import { isPlainObject, stringOr } from '@synoikia/plugin-sdk';
import type { HttpJsonClient, ResolvedTarget } from '@synoikia/plugin-sdk';

/** What a non-GET call acts on, read back from Backstage so the approver sees the stored entity, location or
 * task rather than an id; no target when it can't be read (the summary then shows the path and body). */

const field = (value: unknown, ...path: string[]): string | undefined => {
  let v = value;
  for (const p of path) v = isPlainObject(v) ? v[p] : undefined;
  return stringOr(v);
};

/** `kind:namespace/name`, as Backstage's stringifyEntityRef writes it. */
export function entityRef(entity: unknown): string | undefined {
  const kind = field(entity, 'kind');
  const name = field(entity, 'metadata', 'name');
  if (!kind || !name) return undefined;
  return `${kind.toLowerCase()}:${field(entity, 'metadata', 'namespace') ?? 'default'}/${name}`;
}

/** `[kind:]namespace/name` with Backstage's defaults filled in, or undefined for anything else. */
export function parseEntityRef(ref: string, defaultKind: string) {
  const m = /^(?:([^:/]+):)?(?:([^:/]+)\/)?([^:/]+)$/.exec(ref);
  if (!m) return undefined;
  return { kind: m[1] ?? defaultKind, namespace: m[2] ?? 'default', name: m[3]! };
}

const ENTITY = 'DELETE /api/catalog/entities/by-uid/{uid}';
const LOCATION = / \/api\/catalog\/locations\/\{id\}$/;
const TASK = /^POST \/api\/scaffolder\/v2\/tasks\/\{taskId\}\/(cancel|retry)$/;
const SCAFFOLD = 'POST /api/scaffolder/v2/tasks';
export const REGISTER = 'POST /api/catalog/locations';

export async function backstageTargets(
  client: HttpJsonClient,
  key: string,
  params: unknown,
  timeoutMs: number,
): Promise<ResolvedTarget[]> {
  if (key.startsWith('GET ')) return [];
  const path = isPlainObject(params) && isPlainObject(params.path) ? params.path : {};
  const get = async (url: string) => {
    try {
      return await client.request('GET', url, { timeoutMs });
    } catch {
      return undefined;
    }
  };
  const id = (name: string) => encodeURIComponent(stringOr(path[name]) ?? '');

  if (key === ENTITY && stringOr(path.uid)) {
    const ref = entityRef(await get(`/api/catalog/entities/by-uid/${id('uid')}`));
    return ref ? [{ kind: 'entity', id: String(path.uid), name: ref }] : [];
  }
  if (LOCATION.test(key) && stringOr(path.id)) {
    const loc = await get(`/api/catalog/locations/${id('id')}`);
    const target = field(loc, 'target');
    return target ? [{ kind: 'location', id: String(path.id), name: `${field(loc, 'type') ?? 'url'}:${target}` }] : [];
  }
  if (TASK.test(key) && stringOr(path.taskId)) {
    const task = await get(`/api/scaffolder/v2/tasks/${id('taskId')}`);
    const template = field(task, 'spec', 'templateInfo', 'entityRef');
    if (!template) return [];
    const status = field(task, 'status');
    return [{ kind: 'task', id: String(path.taskId), name: status ? `${template} (task ${status})` : template }];
  }
  if (key === REGISTER) {
    // Where the catalog will ingest from, as the body names it: the approver must see it first.
    const body = isPlainObject(params) ? params.body : undefined;
    const target = field(body, 'target');
    return target ? [{ kind: 'location', id: target, name: `${field(body, 'type') ?? 'url'}:${target}` }] : [];
  }
  if (key === SCAFFOLD) {
    // The template the body names, shown only when the catalog has it, with its title.
    const body = isPlainObject(params) ? params.body : undefined;
    const ref = parseEntityRef(field(body, 'templateRef') ?? '', 'template');
    if (!ref || ref.kind.toLowerCase() !== 'template') return [];
    const parts = [ref.kind, ref.namespace, ref.name].map(encodeURIComponent).join('/');
    const template = await get(`/api/catalog/entities/by-name/${parts}`);
    const canonical = entityRef(template);
    if (!canonical) return [];
    const title = field(template, 'metadata', 'title');
    return [{ kind: 'template', id: canonical, name: title ? `${canonical} (${title})` : canonical }];
  }
  return [];
}

/** The approval text with the targets it acts on; a location register leads with where it ingests from. */
export function withTargets(text: string, key: string, targets: readonly ResolvedTarget[]) {
  if (!targets.length) return text;
  const names = targets.map((t) => t.name).join(', ');
  if (key === REGISTER && text.includes(key)) return text.replace(key, `${key} from ${names}:`);
  return `${text} on ${names}`;
}
