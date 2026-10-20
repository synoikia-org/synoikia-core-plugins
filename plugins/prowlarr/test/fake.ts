import { CREDENTIALS, SECRETS, startFakeProwlarr } from './fake-prowlarr.js';

/** The fake that test/compliance.yaml names: its URLs, the API key and the secrets its answers hold. */
export async function start() {
  const fake = await startFakeProwlarr();
  return {
    ...CREDENTIALS,
    ...SECRETS,
    url: fake.url,
    specUrl: fake.specUrl,
    close: () => fake.close(),
    reset: () => fake.reset(),
  };
}
