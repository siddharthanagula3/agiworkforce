import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SupportHandoffPanel } from '../components/SupportHandoffPanel';
import { useSupportPresence } from '../hooks/useSupportPresence';
import { useSupportSession } from '../hooks/useSupportSession';
import { UNAVAILABLE_PRESENCE, type SupportPresenceView } from '../lib/contract';

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: (headers: HeadersInit = {}) => Promise.resolve(headers),
  getCsrfToken: () => Promise.resolve('test-csrf'),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const LIVE_PRESENCE: SupportPresenceView = {
  live: true,
  headline: 'Someone is available now.',
  detail: 'Average wait is under a minute.',
  fallback: {
    address: 'support@agiworkforce.com',
    expectedReply: 'within one business day',
    configured: true,
  },
  waitTimeoutSeconds: 120,
  pollIntervalMs: 3000,
};

const OFFLINE_WITH_EMAIL: SupportPresenceView = {
  ...UNAVAILABLE_PRESENCE,
  fallback: {
    address: 'support@agiworkforce.com',
    expectedReply: 'within one business day',
    configured: true,
  },
};

const noop = () => undefined;

describe('presence-honest handoff UI', () => {
  it('renders NO live-chat control when nobody is online, and offers email instead', () => {
    render(
      <SupportHandoffPanel
        presence={OFFLINE_WITH_EMAIL}
        checking={false}
        handoff={null}
        pending={false}
        signedIn
        onStart={noop}
        onDismiss={noop}
      />,
    );

    expect(screen.getByText('No one is on live chat right now.')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /chat with a person now/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /send this to the support team/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/within one business day/)).toBeInTheDocument();
  });

  it('renders the live-chat control ONLY when the server says a human is online', () => {
    render(
      <SupportHandoffPanel
        presence={LIVE_PRESENCE}
        checking={false}
        handoff={null}
        pending={false}
        signedIn
        onStart={noop}
        onDismiss={noop}
      />,
    );
    expect(screen.getByRole('button', { name: /chat with a person now/i })).toBeInTheDocument();
  });

  it('hides the live-chat control while presence is still being checked', () => {
    render(
      <SupportHandoffPanel
        presence={LIVE_PRESENCE}
        checking
        handoff={null}
        pending={false}
        signedIn
        onStart={noop}
        onDismiss={noop}
      />,
    );
    expect(screen.getByText(/checking who is available/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /chat with a person now/i }),
    ).not.toBeInTheDocument();
  });

  it('says so plainly and promises nothing when email is not configured', () => {
    render(
      <SupportHandoffPanel
        presence={UNAVAILABLE_PRESENCE}
        checking={false}
        handoff={null}
        pending={false}
        signedIn
        onStart={noop}
        onDismiss={noop}
      />,
    );

    expect(screen.getByText(/not configured on this deployment/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /send this to the support team/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /see contact options/i })).toHaveAttribute(
      'href',
      '/support',
    );
  });

  it('requires an email address from a signed-out visitor before escalating', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(
      <SupportHandoffPanel
        presence={OFFLINE_WITH_EMAIL}
        checking={false}
        handoff={null}
        pending={false}
        signedIn={false}
        onStart={onStart}
        onDismiss={noop}
      />,
    );

    await user.click(screen.getByRole('button', { name: /send this to the support team/i }));
    expect(onStart).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/enter an email address/i);

    await user.type(screen.getByLabelText(/your email/i), 'visitor@example.com');
    await user.click(screen.getByRole('button', { name: /send this to the support team/i }));
    expect(onStart).toHaveBeenCalledWith('visitor@example.com');
  });

  it('shows a bounded countdown while waiting, never an open-ended spinner', () => {
    render(
      <SupportHandoffPanel
        presence={LIVE_PRESENCE}
        checking={false}
        handoff={{
          kind: 'waiting',
          sessionId: 's1',
          referenceId: 'AGI-20260805-ABCDEFGH',
          waitExpiresAt: new Date(Date.now() + 30_000).toISOString(),
          pollIntervalMs: 3000,
          headline: 'Waiting for someone to pick up.',
          detail: 'If nobody picks up shortly, I will email this instead.',
        }}
        pending={false}
        signedIn
        onStart={noop}
        onDismiss={noop}
      />,
    );

    const remaining = screen.getByText(/I will wait/i).getAttribute('data-support-wait-remaining');
    expect(Number(remaining)).toBeGreaterThan(0);
    expect(Number(remaining)).toBeLessThanOrEqual(30);
    expect(screen.getByText(/AGI-20260805-ABCDEFGH/)).toBeInTheDocument();
  });

  it('reports an email handoff with its reference and expected reply', () => {
    render(
      <SupportHandoffPanel
        presence={OFFLINE_WITH_EMAIL}
        checking={false}
        handoff={{
          kind: 'emailed',
          referenceId: 'AGI-20260805-11111111',
          emailedTo: 'support@agiworkforce.com',
          expectedReply: 'within one business day',
          headline: 'Sent to the support team.',
          detail: 'They have the whole conversation.',
        }}
        pending={false}
        signedIn
        onStart={noop}
        onDismiss={noop}
      />,
    );
    expect(screen.getByText('Sent to the support team.')).toBeInTheDocument();
    expect(screen.getByText(/AGI-20260805-11111111/)).toBeInTheDocument();
  });
});

