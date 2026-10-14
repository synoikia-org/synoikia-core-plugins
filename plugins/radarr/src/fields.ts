import { ErrorCodes, isPlainObject, PluginError, stringOr } from '@synoikia/plugin-sdk';

/** Servarr provider settings (download clients, indexers, import lists, notifications, metadata) are a `fields`
 * list of `{ name, value, privacy }`; key-based redaction can't see a secret in `value`, so these helpers do. */

/** Servarr's own mask: a provider write that sends it back keeps the stored password or API key. */
export const PRIVATE_VALUE = '********';
const REDACTED = '[REDACTED]';
const PRIVATE = new Set(['password', 'apikey']);
const SECRET_NAME = /pass|secret|token|apikey|api_key/i;
const MAX_DEPTH = 16;

/** A model-written string as one visible line: control, bidi and zero-width characters escaped. */
export function safe(value: unknown): string | undefined {
  const text = stringOr(value);
  if (text === undefined) return undefined;
  return JSON.stringify(text)
    .slice(1, -1)
    .replace(
      /[\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g,
      (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
    );
}

const asUrl = (value: unknown): URL | undefined => {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9+.-]*:\/\//i.test(value.trim())) return undefined;
  try {
    return new URL(value.trim());
  } catch {
    return undefined;
  }
};

/** `https://user:pw@discord.com/api/webhooks/1/abc?x` → `https://discord.com`: where a URL goes, without what it
 * carries. */
export function originOf(value: unknown): string | undefined {
  const url = asUrl(value);
  return url ? `${url.protocol}//${url.host}` : undefined;
}

/** Hides a URL's credentials, query and (for notifications, whose webhook paths hold tokens) its path. */
function maskUrl(value: string, hidePath: boolean): string {
  const url = asUrl(value);
  if (!url) return value;
  const path = url.pathname.replace(/\/+$/, '');
  const hides = url.username || url.password || url.search || url.hash || (hidePath && path);
  if (!hides) return value;
  return `${url.protocol}//${url.host}${hidePath ? '' : path}/${REDACTED}`;
}

const isField = (v: unknown): v is Record<string, unknown> => isPlainObject(v) && 'value' in v && 'name' in v;

function maskField(field: Record<string, unknown>, hidePath: boolean): Record<string, unknown> {
  const { value } = field;
  if (value === null || value === undefined || value === '') return field;
  const privacy = typeof field.privacy === 'string' ? field.privacy.toLowerCase() : '';
  if (PRIVATE.has(privacy)) return { ...field, value: PRIVATE_VALUE };
  // Not marked private, so Servarr would store its mask as is: the write guard refuses `[REDACTED]` instead.
  if (typeof field.name === 'string' && SECRET_NAME.test(field.name)) return { ...field, value: REDACTED };
  if (typeof value === 'string') return { ...field, value: maskUrl(value, hidePath) };
  if (Array.isArray(value))
    return { ...field, value: value.map((v) => (typeof v === 'string' ? maskUrl(v, hidePath) : v)) };
  return field;
}

/** A result with every provider field's password or API key replaced by Servarr's mask, and URLs cut to what
 * doesn't carry a token; `hidePath` for notifications. Anything nested too deep is hidden. */
export function maskProviderFields(value: unknown, hidePath: boolean, depth = 0): unknown {
  if (depth > MAX_DEPTH) return REDACTED;
  if (Array.isArray(value)) return value.map((v) => maskProviderFields(v, hidePath, depth + 1));
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    const masked =
      k === 'fields' && Array.isArray(v)
        ? v.map((f) => (isField(f) ? maskField(f, hidePath) : maskProviderFields(f, hidePath, depth + 1)))
        : maskProviderFields(v, hidePath, depth + 1);
    Object.defineProperty(out, k, { value: masked, enumerable: true, writable: true, configurable: true });
  }
  return out;
}

const hasRedacted = (value: unknown, depth = 0): boolean => {
  if (typeof value === 'string') return value.includes(REDACTED);
  if (depth > MAX_DEPTH) return true;
  if (Array.isArray(value)) return value.some((v) => hasRedacted(v, depth + 1));
  return isPlainObject(value) && Object.values(value).some((v) => hasRedacted(v, depth + 1));
};

/** Refuses a body that carries a masked value from an earlier result: Servarr would store `[REDACTED]` as the
 * password, URL or key. Servarr's own `********` is fine (it keeps the stored secret). */
export function refuseMaskedValues(body: unknown): void {
  if (hasRedacted(body))
    throw new PluginError(
      ErrorCodes.InvalidParams,
      `The body contains ${REDACTED}, a masked value from an earlier result; the upstream would store it as is. ` +
        `Leave the field out, send ${PRIVATE_VALUE} to keep a stored password or API key, or ask the user for the value`,
    );
}

/** Where a provider body sends data: hosts and URL origins, and the recipients of a notification. */
export function destinations(body: unknown): string[] {
  if (!isPlainObject(body) || !Array.isArray(body.fields)) return [];
  const byName = new Map<string, unknown>();
  for (const f of body.fields) if (isField(f) && typeof f.name === 'string') byName.set(f.name.toLowerCase(), f.value);
  const out = new Set<string>();
  const host = safe(byName.get('host'));
  if (host) {
    const port = safe(byName.get('port'));
    out.add(`${byName.get('usessl') === true ? 'https' : 'http'}://${host}${port ? `:${port}` : ''}`);
  }
  for (const [name, value] of byName) {
    if (PRIVATE.has(name) || SECRET_NAME.test(name)) continue;
    for (const v of Array.isArray(value) ? value : [value]) {
      const origin = originOf(v);
      if (origin) out.add(safe(origin) ?? origin);
      else if (['server', 'to', 'cc', 'bcc'].includes(name) && safe(v)) out.add(safe(v)!);
    }
  }
  return [...out];
}
