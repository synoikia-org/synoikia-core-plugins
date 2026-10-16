import { readFileSync } from 'node:fs';
import { checkConformance, compileRules, ErrorCodes, parsePluginSettings } from '@synoikia/plugin-sdk';
import type { OperationDescriptor, PluginHandlers } from '@synoikia/plugin-sdk';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import raw from '../plugin.yaml';
import { createQbittorrentPlugin, settings } from '../src/plugin.js';
import { checkPolicy, REQUIRED_LOCKS } from '../src/policy.js';
import { sessionCookie } from '../src/session.js';
import {
  CREDENTIALS,
  FEED,
  HASH,
  NAMES,
  SEARCH_FILE_URL,
  SECRETS,
  startFakeQbittorrent,
  TRACKER,
} from './fake-qbittorrent.js';
import type { FakeQbittorrent } from './fake-qbittorrent.js';

const manifest: unknown = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const MASK_KEY = new Uint8Array(32).fill(7);
const context = { callId: 'unit', deadlineMs: 5000 };

let fake: FakeQbittorrent;
let plugin: PluginHandlers;
let operations: OperationDescriptor[];

const connection = (url = fake.url) => ({
  instanceId: 'qbittorrent',
  config: { baseUrl: url, username: CREDENTIALS.username },
  secrets: { password: CREDENTIALS.password },
});

beforeAll(async () => {
  fake = await startFakeQbittorrent();
  plugin = createQbittorrentPlugin({ maskKey: MASK_KEY });
  await plugin.init({ ...connection(), sdkVersion: '1.0.0' });
  operations = (await plugin.syncCatalog()).operations as OperationDescriptor[];
});
afterAll(async () => {
  await plugin.shutdown?.();
  await fake?.close();
});
beforeEach(() => fake.reset());

const resolve = (key: string, params?: unknown) => plugin.resolveOperation({ fn: 'call', args: [key, params] });
const invoke = async (key: string, params?: unknown) => {
  const r = await resolve(key, params);
  return plugin.invoke({ key: r.key, params: r.params, context });
};
const SECRET_VALUES = Object.values(SECRETS);

describe('catalog', () => {
  it('passes the SDK conformance checks against the fake', async () => {
    const issues = await checkConformance({
      manifest,
      settings,
      handlers: createQbittorrentPlugin(),
      init: connection(),
      samples: [
        { fn: 'call', args: ['torrents.info'], expectKey: 'torrents.info' },
        {
          fn: 'call',
          args: ['torrents.delete', { hashes: HASH.ubuntu, deleteFiles: true }],
          expectKey: 'torrents.delete#with-files',
        },
      ],
      rejects: [
        { fn: 'call', args: ['torrents.nope'] },
        { fn: 'other', args: [] },
        { fn: 'call', args: ['torrents.delete#with-files', {}] },
      ],
    });
    expect(issues).toEqual([]);
  });

  it('locks every required key, and reads only GET', () => {
    const byKey = new Map(operations.map((o) => [o.key, o]));
    for (const key of REQUIRED_LOCKS)
      expect(byKey.get(key), key).toMatchObject({ locked: true, typedConfirmation: true });
    for (const op of settings.operations)
      expect(op.http?.method, op.key).toBe(op.classification === 'read' ? 'GET' : 'POST');
    expect(operations.filter((o) => o.key.endsWith('#all'))).toHaveLength(10);
  });

  it('refuses plugin.yaml without a required lock, or with a rule naming no operation', () => {
    const base = structuredClone(raw) as { rules: { match: string | string[]; locked?: boolean }[] };
    const unlocked = {
      ...base,
      rules: base.rules.map((r) =>
        r.locked && Array.isArray(r.match) ? { ...r, match: r.match.filter((k) => k !== 'app.shutdown') } : r,
      ),
    };
    const s1 = parsePluginSettings(unlocked);
    expect(() => checkPolicy(s1, compileRules(s1))).toThrow(/app\.shutdown must be declared and locked/);
    const s2 = parsePluginSettings({ ...base, rules: [...base.rules, { match: 'torrents.delte', locked: true }] });
    expect(() => checkPolicy(s2, compileRules(s2))).toThrow(/torrents\.delte, which is not declared/);
  });

  it('keeps the agent instructions under the cap, naming only real keys', () => {
    const text = readFileSync(new URL('../instructions.md', import.meta.url), 'utf8');
    expect(Buffer.byteLength(text)).toBeLessThanOrEqual(4096);
    const keys = new Set(operations.map((o) => o.key));
    const named = [...text.matchAll(/`([a-z]+\.[a-zA-Z]+)`/g)].map((m) => m[1]!);
    expect(named.length).toBeGreaterThan(10);
    for (const k of named) expect(keys.has(k), k).toBe(true);
  });
});

