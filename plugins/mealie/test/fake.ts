import { CREDENTIALS, SECRETS, startFakeMealie } from './fake-mealie.js';

/** Passwords, keys and tokens that the lock cases send: none may reach the approver or the audit log. */
const SENT = {
  newUserPassword: 'pw-123456',
  aiKey: 'sk-ai-key-666666',
  oldPassword: 'old-pw-777777',
  newPassword: 'new-pw-888888',
  resetCode: 'reset-999999',
  resetPassword: 'pw-000000',
};

/** The fake that test/compliance.yaml names: its URL, the token and the secrets that calls send or answers hold. */
export async function start() {
  const fake = await startFakeMealie();
  const seed = () => {
    fake.users.set('u-2', { id: 'u-2', username: 'alex', email: 'alex@example.com' });
    fake.recipes.set('pasta', { id: 'r-1', slug: 'pasta', name: 'Pasta Fagioli' });
  };
  return {
    ...CREDENTIALS,
    ...SECRETS,
    ...SENT,
    hookSecret: 'hook-secret-444444',
    url: fake.url,
    close: () => fake.close(),
    reset: seed,
  };
}
