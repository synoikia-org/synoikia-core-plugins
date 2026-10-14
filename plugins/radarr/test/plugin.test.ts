import { readFileSync } from 'node:fs';
import { checkConformance, ErrorCodes } from '@synoikia/plugin-sdk';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { settings } from '../src/catalog.js';
import { destinations, maskProviderFields } from '../src/fields.js';
import { createRadarrPlugin } from '../src/plugin.js';
import { CREDENTIALS, SECRETS, startFakeRadarr, TAG, VERSION } from './fake-radarr.js';
import type { FakeRadarr } from './fake-radarr.js';

const manifest: unknown = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const context = { callId: 'unit', deadlineMs: 5000 };

let fake: FakeRadarr;
const plugin = createRadarrPlugin();

beforeAll(async () => {
  fake = await startFakeRadarr();
  await plugin.init({ ...connection(), sdkVersion: '1' });
});
afterAll(async () => {
  await plugin.shutdown?.();
  await fake?.close();
});
beforeEach(() => {
  fake.reset();
  fake.version = VERSION;
  fake.specText = undefined;
  fake.specRefs = new Set(['develop', TAG]);
});

function connection() {
  return {
    instanceId: 'radarr',
    config: { baseUrl: fake.url, specBaseUrl: fake.specUrl },
    secrets: { ...CREDENTIALS },
  };
}
const resolve = (request: object) => plugin.resolveOperation({ fn: 'request', args: [request] });

