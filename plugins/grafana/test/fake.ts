import { CREDENTIALS, SECRETS, startFakeGrafana } from './fake-grafana.js';

/** The fake that test/compliance.yaml names: its URL, the token and the secrets its answers hold. */
export async function start() {
  const fake = await startFakeGrafana();
  return { ...CREDENTIALS, ...SECRETS, url: fake.url, close: () => fake.close() };
}