describe('sign-in', () => {
  it('reads the 5.2 cookie, the 5.0 SID cookie, and only a lone cookie of another name', () => {
    expect(sessionCookie(['QBT_SID_8080=abc; HttpOnly; path=/'])).toBe('QBT_SID_8080=abc');
    expect(sessionCookie('SID=xyz; HttpOnly')).toBe('SID=xyz');
    expect(sessionCookie(['other=1', 'SID=xyz'])).toBe('SID=xyz');
    expect(sessionCookie(['custom=1'])).toBe('custom=1');
    expect(sessionCookie(['a=1', 'b=2'])).toBeUndefined();
    expect(sessionCookie(['SID=; path=/'])).toBeUndefined();
  });

  it('signs in with a form once, and again when the session ends', async () => {
    await invoke('torrents.tags');
    const logins = fake.logins;
    await invoke('torrents.tags');
    expect(fake.logins).toBe(logins);
    fake.expireSessions();
    await expect(invoke('torrents.tags')).resolves.toEqual(expect.arrayContaining(['iso']));
    expect(fake.logins).toBe(logins + 1);
    const login = fake.requests.findLast((r) => r.path === '/api/v2/auth/login');
    expect(login?.headers['content-type']).toBe('application/x-www-form-urlencoded');
    expect(login?.headers.origin).toBeUndefined();
  });

  it.each(['5.0', '5.2'] as const)('works with qBittorrent %s and reports its version', async (release) => {
    const other = await startFakeQbittorrent({ release });
    const p = createQbittorrentPlugin();
    await p.init({ ...connection(other.url), sdkVersion: '1' });
    expect(await p.testConnection()).toEqual({
      ok: true,
      upstreamVersion: release === '5.2' ? 'v5.2.4 (WebUI API 2.15.1)' : 'v5.0.0 (WebUI API 2.11.2)',
    });
    const bad = createQbittorrentPlugin();
    await bad.init({ ...connection(other.url), secrets: { password: 'wrong' }, sdkVersion: '1' });
    expect(await bad.testConnection()).toEqual({ ok: false, message: 'qBittorrent rejected the username or password' });
    await p.shutdown?.();
    await bad.shutdown?.();
    await other.close();
  });

  it('refuses a connection without a base URL or password', async () => {
    await expect(
      createQbittorrentPlugin().init({ ...connection(), config: {}, sdkVersion: '1' }),
    ).rejects.toMatchObject({ code: ErrorCodes.InvalidParams });
    await expect(
      createQbittorrentPlugin().init({ ...connection(), secrets: {}, sdkVersion: '1' }),
    ).rejects.toMatchObject({ code: ErrorCodes.InvalidParams });
  });
});

