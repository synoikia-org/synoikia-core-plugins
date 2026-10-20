import { CREDENTIALS, SECRETS, startFakeProfilarr } from './fake-profilarr.js';

const BACKUP = 'backup-2026-10-14-100005.tar.gz';
const DICTIONARRY = {
  id: 1,
  name: 'Dictionarry',
  repository_url: 'https://github.com/Dictionarry-Hub/database',
  auto_pull: 1,
  personal_access_token: SECRETS.pat,
};

/** The fake that test/compliance.yaml names: its URL, the API key, the secrets its answers hold and the tokens
 * the lock cases send. A reset brings back the database and the backup that a lock case deletes. */
export async function start() {
  const fake = await startFakeProfilarr();
  return {
    ...CREDENTIALS,
    ...SECRETS,
    linkPat: 'ghp_link-pat-555555',
    newPat: 'ghp_new-pat-333333',
    url: fake.url,
    close: () => fake.close(),
    reset: () => {
      fake.databases.set(1, { ...DICTIONARRY });
      fake.backups.add(BACKUP);
    },
  };
}
