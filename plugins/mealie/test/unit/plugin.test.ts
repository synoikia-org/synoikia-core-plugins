import { ErrorCodes } from '@synoikia/plugin-sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createMealiePlugin } from '../../src/plugin.js';
import { CREDENTIALS, SPEC_TEXT, startFakeMealie } from '../fake-mealie.js';
import type { FakeMealie } from '../fake-mealie.js';

let fake: FakeMealie;
const plugin = createMealiePlugin();

beforeAll(async () => {
  fake = await startFakeMealie();
});
afterAll(async () => {
  await plugin.shutdown?.();
  await fake?.close();
});

const connection = () => ({ instanceId: 'mealie', config: { baseUrl: fake.url }, secrets: { ...CREDENTIALS } });

describe('Mealie plugin', () => {
  it('syncs the served spec and reports the version from /api/app/about', async () => {
    await plugin.init({ ...connection(), sdkVersion: '1' });
    const { upstreamVersion, operations } = await plugin.syncCatalog();
    expect(upstreamVersion).toBe('v3.28.0');
    expect(operations).toHaveLength(235);
    expect(fake.requests.some((r) => r.path === '/openapi.json')).toBe(true);
  });

  it('resolves paths only with their /api prefix, and refuses unknown ones', async () => {
    await expect(plugin.resolveOperation({ fn: 'request', args: [{ path: '/api/recipes/pasta' }] })).resolves.toEqual({
      key: 'GET /api/recipes/{slug}',
      params: { path: { slug: 'pasta' } },
    });
    await expect(plugin.resolveOperation({ fn: 'request', args: [{ path: '/recipes/pasta' }] })).rejects.toMatchObject({
      code: ErrorCodes.UnknownOperation,
    });
    await expect(
      plugin.resolveOperation({ fn: 'request', args: [{ path: '/api/auth/token', method: 'POST' }] }),
    ).rejects.toMatchObject({ code: ErrorCodes.UnknownOperation });
  });

  it('names the user in a locked delete, and falls back to the id when the lookup fails', async () => {
    expect(
      await plugin.summarize({
        key: 'DELETE /api/admin/users/{item_id}',
        params: { path: { item_id: 'u-2' } },
        targets: [],
      }),
    ).toEqual({ text: 'Mealie DELETE /api/admin/users/u-2', confirmLiteral: 'alex' });
    expect(
      await plugin.summarize({
        key: 'DELETE /api/admin/users/{item_id}',
        params: { path: { item_id: 'u-404' } },
        targets: [],
      }),
    ).toMatchObject({ confirmLiteral: 'u-404' });
  });

  it('refuses a served spec that is not OpenAPI, truncated, or missing a locked operation', async () => {
    const renamed = JSON.parse(SPEC_TEXT) as { paths: Record<string, unknown> };
    delete renamed.paths['/api/recipes/bulk-actions/delete'];
    for (const bad of [
      { detail: 'Not Found' },
      { openapi: '3.1.0', paths: { '/api/app/about': { get: {} } } },
      renamed,
    ]) {
      fake.serveSpec(bad);
      await expect(plugin.syncCatalog()).rejects.toMatchObject({ code: ErrorCodes.UpstreamError });
    }
    fake.serveSpec(JSON.parse(SPEC_TEXT));
    await expect(plugin.syncCatalog()).resolves.toMatchObject({ upstreamVersion: 'v3.28.0' });
  });

  it('refuses a connection without a base URL', async () => {
    await expect(createMealiePlugin().init({ ...connection(), config: {}, sdkVersion: '1' })).rejects.toMatchObject({
      code: ErrorCodes.InvalidParams,
    });
  });
});
