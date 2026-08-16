

const mockInitExecutorch = jest.fn();
const mockExpoResourceFetcher = { fetch: jest.fn(), readAsString: jest.fn() };

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

describe('apps/mobile/index.js: executorch startup wiring', () => {
  beforeAll(() => {
    jest.resetModules();
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
