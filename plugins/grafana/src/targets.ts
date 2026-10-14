import { isPlainObject, stringOr } from '@synoikia/plugin-sdk';
import type { HttpJsonClient, ResolvedTarget } from '@synoikia/plugin-sdk';

/** The stored data source a non-GET call on `/datasources/{id}` or `/datasources/uid/{uid}` acts on, named
 * with its type and URL so the approver sees where its queries go; none when it can't be read. */
export async function dataSourceTargets(
  client: HttpJsonClient,
  key: string,
  params: unknown,
  timeoutMs: number,
): Promise<ResolvedTarget[]> {
  const byUid = key.includes(' /datasources/uid/{uid}');
  if (key.startsWith('GET ') || (!byUid && !key.includes(' /datasources/{id}'))) return [];
  const path = isPlainObject(params) && isPlainObject(params.path) ? params.path : {};
  const id = stringOr(byUid ? path.uid : path.id);
  if (!id) return [];
  let ds: unknown;
  try {
    ds = await client.request('GET', `/datasources/${byUid ? 'uid/' : ''}${encodeURIComponent(id)}`, { timeoutMs });
  } catch {
    return [];
  }
  if (!isPlainObject(ds)) return [];
  const name = stringOr(ds.name) ?? id;
  const detail = [stringOr(ds.type), stringOr(ds.url)].filter(Boolean).join(', ');
  return [{ kind: 'datasource', id, name: detail ? `${name} (${detail})` : name }];
}

/** The approval text with the targets it acts on. */
export const withTargets = (text: string, targets: readonly ResolvedTarget[]) =>
  targets.length ? `${text} on ${targets.map((t) => t.name).join(', ')}` : text;
