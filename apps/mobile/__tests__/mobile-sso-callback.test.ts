import { redirectSystemPath } from '../app/+native-intent';
import { withMobileSsoCallback } from '../src/features/auth/services/mobileSsoCallback';

jest.mock('expo-linking', () => ({
  createURL: () => 'agiworkforce:///login',
  parse: (link: string) => new URL(link),
}));

describe('mobile browser authentication', () => {
  it('keeps the mounted login screen while Clerk receives its return link', async () => {
    const callback = 'agiworkforce:///login?rotating_token_nonce=fixture';
    await withMobileSsoCallback(async (url) => {
      expect(url).toBe('agiworkforce:///login');
      expect(redirectSystemPath({ path: callback, initial: false })).toBeNull();
      const other = 'agiworkforce:///login-other';
      expect(redirectSystemPath({ path: other, initial: false })).toBe(other);
    });
    expect(redirectSystemPath({ path: 'agiworkforce:///login', initial: false })).toBe(
      'agiworkforce:///login',
    );
  });

  it('restores normal login navigation after browser failure', async () => {
    await expect(
      withMobileSsoCallback(async () => {
        throw new Error('browser failed');
      }),
    ).rejects.toThrow('browser failed');
    expect(redirectSystemPath({ path: 'agiworkforce:///login', initial: false })).toBe(
      'agiworkforce:///login',
    );
  });
});
