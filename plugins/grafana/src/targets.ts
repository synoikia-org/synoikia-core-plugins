import { ErrorCodes, isPlainObject, PluginError, readPointer, stringOr } from '@synoikia/plugin-sdk';
import type { HttpJsonClient, ResolvedTarget } from '@synoikia/plugin-sdk';

/** Most data sources one `POST /ds/query` may name; more are refused rather than shown in part. */
const MAX_QUERY_SOURCES = 20;

/** A data source named with its type and URL, so the approver sees where its queries go; undefined when it
 * can't be read. */
async function dataSource(client: HttpJsonClient, path: string, id: string, timeoutMs: number) {
  let ds: unknown;
  try {
    ds = await client.request('GET', path, { timeoutMs });
  } catch {
    return undefined;
  }
  if (!isPlainObject(ds)) return undefined;
  const name = stringOr(ds.name) ?? id;
  const detail = [stringOr(ds.type), stringOr(ds.url)].filter(Boolean).join(', ');
  return { kind: 'datasource', id, name: detail ? `${name} (${detail})` : name } satisfies ResolvedTarget;
}

/** `https://hooks.slack.com/services/…` → `hooks.slack.com`: where it posts, without the token in its path. */
export function hostOf(value: unknown): string {
  try {
    return new URL(String(value)).host || 'an invalid URL';
  } catch {
    return 'an invalid URL';
  }
}

/** What a call acts on: the stored data source of a non-GET `/datasources/{id}` or `/datasources/uid/{uid}`
 * call, every data source a `POST /ds/query` names (an unreadable one by its uid), or the host a contact
 * point's `settings.url` posts to. */
export async function resolveTargets(
  client: HttpJsonClient,
  key: string,
  params: unknown,
  timeoutMs: number,
): Promise<ResolvedTarget[]> {
  if (key.startsWith('GET ')) return [];
  const p = isPlainObject(params) ? params : {};

  if (key === 'POST /ds/query') {
    const queries = readPointer(p.body, '/queries');
    const uids = new Set<string>();
    for (const q of Array.isArray(queries) ? queries : []) {
      const uid = stringOr(readPointer(q, '/datasource/uid'));
      if (uid) uids.add(uid);
    }
    if (uids.size > MAX_QUERY_SOURCES)
      throw new PluginError(
        ErrorCodes.TargetResolutionFailed,
        `POST /ds/query names ${uids.size} data sources; the limit is ${MAX_QUERY_SOURCES}`,
      );
    return Promise.all(
      [...uids].map(
        async (uid): Promise<ResolvedTarget> =>
          (await dataSource(client, `/datasources/uid/${encodeURIComponent(uid)}`, uid, timeoutMs)) ?? {
            kind: 'datasource',
            id: uid,
            name: uid,
          },
      ),
    );
  }

  if (key === 'POST /v1/provisioning/contact-points' || key === 'PUT /v1/provisioning/contact-points/{UID}') {
    const url = readPointer(p.body, '/settings/url');
    if (url === undefined || url === null || url === '') return [];
    const host = hostOf(url);
    return [{ kind: 'destination', id: host, name: `${host} (contact point URL)` }];
  }

  const byUid = key.includes(' /datasources/uid/{uid}');
  if (!byUid && !key.includes(' /datasources/{id}')) return [];
  const path = isPlainObject(p.path) ? p.path : {};
  const id = stringOr(byUid ? path.uid : path.id);
  if (!id) return [];
  const target = await dataSource(
    client,
    `/datasources/${byUid ? 'uid/' : ''}${encodeURIComponent(id)}`,
    id,
    timeoutMs,
  );
  return target ? [target] : [];
}

/** The approval text with the targets it acts on. */
export const withTargets = (text: string, targets: readonly ResolvedTarget[]) =>
  targets.length ? `${text} on ${targets.map((t) => t.name).join(', ')}` : text;
