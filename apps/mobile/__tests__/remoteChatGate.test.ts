import {
  MOBILE_REMOTE_CHAT_DISABLED_MESSAGE,
  MOBILE_REMOTE_CHAT_SIGNIN_REQUIRED_MESSAGE,
  RemoteChatDisabledError,
  assertRemoteChatAllowed,
  getRemoteChatDisabledReason,
} from '../services/remoteChatGate';

describe('remoteChatGate', () => {
  it('blocks remote chat when Mobile is explicitly local-only', () => {
    const flags = { v1LocalOnly: true, cloudChat: false, byokKeys: false };

    expect(getRemoteChatDisabledReason(flags)).toBe(MOBILE_REMOTE_CHAT_DISABLED_MESSAGE);
    expect(() => assertRemoteChatAllowed(flags)).toThrow(RemoteChatDisabledError);
  });

  it('does not allow remote chat from a legacy direct-provider flag', () => {
    expect(
      getRemoteChatDisabledReason({ v1LocalOnly: true, cloudChat: false, byokKeys: true }),
    ).toBe(MOBILE_REMOTE_CHAT_DISABLED_MESSAGE);
  });

  it('requires sign-in when Cloud chat is enabled but the user is not signed in', () => {
    expect(
      getRemoteChatDisabledReason({ v1LocalOnly: true, cloudChat: true, byokKeys: false }),
    ).toBe(MOBILE_REMOTE_CHAT_SIGNIN_REQUIRED_MESSAGE);
  });

  it('allows remote chat when Cloud chat is enabled and the user is signed in', () => {
    expect(
      getRemoteChatDisabledReason(
        { v1LocalOnly: true, cloudChat: true, byokKeys: false },
        { cloudUnlocked: true },
      ),
    ).toBeNull();
  });

  it('does not allow a signed-in session to bypass a disabled Cloud chat build', () => {
    expect(
      getRemoteChatDisabledReason(
        { v1LocalOnly: true, cloudChat: false, byokKeys: false },
        { cloudUnlocked: true },
      ),
    ).toBe(MOBILE_REMOTE_CHAT_DISABLED_MESSAGE);
    expect(() =>
      assertRemoteChatAllowed(
        { v1LocalOnly: true, cloudChat: false, byokKeys: false },
        { cloudUnlocked: true },
      ),
    ).toThrow(RemoteChatDisabledError);
  });
});
