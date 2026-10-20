import { ALEX, CREDENTIALS, PROXY_HOST, SECRETS, startFakeNpm } from './fake-npm.js';

/** Passwords and 2FA codes that the calls send: none may reach the approver or the audit log. */
const SENT = {
  userPassword: 'user-pw-555555',
  newPassword: 'new-pw-666666',
  currentPassword: 'cur-pw-777777',
  totpCode: '918273',
  dnsToken: 'cf-token-121212',
};

/** The fake that test/compliance.yaml names: its URL, the sign-in and the secrets that calls send or answers hold. */
export async function start() {
  const fake = await startFakeNpm();
  const seed = () => {
    fake.proxyHosts.set(PROXY_HOST.id, { ...PROXY_HOST, domain_names: [...PROXY_HOST.domain_names] });
    fake.users.set(ALEX.id, { ...ALEX });
  };
  return {
    ...CREDENTIALS,
    ...SECRETS,
    ...SENT,
    url: fake.url,
    close: () => fake.close(),
    reset: seed,
  };
}
