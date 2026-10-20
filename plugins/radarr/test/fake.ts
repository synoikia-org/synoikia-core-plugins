import { CREDENTIALS, SECRETS, startFakeRadarr } from './fake-radarr.js';

/** The fake that test/compliance.yaml names: its URLs, the API key and the secrets its answers hold. */
export async function start() {
  const fake = await startFakeRadarr();
  return {
    ...CREDENTIALS,
    ...SECRETS,
    url: fake.url,
    specUrl: fake.specUrl,
    close: () => fake.close(),
    reset: () => fake.reset(),
  };
}
