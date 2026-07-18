/**
 * Metro must resolve WebRTC's private event-target-shim dependency.
 *
 * The workspace also contains event-target-shim v5 for other packages. That
 * version does not export Event, so pointing react-native-webrtc at the root
 * copy crashes the app during module evaluation before Expo Router can mount.
 */

jest.mock('expo/metro-config', () => ({
  getDefaultConfig: () => ({
    resolver: {
      resolveRequest: jest.fn(() => {
        throw new Error('unexpected fallback resolver call');
      }),
    },
    watchFolders: [],
  }),
}));

jest.mock('nativewind/metro', () => ({
  withNativeWind: (config: unknown) => config,
}));

describe('Metro WebRTC dependency resolution', () => {
  it('maps event-target-shim/index to an implementation with Event and EventTarget', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const config = require('../metro.config.js');
    const resolution = config.resolver.resolveRequest({}, 'event-target-shim/index', 'ios');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const eventTargetShim = require(resolution.filePath);

    expect(resolution).toEqual({
      type: 'sourceFile',
      filePath: expect.any(String),
    });
    expect(typeof eventTargetShim.Event).toBe('function');
    expect(typeof eventTargetShim.EventTarget).toBe('function');
  });
});
