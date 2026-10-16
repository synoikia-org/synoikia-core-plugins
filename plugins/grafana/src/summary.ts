import { baseKey, fillTemplate, isPlainObject, queryString, readPointer, truncate } from '@synoikia/plugin-sdk';

/** Longest single destination shown. */
const MAX_VALUE = 200;
/** Destinations listed per field before "and N more". */
const MAX_LISTED = 20;

/** JSON text with the control, bidi and zero-width characters JSON leaves raw escaped too, so a model-written
 * value can't hide or reorder what the approver reads. */
export const visible = (json: string) =>
  json.replace(
    /[\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );

/** A string as one visible line, cut to `max`. */
export const safe = (text: string, max = MAX_VALUE) => visible(JSON.stringify(truncate(text, max)).slice(1, -1));

/** One destination field: each address on its own (Grafana splits on `;`, `,` and newlines and trims them) and
 * cut one by one, so padding in one can't push the others past the cut. */
function destination(value: unknown): string {
  const items = (Array.isArray(value) ? value : [value]).flatMap((v) =>
    typeof v === 'string'
      ? v
          .split(/[;,\n]/)
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => `"${safe(s)}"`)
      : [truncate(visible(JSON.stringify(v) ?? String(v)), MAX_VALUE)],
  );
  const shown = items.slice(0, MAX_LISTED).join(', ');
  const more = items.length > MAX_LISTED ? ` and ${items.length - MAX_LISTED} more` : '';
  return items.length === 1 && !Array.isArray(value) ? shown : `[${shown}${more}]`;
}

/** Puts the body's destination fields right after `Grafana VERB /path?query`, ahead of the truncated body, so
 * padding the body cannot push them past the summary's cut. */
export function withDestinations(text: string, service: string, key: string, params: unknown, pointers: string[]) {
  const p = isPlainObject(params) ? params : {};
  const shown = pointers.flatMap((pointer) => {
    const v = readPointer(p.body, pointer);
    return v === undefined || v === null || v === '' ? [] : [`${pointer.slice(1)}=${destination(v)}`];
  });
  if (!shown.length) return text;
  const [method = '', template = ''] = baseKey(key).split(' ');
  let path = template;
  try {
    path = fillTemplate(template, isPlainObject(p.path) ? p.path : {});
  } catch {
    // the binding keeps the template too
  }
  const head = `${service} ${method} ${path}${queryString(isPlainObject(p.query) ? p.query : undefined)}`;
  const dest = ` [to ${shown.join(', ')}]`;
  return text.startsWith(head) ? `${head}${dest}${text.slice(head.length)}` : `${head}${dest} ${text}`;
}
