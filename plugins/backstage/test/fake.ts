import { CREDENTIALS, LOCATION_ID, PETSTORE_UID, SECRETS, startFakeBackstage, TASK_ID } from './fake-backstage.js';

/** The fake that test/compliance.yaml names: its URL, the token, the ids and the secrets that calls send or answers hold. */
export async function start() {
  const fake = await startFakeBackstage();
  return {
    ...CREDENTIALS,
    ...SECRETS,
    scaffoldSecret: 'gho_scaffold-secret-222222',
    retrySecret: 'gho_retry-secret-333333',
    dryRunSecret: 'gho_dry-run-secret-444444',
    refreshSecret: 'refresh-auth-token-666666',
    locationId: LOCATION_ID,
    petstoreUid: PETSTORE_UID,
    taskId: TASK_ID,
    url: fake.url,
    close: () => fake.close(),
    reset: () => fake.reset(),
  };
}
