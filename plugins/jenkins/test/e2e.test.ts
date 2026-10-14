import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPluginContract, startPluginHarness } from '@synoikia/core/testing';
import type { PluginHarness } from '@synoikia/core/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CREDENTIALS } from './fake-auth.js';
import { startFakeJenkins, UPSTREAM_SECRET } from './fake-upstream.js';
import type { FakeJenkins } from './fake-upstream.js';

/** The real core running this plugin's built bundle against the fake Jenkins, via core's harness. */

const PLUGIN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let h: PluginHarness;
let fake: FakeJenkins;

beforeAll(async () => {
  fake = await startFakeJenkins();
  h = await startPluginHarness({ pluginDir: PLUGIN_DIR, connection: { baseUrl: fake.url, ...CREDENTIALS } });
}, 60_000);

afterAll(async () => {
  await h?.stop();
  await fake?.close();
});

describe('Jenkins end to end (fake Jenkins)', () => {
  it('keeps the plugin contract', async () => {
    expect(
      await checkPluginContract(h, {
        read: { key: 'items.list', code: `return await jenkins.call('items.list');` },
        write: { key: 'items.create', code: `return await jenkins.call('items.create', { body: { name: 'x' } });` },
        locked: {
          key: 'items.delete',
          code: `return await jenkins.call('items.delete', { path: { itemId: '1' } });`,
          confirm: 'First item',
        },
        secrets: { code: `return await jenkins.call('settings.get');`, values: [UPSTREAM_SECRET] },
      }),
    ).toEqual([]);
    expect(fake.items.has(1)).toBe(false);
  });
});
