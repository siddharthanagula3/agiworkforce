'use strict';

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
