import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { buildEscalationEmail } from '../escalation-email';
import type { HandoffSessionRow } from '../store';

function row(overrides: Partial<HandoffSessionRow> = {}): HandoffSessionRow {
  return {
    id: 'session-1',
    reference_id: 'AGI-20260805-ABCDEFGH',
    owner_user_id: 'user_1',
    owner_session_key: 'user_1',
    surface: 'web-app',
    reason: 'hard_abstain',
    status: 'emailed',
    contact_email: 'customer@example.com',
    summary: 'Invoice doubled; agent hard-abstained on billing.',
    transcript: [
      { role: 'user', content: 'Why did my invoice double?', at: '2026-08-05T10:00:00.000Z' },
      {
        role: 'assistant',
        content: 'I will not guess about billing.',
        at: '2026-08-05T10:00:02.000Z',
      },
    ],
    attempted_actions: [
      {
        action: 'open_billing_portal',
        outcome: 'refused',
        detail: 'hard-abstain',
        at: '2026-08-05T10:00:03.000Z',
      },
    ],
    citations: [{ title: 'Refund policy', url: 'https://agiworkforce.com/refund-policy' }],
    account_context: {
      signedIn: true,
      userId: 'user_1',
      planTier: 'pro',
      subscriptionStatus: 'active',
      currentPeriodEnd: '2026-09-01T00:00:00.000Z',
      usagePercentage: 42,
      usageResetAt: '2026-09-01T00:00:00.000Z',
      hasUsageRemaining: true,
    },
    page_path: '/settings/billing',
    locale: 'en-GB',
    agent_user_id: null,
    wait_expires_at: null,
    connected_at: null,
    last_activity_at: '2026-08-05T10:00:04.000Z',
    closed_at: null,
    email_sent_at: null,
    email_provider_message_id: null,
    email_error: null,
    created_at: '2026-08-05T10:00:05.000Z',
    ...overrides,
  };
}

describe('buildEscalationEmail', () => {
  it('puts the reference, reason and plan in the subject so a mailbox is triageable', () => {
    const email = buildEscalationEmail(row());
    expect(email.subject).toBe('[AGI Support] AGI-20260805-ABCDEFGH · hard_abstain · pro');
  });

  it('orders the body so a human can act from the top', () => {
    const { text } = buildEscalationEmail(row());
    const order = [
      'Reference: AGI-20260805-ABCDEFGH',
      'SUMMARY',
      'WHAT THE AGENT ALREADY TRIED',
      'SOURCES THE AGENT CITED',
      'ACCOUNT CONTEXT',
      'TRANSCRIPT',
    ].map((heading) => text.indexOf(heading));

    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('sets Reply-To to the user, so replying actually reaches them', () => {
    expect(buildEscalationEmail(row()).replyTo).toBe('customer@example.com');
  });

  it('says explicitly when the agent tried nothing, instead of leaving a blank a human must interpret', () => {
    const { text } = buildEscalationEmail(row({ attempted_actions: [], citations: [] }));
    expect(text).toContain('(nothing, the agent did not attempt any account action)');
    expect(text).toContain('(none, the agent had nothing to cite)');
  });

  it('reports an unknown fact as unknown rather than as zero', () => {
    const { text } = buildEscalationEmail(
      row({
        account_context: {
          signedIn: true,
          userId: 'user_1',
          planTier: null,
          subscriptionStatus: null,
          currentPeriodEnd: null,
          usagePercentage: null,
          usageResetAt: null,
          hasUsageRemaining: null,
          degraded: 'usage lookup unavailable',
        },
      }),
    );
    expect(text).toContain('Usage: unknown');
    expect(text).not.toContain('Usage: 0%');
    expect(text).toContain('NOTE: usage lookup unavailable');
  });

  it('announces dropped turns instead of silently truncating the record', () => {
    const { text } = buildEscalationEmail(row(), { droppedTurns: 12 });
    expect(text).toContain('[12 earlier turns omitted to fit the size cap]');
  });

  it('explains a timed-out live request so the human knows why it arrived by email', () => {
    const { text } = buildEscalationEmail(row(), { timedOut: true });
    expect(text).toContain('Nobody picked it up before the wait deadline');
  });

  it('escapes user content in the HTML part so a pasted tag cannot execute in a mail client', () => {
    const { html, text } = buildEscalationEmail(
      row({
        transcript: [
          { role: 'user', content: '<script>alert(1)</script>', at: '2026-08-05T10:00:00.000Z' },
        ],
      }),
    );
    expect(text).toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