describe('useSupportPresence defaults to unavailable', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stays unavailable when the availability route is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({}, 404))),
    );

    function Probe() {
      const { presence, checking } = useSupportPresence(true);
      return (
        <SupportHandoffPanel
          presence={presence}
          checking={checking}
          handoff={null}
          pending={false}
          signedIn
          onStart={noop}
          onDismiss={noop}
        />
      );
    }

    render(<Probe />);
    await waitFor(() => {
      expect(screen.getByText('No one is on live chat right now.')).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: /chat with a person now/i }),
    ).not.toBeInTheDocument();
  });

  it('stays unavailable when the availability request throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );

    function Probe() {
      const { presence } = useSupportPresence(true);
      return <span data-testid="live">{String(presence.live)}</span>;
    }
    render(<Probe />);
    await waitFor(() => {
      expect(screen.getByTestId('live')).toHaveTextContent('false');
    });
  });

  it('does not raise `live` unless the body literally says live:true', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({ live: 'true', headline: 'Someone is here!', reason: 'live' }),
        ),
      ),
    );

    function Probe() {
      const { presence } = useSupportPresence(true);
      return <span data-testid="live">{String(presence.live)}</span>;
    }
    render(<Probe />);
    await waitFor(() => {
      expect(screen.getByTestId('live')).toHaveTextContent('false');
    });
  });
});

/**
 * REAL TIMERS on purpose.
 *
 * These two cases were originally written with `vi.useFakeTimers()`. RTL's
 * `waitFor` schedules its own polling on `setTimeout`, and when that timer is
 * faked but never advanced by RTL, the assertion can only ever time out — the
 * test would have "failed" for a reason that has nothing to do with the widget.
 * A short REAL deadline (120ms) exercises exactly the same production code path
 * — `useSupportSession`'s independent client-side expiry timer — and actually
 * fails when that timer is deleted. Verified both ways.
 */
describe('a waiting handoff can never outlive its deadline', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function Probe() {
    const session = useSupportSession('app');
    return (
      <div>
        <button
          type="button"
          onClick={() => {
            session.startHandoff({ reason: 'user_requested' });
          }}
        >
          escalate
        </button>
        <span data-testid="kind">{session.handoff?.kind ?? 'none'}</span>
      </div>
    );
  }

  it('converts to a timed-out state client-side even when every poll fails', async () => {
    const pollCalls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        // Creation succeeds with a 120ms deadline...
        if (url.endsWith('/api/support/handoff')) {
          return Promise.resolve(
            jsonResponse({
              mode: 'live',
              sessionId: 'sess-1',
              referenceId: 'AGI-20260805-22222222',
              status: 'waiting',
              waitExpiresAt: new Date(Date.now() + 120).toISOString(),
              pollIntervalMs: 1000,
              onTimeout: 'email_fallback',
              headline: 'Waiting for someone to pick up.',
              detail: 'Hold on.',
            }),
          );
        }
        // ...and every subsequent status poll 500s. That is the exact case the
        // client-side deadline exists to survive: a wedged server can no longer
        // hold the user in a "connecting…" state, because the browser stops
        // waiting on its own authority.
        if (url.includes('/api/support/handoff/')) {
          pollCalls.push(url);
          return Promise.resolve(jsonResponse({}, 500));
        }
        return Promise.resolve(jsonResponse({}, 404));
      }),
    );

    const user = userEvent.setup();
    render(<Probe />);
    await user.click(screen.getByRole('button', { name: 'escalate' }));

    await waitFor(() => {
      expect(screen.getByTestId('kind')).toHaveTextContent('waiting');
    });

    await waitFor(
      () => {
        expect(screen.getByTestId('kind')).toHaveTextContent('timed_out');
      },
      { timeout: 3000 },
    );

    // Nothing the server said moved it on — the client did it unilaterally.
    expect(pollCalls.every((url) => url.includes('sess-1'))).toBe(true);
  });

  it('refuses to render a waiting state when the server omits the deadline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            mode: 'live',
            sessionId: 'sess-2',
            referenceId: 'AGI-20260805-33333333',
            status: 'waiting',
            // waitExpiresAt deliberately missing.
            headline: 'Connecting you to an agent…',
          }),
        ),
      ),
    );

    const user = userEvent.setup();
    render(<Probe />);
    await user.click(screen.getByRole('button', { name: 'escalate' }));

    // A deadline-less "live" response is the single most damaging shape this
    // feature can receive, so it is treated as a failed handoff rather than
    // rendered as an unbounded wait.
    await waitFor(() => {
      expect(screen.getByTestId('kind')).toHaveTextContent('failed');
    });
    expect(screen.getByTestId('kind')).not.toHaveTextContent('waiting');
  });
});