describe('Radarr plugin', () => {
  it('passes the SDK conformance checks against the fake', async () => {
    const issues = await checkConformance({
      manifest,
      settings,
      handlers: createRadarrPlugin(),
      init: connection(),
      samples: [
        { fn: 'request', args: [{ path: '/api/v3/movie' }], expectKey: 'GET /api/v3/movie' },
        { fn: 'request', args: [{ method: 'DELETE', path: '/api/v3/tag/3' }], expectKey: 'DELETE /api/v3/tag/{id}' },
      ],
      rejects: [
        { fn: 'request', args: [{ path: '/api/v3/filesystem' }] },
        { fn: 'other', args: [] },
      ],
    });
    expect(issues).toEqual([]);
  });

  it('syncs the spec from the tag of the instance version, without credentials', async () => {
    fake.specFetches.length = 0;
    const { upstreamVersion, sourceRef, operations } = await plugin.syncCatalog();
    expect({ upstreamVersion, sourceRef, count: operations.length }).toEqual({
      upstreamVersion: VERSION,
      sourceRef: TAG,
      count: 229,
    });
    expect(fake.specFetches).toEqual([TAG]);
    expect(fake.requests.filter((r) => r.path.startsWith('/spec/')).every((r) => !r.headers['x-api-key'])).toBe(true);
  });

  it('falls back to develop for an untagged build or a version that is not a release', async () => {
    fake.version = '6.5.0.10700';
    fake.specFetches.length = 0;
    await expect(plugin.syncCatalog()).resolves.toMatchObject({ sourceRef: 'develop' });
    expect(fake.specFetches).toEqual(['v6.5.0.10700', 'develop']);
    fake.version = '6.5.0-nightly';
    fake.specFetches.length = 0;
    await expect(plugin.syncCatalog()).resolves.toMatchObject({ sourceRef: 'develop' });
    expect(fake.specFetches).toEqual(['develop']);
  });

  it('refuses a fetched spec that is not usable, or missing everywhere', async () => {
    fake.specText = '{"openapi":"3.0.4","paths":{}}';
    await expect(plugin.syncCatalog()).rejects.toMatchObject({ code: ErrorCodes.UpstreamError });
    fake.specText = undefined;
    fake.specRefs = new Set();
    await expect(plugin.syncCatalog()).rejects.toMatchObject({ code: ErrorCodes.UpstreamError });
  });

  it('resolves full /api/v3 paths, and refuses excluded or unknown ones', async () => {
    await expect(resolve({ path: '/api/v3/movie/1' })).resolves.toEqual({
      key: 'GET /api/v3/movie/{id}',
      params: { path: { id: '1' } },
    });
    for (const path of ['/movie/1', '/api/v3/filesystem', '/api/v3/log/file/radarr.txt', '/ping'])
      await expect(resolve({ path }), path).rejects.toMatchObject({ code: ErrorCodes.UnknownOperation });
  });

  it('picks the locked twins from the call', async () => {
    const key = async (request: object) => (await resolve(request)).key;
    expect(await key({ method: 'DELETE', path: '/api/v3/movie/1' })).toBe('DELETE /api/v3/movie/{id}');
    expect(await key({ method: 'DELETE', path: '/api/v3/movie/1', query: { deleteFiles: true } })).toBe(
      'DELETE /api/v3/movie/{id}#delete-files',
    );
    expect(await key({ method: 'POST', path: '/api/v3/command', body: { name: 'RssSync' } })).toBe(
      'POST /api/v3/command',
    );
    expect(await key({ method: 'POST', path: '/api/v3/command', body: { name: 'RenameMovie', movieIds: [1] } })).toBe(
      'POST /api/v3/command#heavy',
    );
    expect(await key({ method: 'POST', path: '/api/v3/indexer/test', body: { name: 'x', fields: [] } })).toBe(
      'POST /api/v3/indexer/test',
    );
    expect(await key({ method: 'POST', path: '/api/v3/indexer/test', body: { id: 7, name: 'x', fields: [] } })).toBe(
      'POST /api/v3/indexer/test#stored',
    );
  });

  it('refuses a write carrying a masked value from an earlier result', async () => {
    await expect(
      resolve({ method: 'PUT', path: '/api/v3/config/host/1', body: { id: 1, password: '[REDACTED]' } }),
    ).rejects.toMatchObject({ code: ErrorCodes.InvalidParams });
    const fields = [{ name: 'webHookUrl', value: 'https://discord.com/[REDACTED]' }];
    await expect(
      resolve({ method: 'PUT', path: '/api/v3/notification/9', body: { id: 9, name: 'Discord', fields } }),
    ).rejects.toMatchObject({ code: ErrorCodes.InvalidParams });
    // Radarr's own mask keeps the stored secret, so it passes.
    const kept = [{ name: 'password', value: '********', privacy: 'password' }];
    await expect(
      resolve({ method: 'PUT', path: '/api/v3/downloadclient/6', body: { id: 6, name: 'qBit', fields: kept } }),
    ).resolves.toMatchObject({ key: 'PUT /api/v3/downloadclient/{id}' });
  });

  it('names the movies, connections and release source a call acts on', async () => {
    const targets = (key: string, params: object) => plugin.resolveTargets!({ key, params });
    await expect(targets('DELETE /api/v3/movie/{id}#delete-files', { path: { id: '1' } })).resolves.toEqual([
      { kind: 'movie', id: '1', name: 'Inception (2010) at /movies/Inception (2010)' },
    ]);
    await expect(targets('DELETE /api/v3/movie/{id}', { path: { id: '404' } })).resolves.toEqual([
      { kind: 'movie', id: '404', name: 'movie 404' },
    ]);
    const editor = await targets('PUT /api/v3/movie/editor', { body: { movieIds: [1, 2, ...Array(11).fill(9)] } });
    expect(editor.map((t) => t.name).slice(0, 2)).toEqual([
      'Inception (2010) at /movies/Inception (2010)',
      'Arrival (2016) at /movies/Arrival (2016)',
    ]);
    expect(editor.at(-1)).toEqual({ kind: 'movie', id: 'more', name: '3 more movies' });
    await expect(
      targets('PUT /api/v3/movie/{id}#move-files', { path: { id: '2' }, body: { path: '/x/Arrival' } }),
    ).resolves.toEqual([{ kind: 'movie', id: '2', name: 'Arrival (2016) at /movies/Arrival (2016) → /x/Arrival' }]);
    const moved = await targets('PUT /api/v3/movie/editor', { body: { movieIds: [1], rootFolderPath: '/4k' } });
    expect(moved.at(-1)).toEqual({ kind: 'folder', id: 'rootFolderPath', name: 'into /4k' });
    await expect(targets('DELETE /api/v3/downloadclient/{id}', { path: { id: '6' } })).resolves.toEqual([
      { kind: 'downloadclient', id: '6', name: 'downloadclient qBit (QBittorrent) → http://qbittorrent.lan:8080' },
    ]);
    const body = {
      id: 9,
      name: 'Discord‮',
      implementation: 'Discord',
      fields: [{ name: 'webHookUrl', value: `https://discord.com/api/webhooks/42/${SECRETS.webhookToken}` }],
    };
    await expect(targets('POST /api/v3/notification/test', { body })).resolves.toEqual([
      { kind: 'notification', id: '9', name: 'notification Discord\\u202e (Discord) → https://discord.com' },
    ]);
    await expect(
      targets('POST /api/v3/release/push', { body: { title: 'X', downloadUrl: 'https://t.example/dl?passkey=pk' } }),
    ).resolves.toEqual([{ kind: 'release', id: 'push', name: 'X from https://t.example' }]);
    await expect(targets('GET /api/v3/movie/{id}', { path: { id: '1' } })).resolves.toEqual([]);
  });

  it('puts the destination ahead of a long body in the approval text', async () => {
    const targets = [{ kind: 'downloadclient', id: 'new', name: 'downloadclient X (Sabnzbd) → http://sab.lan:8085' }];
    const { text, confirmLiteral } = await plugin.summarize({
      key: 'POST /api/v3/downloadclient',
      params: { body: { name: 'X', padding: 'p'.repeat(2000), fields: '[REDACTED]' } },
      targets,
    });
    expect(text).toMatch(
      /^Radarr POST \/api\/v3\/downloadclient on downloadclient X \(Sabnzbd\) → http:\/\/sab\.lan:8085 \{/,
    );
    expect(confirmLiteral).toBe('X');
  });

  it('masks provider secrets in results the way Radarr does, and webhook URLs to their origin', async () => {
    await plugin.syncCatalog();
    const invoke = async (path: string) => {
      const { key, params } = await resolve({ path });
      return JSON.stringify(await plugin.invoke({ key, params, context }));
    };
    const clients = await invoke('/api/v3/downloadclient');
    expect(clients).not.toContain(SECRETS.clientPassword);
    expect(clients).toContain('"value":"********"');
    expect(clients).toContain('qbittorrent.lan');
    expect(clients).toContain('"value":"radarr"');
    expect(await invoke('/api/v3/indexer/7')).not.toContain(SECRETS.indexerApiKey);
    const hooks = await invoke('/api/v3/notification');
    expect(hooks).not.toContain(SECRETS.webhookToken);
    expect(hooks).toContain('"value":"https://discord.com/[REDACTED]"');
  });

  it('reports a rejected key without throwing', async () => {
    const bad = createRadarrPlugin();
    await bad.init({ ...connection(), secrets: { apiKey: 'wrong' }, sdkVersion: '1' });
    expect(await bad.testConnection()).toMatchObject({ ok: false });
    await bad.shutdown?.();
  });
});

describe('provider fields', () => {
  it('keeps hosts and plain URLs, hides credentials, queries and secret-named values', () => {
    const fields = [
      { name: 'baseUrl', value: 'https://user:pw@idx.example/api?apikey=k', privacy: 'normal' },
      { name: 'apiPath', value: '/api', privacy: 'normal' },
      { name: 'botToken', value: 'abc', privacy: 'normal' },
      { name: 'seedCriteria', value: { nested: 1 } },
    ];
    expect(maskProviderFields({ fields }, false)).toEqual({
      fields: [
        { name: 'baseUrl', value: 'https://idx.example/api/[REDACTED]', privacy: 'normal' },
        { name: 'apiPath', value: '/api', privacy: 'normal' },
        { name: 'botToken', value: '[REDACTED]', privacy: 'normal' },
        { name: 'seedCriteria', value: { nested: 1 } },
      ],
    });
  });

  it('lists hosts, URL origins and recipients, never a secret field', () => {
    expect(
      destinations({
        fields: [
          { name: 'server', value: 'smtp.example' },
          { name: 'to', value: ['a@example.com', 'b@example.com'] },
          { name: 'apiKey', value: 'https://secret.example/' },
          { name: 'url', value: 'https://hooks.example/t/x' },
        ],
      }),
    ).toEqual(['smtp.example', 'a@example.com', 'b@example.com', 'https://hooks.example']);
  });
});
