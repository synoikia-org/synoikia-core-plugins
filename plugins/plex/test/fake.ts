import { readFileSync } from 'node:fs';
import { CREDENTIALS, SECRETS, startFakePlex } from './fake-plex.js';

// The bundle accepts only the spec file whose SHA-256 plugin.yaml pins, not the reduced copy the unit tests read.
const PINNED_SPEC = readFileSync(new URL('./fixtures/plex-api-spec.pinned.yaml', import.meta.url), 'utf8');

/** The fake that test/compliance.yaml names: its URLs, the token and the secrets its answers hold. */
export async function start() {
  const fake = await startFakePlex();
  fake.specText = PINNED_SPEC;
  return {
    ...CREDENTIALS,
    ...SECRETS,
    url: fake.url,
    specUrl: fake.specUrl,
    close: () => fake.close(),
    reset: () => fake.reset(),
  };
}
