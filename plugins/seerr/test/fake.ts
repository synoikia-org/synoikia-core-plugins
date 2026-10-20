import { FAKE_API_KEY, FAKE_EMAIL, FAKE_PASSWORD, SECRETS, startFakeSeerr } from './fake-seerr.js';

/** The fake that test/compliance.yaml names: its URLs, the local user, the API key and the secrets its answers hold. */
export async function start() {
  const fake = await startFakeSeerr();
  return {
    ...SECRETS,
    email: FAKE_EMAIL,
    password: FAKE_PASSWORD,
    apiKey: FAKE_API_KEY,
    url: fake.url,
    specUrl: fake.specUrl,
    close: () => fake.close(),
    reset: () => fake.reset(),
  };
}
