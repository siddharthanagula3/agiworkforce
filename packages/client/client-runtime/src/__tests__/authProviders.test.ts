import { describe, expect, it } from 'vitest';
import { parseAuthProviderIds, passkeySignInEnabled } from '../authProviders';

describe('configured sign-in methods', () => {
  it('turns passkey sign-in on only when the deployment lists it', () => {
    expect(passkeySignInEnabled('google,github,passkey')).toBe(true);
    expect(passkeySignInEnabled(' Passkey ')).toBe(true);
    expect(passkeySignInEnabled('google,github')).toBe(false);
    expect(passkeySignInEnabled(undefined)).toBe(false);
  });

  it('keeps passkey out of the social provider buttons', () => {
    expect(parseAuthProviderIds('microsoft,passkey,apple')).toEqual(['microsoft', 'apple']);
  });
});
