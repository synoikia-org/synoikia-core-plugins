import { startFakeAdaptive, TOKEN } from './fake-adaptive.js';

/** The fake that test/compliance.yaml names: the three services, their connection fields and the token. */
export async function start() {
  const fake = await startFakeAdaptive();
  return {
    ...fake.connection(),
    token: TOKEN,
    url: fake.metrics.url,
    close: () => fake.close(),
    reset: () => fake.reset(),
  };
}
