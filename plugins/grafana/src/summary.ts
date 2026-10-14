import { baseKey, fillTemplate, isPlainObject, queryString, readPointer, truncate } from '@synoikia/plugin-sdk';

/** Longest destination value shown. */
const MAX_VALUE = 200;

/** Puts the body's destination fields right after `Grafana VERB /path?query`, ahead of the truncated body, so
 * padding the body cannot push them past the summary's cut. */
export function withDestinations(text: string, service: string, key: string, params: unknown, pointers: string[]) {
  const p = isPlainObject(params) ? params : {};
  const shown = pointers.flatMap((pointer) => {
    const v = readPointer(p.body, pointer);
    return v === undefined || v === null || v === ''
      ? []
      : [`${pointer.slice(1)}=${truncate(JSON.stringify(v), MAX_VALUE)}`];
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
