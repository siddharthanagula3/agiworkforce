'use strict';

module.exports = {
  setStringAsync: jest.fn().mockResolvedValue(undefined),
  hasImageAsync: jest.fn().mockResolvedValue(false),
  getImageAsync: jest.fn().mockResolvedValue(null),
};
