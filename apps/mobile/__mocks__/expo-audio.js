'use strict';

function createAudioPlayer(source) {
  const listeners = new Map();
  return {
    source,
    addListener: jest.fn((event, handler) => {
      listeners.set(event, handler);
      return { remove: () => listeners.delete(event) };
    }),
    emit(event, payload) {
      listeners.get(event)?.(payload);
    },
    play: jest.fn(),
    pause: jest.fn(),
    remove: jest.fn(),
  };
}

module.exports = {
  createAudioPlayer: jest.fn(createAudioPlayer),
  setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
};
