import { fetchSpec, isPlainObject, parseOpenApi } from '@synoikia/plugin-sdk';

/** PMS serves no spec. The community spec (LukeHagar/plex-api-spec) is fetched at a pinned commit from a
 * configurable mirror, with no credentials sent, and cut to the operations the PMS itself serves. */

export interface SpecSource {
  /** `<baseUrl>/<ref>/<file>` is the spec. */
  baseUrl: string;
  /** A full commit SHA: a branch would let a third-party change alter the catalog. */
  ref: string;
  file: string;
  maxBytes: number;
  timeoutMs: number;
}

/** Validates plugin.yaml's `plugin.spec`. */
export function parseSpecSource(value: unknown): SpecSource {
  const p = isPlainObject(value) ? value : {};
  const text = (key: string) => {
    const v = p[key];
    if (typeof v !== 'string' || !v) throw new Error(`plugin.yaml plugin.spec.${key} must be a string`);
    return v;
  };
  const num = (key: string) => {
    const v = p[key];
    if (typeof v !== 'number' || v <= 0) throw new Error(`plugin.yaml plugin.spec.${key} must be a positive number`);
    return v;
  };
  const ref = text('ref');
  if (!/^[0-9a-f]{40}$/.test(ref)) throw new Error('plugin.yaml plugin.spec.ref must be a full commit SHA');
  return { baseUrl: text('baseUrl'), ref, file: text('file'), maxBytes: num('maxBytes'), timeoutMs: num('timeoutMs') };
}

/** Fetches the spec at the pinned ref; returns its text and the ref. */
export function fetchPlexSpec(
  service: string,
  source: SpecSource,
  baseUrl: string = source.baseUrl,
): Promise<{ text: string; ref: string }> {
  const base = baseUrl.replace(/\/+$/, '');
  return fetchSpec({
    service,
    candidates: [{ url: `${base}/${source.ref}/${source.file}`, ref: source.ref }],
    maxBytes: source.maxBytes,
    timeoutMs: source.timeoutMs,
  });
}

const VERBS = new Set(['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace']);

/** The spec with every operation that declares its own `servers` (plex.tv and the cloud providers) removed, at
 * operation or path level; the rest is served by the PMS at the connection's base URL. */
export function pmsOnly(spec: string | Record<string, unknown>, service: string): Record<string, unknown> {
  const doc = parseOpenApi(spec, service);
  const paths: Record<string, unknown> = {};
  for (const [path, item] of Object.entries(isPlainObject(doc.paths) ? doc.paths : {})) {
    if (!isPlainObject(item) || item.servers !== undefined) continue;
    const kept: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(item)) {
      if (VERBS.has(name.toLowerCase()) && (!isPlainObject(value) || value.servers !== undefined)) continue;
      Object.defineProperty(kept, name, { value, enumerable: true, writable: true, configurable: true });
    }
    Object.defineProperty(paths, path, { value: kept, enumerable: true, writable: true, configurable: true });
  }
  return { ...doc, paths };
}
