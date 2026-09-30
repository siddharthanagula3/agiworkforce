import { MOBILE_SESSION_TOKEN_TEMPLATE } from '@agiworkforce/types';
import { getSurfaceToken } from '../src/integrations/clerk';

jest.mock('@clerk/expo', () => ({ getClerkInstance: jest.fn() }));

describe('mobile Cloud bearer credential', () => {
  it('mints the signed mobile surface token for ordinary and refreshed requests', async () => {
    const mint = jest.fn(async () => 'bound-token');

    await expect(getSurfaceToken(mint)).resolves.toBe('bound-token');
    await expect(getSurfaceToken(mint, { skipCache: true })).resolves.toBe('bound-token');
    expect(mint).toHaveBeenNthCalledWith(1, { template: MOBILE_SESSION_TOKEN_TEMPLATE });
    expect(mint).toHaveBeenNthCalledWith(2, {
      template: MOBILE_SESSION_TOKEN_TEMPLATE,
      skipCache: true,
    });
  });

  it('does not retry with an unbound plain session token when the template is unavailable', async () => {
    const mint = jest.fn(async () => {
      throw new Error('template unavailable');
    });
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      await expect(getSurfaceToken(mint)).resolves.toBeNull();
      expect(mint).toHaveBeenCalledTimes(1);
      expect(mint).toHaveBeenCalledWith({ template: MOBILE_SESSION_TOKEN_TEMPLATE });
    } finally {
      warning.mockRestore();
    }
  });
});
