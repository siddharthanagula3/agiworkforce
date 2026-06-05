import {
  MOBILE_REMOTE_CHAT_DISABLED_MESSAGE,
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

  it('allows remote chat only after Cloud Managed mode is enabled', () => {
    expect(
      getRemoteChatDisabledReason({ v1LocalOnly: true, cloudChat: true, byokKeys: false }),
    ).toBeNull();
    expect(
      getRemoteChatDisabledReason({ v1LocalOnly: false, cloudChat: false, byokKeys: false }),
    ).toBeNull();
  });
});
