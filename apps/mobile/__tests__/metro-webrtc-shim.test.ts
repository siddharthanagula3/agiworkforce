
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
