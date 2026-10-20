import { CREDENTIALS, ORG, SECRETS, startFakeGrafanaCloud } from './fake-grafanacloud.js';

/** The fake that test/compliance.yaml names: its URL, the org, the token and the secrets its answers hold. */
export async function start() {
  const fake = await startFakeGrafanaCloud();
  return { ...CREDENTIALS, ...SECRETS, org: ORG, url: fake.url, close: () => fake.close() };
}
