import { MOBILE_SESSION_TOKEN_TEMPLATE, SURFACE_TOKEN_HEADER } from '@agiworkforce/types';
import {
  getClerkSurfaceToken,
  getClerkToken,
  getSessionToken,
  getSurfaceToken,
  setClerkTokenMinter,
} from '../src/integrations/clerk';
import { withSurfaceProof } from '../services/surfaceProof';
import { API_URL } from '../lib/constants';

jest.mock('@clerk/expo', () => ({ getClerkInstance: jest.fn(() => ({ session: null })) }));

function minter() {
  return jest.fn(async (options?: { template?: string; skipCache?: boolean }) =>
    options?.template ? 'surface-token' : 'session-token',
  );
}

afterEach(() => setClerkTokenMinter(null, null));

describe('mobile Cloud credential', () => {
  it('mints the signed mobile surface token for ordinary and refreshed requests', async () => {
    const mint = minter();

    await expect(getSurfaceToken(mint)).resolves.toBe('surface-token');
    await expect(getSurfaceToken(mint, { skipCache: true })).resolves.toBe('surface-token');
    expect(mint).toHaveBeenNthCalledWith(1, { template: MOBILE_SESSION_TOKEN_TEMPLATE });
    expect(mint).toHaveBeenNthCalledWith(2, {
      template: MOBILE_SESSION_TOKEN_TEMPLATE,
      skipCache: true,
    });
  });

  it('uses the session token, which carries the session id, as the bearer', async () => {
    const mint = minter();

    await expect(getSessionToken(mint)).resolves.toBe('session-token');
    await expect(getSessionToken(mint, { skipCache: true })).resolves.toBe('session-token');
    expect(mint).toHaveBeenCalledWith(undefined);
    expect(mint).toHaveBeenCalledWith({ skipCache: true });
  });

  it('hands out no bearer while the surface template cannot mint', async () => {
    const mint = jest.fn(async (options?: { template?: string }) => {
      if (options?.template) throw new Error('template unavailable');
      return 'session-token';
    });
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      await expect(getSessionToken(mint)).resolves.toBeNull();
      expect(mint).toHaveBeenCalledTimes(1);
      expect(mint).toHaveBeenCalledWith({ template: MOBILE_SESSION_TOKEN_TEMPLATE });
    } finally {
      warning.mockRestore();
    }
  });

  it('serves the bearer and the proof from the signed-in session', async () => {
    setClerkTokenMinter(minter(), () => 'user-1');

    await expect(getClerkToken()).resolves.toBe('session-token');
    await expect(getClerkSurfaceToken()).resolves.toBe('surface-token');
  });
});

describe('surface proof on outgoing requests', () => {
  const api = `${API_URL.replace(/\/+$/, '')}/api/chat/sync`;

  beforeEach(() => setClerkTokenMinter(minter(), () => 'user-1'));

  it('sends the template token beside a bearer bound for the AGI API', async () => {
    const init = await withSurfaceProof(api, {
      method: 'POST',
      headers: { Authorization: 'Bearer session-token', 'Content-Type': 'application/json' },
    });

    expect(init?.headers).toEqual({
      Authorization: 'Bearer session-token',
      'Content-Type': 'application/json',
      [SURFACE_TOKEN_HEADER]: 'surface-token',
    });
  });

  it('adds the proof to Headers and header-pair inits too', async () => {
    const fromHeaders = await withSurfaceProof(api, {
      headers: new Headers({ authorization: 'Bearer session-token' }),
    });
    expect((fromHeaders?.headers as Headers).get(SURFACE_TOKEN_HEADER)).toBe('surface-token');

    const fromPairs = await withSurfaceProof(api, {
      headers: [['Authorization', 'Bearer session-token']],
    });
    expect(fromPairs?.headers).toContainEqual([SURFACE_TOKEN_HEADER, 'surface-token']);
  });

  it('never sends the proof to another host or without a bearer', async () => {
    const elsewhere = { headers: { Authorization: 'Bearer provider-key' } };
    await expect(withSurfaceProof('https://api.openai.com/v1/chat', elsewhere)).resolves.toBe(
      elsewhere,
    );

    const anonymous = { headers: { 'Content-Type': 'application/json' } };
    await expect(withSurfaceProof(api, anonymous)).resolves.toBe(anonymous);
  });

  it('keeps a proof the caller already attached', async () => {
    const init = { headers: { Authorization: 'Bearer t', [SURFACE_TOKEN_HEADER]: 'already' } };
    await expect(withSurfaceProof(api, init)).resolves.toBe(init);
  });
});
