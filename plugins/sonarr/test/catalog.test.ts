import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCatalog, settings, splitWhen } from '../src/catalog.js';
import { lockedKeys } from '../src/locks.js';
import { tagFor } from '../src/spec.js';
import { SPEC_TEXT } from './fake-sonarr.js';
import { LOCK_CASES } from './locks.js';

const LOCKED_TOTAL = 32;

/** The catalog from the pinned Sonarr v4.0.20.3014 spec: a rename upstream must fail here, not silently unlock. */

const catalog = buildCatalog(SPEC_TEXT);
const keys = new Set(catalog.operations.map((o) => o.key));
const op = (key: string) => catalog.operations.find((o) => o.key === key);
const listOf = (m: string | string[]) => (Array.isArray(m) ? m : [m]);
const globRe = (glob: string) => new RegExp(`^${glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
const specOf = () => JSON.parse(SPEC_TEXT) as { paths: Record<string, Record<string, unknown>> };
const VERBS = ['get', 'post', 'put', 'patch', 'delete'];

describe('Sonarr catalog (pinned spec)', () => {
  it('keys every operation by the spec path, /api/v3 included', () => {
    expect(catalog.operations).toHaveLength(230);
    for (const key of keys) expect(key).toMatch(/^(GET|POST|PUT|DELETE) \/api\/v3\//);
  });

  it('has every key plugin.yaml locks, and each one is locked', () => {
    const locked = lockedKeys(settings.rules);
    expect(locked).toHaveLength(9);
    for (const key of locked) {
      expect(keys).toContain(key);
      expect(op(key)).toMatchObject({ locked: true, typedConfirmation: true, classification: 'write' });
    }
  });

  it('locks bulk deletes and every split twin, and no single-item delete or write the rules do not name', () => {
    const bulk = (k: string) => /^DELETE \S+\/(bulk|editor)$/.test(k);
    const locked = catalog.operations.filter((o) => o.locked).map((o) => o.key);
    for (const o of catalog.operations.filter((x) => bulk(x.key) || x.key.includes('#')))
      expect(o.locked, o.key).toBe(true);
    const named = new Set(lockedKeys(settings.rules));
    expect(locked.filter((k) => !bulk(k) && !k.includes('#') && !named.has(k))).toEqual([]);
    for (const key of ['DELETE /api/v3/series/{id}', 'DELETE /api/v3/episodefile/{id}', 'DELETE /api/v3/tag/{id}'])
      expect(op(key), key).toMatchObject({ locked: false, typedConfirmation: false, classification: 'write' });
    for (const key of ['POST /api/v3/downloadclient', 'PUT /api/v3/indexer/{id}', 'POST /api/v3/release/push'])
      expect(op(key), key).toMatchObject({ locked: false, classification: 'write' });
    expect(locked).toHaveLength(LOCKED_TOTAL);
  });

  it('describes every operation, by hand where plugin.yaml says why it is locked or split', () => {
    for (const o of catalog.operations) expect(o.docs?.description, o.key).toMatch(/\w/);
    expect(op('GET /api/v3/series')?.docs?.description).toBe('List series');
    expect(op('GET /api/v3/series/{id}')?.docs?.description).toBe('Get a series by id');
    expect(op('DELETE /api/v3/series/{id}')?.docs?.description).toBe('Delete a series');
    expect(op('POST /api/v3/downloadclient/test')?.docs?.description).toMatch(/#stored twin/);
    for (const o of catalog.operations.filter((x) => x.locked || x.key.includes('#')))
      expect(o.docs?.description, o.key).toMatch(/Locked|locked|twin/);
  });

  it('has a lock case for every named lock and every twin', () => {
    const cases = new Set(LOCK_CASES.map((c) => c.key));
    for (const o of catalog.operations.filter((x) => x.locked && !x.key.startsWith('DELETE ')))
      expect(cases, o.key).toContain(o.key);
    for (const o of catalog.operations.filter((x) => x.key.includes('#'))) expect(cases, o.key).toContain(o.key);
    for (const key of cases) expect(op(key)?.locked, key).toBe(true);
  });

  it('matches at least one operation with every rule pattern', () => {
    // Forward-looking: only newer specs have the UI password reset.
    const ahead = new Set(['POST /reset-password*']);
    for (const pattern of settings.rules.flatMap((r) => listOf(r.match)).filter((p) => !ahead.has(p)))
      expect(
        [...keys].some((k) => globRe(pattern).test(k)),
        pattern,
      ).toBe(true);
  });

  it('leaves out the UI, sign-in, feeds, file downloads, filesystem browsing and the backup upload', () => {
    for (const key of [
      'GET /',
      'GET /{path}',
      'POST /login',
      'GET /ping',
      'GET /api',
      'GET /feed/v3/calendar/sonarr.ics',
      'GET /api/v3/log/file/{filename}',
      'GET /api/v3/mediacover/{seriesId}/{filename}',
      'GET /api/v3/filesystem',
      'GET /api/v3/filesystem/mediafiles',
      'GET /api/v3/manualimport',
      'POST /api/v3/manualimport',
      'POST /api/v3/system/backup/restore/upload',
    ])
      expect(keys.has(key), key).toBe(false);
    const specKeys = Object.entries(specOf().paths).flatMap(([path, item]) =>
      Object.keys(item)
        .filter((verb) => VERBS.includes(verb))
        .map((verb) => `${verb.toUpperCase()} ${path}`),
    );
    const twins = catalog.operations.filter((o) => o.key.includes('#')).length;
    expect(specKeys.length - (keys.size - twins)).toBe(20);
  });

  it('reads with GET and writes with every other verb; no GET is left for review', () => {
    for (const o of catalog.operations) {
      expect(o.classification, o.key).toBe(o.key.startsWith('GET ') && !o.locked ? 'read' : 'write');
      expect(o.needsReview ?? false, o.key).toBe(false);
    }
  });

  it('hides provider fields in params, host secrets and release URLs in results', () => {
    for (const key of [
      'POST /api/v3/downloadclient',
      'PUT /api/v3/indexer/{id}',
      'POST /api/v3/notification/test',
      'POST /api/v3/importlist/test#stored',
    ])
      expect(op(key)?.sensitiveParams, key).toContain('/body/fields');
    expect(op('PUT /api/v3/config/host/{id}')?.sensitiveParams).toEqual(
      expect.arrayContaining(['/body/apiKey', '/body/password', '/body/proxyPassword']),
    );
    expect(op('GET /api/v3/config/host')?.sensitiveResult).toMatchObject({ keys: expect.arrayContaining(['apiKey']) });
    expect(op('GET /api/v3/release')?.sensitiveResult).toEqual({
      keys: ['downloadUrl', 'magnetUrl', 'url'],
      deep: true,
    });
    expect(op('GET /api/v3/history')?.sensitiveResult).toEqual({
      keys: ['downloadUrl', 'magnetUrl', 'url'],
      deep: true,
    });
    expect(op('POST /api/v3/release/push')?.sensitiveParams).toEqual([
      '/body/downloadUrl',
      '/body/magnetUrl',
      '/body/guid',
      '/body/infoUrl',
      '/body/commentUrl',
    ]);
  });

  it('locks a bulk delete a newer spec adds, and leaves a new single delete a regular write', () => {
    const spec = specOf();
    const paths = {
      ...spec.paths,
      '/api/v3/movie/{id}': { delete: { tags: ['Movie'] } },
      '/api/v3/movie/bulk': { delete: { tags: ['Movie'] } },
    };
    const ops = buildCatalog({ ...spec, paths }).operations;
    expect(ops.find((o) => o.key === 'DELETE /api/v3/movie/bulk')).toMatchObject({ locked: true });
    expect(ops.find((o) => o.key === 'DELETE /api/v3/movie/{id}')).toMatchObject({
      locked: false,
      classification: 'write',
    });
  });

  it('locks the UI password reset a newer spec adds, without requiring it', () => {
    const spec = specOf();
    const form = { content: { 'multipart/form-data': { schema: { type: 'object' } } } };
    const paths = {
      ...spec.paths,
      '/reset-password': { post: { tags: ['Authentication'], requestBody: form } },
      '/reset-password/request': { post: { tags: ['Authentication'] } },
    };
    const ops = buildCatalog({ ...spec, paths }).operations;
    for (const key of ['POST /reset-password', 'POST /reset-password/request'])
      expect(
        ops.find((o) => o.key === key),
        key,
      ).toMatchObject({ locked: true, typedConfirmation: true });
    expect(ops.find((o) => o.key === 'POST /reset-password')?.sensitiveParams).toEqual(
      expect.arrayContaining(['/body/password', '/body/token']),
    );
    expect(keys.has('POST /reset-password')).toBe(false);
  });

  it('refuses a truncated spec', () => {
    const spec = specOf();
    const small = { ...spec, paths: Object.fromEntries(Object.entries(spec.paths).slice(0, 20)) };
    expect(() => buildCatalog(small)).toThrow(/refusing a partial catalog/);
  });

  it('refuses a spec that lost a locked operation, as after an upstream rename', () => {
    const spec = specOf();
    const { post: _gone, ...rest } = spec.paths['/api/v3/system/restart']!;
    const renamed = { ...spec, paths: { ...spec.paths, '/api/v3/system/restart': rest } };
    expect(() => buildCatalog(renamed)).toThrow(/lacks locked operations \(POST \/api\/v3\/system\/restart\)/);
  });
});

describe('split predicates', () => {
  const call = (key: string, params: object) =>
    ({ key, method: key.split(' ')[0], template: key.split(' ')[1], params, request: {} }) as Parameters<
      ReturnType<typeof splitWhen>['heavy']
    >[0];
  const offline = splitWhen();

  it('takes #delete-files on a bulk delete for any flag that is not plainly off, and #move-files', () => {
    const bulk = (body?: unknown) => offline['delete-files']!(call('DELETE /api/v3/series/editor', { body }));
    expect([bulk({ seriesIds: [1] }), bulk({ seriesIds: [1], deleteFiles: 'false' })]).toEqual([false, false]);
    expect([bulk({ seriesIds: [1], deleteFiles: true }), bulk({ deleteFiles: 1 }), bulk(undefined)]).toEqual([
      true,
      true,
      true,
    ]);
    expect(offline['move-files']!(call('PUT /api/v3/series/{id}', { query: { moveFiles: 'True' } }))).toBe(true);
  });

  it('takes #heavy for any command not listed as quick, compared case-insensitively', () => {
    const heavy = (body: unknown) => offline.heavy!(call('POST /api/v3/command', { body }));
    expect(heavy({ name: 'SeriesSearch', seriesId: 1 })).toBe(false);
    expect(heavy({ name: 'rsssync' })).toBe(false);
    for (const name of [
      'RenameFiles',
      'RenameSeries',
      'MoveSeries',
      'BulkMoveSeries',
      'ManualImport',
      'DownloadedEpisodesScan',
      'DeleteLogFiles',
      'ResetApiKey',
      'ApplicationUpdate',
      'ApplicationUpdateCheck',
      'Nope',
      7,
    ])
      expect(heavy({ name }), String(name)).toBe(true);
    expect(heavy(undefined)).toBe(true);
  });

  const qbit = {
    id: 6,
    name: 'qBit',
    implementation: 'QBittorrent',
    fields: [
      { name: 'host', value: 'qbittorrent.lan' },
      { name: 'port', value: 8080 },
      { name: 'urlBase', value: '' },
      { name: 'useSsl', value: false },
      { name: 'password', value: '********', privacy: 'password' },
    ],
  };
  const KEY = 'POST /api/v3/downloadclient/test';
  const withField = (name: string, value: unknown) => ({
    ...qbit,
    fields: qbit.fields.map((f) => (f.name === name ? { ...f, value } : f)),
  });

  it('takes #stored only when a stored connection is sent to another destination', async () => {
    const seen: string[] = [];
    const stored = splitWhen(async (path) => {
      seen.push(path);
      if (path === '/api/v3/downloadclient/6') return qbit;
      throw new Error('404');
    }).stored!;
    const take = (body: unknown) => stored(call(KEY, { body }));
    expect([await take({}), await take({ id: 0 }), await take({ id: null })]).toEqual([false, false, false]);
    expect(await take(qbit)).toBe(false);
    expect(await take({ ...withField('host', 'QBITTORRENT.LAN'), name: 'renamed' })).toBe(false);
    expect(seen).toContain('/api/v3/downloadclient/6');
    for (const body of [
      withField('host', 'collector.example'),
      withField('port', 443),
      withField('useSsl', true),
      withField('urlBase', '/x'),
      { ...qbit, implementation: 'Transmission' },
      { ...qbit, fields: qbit.fields.filter((f) => f.name !== 'host') },
      { ...qbit, fields: [...qbit.fields, { name: 'proxyUrl', value: 'https://collector.example' }] },
      { ...qbit, id: 99 },
      { ...qbit, id: '6', fields: 'nope' },
    ])
      expect(await take(body), JSON.stringify(body)).toBe(true);
    expect(await offline.stored!(call(KEY, { body: qbit }))).toBe(true);
  });

  it('takes #script for a notification that runs a program, and testall while one is stored', async () => {
    const script = (key: string, body: unknown, rows?: unknown) =>
      splitWhen(async () => {
        if (rows === undefined) throw new Error('down');
        return rows;
      }).script!(call(key, { body }));
    const hook = { name: 'Hook', implementation: 'Webhook', fields: [{ name: 'url', value: 'https://h.example' }] };
    expect(await script('POST /api/v3/notification', hook)).toBe(false);
    for (const body of [
      { name: 'Run', implementation: 'CustomScript', fields: [] },
      { name: 'Run', implementation: 'customscript' },
      { name: 'x', implementation: 'Other', fields: [{ name: 'Path', value: '/bin/sh' }] },
      { name: 'x', implementation: 'Other', fields: [{ name: 'p', type: 'filePath', value: '/x' }] },
      { id: 9, name: 'no implementation' },
      undefined,
    ])
      expect(await script('PUT /api/v3/notification/{id}', body), JSON.stringify(body)).toBe(true);
    const TESTALL = 'POST /api/v3/notification/testall';
    expect(await script(TESTALL, undefined, [hook])).toBe(false);
    expect(await script(TESTALL, undefined, [hook, { implementation: 'CustomScript' }])).toBe(true);
    expect(await script(TESTALL, undefined, { not: 'a list' })).toBe(true);
    expect(await script(TESTALL, undefined)).toBe(true);
  });
});

describe('spec tag', () => {
  it('maps a 4-part Servarr version to its tag and nothing else', () => {
    expect(tagFor('4.0.20.3014')).toBe('v4.0.20.3014');
    expect(tagFor('v4.0.20.3014')).toBe('v4.0.20.3014');
    for (const v of ['4.0.20', '4.0.20.3014-nightly', 'main', '../x']) expect(tagFor(v), v).toBeUndefined();
  });
});

describe('instructions.md', () => {
  const text = readFileSync(new URL('../instructions.md', import.meta.url), 'utf8');

  it('stays within 1.5 KB', () => {
    expect(Buffer.byteLength(text, 'utf8')).toBeLessThanOrEqual(1536);
  });

  it('names only operations the catalog has', () => {
    const named = [...text.matchAll(/`((?:GET|POST|PUT|PATCH|DELETE) \/[^`\s]+)`/g)].map((m) => m[1]!);
    expect(named.length).toBeGreaterThanOrEqual(10);
    for (const key of named) expect(keys, key).toContain(key);
  });
});
