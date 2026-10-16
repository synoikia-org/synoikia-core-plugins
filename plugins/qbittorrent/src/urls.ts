/** URLs qBittorrent fetches are parsed by Qt's QUrl, the origins approvers see by Node's WHATWG URL. The two differ
 * (`https://a.example\@b.example/` is host a.example to Node and b.example to QUrl), so a URL is accepted only when
 * nothing in it can be read two ways: no backslash, whitespace or control character, no userinfo, and Node's host
 * equal to the authority as written. */

// eslint-disable-next-line no-control-regex
const AMBIGUOUS = /[\\\s\x00-\x1f\x7f]/;
const AUTHORITY = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)/i;
const DEFAULT_PORTS: Record<string, string> = { http: '80', https: '443', ws: '80', wss: '443' };

/** The URLs a magnet link makes qBittorrent contact: trackers (`tr`), web seeds (`ws`) and sources (`xs`, `as`). */
export function magnetUrls(magnet: string): string[] {
  const params = new URLSearchParams(magnet.slice(magnet.indexOf('?') + 1));
  return [...params]
    .filter(
      ([k, v]) => ['tr', 'ws', 'xs', 'as'].includes(k.replace(/\.\d+$/, '')) && /^[a-z][a-z0-9+.-]*:\/\//i.test(v),
    )
    .map(([, v]) => v);
}

/** Why a URL would not be read the same by Node and qBittorrent, or undefined when it would. Never quotes the URL. */
export function urlProblem(raw: string): string | undefined {
  if (AMBIGUOUS.test(raw)) return 'contains a backslash, whitespace or a control character';
  if (/^magnet:\?/i.test(raw)) {
    for (const inner of magnetUrls(raw)) {
      const problem = urlProblem(inner);
      if (problem) return `names a tracker or source that ${problem}`;
    }
    return undefined;
  }
  const m = AUTHORITY.exec(raw);
  if (!m) return 'is not an absolute URL';
  const authority = m[2]!;
  if (!authority || authority.includes('@')) return 'has user credentials or no host';
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return 'is not a valid URL';
  }
  let written = authority.toLowerCase();
  const port = DEFAULT_PORTS[m[1]!.toLowerCase()];
  if (port && written.endsWith(`:${port}`)) written = written.slice(0, -port.length - 1);
  if (parsed.host.toLowerCase() !== written) return 'has a host that parses differently';
  return undefined;
}
