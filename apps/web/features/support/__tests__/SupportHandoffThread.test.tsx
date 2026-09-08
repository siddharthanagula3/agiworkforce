import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: (headers: HeadersInit = {}) => Promise.resolve(headers),
  getCsrfToken: () => Promise.resolve('test-csrf'),
}));

import { SupportHandoffPanel } from '../components/SupportHandoffPanel';
import { SupportHandoffQueuePanel } from '../components/SupportHandoffQueuePanel';
import { UNAVAILABLE_PRESENCE, type SupportHandoffView } from '../lib/contract';

const SESSION_ID = 'sess-1';
const REFERENCE = 'AGI-SUP-1';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function message(seq: number, author: 'user' | 'agent' | 'system', body: string) {
  return { seq, author, body, at: '2026-09-07T10:00:00.000Z' };
}

const CONNECTED: SupportHandoffView = {
  kind: 'connected',
  sessionId: SESSION_ID,
  referenceId: REFERENCE,
  agentDisplayName: 'Robin',
  pollIntervalMs: 1000,
  headline: 'Someone has joined.',
  detail: 'They can see the conversation so far.',
};

const WAITING: SupportHandoffView = {
  kind: 'waiting',
  sessionId: SESSION_ID,
  referenceId: REFERENCE,
  waitExpiresAt: new Date(Date.now() + 120_000).toISOString(),
  pollIntervalMs: 1000,
  headline: 'Waiting for someone to pick up.',
  detail: 'I will email this if nobody does.',
};

