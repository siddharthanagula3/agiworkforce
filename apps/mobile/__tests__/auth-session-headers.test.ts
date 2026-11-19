import { SURFACE_TOKEN_HEADER } from '@agiworkforce/types';

const mockGetClerkToken = jest.fn();
const mockGetClerkSurfaceToken = jest.fn();

jest.mock('@clerk/expo', () => ({ getClerkInstance: jest.fn() }));

jest.mock('@/src/integrations/clerk', () => ({
  CLERK_PUBLISHABLE_KEY: 'pk_test_fixture',
  getClerkToken: () => mockGetClerkToken(),
  getClerkTokenFresh: jest.fn(),
  getClerkUserId: jest.fn(),
  getClerkSurfaceToken: () => mockGetClerkSurfaceToken(),
}));

import { getAuthHeaders } from '@/services/authSession';

describe('headers for requests sent outside the fetch wrapper', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('carries the surface proof beside the bearer, which the gateway requires of a phone session', async () => {
    mockGetClerkToken.mockResolvedValue('session-token');
    mockGetClerkSurfaceToken.mockResolvedValue('surface-proof');

    await expect(getAuthHeaders()).resolves.toEqual({
      Authorization: 'Bearer session-token',
      [SURFACE_TOKEN_HEADER]: 'surface-proof',
    });
  });

  it('sends the bearer alone when no proof can be minted', async () => {
    mockGetClerkToken.mockResolvedValue('session-token');
    mockGetClerkSurfaceToken.mockResolvedValue(null);

    await expect(getAuthHeaders()).resolves.toEqual({ Authorization: 'Bearer session-token' });
  });

  it('sends nothing and mints no proof while signed out', async () => {
    mockGetClerkToken.mockResolvedValue(null);

    await expect(getAuthHeaders()).resolves.toEqual({});
    expect(mockGetClerkSurfaceToken).not.toHaveBeenCalled();
  });
});
