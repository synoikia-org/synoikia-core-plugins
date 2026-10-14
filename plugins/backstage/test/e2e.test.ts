import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPluginContract, startPluginHarness } from '@synoikia/core/testing';
import type { PluginHarness } from '@synoikia/core/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CREDENTIALS } from './fake-auth.js';
import { startFakeBackstage, UPSTREAM_SECRET } from './fake-upstream.js';
import type { FakeBackstage } from './fake-upstream.js';

/** The real core running this plugin's built bundle against the fake Backstage, via core's harness. */

const PLUGIN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let h: PluginHarness;
let fake: FakeBackstage;

beforeAll(async () => {
  fake = await startFakeBackstage();
  h = await startPluginHarness({ pluginDir: PLUGIN_DIR, connection: { baseUrl: fake.url, ...CREDENTIALS } });
}, 60_000);

afterAll(async () => {
  await h?.stop();
  await fake?.close();
});

describe('Backstage end to end (fake Backstage)', () => {
  it('keeps the plugin contract', async () => {
    expect(
      await checkPluginContract(h, {
        read: { key: 'GET /items', code: `return await backstage.request({ path: '/items' });` },
        write: {
          key: 'POST /items',
          code: `return await backstage.request({ method: 'POST', path: '/items', body: { name: 'x' } });`,
        },
        locked: {
          key: 'DELETE /items/{itemId}',
          code: `return await backstage.request({ method: 'DELETE', path: '/items/1' });`,
          confirm: 'First item',
        },
        secrets: { code: `return await backstage.request({ path: '/settings' });`, values: [UPSTREAM_SECRET] },
      }),
    ).toEqual([]);
    expect(fake.items.has(1)).toBe(false);
  });
});
