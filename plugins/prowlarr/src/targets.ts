import { isPlainObject, stringOr } from '@synoikia/plugin-sdk';
import type { HttpJsonClient, ResolvedTarget } from '@synoikia/plugin-sdk';
import { destinations, originOf, safe } from './fields.js';
import { foldersOf, programsOf } from './stored.js';

/** What a non-GET call acts on, for the approver: a provider connection (indexer, application, proxy, download
 * client, notification) by name with the hosts it sends to, the providers a bulk call changes, or the releases a grab
 * sends to a download client. Lookups that fail leave the id (fail visible, not closed). */

const MAX_BULK = 10;
const PROVIDER =
  /^(POST|PUT|DELETE) \/api\/v1\/(downloadclient|indexer|indexerproxy|notification|applications)(\/|$|#)/;
const BULK = /^(PUT|DELETE) \/api\/v1\/(downloadclient|indexer|applications)\/bulk/;
const GRAB = /^POST \/api\/v1\/search(\/bulk)?$/;
const PROXY_SAVE = /^(POST \/api\/v1\/indexerproxy|PUT \/api\/v1\/indexerproxy\/\{id\})(#|$)/;
const MAX_ROUTED = 20;

type Get = (path: string) => Promise<unknown>;

const label = (resource: string, source: Record<string, unknown>, id: string | undefined) => {
  const impl = safe(source.implementation);
  return `${resource} ${safe(source.name) ?? safe(id) ?? 'new'}${impl ? ` (${impl})` : ''}`;
};

async function provider(get: Get, resource: string, body: unknown, id: string | undefined): Promise<ResolvedTarget[]> {
  let stored: Record<string, unknown> | undefined;
  if (id) {
    try {
      const row = await get(`/api/v1/${resource}/${encodeURIComponent(id)}`);
      stored = isPlainObject(row) ? row : undefined;
    } catch {
      stored = undefined;
    }
  }
  const sent = isPlainObject(body) && Array.isArray(body.fields) ? body : undefined;
  const source = sent ?? stored;
  if (!source) return id ? [{ kind: resource, id, name: `${resource} ${safe(id) ?? '?'}` }] : [];
  let to = destinations(source);
  // A body that names no destination keeps the stored one.
  if (!to.length && sent && stored) to = destinations(stored);
  // A notification that runs a program, or a client that writes to a folder, shows it: provider fields are hidden.
  const runs = resource === 'notification' ? programsOf(source) : [];
  const folders = resource === 'downloadclient' ? foldersOf(source) : [];
  // A stored provider is named by its stored name: the body's `name` is the model's.
  return [
    {
      kind: resource,
      id: id ?? 'new',
      name: `${label(resource, { ...source, name: stored?.name ?? source.name }, id)}${to.length ? ` → ${to.join(', ')}` : ''}${runs.length ? `, runs ${runs.join(', ')}` : ''}${folders.length ? `, writes to ${folders.join(', ')}` : ''}`,
    },
  ];
}

async function bulk(get: Get, resource: string, body: unknown): Promise<ResolvedTarget[]> {
  const ids = isPlainObject(body) && Array.isArray(body.ids) ? body.ids.map(stringOr) : [];
  const known = ids.filter((id): id is string => id !== undefined);
  const shown = await Promise.all(
    known.slice(0, MAX_BULK).map(async (id): Promise<ResolvedTarget> => {
      try {
        const stored = await get(`/api/v1/${resource}/${encodeURIComponent(id)}`);
        if (isPlainObject(stored)) return { kind: resource, id, name: label(resource, stored, id) };
      } catch {
        // Shown by id below.
      }
      return { kind: resource, id, name: `${resource} ${safe(id) ?? '?'}` };
    }),
  );
  const more = known.length - shown.length;
  return [...shown, ...(more > 0 ? [{ kind: resource, id: 'more', name: `${more} more` }] : [])];
}

const lookupName = async (get: Get, resource: string, id: string): Promise<Record<string, unknown> | undefined> => {
  try {
    const stored = await get(`/api/v1/${resource}/${encodeURIComponent(id)}`);
    return isPlainObject(stored) ? stored : undefined;
  } catch {
    return undefined;
  }
};

/** A grab: the release, its indexer, and the download client Prowlarr sends it to (the one in the body for a single
 * grab, else the indexer's, else Prowlarr's default). Prowlarr takes the release from its search cache by `indexerId`
 * and `guid` and ignores the body `title`, so the guid leads and the title is shown as the caller's claim. */
async function grabs(get: Get, body: unknown, many: boolean): Promise<ResolvedTarget[]> {
  const items = (many ? (Array.isArray(body) ? body : []) : [body]).filter(isPlainObject);
  const shown = await Promise.all(
    items.slice(0, MAX_BULK).map(async (r): Promise<ResolvedTarget> => {
      const indexerId = stringOr(r.indexerId);
      const indexer = indexerId ? await lookupName(get, 'indexer', indexerId) : undefined;
      const clientId = (many ? undefined : stringOr(r.downloadClientId)) ?? stringOr(indexer?.downloadClientId);
      const set = clientId !== undefined && clientId !== '0';
      const client = set ? await lookupName(get, 'downloadclient', clientId) : undefined;
      const to = set ? `download client ${safe(client?.name) ?? safe(clientId)}` : 'the default download client';
      const from = safe(indexer?.name) ?? `indexer ${safe(indexerId) ?? '?'}`;
      const title = safe(r.title);
      return {
        kind: 'release',
        id: safe(r.guid) ?? '?',
        name: `release ${safe(r.guid) ?? '?'}${title ? ` ("${title}")` : ''} → ${to} (from ${from})`,
      };
    }),
  );
  const more = items.length - shown.length;
  return [...shown, ...(more > 0 ? [{ kind: 'release', id: 'more', name: `${more} more releases` }] : [])];
}

// Servarr reads a provider field by its exact name, first match first.
function baseUrlOf(row: Record<string, unknown>): unknown {
  const fields: unknown[] = Array.isArray(row.fields) ? row.fields : [];
  const found = fields.find((f): f is Record<string, unknown> => isPlainObject(f) && f.name === 'baseUrl');
  return found?.value;
}

const routed = (id: string, name: string): ResolvedTarget => ({ kind: 'indexer', id, name });

/** The stored indexers whose traffic a saved proxy carries: Prowlarr sends an indexer through every proxy that shares
 * one of its tags. The owner keeps proxy saves a regular write, so the approver sees each indexer instead. */
async function routedIndexers(get: Get, body: unknown): Promise<ResolvedTarget[]> {
  const tags = isPlainObject(body) ? body.tags : undefined;
  if (!Array.isArray(tags) || !tags.every((t) => Number.isInteger(t)))
    return [routed('unknown', 'indexers routed through it: unknown (the body has no list of tag ids)')];
  let rows: unknown;
  try {
    rows = await get('/api/v1/indexer');
  } catch {
    rows = undefined;
  }
  if (!Array.isArray(rows)) return [routed('unknown', 'indexers routed through it: unknown (lookup failed)')];
  const hits = rows.filter(
    (r): r is Record<string, unknown> =>
      isPlainObject(r) && Array.isArray(r.tags) && r.tags.some((t: unknown) => tags.includes(t)),
  );
  if (!hits.length) return [routed('none', 'routes no indexer: no stored indexer shares its tags')];
  const shown = hits.slice(0, MAX_ROUTED).map((r) => {
    const id = stringOr(r.id) ?? '?';
    const origin = safe(originOf(baseUrlOf(r)));
    return routed(id, `routes indexer ${safe(r.name) ?? safe(id) ?? '?'} (${origin ?? 'no base URL'})`);
  });
  const more = hits.length - shown.length;
  return [...shown, ...(more > 0 ? [routed('more', `and ${more} more`)] : [])];
}

export async function resolveTargets(
  client: HttpJsonClient,
  key: string,
  params: unknown,
  timeoutMs: number,
): Promise<ResolvedTarget[]> {
  if (key.startsWith('GET ')) return [];
  const get: Get = (path) => client.request('GET', path, { timeoutMs });
  const p = isPlainObject(params) ? params : {};
  const pathParams = isPlainObject(p.path) ? p.path : {};
  const body = p.body;
  const grab = GRAB.exec(key);
  if (grab) return grabs(get, body, grab[1] !== undefined);
  const many = BULK.exec(key);
  if (many) return bulk(get, many[2]!, body);
  const match = PROVIDER.exec(key);
  if (match) {
    const id = stringOr(pathParams.id) ?? (isPlainObject(body) ? stringOr(body.id) : undefined);
    const self = await provider(get, match[2]!, body, id && id !== '0' ? id : undefined);
    return PROXY_SAVE.test(key) ? [...self, ...(await routedIndexers(get, body))] : self;
  }
  return [];
}

/** The approval text with what it acts on placed right after the method and path, ahead of the (truncated) body,
 * so a long body can't push the destination out of view. */
export function withTargets(text: string, targets: readonly ResolvedTarget[]): string {
  if (!targets.length) return text;
  const head = text.split(' ', 3).join(' ');
  return `${head} on ${targets.map((t) => t.name).join('; ')}${text.slice(head.length)}`;
}
