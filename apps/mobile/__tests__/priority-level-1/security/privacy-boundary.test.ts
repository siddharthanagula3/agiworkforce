/**
 * L1 Security — Privacy Boundaries (Local / BYOK / Cloud isolation)
 *
 * Mobile is local-first v1. The trust boundary that must never be silently
 * crossed is Local -> Cloud Managed. These tests exercise the REAL gate
 * (services/remoteChatGate) and the REAL execution-mode resolver
 * (features/chat/utils/conversationMode) — not stubs — so the test fails if
 * the production guard regresses.
 */
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
    // byokKeys must be inert on Mobile — it must not be a path to Cloud.
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
    // Even if a cloud-managed provider leaks into the record, an explicit
    // local executionMode must win — Local data stays Local.
    const mode = executionModeForConversation({
      executionMode: 'local',
      model: 'anything',
      provider: 'cloud_managed',
    });
    expect(mode).toBe('local');
  });
});
