/* eslint-disable @typescript-eslint/no-require-imports */
const appConfig = require('../app.config.js') as {
  expo: {
    orientation?: string;
    ios?: {
      supportsTablet?: boolean;
      requireFullScreen?: boolean;
    };
  };
};

describe('iPad multitasking native config', () => {
  it('supports tablet multitasking and keeps the Android activity portrait', () => {
    expect(appConfig.expo.orientation).toBe('portrait');
    expect(appConfig.expo.ios).toMatchObject({
      supportsTablet: true,
      requireFullScreen: false,
    });
  });
});
