import { isPlainObject, stringOr } from '@synoikia/plugin-sdk';
import type { HttpJsonClient, ResolvedTarget } from '@synoikia/plugin-sdk';

/** The stored database a non-GET call on `/databases/{id}…` acts on, named with its repository so the
 * approver sees what is synced; no target when it can't be read (the summary then shows the path id). */
export async function databaseTargets(
  client: HttpJsonClient,
  key: string,
  params: unknown,
  timeoutMs: number,
): Promise<ResolvedTarget[]> {
  if (key.startsWith('GET ') || !key.includes(' /databases/{id}')) return [];
  const path = isPlainObject(params) && isPlainObject(params.path) ? params.path : {};
  const id = stringOr(path.id);
  if (!id) return [];
  let db: unknown;
  try {
    db = await client.request('GET', `/databases/${encodeURIComponent(id)}`, { timeoutMs });
  } catch {
    return [];
  }
  if (!isPlainObject(db)) return [];
  const name = stringOr(db.name) ?? id;
  const repo = stringOr(db.repository_url);
  return [{ kind: 'database', id, name: repo ? `${name} (${repo})` : name }];
}

/** The approval text with the targets it acts on. */
export const withTargets = (text: string, targets: readonly ResolvedTarget[]) =>
  targets.length ? `${text} on ${targets.map((t) => t.name).join(', ')}` : text;
