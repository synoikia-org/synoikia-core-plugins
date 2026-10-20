import { CAMERA_TOKEN, FAKE_TOKEN, startFakeHa } from './fake-ha.js';

/** The fake that test/compliance.yaml names: its URL, the access token and the camera token its states hold. */
export async function start() {
  const fake = await startFakeHa();
  return {
    token: FAKE_TOKEN,
    cameraToken: CAMERA_TOKEN,
    url: fake.url,
    close: () => fake.close(),
    reset: () => fake.reset(),
  };
}
