import { ErrorCodes, PluginError, requireString, singleFlight, statusKind, upstreamError } from '@synoikia/plugin-sdk';
import type { HttpJsonClient, HttpJsonClientOptions, HttpResponse, InitParams } from '@synoikia/plugin-sdk';

export const SERVICE = 'qBittorrent';

/** qBittorrent 5.0 and 5.1 name the session cookie `SID` (or a configured name); 5.2 and later `QBT_SID_<port>`. */
const SESSION_COOKIE = /^(SID|QBT_SID_\d{1,5})$/;
/** Cookie names RFC 6265 allows, for a configured name that matches neither. */
const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,64}$/;

/** The session cookie a sign-in sets, as `name=value`: a known session name first, else the only cookie set. */
export function sessionCookie(header: string | string[] | undefined): string | undefined {
  const cookies = (Array.isArray(header) ? header : header ? [header] : []).flatMap((line) => {
    const pair = line.split(';')[0] ?? '';
    const eq = pair.indexOf('=');
    if (eq <= 0) return [];
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    return TOKEN.test(name) && /^[\x21-\x7e]{1,512}$/.test(value) && !value.includes(';') ? [{ name, value }] : [];
  });
  const found = cookies.find((c) => SESSION_COOKIE.test(c.name)) ?? (cookies.length === 1 ? cookies[0] : undefined);
  return found && `${found.name}=${found.value}`;
}

/** Whether a sign-in response accepted the credentials: 5.2 answers 204, older releases 200 `Ok.` (`Fails.` else). */
function signedIn(res: HttpResponse): boolean {
  if (res.status === 204) return true;
  return res.status === 200 && (res.body === null || (typeof res.body === 'string' && res.body.trim() === 'Ok.'));
}

/** The WebUI session: `POST /auth/login` with the connection's username and password as a form, the cookie it sets
 * sent on every call, and one sign-in again on a 401/403 (an expired session answers 403). Credentials and the
 * cookie never reach errors. */
export class QbtSession {
  private cookie?: string;
  private readonly username: string;
  private readonly password: string;
  private readonly signIn = singleFlight((http: HttpJsonClient, deadline: number) => this.doSignIn(http, deadline));

  constructor(init: InitParams) {
    this.username = requireString(init.config, 'username');
    this.password = requireString(init.secrets, 'password');
  }

  /** Auth options for an `HttpJsonClient`; `http()` returns that same client (sign-in uses its `raw`). */
  options(http: () => HttpJsonClient): Pick<HttpJsonClientOptions, 'headers' | 'before' | 'onAuthFailure'> {
    return {
      headers: (): Record<string, string> => (this.cookie ? { cookie: this.cookie } : {}),
      before: async (deadline) => {
        if (!this.cookie) await this.signIn(http(), deadline);
      },
      onAuthFailure: async (deadline) => {
        this.cookie = undefined;
        await this.signIn(http(), deadline);
        return true;
      },
    };
  }

  private async doSignIn(http: HttpJsonClient, deadline: number): Promise<void> {
    this.cookie = undefined;
    const res = await http.raw('POST', '/auth/login', {
      body: { username: this.username, password: this.password },
      bodyEncoding: 'form',
      deadline,
    });
    if (res.status === 403)
      throw new PluginError(
        ErrorCodes.UpstreamDenied,
        `${SERVICE} refused the sign-in: too many failed attempts banned this address for a while`,
      );
    if (res.status === 401 || (res.status === 200 && !signedIn(res)))
      throw new PluginError(ErrorCodes.UpstreamDenied, `${SERVICE} rejected the username or password`);
    if (!signedIn(res))
      throw upstreamError(SERVICE, statusKind(res.status), 'sign-in', `HTTP ${res.status}`, { status: res.status });
    const cookie = sessionCookie(res.headers['set-cookie']);
    if (!cookie) throw new PluginError(ErrorCodes.UpstreamError, `${SERVICE} sign-in set no session cookie`);
    this.cookie = cookie;
  }
}
