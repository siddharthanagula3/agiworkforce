import { describe, expect, it } from 'vitest';
import { agentNotificationsWrite, effectiveAgentNotifications } from '../agent-notifications';
import { DEFAULT_HOST_AGENT_NOTIFICATIONS } from '../host-bridge';

describe('one set of desktop notification choices', () => {
  it('keeps a finished-task "never" saved by an older page as muted finished and failed turns', () => {
    const effective = effectiveAgentNotifications({
      agentNotifications: DEFAULT_HOST_AGENT_NOTIFICATIONS,
      sessionCompletionAlerts: 'never',
      sessionApprovalAlerts: true,
    });

    expect(effective.muted).toEqual(expect.arrayContaining(['turn-complete', 'turn-failed']));
    expect(effective.muted).not.toContain('approval');
  });

  it('keeps an approval alert switched off, and "always" for finished tasks', () => {
    const effective = effectiveAgentNotifications({
      agentNotifications: { ...DEFAULT_HOST_AGENT_NOTIFICATIONS, when: 'unfocused' },
      sessionCompletionAlerts: 'always',
      sessionApprovalAlerts: false,
    });

    expect(effective.when).toBe('always');
    expect(effective.muted).toContain('approval');
  });

  it('applies exactly what the agent rows save, whatever the older fields held', () => {
    const chosen = { when: 'never' as const, muted: ['question' as const], sound: false };
    const saved = { ...agentNotificationsWrite(chosen) };

    expect(effectiveAgentNotifications(saved)).toEqual(chosen);
  });

  it('falls back to the defaults for a shell that saved nothing yet', () => {
    expect(effectiveAgentNotifications({})).toEqual(DEFAULT_HOST_AGENT_NOTIFICATIONS);
  });
});
