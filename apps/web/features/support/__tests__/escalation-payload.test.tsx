import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SupportTranscript } from '../components/SupportTranscript';
import { useSupportSession } from '../hooks/useSupportSession';
import { buildAttemptedActions, buildHandoffCitations } from '../lib/support-client';
import type { SupportTurn } from '../lib/contract';

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: (headers: HeadersInit = {}) => Promise.resolve(headers),
  getCsrfToken: () => Promise.resolve('test-csrf'),
}));

const LIVE_KEY = 'sk_live_ThIsIsAReAlLoOkInGsEcReT0123456789abcdef';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

function installFetch() {
  fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/support/ask')) {
      return Promise.resolve(
        jsonResponse({
          kind: 'answer',
          text: 'I can rotate that key for you.',
          citations: [{ id: 'keys', title: 'API keys', url: '/docs/api-keys' }],
          proposedActionId: 'regenerate_api_key',
        }),
      );
    }
    if (url.includes('/api/support/actions/propose')) {
      return Promise.resolve(
        jsonResponse({
          proposal: {
            id: 'prop_key_1',
            actionId: 'regenerate_api_key',
            title: 'Regenerate your API key',
            summary: 'Your current key stops working and a new one is issued.',
            effects: ['The old key is revoked immediately.'],
            reversible: false,
            expiresAt: new Date(Date.now() + 300_000).toISOString(),
          },
          confirmationToken: 'tok_key_1',
        }),
      );
    }
    if (url.includes('/api/support/actions/confirm')) {
      return Promise.resolve(
        jsonResponse({
          outcome: 'success',
          actionId: 'regenerate_api_key',
          result: {
            kind: 'secret_once',
            message: 'Your new key is ready.',
            apiKey: { id: 'key_2', name: 'default', keyPrefix: 'sk_live_ThI' },
            fullKey: LIVE_KEY,
          },
        }),
      );
    }
    if (url.endsWith('/api/support/handoff')) {
      return Promise.resolve(
        jsonResponse({
          mode: 'email',
          referenceId: 'AGI-20260805-44444444',
          status: 'emailed',
          emailedTo: 'support@agiworkforce.com',
          expectedReply: 'within one business day',
          headline: 'Sent to the support team.',
          detail: 'They have the whole conversation.',
        }),
      );
    }
    return Promise.resolve(jsonResponse({}, 404));
  });
  vi.stubGlobal('fetch', fetchMock);
}

function Harness() {
  const session = useSupportSession('app');
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          session.ask('rotate my api key');
        }}
      >
        ask
      </button>
      <button
        type="button"
        onClick={() => {
          session.startHandoff({ reason: 'user_requested' });
        }}
      >
        escalate
      </button>
      <SupportTranscript
        turns={session.turns}
        pending={session.pending}
        actionFlows={session.actionFlows}
        actionTitles={{ regenerate_api_key: 'Regenerate an API key' }}
        signedIn
        onPrepare={session.prepareAction}
        onConfirm={session.confirmProposal}
        onCancel={session.cancelAction}
        onEscalate={() => undefined}
      />
      <span data-testid="handoff">{session.handoff?.kind ?? 'none'}</span>
    </div>
  );
}

function handoffBody(): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(([input]) =>
    String(input).endsWith('/api/support/handoff'),
  );
  if (!call) throw new Error('no handoff request was made');
  return JSON.parse(String((call[1] as RequestInit).body)) as Record<string, unknown>;
}

describe('the escalation payload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installFetch();
  });

  it('never carries a regenerated API key into the handoff request', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'ask' }));
    await screen.findByText('I can rotate that key for you.');
    await user.click(screen.getByRole('button', { name: /show me what this does/i }));
    await user.click(await screen.findByRole('button', { name: /yes, do it/i }));

    expect(await screen.findByText(LIVE_KEY)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'escalate' }));
    await screen.findByTestId('handoff');

    const raw = JSON.stringify(handoffBody());
    expect(raw).not.toContain(LIVE_KEY);
    expect(raw).not.toContain('sk_live_');
    expect(raw).toContain('Result withheld');
  });

  it('tells the human what the agent already tried', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'ask' }));
    await screen.findByText('I can rotate that key for you.');
    await user.click(screen.getByRole('button', { name: /show me what this does/i }));
    await user.click(await screen.findByRole('button', { name: /yes, do it/i }));
    await screen.findByText(LIVE_KEY);

    await user.click(screen.getByRole('button', { name: 'escalate' }));
    await screen.findByTestId('handoff');

    const body = handoffBody();
    const attempted = body['attemptedActions'] as { action: string; outcome: string }[];
    expect(attempted).toHaveLength(1);
    expect(attempted[0]?.action).toBe('regenerate_api_key');
    expect(attempted[0]?.outcome).toBe('succeeded');

    expect(body['citations']).toEqual([{ title: 'API keys', url: '/docs/api-keys' }]);
  });

  it('reports an action that was offered but never confirmed as pending, not done', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'ask' }));
    await screen.findByText('I can rotate that key for you.');
    await user.click(screen.getByRole('button', { name: /show me what this does/i }));
    await screen.findByRole('button', { name: /yes, do it/i });

    await user.click(screen.getByRole('button', { name: 'escalate' }));
    await screen.findByTestId('handoff');

    const attempted = handoffBody()['attemptedActions'] as { outcome: string }[];
    expect(attempted[0]?.outcome).toBe('confirmation_pending');
    expect(
      fetchMock.mock.calls.filter(([i]) => String(i).includes('/actions/confirm')),
    ).toHaveLength(0);
  });
});

describe('escalation payload builders', () => {
  it('dedupes citations across turns and keeps abstention links', () => {
    const turns: SupportTurn[] = [
      { id: 'u1', role: 'user', text: 'q' },
      {
        id: 'a1',
        role: 'assistant',
        reply: {
          kind: 'answer',
          text: 'a',
          citations: [{ id: '1', title: 'Docs', url: '/docs' }],
          proposedActionId: null,
        },
      },
      {
        id: 'a2',
        role: 'assistant',
        reply: {
          kind: 'abstention',
          reason: 'hard_abstain_billing',
          text: 'no',
          citations: [
            { id: '2', title: 'Docs', url: '/docs' },
            { id: '3', title: 'Refunds', url: '/refund-policy' },
          ],
          escalationOffered: true,
        },
      },
    ];

    expect(buildHandoffCitations(turns)).toEqual([
      { title: 'Docs', url: '/docs' },
      { title: 'Refunds', url: '/refund-policy' },
    ]);
  });

  it('maps a denied outcome to refused rather than failed', () => {
    const attempted = buildAttemptedActions({
      t1: {
        phase: 'done',
        actionId: 'revoke_connector',
        outcome: { kind: 'denied', message: 'Rate limited.' },
      },
      t2: { phase: 'refused', actionId: 'delete_account', refusal: { explanation: 'Permanent.' } },
      t3: { phase: 'blocked', actionId: 'export_account_data', message: 'Not available.' },
    });

    expect(attempted.map((entry) => [entry.action, entry.outcome])).toEqual([
      ['revoke_connector', 'refused'],
      ['delete_account', 'refused'],
      ['export_account_data', 'failed'],
    ]);
  });
});
