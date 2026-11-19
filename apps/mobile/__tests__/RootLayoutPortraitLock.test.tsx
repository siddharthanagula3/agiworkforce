/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock('../global.css', () => ({}));
jest.mock('../app/error', () => ({ default: () => null }));

describe('RootLayout portrait lock', () => {
  it('holds a phone in portrait as the app module loads, before the first frame is drawn', () => {
    const ScreenOrientation = require('expo-screen-orientation') as {
      lockAsync: jest.Mock;
      OrientationLock: { PORTRAIT_UP: number };
    };
    expect(ScreenOrientation.lockAsync).not.toHaveBeenCalled();

    require('../app/_layout');

    expect(ScreenOrientation.lockAsync).toHaveBeenCalledTimes(1);
    expect(ScreenOrientation.lockAsync).toHaveBeenCalledWith(
      ScreenOrientation.OrientationLock.PORTRAIT_UP,
    );
  });
});
