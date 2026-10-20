import {
  BUILD_SECRET,
  CONTEXT,
  CREDENTIALS,
  DEFAULT_SECRET,
  DEPLOY,
  ENV_SECRET,
  GIT_SECRET,
  HELLO,
  startFakeJenkins,
} from './fake-jenkins.js';

/** The fake that test/compliance.yaml names: its URL under the Jenkins context, the credentials, the jobs and the secrets its answers hold. */
export async function start() {
  const fake = await startFakeJenkins();
  return {
    ...CREDENTIALS,
    buildSecret: BUILD_SECRET,
    defaultSecret: DEFAULT_SECRET,
    gitSecret: GIT_SECRET,
    envSecret: ENV_SECRET,
    deploy: DEPLOY,
    hello: HELLO,
    url: fake.url,
    baseUrl: `${fake.url}${CONTEXT}`,
    close: () => fake.close(),
    reset: () => fake.reset(),
  };
}
