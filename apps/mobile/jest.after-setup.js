/* eslint-disable */

Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  enumerable: true,
  writable: true,
  value: jest.fn(async () => {
    throw new Error('Unmocked fetch attempted during a Mobile unit test');
  }),
});
