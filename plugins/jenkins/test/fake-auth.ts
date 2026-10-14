import type { IncomingHttpHeaders } from 'node:http';

/** The connection the tests use, and how the fake upstream checks it. */
export const CREDENTIALS = { username: 'synoikia', password: 'fake-password-abcdef' };

export const authorized = (headers: IncomingHttpHeaders) =>
  headers.authorization ===
  `Basic ${Buffer.from(`${CREDENTIALS.username}:${CREDENTIALS.password}`).toString('base64')}`;
