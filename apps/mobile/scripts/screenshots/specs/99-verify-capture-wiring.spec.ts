/** Throwaway spec used only to verify Detox artifact-copy wiring. Not part of the screenshot deck. */
import { device } from 'detox';

describe('verify capture wiring', () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true, delete: false });
  });

  it('takes a screenshot regardless of app state', async () => {
    await device.takeScreenshot('99-verify-capture-wiring');
  });
});
