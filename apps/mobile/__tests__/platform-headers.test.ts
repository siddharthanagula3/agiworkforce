import {
  API_CONTRACT_VERSION,
  API_VERSION_REQUEST_HEADER,
  CLIENT_VERSION_HEADER,
  SURFACE_REQUEST_HEADER,
} from '@agiworkforce/cloud-contracts';

const expoConfig: { version?: string } = { version: '1.2.0' };

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return expoConfig;
    },
  },
}));

import { platformRequestHeaders } from '../lib/platformHeaders';

describe('what every call from the app tells the platform', () => {
  afterEach(() => {
    expoConfig.version = '1.2.0';
  });

  it('takes the version Expo built into this binary, never a literal', () => {
    const headers = platformRequestHeaders();

    expect(headers[SURFACE_REQUEST_HEADER]).toBe('mobile');
    expect(headers[CLIENT_VERSION_HEADER]).toBe('1.2.0');
    expect(headers[API_VERSION_REQUEST_HEADER]).toBe(API_CONTRACT_VERSION);
  });

  it('follows the build when a release bumps it', () => {
    expoConfig.version = '2.0.1';
    expect(platformRequestHeaders()[CLIENT_VERSION_HEADER]).toBe('2.0.1');
  });

  it('still names the surface and the contract when the build stamped no version', () => {
    delete expoConfig.version;

    const headers = platformRequestHeaders();

    expect(headers[SURFACE_REQUEST_HEADER]).toBe('mobile');
    expect(headers[API_VERSION_REQUEST_HEADER]).toBe(API_CONTRACT_VERSION);
    expect(Object.keys(headers)).not.toContain(CLIENT_VERSION_HEADER);
  });
});
