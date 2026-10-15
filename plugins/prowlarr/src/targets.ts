import { isPlainObject, stringOr } from '@synoikia/plugin-sdk';
import type { HttpJsonClient, ResolvedTarget } from '@synoikia/plugin-sdk';
import { destinations, safe } from './fields.js';

/** What a non-GET call acts on, for the approver: a provider connection (indexer, application, proxy, download
 * client, notification) by name with the hosts it sends to, or the providers a bulk call changes. Lookups that fail
 * leave the id (fail visible, not closed). */

const MAX_BULK = 10;
const PROVIDER =
  /^(POST|PUT|DELETE) \/api\/v1\/(downloadclient|indexer|indexerproxy|notification|applications)(\/|$|#)/;
const BULK = /^(PUT|DELETE) \/api\/v1\/(downloadclient|indexer|applications)\/bulk/;

type Get = (path: string) => Promise<unknown>;

const label = (resource: string, source: Record<string, unknown>, id: string | undefined) => {
  const impl = safe(source.implementation);
  return `${resource} ${safe(source.name) ?? safe(id) ?? 'new'}${impl ? ` (${impl})` : ''}`;
};

async function provider(get: Get, resource: string, body: unknown, id: string | undefined): Promise<ResolvedTarget[]> {
  let source = body;
  if (!isPlainObject(body) || !Array.isArray(body.fields)) {
    if (!id) return [];
    try {
      source = await get(`/api/v1/${resource}/${encodeURIComponent(id)}`);
    } catch {
      return [{ kind: resource, id, name: `${resource} ${safe(id) ?? '?'}` }];
    }
  }
  if (!isPlainObject(source)) return [];
  let to = destinations(source);
  // A body that names no destination keeps the stored one.
  if (!to.length && source === body && id) {
    try {
      to = destinations(await get(`/api/v1/${resource}/${encodeURIComponent(id)}`));
    } catch {
      to = [];
    }
  }
  return [
    {
      kind: resource,
      id: id ?? 'new',
      name: `${label(resource, source, id)}${to.length ? ` → ${to.join(', ')}` : ''}`,
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
  const many = BULK.exec(key);
  if (many) return bulk(get, many[2]!, body);
  const match = PROVIDER.exec(key);
  if (match) {
    const id = stringOr(pathParams.id) ?? (isPlainObject(body) ? stringOr(body.id) : undefined);
    return provider(get, match[2]!, body, id && id !== '0' ? id : undefined);
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
