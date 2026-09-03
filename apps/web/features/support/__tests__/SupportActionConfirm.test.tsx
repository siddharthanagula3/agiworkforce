import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SupportTranscript } from '../components/SupportTranscript';
import { useSupportSession } from '../hooks/useSupportSession';

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: (headers: HeadersInit = {}) => Promise.resolve(headers),
  getCsrfToken: () => Promise.resolve('test-csrf'),
}));

const ANSWER_WITH_ACTION = {
  kind: 'answer',
  text: 'I can revoke that connector for you.',
  citations: [{ id: 'c1', title: 'Connectors', url: '/docs' }],
  proposedActionId: 'revoke_connector',
};

const PROPOSAL = {
  proposal: {
    id: 'prop_123',
    actionId: 'revoke_connector',
    title: 'Revoke the GitHub connector',
    summary: 'This disconnects GitHub from your account.',
    effects: [
      'GitHub stops being available to your agents.',
      'Saved "always allow" permissions for it are cleared.',
    ],
    reversible: true,
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
  },
  confirmationToken: 'tok_abc',
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

function installFetch(overrides: Record<string, () => Response> = {}) {
  fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    for (const [fragment, make] of Object.entries(overrides)) {
      if (url.includes(fragment)) return Promise.resolve(make());
    }
    if (url.includes('/api/support/ask')) return Promise.resolve(jsonResponse(ANSWER_WITH_ACTION));
    if (url.includes('/api/support/actions/propose'))
      return Promise.resolve(jsonResponse(PROPOSAL));
    if (url.includes('/api/support/actions/confirm')) {
      return Promise.resolve(
        jsonResponse({
          outcome: 'success',
          actionId: 'revoke_connector',
          result: { kind: 'completed', message: 'GitHub disconnected.' },
        }),
      );
    }
    return Promise.resolve(jsonResponse({}, 404));
  });
  vi.stubGlobal('fetch', fetchMock);
}

function callsTo(fragment: string) {
  return fetchMock.mock.calls.filter(([input]) => String(input).includes(fragment));
}

function Harness({ signedIn = true }: { signedIn?: boolean }) {
  const session = useSupportSession('app');
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          session.ask('how do I disconnect github');
        }}
      >
        ask
      </button>
      <SupportTranscript
        turns={session.turns}
        pending={session.pending}
        actionFlows={session.actionFlows}
        actionTitles={{ revoke_connector: 'Revoke a connector' }}
        signedIn={signedIn}
        onPrepare={session.prepareAction}
        onConfirm={session.confirmProposal}
        onCancel={session.cancelAction}
        onEscalate={() => undefined}
      />
    </div>
  );
}

describe('an action never runs without an explicit confirmation click', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installFetch();
  });

  it('offers, then describes, then executes, one user click per step', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'ask' }));
    await screen.findByText('I can revoke that connector for you.');

    expect(screen.getByText(/I can do this for you/i)).toBeInTheDocument();
    expect(callsTo('/api/support/actions/propose')).toHaveLength(0);
    expect(callsTo('/api/support/actions/confirm')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /yes, do it/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /show me what this does/i }));
    await screen.findByText('This disconnects GitHub from your account.');

    expect(screen.getByText(/GitHub stops being available to your agents\./)).toBeInTheDocument();
    expect(
      screen.getByText(/Saved "always allow" permissions for it are cleared\./),
    ).toBeInTheDocument();
    expect(callsTo('/api/support/actions/confirm')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: /yes, do it/i }));
    await screen.findByText('GitHub disconnected.');

    const confirmCalls = callsTo('/api/support/actions/confirm');
    expect(confirmCalls).toHaveLength(1);

    const init = confirmCalls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['confirmationToken', 'proposalId']);
    expect(body['proposalId']).toBe('prop_123');
    expect(body['confirmationToken']).toBe('tok_abc');
  });

  it('cancelling at the confirm step executes nothing', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: 'ask' }));
    await screen.findByText('I can revoke that connector for you.');
    await user.click(screen.getByRole('button', { name: /show me what this does/i }));
    await screen.findByRole('button', { name: /yes, do it/i });

    await user.click(screen.getByRole('button', { name: /no, don't/i }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /yes, do it/i })).not.toBeInTheDocument();
    });
    expect(callsTo('/api/support/actions/confirm')).toHaveLength(0);
  });

  it('renders a refusal with the real control and NO confirm button for excluded actions', async () => {
    installFetch({
      '/api/support/actions/propose': () =>
        jsonResponse(
          {
            code: 'SUPPORT_ACTION_EXCLUDED',
            explain: 'Cancelling a subscription is permanent, so you do it yourself.',
            control: { label: 'Manage billing', href: '/settings/billing' },
          },
          400,
        ),
    });

    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'ask' }));
    await screen.findByText('I can revoke that connector for you.');
    await user.click(screen.getByRole('button', { name: /show me what this does/i }));

    await screen.findByText(/Cancelling a subscription is permanent/);
    expect(screen.getByRole('link', { name: 'Manage billing' })).toHaveAttribute(
      'href',
      '/settings/billing',
    );
    expect(screen.queryByRole('button', { name: /yes, do it/i })).not.toBeInTheDocument();
    expect(callsTo('/api/support/actions/confirm')).toHaveLength(0);
  });

  it('shows a denied confirmation honestly instead of pretending it worked', async () => {
    installFetch({
      '/api/support/actions/confirm': () => jsonResponse({ code: 'SPENT' }, 410),
    });

    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'ask' }));
    await screen.findByText('I can revoke that connector for you.');
    await user.click(screen.getByRole('button', { name: /show me what this does/i }));
    await user.click(await screen.findByRole('button', { name: /yes, do it/i }));

    expect(await screen.findByText(/expired or was already used/i)).toBeInTheDocument();
    expect(screen.getByText('Not allowed')).toBeInTheDocument();
  });

  it('offers no action at all to a signed-out visitor, even when the answer proposes one', async () => {
    const user = userEvent.setup();
    render(<Harness signedIn={false} />);

    await user.click(screen.getByRole('button', { name: 'ask' }));
    await screen.findByText('I can revoke that connector for you.');

    expect(screen.queryByText(/I can do this for you/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /show me what this does/i }),
    ).not.toBeInTheDocument();
    expect(callsTo('/api/support/actions/propose')).toHaveLength(0);
  });
});
