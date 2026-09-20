import {
  API_CONTRACT_VERSION,
  API_VERSION_REQUEST_HEADER,
  CLIENT_VERSION_HEADER,
  SURFACE_REQUEST_HEADER,
} from '@agiworkforce/cloud-contracts';
import { describe, expect, it } from 'vitest';

import { platformRequestHeaders } from '../lib/platformHeaders';

describe('what every call from the shell tells the platform', () => {
  it('names the surface, the running build and the contract it was written against', () => {
    const headers = platformRequestHeaders('1.2.0');

    expect(headers[SURFACE_REQUEST_HEADER]).toBe('desktop');
    expect(headers[CLIENT_VERSION_HEADER]).toBe('1.2.0');
    expect(headers[API_VERSION_REQUEST_HEADER]).toBe(API_CONTRACT_VERSION);
  });

  it('reports whichever version its runtime knows, so the two halves cannot diverge', () => {
    expect(platformRequestHeaders('3.1.0')[CLIENT_VERSION_HEADER]).toBe('3.1.0');
  });

  it('still names the surface and the contract where no version was stamped', () => {
    const headers = platformRequestHeaders(undefined);

    expect(headers[SURFACE_REQUEST_HEADER]).toBe('desktop');
    expect(headers[API_VERSION_REQUEST_HEADER]).toBe(API_CONTRACT_VERSION);
    expect(Object.keys(headers)).not.toContain(CLIENT_VERSION_HEADER);
  });
});