function renderVisitor(handoff: SupportHandoffView) {
  return render(
    <SupportHandoffPanel
      presence={UNAVAILABLE_PRESENCE}
      checking={false}
      handoff={handoff}
      pending={false}
      signedIn
      onStart={() => {}}
      onDismiss={() => {}}
    />,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('the visitor can read and write a live handoff', () => {
  it('renders the thread, marking the agent turn as theirs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          sessionId: SESSION_ID,
          status: 'connected',
          messages: [
            message(1, 'system', 'A member of the support team joined.'),
            message(2, 'user', 'My invoice is wrong'),
            message(3, 'agent', 'I can see it, one moment'),
          ],
          nextAfter: 3,
          pollIntervalMs: 1000,
        }),
      ),
    );

    renderVisitor(CONNECTED);

    const list = await screen.findByRole('list', { name: 'Conversation with the support team' });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(3));
    const items = within(list).getAllByRole('listitem');
    expect(items[2]).toHaveAttribute('data-author', 'agent');
    expect(items[2]).toHaveTextContent('I can see it, one moment');
  });

  it('posts what the visitor typed to the visitor route', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return jsonResponse({ message: message(4, 'user', 'Thanks') });
      }
      return jsonResponse({
        sessionId: SESSION_ID,
        status: 'connected',
        messages: [],
        nextAfter: 0,
        pollIntervalMs: 1000,
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderVisitor(CONNECTED);
    const user = userEvent.setup();

    const box = await screen.findByLabelText('Message the support team');
    await user.type(box, 'Thanks');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find((call) => (call[1] as RequestInit)?.method === 'POST');
      expect(post).toBeDefined();
      expect(String(post?.[0])).toBe(`/api/support/handoff/${SESSION_ID}/messages`);
      expect(JSON.parse(String((post?.[1] as RequestInit).body))).toEqual({ body: 'Thanks' });
    });
    await waitFor(() => expect(screen.getByText('Thanks')).toBeVisible());
  });

  it('says why a send failed and keeps the conversation readable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          return jsonResponse(
            { error: { message: 'This conversation is not connected to a person' } },
            409,
          );
        }
        return jsonResponse({
          sessionId: SESSION_ID,
          status: 'connected',
          messages: [message(1, 'user', 'Hello')],
          nextAfter: 1,
          pollIntervalMs: 1000,
        });
      }),
    );

    renderVisitor(CONNECTED);
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Message the support team'), 'Anyone there');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This conversation is not connected to a person');
    expect(screen.getByText('Hello')).toBeVisible();
  });

  it('refuses to offer a composer while nobody has picked the request up', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          sessionId: SESSION_ID,
          status: 'waiting',
          messages: [],
          nextAfter: 0,
          pollIntervalMs: 1000,
        }),
      ),
    );

    renderVisitor(WAITING);

    const box = await screen.findByLabelText('Message the support team');
    expect(box).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(
      screen.getByText('You can write once someone joins. Nobody has picked this up yet.'),
    ).toBeVisible();
  });

  it('keeps the thread readable when a poll fails, and says so', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        if (calls === 1) {
          return jsonResponse({
            sessionId: SESSION_ID,
            status: 'connected',
            messages: [message(1, 'agent', 'Still here')],
            nextAfter: 1,
            pollIntervalMs: 1000,
          });
        }
        return jsonResponse({ error: { message: 'nope' } }, 500);
      }),
    );

    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderVisitor(CONNECTED);
      await waitFor(() => expect(screen.getByText('Still here')).toBeVisible());
      await act(async () => {
        vi.advanceTimersByTime(1200);
      });
      await waitFor(() =>
        expect(
          screen.getByText('The conversation could not be read just now. Still trying.'),
        ).toBeVisible(),
      );
      expect(screen.getByText('Still here')).toBeVisible();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('the agent can take a waiting visitor and answer them', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists the queue and claims the session the operator picked', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/agent/queue')) {
        return jsonResponse({
          queue: [
            {
              sessionId: SESSION_ID,
              referenceId: REFERENCE,
              summary: 'My invoice is wrong',
              createdAt: '2026-09-07T10:00:00.000Z',
              waitExpiresAt: new Date(Date.now() + 60_000).toISOString(),
              signedIn: true,
            },
          ],
        });
      }
      if (url.includes('/claim')) {
        return jsonResponse({
          sessionId: SESSION_ID,
          referenceId: REFERENCE,
          status: 'connected',
          summary: 'My invoice is wrong',
          contactEmail: 'visitor@example.com',
          pollIntervalMs: 1000,
        });
      }
      if (init?.method === 'POST') {
        return jsonResponse({ message: message(2, 'agent', 'Looking now') });
      }
      return jsonResponse({
        sessionId: SESSION_ID,
        status: 'connected',
        messages: [message(1, 'user', 'The total does not match my plan')],
        nextAfter: 1,
        pollIntervalMs: 1000,
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<SupportHandoffQueuePanel />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Take this' }));

    const thread = await screen.findByRole('region', { name: `Conversation ${REFERENCE}` });
    expect(within(thread).getByText('Reply-to visitor@example.com')).toBeVisible();
    const messages = within(thread).getByRole('list', { name: 'Messages' });
    await waitFor(() =>
      expect(within(messages).getByText('The total does not match my plan')).toBeVisible(),
    );

    await user.type(screen.getByLabelText('Reply to this visitor'), 'Looking now');
    await user.click(within(thread).getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        (call) =>
          (call[1] as RequestInit)?.method === 'POST' &&
          String(call[0]).endsWith(`/agent/${SESSION_ID}/messages`),
      );
      expect(post).toBeDefined();
      expect(JSON.parse(String((post?.[1] as RequestInit).body))).toEqual({ body: 'Looking now' });
    });
  });

  it('says why a claim was refused rather than opening an empty thread', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/agent/queue')) {
          return jsonResponse({
            queue: [
              {
                sessionId: SESSION_ID,
                referenceId: REFERENCE,
                summary: 'My invoice is wrong',
                createdAt: '2026-09-07T10:00:00.000Z',
                waitExpiresAt: null,
                signedIn: false,
              },
            ],
          });
        }
        return jsonResponse({ error: { message: 'That request is already connected' } }, 409);
      }),
    );

    render(<SupportHandoffQueuePanel />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Take this' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('That request is already connected');
    expect(screen.queryByLabelText('Reply to this visitor')).toBeNull();
  });

  it('says the queue is empty rather than looking broken', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ queue: [] })),
    );

    render(<SupportHandoffQueuePanel />);

    expect(await screen.findByText(/Nobody is waiting\./)).toBeVisible();
  });

  it('surfaces the deployment warning when live handoff is switched off', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).includes('/agent/presence') && init?.method === 'POST') {
          return jsonResponse({
            presence: { status: 'online' },
            warning: 'AGI_SUPPORT_LIVE_HANDOFF_ENABLED is not set, so live handoff stays off.',
          });
        }
        return jsonResponse({ queue: [] });
      }),
    );

    render(<SupportHandoffQueuePanel />);
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Name visitors see'), 'Robin');
    await user.click(screen.getByRole('button', { name: 'Go online' }));

    expect(
      await screen.findByText(
        'AGI_SUPPORT_LIVE_HANDOFF_ENABLED is not set, so live handoff stays off.',
      ),
    ).toBeVisible();
  });
});
