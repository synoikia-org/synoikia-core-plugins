import { CREDENTIALS, SECRETS, startFakeQbittorrent } from './fake-qbittorrent.js';

/** The fake that test/compliance.yaml names: its URL, the WebUI credentials and the secrets its answers hold. */
export async function start() {
  const fake = await startFakeQbittorrent();
  return {
    ...CREDENTIALS,
    ...SECRETS,
    url: fake.url,
    close: () => fake.close(),
    reset: () => fake.reset(),
  };
}
