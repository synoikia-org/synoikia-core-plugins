import { isPlainObject, parseOpenApi } from '@synoikia/plugin-sdk';

/** Servarr specs carry no summaries, so each operation without one gets a short description from its method, path
 * and tag ("List series", "Get a series by id", "Test a download client"). plugin.yaml's own descriptions win. */

const VERBS = ['get', 'post', 'put', 'patch', 'delete'];
const isParam = (s: string) => s.startsWith('{') && s.endsWith('}');
const words = (text: string) =>
  text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .toLowerCase()
    .trim();

const UNCOUNTABLE = /(metadata|series|history|health)$/;

function plural(phrase: string): string {
  if (UNCOUNTABLE.test(phrase)) return phrase;
  if (/(s|x|ch|sh)$/.test(phrase)) return /(x|ch|sh)$/.test(phrase) ? `${phrase}es` : phrase;
  if (/[^aeiou]y$/.test(phrase)) return `${phrase.slice(0, -1)}ies`;
  return `${phrase}s`;
}

const a = (phrase: string) => `${/^([aeio]|u(?!i))/.test(phrase) ? 'an' : 'a'} ${phrase}`;

/** The resource phrase: the tag's words where a path segment names them, other segments as words. */
function phrase(literals: string[], tag: string): string {
  const noun = words(tag);
  const joined = noun.replace(/ /g, '');
  const covered = (s: string) => {
    const seg = s.toLowerCase().replace(/[^a-z0-9]/g, '');
    return Boolean(noun) && (joined.includes(seg) || joined.includes(seg.replace(/s$/, '')));
  };
  if (noun && !literals.some(covered)) return noun;
  const out: string[] = [];
  let used = false;
  for (const s of literals) {
    if (!covered(s)) out.push(words(s));
    else if (!used) {
      out.push(noun);
      used = true;
    }
  }
  return out.join(' ') || noun;
}

/** One operation's description. */
export function describeOperation(method: string, path: string, tag: string, paths: readonly string[]): string {
  const segments = path
    .replace(/^\/api\/v\d+(?=\/|$)/, '')
    .split('/')
    .filter(Boolean);
  const last = segments.at(-1) ?? '';
  const param = isParam(last) ? last.slice(1, -1) : undefined;
  const literals = segments.filter((s) => !isParam(s));
  const action = literals.at(-1)?.toLowerCase() ?? '';
  const base = (drop: string[]) =>
    phrase(
      literals.filter((s) => !drop.includes(s.toLowerCase())),
      words(tag)
        .split(' ')
        .filter((w) => !drop.includes(w))
        .join(' '),
    );
  const verb = method.toUpperCase();
  if (verb === 'POST' && action === 'test') return `Test ${a(base(['test']))}`;
  if (verb === 'POST' && action === 'testall') return `Test all ${plural(base(['testall']))}`;
  if (verb === 'POST' && action === 'action' && param) return `Run ${a(base(['action']))} action`;
  if (action === 'bulk' || action === 'editor') {
    const what = plural(base(['bulk', 'editor']));
    return `${{ GET: 'Get', POST: 'Add', PUT: 'Update', PATCH: 'Change', DELETE: 'Delete' }[verb] ?? verb} ${what} in bulk`;
  }
  if (verb === 'GET' && action === 'schema') return `List ${base(['schema'])} schemas`;
  const what = phrase(literals, tag);
  // A settings resource (`/config/host`) is one object, though it also takes an id.
  const collection = !param && !literals.includes('config') && paths.some((p) => p.startsWith(`${path}/{`));
  switch (verb) {
    case 'GET':
      if (param) return `Get ${a(what)} by ${words(param)}`;
      return collection ? `List ${plural(what)}` : `Get ${what}`;
    case 'POST':
      return collection ? `Add ${a(what)}` : `Run ${what}`;
    case 'PUT':
      return `Update ${param ? a(what) : what}`;
    case 'PATCH':
      return `Change ${param ? a(what) : what}`;
    case 'DELETE':
      return `Delete ${param ? a(what) : what}`;
    default:
      return `${verb} ${path}`;
  }
}

/** A copy of the spec where every operation without a summary or description has a generated description. */
export function withDescriptions(spec: string | Record<string, unknown>, service: string): Record<string, unknown> {
  const doc = parseOpenApi(spec, service);
  const source = doc.paths as Record<string, unknown>;
  const keys = Object.keys(source);
  const paths: Record<string, unknown> = {};
  for (const [path, item] of Object.entries(source)) {
    if (!isPlainObject(item)) {
      Object.defineProperty(paths, path, { value: item, enumerable: true, writable: true, configurable: true });
      continue;
    }
    const copy: Record<string, unknown> = { ...item };
    for (const verb of VERBS) {
      const op = item[verb];
      if (!isPlainObject(op) || (typeof op.summary === 'string' && op.summary.trim())) continue;
      if (typeof op.description === 'string' && op.description.trim()) continue;
      const tag = Array.isArray(op.tags) && typeof op.tags[0] === 'string' ? op.tags[0] : '';
      copy[verb] = { ...op, description: describeOperation(verb, path, tag, keys) };
    }
    Object.defineProperty(paths, path, { value: copy, enumerable: true, writable: true, configurable: true });
  }
  return { ...doc, paths };
}
