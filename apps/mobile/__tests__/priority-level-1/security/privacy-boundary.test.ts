import {
  MOBILE_REMOTE_CHAT_DISABLED_MESSAGE,
  MOBILE_REMOTE_CHAT_SIGNIN_REQUIRED_MESSAGE,
  RemoteChatDisabledError,
  assertRemoteChatAllowed,
  getRemoteChatDisabledReason,
} from '../../../services/remoteChatGate';
import {
  executionModeForConversation,
  providerForExecutionMode,
} from '@/src/features/chat/utils/conversationMode';

describe('L1 Security - Privacy Boundaries', () => {
  test('SECURITY: Local-only build blocks remote chat (no silent Cloud route)', () => {
    const flags = { v1LocalOnly: true, cloudChat: false, byokKeys: false };

    expect(getRemoteChatDisabledReason(flags)).toBe(MOBILE_REMOTE_CHAT_DISABLED_MESSAGE);
    expect(() => assertRemoteChatAllowed(flags)).toThrow(RemoteChatDisabledError);
  });

  test('SECURITY: legacy direct-provider (byok) flag cannot unlock remote chat', () => {
    expect(
      getRemoteChatDisabledReason({ v1LocalOnly: true, cloudChat: false, byokKeys: true }),
    ).toBe(MOBILE_REMOTE_CHAT_DISABLED_MESSAGE);
  });

  test('SECURITY: Cloud chat enabled still requires sign-in (no open routing)', () => {
    expect(
      getRemoteChatDisabledReason(
        { v1LocalOnly: true, cloudChat: true, byokKeys: false },
        { cloudUnlocked: false },
      ),
    ).toBe(MOBILE_REMOTE_CHAT_SIGNIN_REQUIRED_MESSAGE);
  });

  test('SECURITY: remote chat allowed only with explicit Cloud unlock', () => {
    expect(
      getRemoteChatDisabledReason(
        { v1LocalOnly: true, cloudChat: true, byokKeys: false },
        { cloudUnlocked: true },
      ),
    ).toBeNull();
    expect(() =>
      assertRemoteChatAllowed(
        { v1LocalOnly: true, cloudChat: true, byokKeys: false },
        { cloudUnlocked: true },
      ),
    ).not.toThrow();
  });

  test('SECURITY: a conversation with no cloud model resolves to LOCAL execution', () => {
    const mode = executionModeForConversation({
      executionMode: undefined,
      model: 'fixture-local-model',
      provider: undefined,
    });
    expect(mode).toBe('local');
    expect(providerForExecutionMode(mode)).toBe('local');
  });

  test('SECURITY: explicit local executionMode is never overridden by model/provider', () => {
    const mode = executionModeForConversation({
      executionMode: 'local',
      model: 'anything',
      provider: 'cloud_managed',
    });
    expect(mode).toBe('local');
  });
});
