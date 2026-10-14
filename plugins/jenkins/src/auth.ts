import { requireString } from '@synoikia/plugin-sdk';
import type { InitParams } from '@synoikia/plugin-sdk';

/** Authenticates every request with the connection's username and password (HTTP Basic). */
export function authHeaders({ config, secrets }: InitParams): () => Record<string, string> {
  const credentials = Buffer.from(
    `${requireString(config, 'username')}:${requireString(secrets, 'password')}`,
  ).toString('base64');
  return () => ({ authorization: `Basic ${credentials}` });
}
