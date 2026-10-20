import { FAKE_API_KEY, SECRETS, startFakeTrueNas } from './fake-truenas.js';

/** The fake that test/compliance.yaml names: its URL, the API key and the secrets its answers hold. */
export async function start() {
  const fake = await startFakeTrueNas();
  return {
    ...SECRETS,
    apiKey: FAKE_API_KEY,
    url: fake.url,
    close: () => fake.close(),
    reset: () => fake.reset(),
  };
}
