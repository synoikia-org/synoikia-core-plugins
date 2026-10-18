import { ErrorCodes, isPlainObject, PluginError, stringOr } from '@synoikia/plugin-sdk';
import type { RestParams } from '@synoikia/plugin-sdk';
import { destinations, safe } from './fields.js';

/** The upstream decisions behind the `#stored`, `#script` and `#folder` twins: whether a provider write, test or
 * action sends the stored credentials somewhere other than the stored destination, whether a notification runs a
 * program, and whether a download client writes files to a host folder. Any lookup that fails, or a shape that is
 * not known, takes the locked twin. */

export type Get = (path: string) => Promise<unknown>;

const DESTINATION_NAMES = new Set(['host', 'port', 'urlbase', 'url', 'baseurl', 'usessl']);
const DESTINATION_NAME = /host|url/i;
const SCRIPT_IMPLEMENTATIONS = new Set(['customscript']);
const SCRIPT_NAME = /path|script|command|executable|program/i;
const SCRIPT_TYPES = new Set(['path', 'filepath']);
const FOLDER_IMPLEMENTATIONS = new Set(['torrentblackhole', 'usenetblackhole', 'pneumatic']);
const FOLDER_NAME = /folder|path/i;

/** A positive `id` in the body: Servarr fills the stored secrets into a test or action for it. */
export function storedId(body: unknown): string | undefined {
  if (!isPlainObject(body)) return undefined;
  const { id } = body;
  if (id === undefined || id === null || (typeof id === 'number' && id <= 0)) return undefined;
  return String(id);
}

/** `/api/v3/downloadclient` from `POST /api/v3/downloadclient/test` or `PUT /api/v3/notification/{id}`. */
export function resourcePath(key: string): string | undefined {
  return /^[A-Z]+ (\/api\/v\d+\/[a-z]+)(\/|$|#)/.exec(key)?.[1];
}

type Fields = Map<string, { value: unknown; type: string }>;

/** Provider fields by lowercased name; the first spelling wins (request.ts refuses a second one). */
function fieldsOf(row: Record<string, unknown>): Fields {
  const out: Fields = new Map();
  for (const f of Array.isArray(row.fields) ? row.fields : []) {
    if (!isPlainObject(f) || typeof f.name !== 'string') continue;
    const name = f.name.toLowerCase();
    if (!out.has(name)) out.set(name, { value: f.value, type: typeof f.type === 'string' ? f.type.toLowerCase() : '' });
  }
  return out;
}

const norm = (v: unknown) =>
  v === undefined || v === null || v === ''
    ? ''
    : (typeof v === 'object' ? JSON.stringify(v) : String(v)).toLowerCase();

const isDestination = (name: string, type: string) =>
  DESTINATION_NAMES.has(name) || DESTINATION_NAME.test(name) || type === 'url';

/** True when `body` names a destination, or a provider type, other than the stored row's. `keys` are top-level
 * body keys that also decide where the provider connects (Prowlarr's `tags` pick the indexer proxy). */
export function destinationChanged(
  stored: Record<string, unknown>,
  body: Record<string, unknown>,
  keys: readonly string[] = [],
): boolean {
  if (norm(stored.implementation) !== norm(body.implementation)) return true;
  if (keys.some((k) => norm(stored[k]) !== norm(body[k]))) return true;
  const before = fieldsOf(stored);
  const after = fieldsOf(body);
  for (const name of new Set([...before.keys(), ...after.keys()])) {
    const type = before.get(name)?.type || after.get(name)?.type || '';
    if (isDestination(name, type) && norm(before.get(name)?.value) !== norm(after.get(name)?.value)) return true;
  }
  const a = destinations(stored).map((d) => d.toLowerCase());
  const b = destinations(body).map((d) => d.toLowerCase());
  return a.length !== b.length || a.some((d) => !b.includes(d));
}

/** `#stored`: a write, test or action for a stored provider whose body changes where it connects. A PUT names the
 * stored row by its path id (Servarr tests the provider on save), a test or action by the body's `id`. */
export async function sendsStoredElsewhere(
  get: Get | undefined,
  key: string,
  params: RestParams,
  keys: readonly string[] = [],
): Promise<boolean> {
  const { body } = params;
  const pathId = stringOr(params.path?.id);
  const id = key.startsWith('PUT ') ? pathId : storedId(body);
  if (key.startsWith('PUT ')) {
    const bodyId = isPlainObject(body) ? body.id : undefined;
    if (bodyId !== undefined && bodyId !== null && String(bodyId) !== pathId)
      throw new PluginError(ErrorCodes.InvalidParams, `body.id (${String(bodyId)}) must be the path id (${pathId})`);
  }
  if (id === undefined) return !key.startsWith('POST ');
  const base = resourcePath(key);
  if (!get || !base || !isPlainObject(body)) return true;
  let stored: unknown;
  try {
    stored = await get(`${base}/${encodeURIComponent(id)}`);
  } catch {
    return true;
  }
  return !isPlainObject(stored) || destinationChanged(stored, body, keys);
}

/** A notification that runs a program: a script implementation, or a path- or script-like field. */
export function runsProgram(row: unknown): boolean {
  if (!isPlainObject(row) || typeof row.implementation !== 'string' || !row.implementation) return true;
  if (SCRIPT_IMPLEMENTATIONS.has(row.implementation.toLowerCase())) return true;
  for (const [name, { type }] of fieldsOf(row)) if (SCRIPT_NAME.test(name) || SCRIPT_TYPES.has(type)) return true;
  return false;
}

/** The programs a notification names in path- or script-like fields, for the approver. */
export function programsOf(row: unknown): string[] {
  if (!isPlainObject(row)) return [];
  const out: string[] = [];
  for (const [name, { value, type }] of fieldsOf(row))
    if ((SCRIPT_NAME.test(name) || SCRIPT_TYPES.has(type)) && typeof value === 'string' && value)
      out.push(safe(value) ?? value);
  return out;
}

/** `#script`: a notification write or test that runs a program; `testall` runs every stored one. */
export async function runsScript(get: Get | undefined, key: string, body: unknown): Promise<boolean> {
  if (!/\/testall$/.test(key)) return runsProgram(body);
  const base = resourcePath(key);
  if (!get || !base) return true;
  try {
    const rows = await get(base);
    return !Array.isArray(rows) || rows.some(runsProgram);
  } catch {
    return true;
  }
}

/** A download client that writes files to a host folder: a blackhole client, or a folder- or path-like field. */
export function writesToFolder(row: unknown): boolean {
  if (!isPlainObject(row) || typeof row.implementation !== 'string' || !row.implementation) return true;
  if (FOLDER_IMPLEMENTATIONS.has(row.implementation.toLowerCase())) return true;
  for (const [name, { type }] of fieldsOf(row)) if (FOLDER_NAME.test(name) || SCRIPT_TYPES.has(type)) return true;
  return false;
}

/** The folders a download client names, for the approver. */
export function foldersOf(row: unknown): string[] {
  if (!isPlainObject(row)) return [];
  const out: string[] = [];
  for (const [name, { value, type }] of fieldsOf(row))
    if ((FOLDER_NAME.test(name) || SCRIPT_TYPES.has(type)) && typeof value === 'string' && value)
      out.push(safe(value) ?? value);
  return out;
}
