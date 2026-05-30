/**
 * Wiring test: initExecutorch is called at startup with the Expo resource fetcher.
 *
 * Background (A14 bug): On a clean install, tier2LoadModel throws because
 * ResourceFetcher.adapter is null — initExecutorch was never called. This test
 * ensures apps/mobile/index.js wires the adapter before expo-router boots.
 *
 * Strategy:
 *   1. Mock react-native-executorch to intercept initExecutorch calls.
 *   2. Mock react-native-executorch-expo-resource-fetcher to provide a sentinel.
 *   3. Mock expo-router/entry (heavy native dep — not needed for this assertion).
 *   4. Mock ./polyfills (also native).
 *   5. require('apps/mobile/index.js') and assert initExecutorch was called
 *      with the Expo fetcher sentinel as resourceFetcher.
 *
 * This test FAILS without the fix (initExecutorch never called) and PASSES with it.
 * It is intentionally a unit/wiring test — no device download is performed.
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before any require of the module under test.
// Variables referenced inside jest.mock() factories must be prefixed 'mock'
// (Jest hoisting restriction).
// ---------------------------------------------------------------------------

const mockInitExecutorch = jest.fn();
// Sentinel object for ExpoResourceFetcher — identity-checked in the assertion.
const mockExpoResourceFetcher = { fetch: jest.fn(), readAsString: jest.fn() };

jest.mock('react-native-executorch', () => ({
  initExecutorch: mockInitExecutorch,
}));

// `virtual: true` — the package's exports map blocks bare resolution under jest
// (ERR_PACKAGE_PATH_NOT_EXPORTED), so register the mock without resolving it.
jest.mock(
  'react-native-executorch-expo-resource-fetcher',
  () => ({ ExpoResourceFetcher: mockExpoResourceFetcher }),
  { virtual: true },
);

// expo-router/entry triggers full app bootstrap — not needed for this assertion
jest.mock('expo-router/entry', () => {});

// polyfills may access native modules — skip in Node
jest.mock('../polyfills', () => {});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('apps/mobile/index.js: executorch startup wiring', () => {
  beforeAll(() => {
    jest.resetModules();
    // Re-register mocks after resetModules so they still apply on require
    jest.mock('react-native-executorch', () => ({
      initExecutorch: mockInitExecutorch,
    }));
    jest.mock(
      'react-native-executorch-expo-resource-fetcher',
      () => ({ ExpoResourceFetcher: mockExpoResourceFetcher }),
      { virtual: true },
    );
    jest.mock('expo-router/entry', () => {});
    jest.mock('../polyfills', () => {});

    // Require the entry point — this executes the module top-level code,
    // including the initExecutorch({ resourceFetcher: ExpoResourceFetcher }) call.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../index.js');
  });

  it('calls initExecutorch exactly once at startup', () => {
    expect(mockInitExecutorch).toHaveBeenCalledTimes(1);
  });

  it('passes ExpoResourceFetcher as the resourceFetcher adapter', () => {
    expect(mockInitExecutorch).toHaveBeenCalledWith({
      resourceFetcher: mockExpoResourceFetcher,
    });
  });
});
