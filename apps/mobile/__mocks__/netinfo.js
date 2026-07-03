'use strict';

// @react-native-community/netinfo registers a native event subscription at
// import time; that crashes outside a real RN runtime (no native module),
// which several test files hit transitively via lib/egressGuard.ts. Mirrors
// the __mocks__/expo-clipboard.js / expo-sqlite.js pattern used for the same
// reason — jest.config.js moduleNameMapper redirects the real package here.
const state = {
  isConnected: true,
  isInternetReachable: true,
  type: 'wifi',
};

const netInfoMock = {
  configure: jest.fn(),
  fetch: jest.fn().mockResolvedValue(state),
  refresh: jest.fn().mockResolvedValue(state),
  addEventListener: jest.fn().mockReturnValue(() => {}),
  useNetInfo: jest.fn().mockReturnValue(state),
  useNetInfoInstance: jest.fn().mockReturnValue({ netInfo: state, refresh: jest.fn() }),
};

module.exports = netInfoMock;
module.exports.default = netInfoMock;