describe('params', () => {
  const share = { hashes: HASH.ubuntu, ratioLimit: 1, seedingTimeLimit: 1, inactiveSeedingTimeLimit: 1 };
  it.each([
    ['an unknown name', 'torrents.stop', { hashes: HASH.ubuntu, deleteFiles: true }],
    ['a name in another case', 'torrents.delete', { hashes: HASH.ubuntu, deleteFiles: false, DeleteFiles: true }],
    ['a non-scalar value', 'torrents.delete', { hashes: [HASH.ubuntu], deleteFiles: true }],
    ['a string for a boolean', 'torrents.delete', { hashes: HASH.ubuntu, deleteFiles: 'true' }],
    ['ALL in capitals', 'torrents.stop', { hashes: 'ALL' }],
    ['all for a queue move', 'torrents.topPrio', { hashes: 'all' }],
    ['a short hash', 'torrents.stop', { hashes: 'abc' }],
    ['an empty entry', 'torrents.stop', { hashes: `${HASH.ubuntu}|` }],
    ['several torrents for one', 'torrents.addTrackers', { hash: `${HASH.ubuntu}|${HASH.debian}`, urls: TRACKER.udp }],
    ['every torrent for trackers', 'torrents.removeTrackers', { hash: 'all', urls: TRACKER.udp }],
    ['a torrent file from disk', 'torrents.add', { urls: '/watch/x.torrent' }],
    ['a file URL', 'torrents.add', { urls: 'file:///etc/passwd' }],
    ['an unknown masked URL', 'torrents.add', { urls: 'https://search.example/<masked:000000000000>' }],
    ['a plugin over http', 'search.installPlugin', { sources: 'http://plugins.example/x.py' }],
    ['a path out of the torrent', 'torrents.renameFile', { hash: HASH.ubuntu, oldPath: 'a.iso', newPath: '../b.iso' }],
    ['an absolute path', 'torrents.renameFolder', { hash: HASH.ubuntu, oldPath: '/etc', newPath: 'b' }],
    ['a redacted value written back', 'app.setPreferences', { json: { proxy_password: '[REDACTED]' } }],
    ['an empty tag list', 'torrents.removeTags', { hashes: HASH.ubuntu, tags: '' }],
    ['a missing required name', 'torrents.delete', { hashes: HASH.ubuntu }],
    ['an unknown share action', 'torrents.setShareLimits', { ...share, shareLimitAction: 'remove' }],
  ])('refuses %s', async (_label, key, params) => {
    await expect(resolve(key, params)).rejects.toMatchObject({ code: ErrorCodes.InvalidParams });
  });

  it('normalizes hashes and picks the locked twins', async () => {
    expect(await resolve('torrents.stop', { hashes: HASH.ubuntu.toUpperCase() })).toEqual({
      key: 'torrents.stop',
      params: { hashes: HASH.ubuntu },
    });
    expect((await resolve('torrents.stop', { hashes: 'all' })).key).toBe('torrents.stop#all');
    expect((await resolve('torrents.delete', { hashes: HASH.ubuntu, deleteFiles: true })).key).toBe(
      'torrents.delete#with-files',
    );
    expect((await resolve('torrents.delete', { hashes: 'all', deleteFiles: false })).key).toBe('torrents.delete');
    const all = { ...share, hashes: 'all' };
    expect((await resolve('torrents.setShareLimits', { ...all, shareLimitAction: 'RemoveWithContent' })).key).toBe(
      'torrents.setShareLimits#remove',
    );
    expect((await resolve('torrents.setShareLimits', { ...all, shareLimitAction: 'Stop' })).key).toBe(
      'torrents.setShareLimits#all',
    );
  });

  it('refuses an invoke whose params no longer fit the key it was gated as', async () => {
    await expect(
      plugin.invoke({ key: 'torrents.delete', params: { hashes: HASH.ubuntu, deleteFiles: true }, context }),
    ).rejects.toMatchObject({ code: ErrorCodes.InvalidParams });
    expect(fake.torrents.has(HASH.ubuntu)).toBe(true);
  });
});

describe('requests', () => {
  it('sends GET params as the query and POST params as a form', async () => {
    await invoke('torrents.info', { filter: 'downloading', reverse: true, limit: 5 });
    const get = fake.requests.findLast((r) => r.path === '/api/v2/torrents/info');
    expect(Object.fromEntries(get!.query)).toEqual({ filter: 'downloading', reverse: 'true', limit: '5' });
    const hashes = `${HASH.ubuntu}|${HASH.debian}`;
    await expect(invoke('torrents.setCategory', { hashes, category: 'movies' })).resolves.toEqual({ ok: true });
    expect(fake.calls.at(-1)).toEqual({
      method: 'POST',
      path: 'torrents/setCategory',
      contentType: 'form',
      fields: { hashes, category: 'movies' },
    });
    expect(fake.torrents.get(HASH.debian)?.category).toBe('movies');
  });

  it('sends torrents/add as multipart and preferences as one json field', async () => {
    await invoke('torrents.add', {
      urls: `magnet:?xt=urn:btih:${'dd'.repeat(20)}&dn=Fedora`,
      category: 'linux',
      stopped: true,
    });
    expect(fake.calls.at(-1)).toMatchObject({
      path: 'torrents/add',
      contentType: 'multipart',
      fields: { category: 'linux', stopped: 'true' },
    });
    await invoke('app.setPreferences', { json: { dl_limit: 1000, scan_dirs: { '/watch': 0 } } });
    expect(fake.calls.at(-1)?.fields).toEqual({ json: '{"dl_limit":1000,"scan_dirs":{"/watch":0}}' });
  });

  it('maps qBittorrent failures to error codes', async () => {
    await expect(invoke('torrents.setCategory', { hashes: HASH.ubuntu, category: 'nope' })).rejects.toMatchObject({
      code: ErrorCodes.UpstreamError,
      message: expect.stringContaining('Incorrect category name'),
    });
    await expect(invoke('torrents.rename', { hash: 'ee'.repeat(20), name: 'x' })).rejects.toMatchObject({
      code: ErrorCodes.UpstreamError,
    });
  });
});

