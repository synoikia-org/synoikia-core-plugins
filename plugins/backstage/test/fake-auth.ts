import type { IncomingHttpHeaders } from 'node:http';

/** The connection the tests use, and how the fake upstream checks it. */
export const CREDENTIALS = { token: 'fake-api-token-abcdef' };

export const authorized = (headers: IncomingHttpHeaders) => headers.authorization === `Bearer ${CREDENTIALS.token}`;
