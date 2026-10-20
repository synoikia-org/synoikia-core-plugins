import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildCatalog, custom, settings, splitWhen } from '../../src/catalog.js';
import { lockedKeys } from '../../src/locks.js';
import { tagFor } from '../../src/spec.js';
import { SPEC_TEXT } from '../fake-prowlarr.js';

const LOCKED_TOTAL = 36;

/** The catalog from the pinned Prowlarr v2.6.5.5623 spec: a rename upstream must fail here, not silently unlock. */

const catalog = buildCatalog(SPEC_TEXT);
const keys = new Set(catalog.operations.map((o) => o.key));
const op = (key: string) => catalog.operations.find((o) => o.key === key);
const listOf = (m: string | string[]) => (Array.isArray(m) ? m : [m]);
const globRe = (glob: string) => new RegExp(`^${glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
const specOf = () => JSON.parse(SPEC_TEXT) as { paths: Record<string, Record<string, unknown>> };
const VERBS = ['get', 'post', 'put', 'patch', 'delete'];

describe('Prowlarr catalog (pinned spec)', () => {
  it('keys every operation by the spec path, /api/v1 included', () => {
    expect(catalog.operations).toHaveLength(134);
    for (const key of keys) expect(key).toMatch(/^(GET|POST|PUT|DELETE) \/api\/v1\//);
  });

  it('has every key plugin.yaml locks, and each one is locked', () => {
    const locked = lockedKeys(settings.rules);
    expect(locked).toHaveLength(8);
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
    for (const key of ['DELETE /api/v1/indexer/{id}', 'DELETE /api/v1/applications/{id}', 'DELETE /api/v1/tag/{id}'])
      expect(op(key), key).toMatchObject({ locked: false, typedConfirmation: false, classification: 'write' });
    expect(locked).toHaveLength(LOCKED_TOTAL);
  });

  it('describes every operation, by hand where plugin.yaml says why it is locked or split', () => {
    for (const o of catalog.operations) expect(o.docs?.description, o.key).toMatch(/\w/);
    expect(op('GET /api/v1/indexer')?.docs?.description).toBe('List indexers');
    expect(op('GET /api/v1/indexer/{id}')?.docs?.description).toBe('Get an indexer by id');
    expect(op('DELETE /api/v1/indexer/{id}')?.docs?.description).toBe('Delete an indexer');
    for (const o of catalog.operations.filter((x) => x.locked || x.key.includes('#')))
      expect(o.docs?.description, o.key).toMatch(/Locked|locked|twin/);
  });

  it('locks bulk edits, application tests to every app and instance settings; single provider writes are regular', () => {
    for (const key of [
      'PUT /api/v1/applications/bulk',
      'POST /api/v1/applications/testall',
      'PUT /api/v1/config/development/{id}',
      'POST /api/v1/applications/test#stored',
      'POST /api/v1/applications/action/{name}#stored',
      'PUT /api/v1/indexer/bulk',
      'DELETE /api/v1/indexer/bulk',
    ])
      expect(op(key), key).toMatchObject({ locked: true, typedConfirmation: true });
    for (const key of [
      'POST /api/v1/applications',
      'PUT /api/v1/applications/{id}',
      'POST /api/v1/applications/test',
      'POST /api/v1/applications/action/{name}',
      'DELETE /api/v1/applications/{id}',
      'POST /api/v1/indexer',
      'PUT /api/v1/indexer/{id}',
      'POST /api/v1/indexerproxy',
      'PUT /api/v1/indexerproxy/{id}',
    ])
      expect(op(key), key).toMatchObject({ locked: false, classification: 'write' });
    for (const key of ['GET /api/v1/search', 'GET /api/v1/history', 'GET /api/v1/indexerstats', 'GET /api/v1/indexer'])
      expect(op(key), key).toMatchObject({ locked: false, classification: 'read' });
    for (const key of ['POST /api/v1/search', 'POST /api/v1/search/bulk', 'POST /api/v1/indexer/testall'])
      expect(op(key), key).toMatchObject({ locked: false, classification: 'write' });
  });

  it('matches at least one operation with every rule pattern', () => {
    // Forward-looking: Prowlarr has no editor endpoint or UI password reset yet.
    const ahead = new Set(['DELETE */editor', 'POST /reset-password*']);
    for (const pattern of settings.rules.flatMap((r) => listOf(r.match)).filter((p) => !ahead.has(p)))
      expect(
        [...keys].some((k) => globRe(pattern).test(k)),
        pattern,
      ).toBe(true);
  });

  it('leaves out the UI, sign-in, log files, filesystem browsing, the backup upload and the Newznab proxy', () => {
    for (const key of [
      'GET /',
      'GET /{path}',
      'POST /login',
      'GET /ping',
      'GET /api',
      'GET /api/v1/log/file',
      'GET /api/v1/log/file/{filename}',
      'GET /api/v1/log/file/update/{filename}',
      'GET /api/v1/filesystem',
      'GET /api/v1/filesystem/type',
      'POST /api/v1/system/backup/restore/upload',
      'GET /{id}/api',
      'GET /{id}/download',
      'GET /api/v1/indexer/{id}/newznab',
      'GET /api/v1/indexer/{id}/download',
    ])
      expect(keys.has(key), key).toBe(false);
    const specKeys = Object.entries(specOf().paths).flatMap(([path, item]) =>
      Object.keys(item)
        .filter((verb) => VERBS.includes(verb))
        .map((verb) => `${verb.toUpperCase()} ${path}`),
    );
    const twins = catalog.operations.filter((o) => o.key.includes('#')).length;
    expect(specKeys.length - (keys.size - twins)).toBe(19);
  });

  it('reads with GET and writes with every other verb; no GET is left for review', () => {
    for (const o of catalog.operations) {
      expect(o.classification, o.key).toBe(o.key.startsWith('GET ') && !o.locked ? 'read' : 'write');
      expect(o.needsReview ?? false, o.key).toBe(false);
    }
  });

  it('hides provider fields in params, host secrets and search and history links in results', () => {
    for (const key of [
      'POST /api/v1/downloadclient',
      'PUT /api/v1/indexer/{id}',
      'POST /api/v1/indexerproxy',
      'POST /api/v1/notification/test',
      'POST /api/v1/applications',
      'POST /api/v1/applications/test#stored',
    ])
      expect(op(key)?.sensitiveParams, key).toContain('/body/fields');
    expect(op('PUT /api/v1/config/host/{id}')?.sensitiveParams).toEqual(
      expect.arrayContaining(['/body/apiKey', '/body/password', '/body/proxyPassword']),
    );
    expect(op('GET /api/v1/config/host')?.sensitiveResult).toMatchObject({ keys: expect.arrayContaining(['apiKey']) });
    for (const key of [
      'GET /api/v1/search',
      'POST /api/v1/search',
      'GET /api/v1/history',
      'GET /api/v1/history/indexer',
    ])
      expect(op(key)?.sensitiveResult, key).toEqual({ keys: ['downloadUrl', 'magnetUrl', 'url'], deep: true });
  });

  it('locks a bulk delete a newer spec adds, and leaves a new single delete a regular write', () => {
    const spec = specOf();
    const paths = {
      ...spec.paths,
      '/api/v1/history/{id}': { delete: { tags: ['History'] } },
      '/api/v1/history/bulk': { delete: { tags: ['History'] } },
    };
    const ops = buildCatalog({ ...spec, paths }).operations;
    expect(ops.find((o) => o.key === 'DELETE /api/v1/history/bulk')).toMatchObject({ locked: true });
    expect(ops.find((o) => o.key === 'DELETE /api/v1/history/{id}')).toMatchObject({
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
    const { post: _gone, ...rest } = spec.paths['/api/v1/applications/testall']!;
    const renamed = { ...spec, paths: { ...spec.paths, '/api/v1/applications/testall': rest } };
    expect(() => buildCatalog(renamed)).toThrow(/lacks locked operations \(POST \/api\/v1\/applications\/testall\)/);
  });
});

describe('split predicates and literals', () => {
  const call = (key: string, params: object) =>
    ({ key, method: key.split(' ')[0], template: key.split(' ')[1], params, request: {} }) as Parameters<
      ReturnType<typeof splitWhen>['heavy']
    >[0];
  const offline = splitWhen();

  it('takes #heavy for any command not listed as quick, compared case-insensitively', () => {
    const heavy = (body: unknown) => offline.heavy!(call('POST /api/v1/command', { body }));
    expect(heavy({ name: 'CheckHealth' })).toBe(false);
    expect(heavy({ name: 'indexerdefinitionupdate' })).toBe(false);
    for (const name of [
      'ApplicationIndexerSync',
      'ApplicationUpdateCheck',
      'ApplicationUpdate',
      'ClearHistory',
      'ClearLog',
      'DeleteLogFiles',
      'ResetApiKey',
      'Restart',
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
  const KEY = 'POST /api/v1/downloadclient/test';
  const withField = (name: string, value: unknown) => ({
    ...qbit,
    fields: qbit.fields.map((f) => (f.name === name ? { ...f, value } : f)),
  });

  it('takes #stored only when a stored connection is sent to another destination', async () => {
    const seen: string[] = [];
    const stored = splitWhen(async (path) => {
      seen.push(path);
      if (path === '/api/v1/downloadclient/6') return qbit;
      throw new Error('404');
    }).stored!;
    const take = (body: unknown) => stored(call(KEY, { body }));
    expect([await take({}), await take({ id: 0 }), await take({ id: null })]).toEqual([false, false, false]);
    expect(await take(qbit)).toBe(false);
    expect(await take({ ...withField('host', 'QBITTORRENT.LAN'), name: 'renamed' })).toBe(false);
    expect(seen).toContain('/api/v1/downloadclient/6');
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

  it('takes #stored on a save whose destination changes, by the path id, and refuses another body id', async () => {
    const get = async (path: string) => {
      if (path === '/api/v1/downloadclient/6') return qbit;
      throw new Error('404');
    };
    const PUT = 'PUT /api/v1/downloadclient/{id}';
    const save = (body: unknown, id = '6') => splitWhen(get).stored!(call(PUT, { path: { id }, body }));
    expect(await save(qbit)).toBe(false);
    expect(await save({ ...qbit, id: undefined })).toBe(false);
    // A new host with the stored password kept as ********: Servarr tests the client on save with that password.
    expect(await save(withField('host', 'collector.example'))).toBe(true);
    expect(await save({ ...qbit, id: undefined }, '99')).toBe(true);
    await expect(save({ ...qbit, id: 7 })).rejects.toMatchObject({ code: 'INVALID_PARAMS' });
    expect(await offline.stored!(call(PUT, { path: { id: '6' }, body: qbit }))).toBe(true);
  });

  it('takes #folder for a download client that writes files to a host folder', () => {
    const folder = (body: unknown) => offline.folder!(call('POST /api/v1/downloadclient', { body }));
    expect(folder(qbit)).toBe(false);
    for (const body of [
      { ...qbit, implementation: 'TorrentBlackhole' },
      { ...qbit, implementation: 'usenetblackhole' },
      { ...qbit, implementation: 'Pneumatic' },
      { ...qbit, fields: [...qbit.fields, { name: 'watchFolder', value: '/w' }] },
      { ...qbit, fields: [...qbit.fields, { name: 'nzbPath', value: '/n' }] },
      { ...qbit, fields: [...qbit.fields, { name: 'x', type: 'path', value: '/x' }] },
      { id: 6, name: 'no implementation' },
      undefined,
    ])
      expect(folder(body), JSON.stringify(body)).toBe(true);
  });

  it('counts a change of tags as a destination change: tags pick the indexer proxy', async () => {
    const tagged = { ...qbit, tags: [1] };
    const stored = splitWhen(async () => tagged).stored!;
    const take = (body: unknown) => stored(call('POST /api/v1/downloadclient/test', { body }));
    expect(await take(tagged)).toBe(false);
    expect(await take({ ...tagged, tags: [2] })).toBe(true);
    expect(await take({ ...tagged, tags: [] })).toBe(true);
  });

  it('takes #script for a notification that runs a program, and testall while one is stored', async () => {
    const script = (key: string, body: unknown, rows?: unknown) =>
      splitWhen(async () => {
        if (rows === undefined) throw new Error('down');
        return rows;
      }).script!(call(key, { body }));
    const hook = { name: 'Hook', implementation: 'Webhook', fields: [{ name: 'url', value: 'https://h.example' }] };
    expect(await script('POST /api/v1/notification', hook)).toBe(false);
    for (const body of [
      { name: 'Run', implementation: 'CustomScript', fields: [] },
      { name: 'Run', implementation: 'customscript' },
      { name: 'x', implementation: 'Other', fields: [{ name: 'Path', value: '/bin/sh' }] },
      { name: 'x', implementation: 'Other', fields: [{ name: 'p', type: 'filePath', value: '/x' }] },
      { id: 9, name: 'no implementation' },
      undefined,
    ])
      expect(await script('PUT /api/v1/notification/{id}', body), JSON.stringify(body)).toBe(true);
    const TESTALL = 'POST /api/v1/notification/testall';
    expect(await script(TESTALL, undefined, [hook])).toBe(false);
    expect(await script(TESTALL, undefined, [hook, { implementation: 'CustomScript' }])).toBe(true);
    expect(await script(TESTALL, undefined, { not: 'a list' })).toBe(true);
    expect(await script(TESTALL, undefined)).toBe(true);
  });

  it('counts the providers a bulk call changes', () => {
    const count = (key: string, body: unknown) => custom.count!({ key, params: { body }, targets: [] });
    expect(count('PUT /api/v1/indexer/bulk', { ids: [1, 2, 3] })).toBe('3 indexers');
    expect(count('DELETE /api/v1/applications/bulk', { ids: [4] })).toBe('1 application');
    expect(count('DELETE /api/v1/downloadclient/bulk', { ids: [6, 7] })).toBe('2 download clients');
    expect(count('DELETE /api/v1/indexer/bulk', {})).toBeUndefined();
  });
});

describe('spec tag', () => {
  it('maps a 4-part Servarr version to its tag and nothing else', () => {
    expect(tagFor('2.6.5.5623')).toBe('v2.6.5.5623');
    expect(tagFor('v2.6.5.5623')).toBe('v2.6.5.5623');
    for (const v of ['2.6.5', '2.6.5.5623-nightly', 'develop', '../x']) expect(tagFor(v), v).toBeUndefined();
  });
});

describe('instructions.md', () => {
  const text = readFileSync(new URL('../../instructions.md', import.meta.url), 'utf8');

  it('stays within 1.5 KB', () => {
    expect(Buffer.byteLength(text, 'utf8')).toBeLessThanOrEqual(1536);
  });

  it('names only operations the catalog has', () => {
    const named = [...text.matchAll(/`((?:GET|POST|PUT|PATCH|DELETE) \/[^`\s]+)`/g)].map((m) => m[1]!);
    expect(named.length).toBeGreaterThanOrEqual(10);
    for (const key of named) expect(keys, key).toContain(key);
  });
});