describe('URLs in results', () => {
  it('masks tracker, magnet, web seed, feed, search and log URLs to their origin', async () => {
    const results = [
      await invoke('torrents.info'),
      await invoke('torrents.trackers', { hash: HASH.ubuntu }),
      await invoke('torrents.webseeds', { hash: HASH.ubuntu }),
      await invoke('torrents.properties', { hash: HASH.ubuntu }),
      await invoke('sync.maindata'),
      await invoke('rss.items', { withData: true }),
      await invoke('rss.rules'),
      await invoke('search.results', { id: 7 }),
      await invoke('log.main'),
    ];
    const text = JSON.stringify(results);
    for (const s of SECRET_VALUES) expect(text).not.toContain(s);
    expect(text).toContain('https://tracker.example/<masked:');
    expect(text).toContain('udp://open.example:1337/<masked:');
    expect(text).toContain(`magnet:?xt=urn:btih:${HASH.ubuntu}&dn=Ubuntu%2024.04%20Desktop&<masked:`);
    expect(text).toContain('https://public.example/<masked:');
    expect(text).toContain('"siteUrl":"https://search.example"');
  });

  it('takes a masked search result back in torrents.add and sends the real URL', async () => {
    const res = (await invoke('search.results', { id: 7 })) as { results: { fileUrl: string }[] };
    const masked = res.results[0]!.fileUrl;
    expect(masked).toMatch(/^https:\/\/search\.example\/<masked:[0-9a-f]{12}>$/);
    await invoke('torrents.add', { urls: masked, savepath: '/downloads/iso' });
    expect(fake.calls.at(-1)?.fields.urls).toBe(SEARCH_FILE_URL);
  });

  it('resolves a masked tracker against the torrent, and a masked feed against RSS', async () => {
    const trackers = (await invoke('torrents.trackers', { hash: HASH.ubuntu })) as { url: string }[];
    const masked = trackers.find((t) => t.url.startsWith('https://tracker.example'))!.url;
    await invoke('torrents.removeTrackers', { hash: HASH.ubuntu, urls: masked });
    expect(fake.calls.at(-1)?.fields.urls).toBe(TRACKER.public);
    expect(fake.torrents.get(HASH.ubuntu)?.trackers).toEqual([TRACKER.udp]);
    await expect(invoke('torrents.removeTrackers', { hash: HASH.debian, urls: masked })).rejects.toMatchObject({
      code: ErrorCodes.InvalidParams,
    });
    const rules = (await invoke('rss.rules')) as Record<string, { affectedFeeds: string[] }>;
    await invoke('rss.setRule', { ruleName: 'Ubuntu', ruleDef: { ...rules.Ubuntu, mustContain: 'noble' } });
    expect(fake.rssRules.Ubuntu?.affectedFeeds).toEqual([FEED.keyed]);
  });
});

describe('targets and literals', () => {
  const summarize = async (key: string, params: unknown) => {
    const r = await resolve(key, params);
    const targets = (await plugin.resolveTargets?.({ key: r.key, params: r.params })) ?? [];
    return { key: r.key, targets, ...(await plugin.summarize({ key: r.key, params: r.params, targets })) };
  };

  it('names one torrent, counts several, and counts all of them', async () => {
    const one = await summarize('torrents.delete', { hashes: HASH.ubuntu, deleteFiles: false });
    expect(one.confirmLiteral).toBe(NAMES.ubuntu);
    const two = await summarize('torrents.setLocation', {
      hashes: `${HASH.ubuntu}|${HASH.bunny}`,
      location: '/archive',
    });
    expect(two.confirmLiteral).toBe('2 torrents');
    expect(two.text).toBe(
      `qBittorrent torrents.setLocation to "/archive" for 2 torrents: "${NAMES.ubuntu}", "${NAMES.bunny}": moves their data; turns off automatic management`,
    );
    expect(await summarize('torrents.stop', { hashes: 'all' })).toMatchObject({
      key: 'torrents.stop#all',
      confirmLiteral: 'all 3 torrents',
      text: 'qBittorrent torrents.stop#all on all 3 torrents',
    });
  });

  it.each([
    ['torrents.delete', { hashes: `${HASH.ubuntu}|${'ee'.repeat(20)}`, deleteFiles: false }],
    ['torrents.removeCategories', { categories: 'linux\nnope' }],
    ['torrents.deleteTags', { tags: 'nope' }],
    ['rss.removeRule', { ruleName: 'Nope' }],
    ['rss.removeItem', { path: 'Nope' }],
    ['search.uninstallPlugin', { names: 'nope' }],
    ['torrents.editTracker', { hash: HASH.ubuntu, url: 'https://unknown.example/a', tier: 1 }],
  ])('gives %s no literal when what it names is unknown', async (key, params) => {
    expect((await summarize(key, params)).confirmLiteral).toBeUndefined();
  });

  it('escapes and quotes model-written strings', async () => {
    const s = await summarize('torrents.rename', { hash: HASH.ubuntu, name: 'evil\u202e"\nname' });
    expect(s.text).toBe(`qBittorrent torrents.rename on torrent "${NAMES.ubuntu}": rename to "evil\\u202e\\"\\nname"`);
  });
});
