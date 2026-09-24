import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const { replace, fetchMock } = vi.hoisted(() => ({ replace: vi.fn(), fetchMock: vi.fn() }));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useParams: () => ({ token: 'AbCdEfGhIjKlMnOpQrStUvWx' }),
  useRouter: () => ({ replace, push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
}));

vi.stubGlobal('fetch', fetchMock);

import ContinueSharedSessionPage from '../page';

const TOKEN = 'AbCdEfGhIjKlMnOpQrStUvWx';
const CREATED = 'conv-created';

interface Server {
  share: Response | (() => Response);
  bulk?: (call: number) => Response;
  discard?: () => Response;
}

function sharedMessages(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `message ${index}`,
  }));
}

function serve(server: Server): void {
  let bulkCalls = 0;
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (url === '/api/csrf') return Response.json({ token: 'csrf', expiresIn: 3_600_000 });
    if (url === `/api/share/${TOKEN}`) {
      return typeof server.share === 'function' ? server.share() : server.share.clone();
    }
    if (url === '/api/chat/conversations' && method === 'POST') {
      return Response.json({ conversation: { id: CREATED } }, { status: 201 });
    }
    if (url === `/api/chat/conversations/${CREATED}/messages/bulk`) {
      bulkCalls += 1;
      return server.bulk ? server.bulk(bulkCalls) : Response.json({ inserted: 1 });
    }
    if (url === `/api/chat/conversations/${CREATED}` && method === 'DELETE') {
      return server.discard ? server.discard() : Response.json({ success: true });
    }
    return new Response(null, { status: 500 });
  });
}

function calls(url: string, method = 'GET') {
  return fetchMock.mock.calls.filter(
    ([input, init]) => String(input) === url && ((init as RequestInit)?.method ?? 'GET') === method,
  );
}

beforeEach(() => {
  replace.mockReset();
  fetchMock.mockReset();
});

describe('continuing a shared conversation', () => {
  it('announces that it is working while the copy is in flight', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    render(<ContinueSharedSessionPage />);

    expect(screen.getByRole('status')).toHaveTextContent('Setting up your conversation…');
  });

  it('copies every shared message into a new conversation and opens it', async () => {
    serve({ share: Response.json({ title: 'Shared plan', messages: sharedMessages(250) }) });
    render(<ContinueSharedSessionPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/chat/${CREATED}`));
    const copied = calls(`/api/chat/conversations/${CREATED}/messages/bulk`, 'POST').flatMap(
      ([, init]) => JSON.parse(String((init as RequestInit).body)).messages,
    );
    expect(copied).toHaveLength(250);
  });

  it('creates nothing and says so when the share holds no messages', async () => {
    serve({ share: Response.json({ title: 'Empty', messages: [] }) });
    render(<ContinueSharedSessionPage />);

    expect(
      await screen.findByText('This shared conversation has no messages to continue from.'),
    ).toBeInTheDocument();
    expect(calls('/api/chat/conversations', 'POST')).toHaveLength(0);
    expect(screen.getByRole('link', { name: 'Start a new chat' })).toHaveAttribute('href', '/chat');
  });

  it('says the share expired', async () => {
    serve({ share: Response.json({ error: { code: 'SHARE_EXPIRED' } }, { status: 410 }) });
    render(<ContinueSharedSessionPage />);

    expect(await screen.findByText('This shared conversation has expired.')).toBeInTheDocument();
  });

  it('offers no retry for a share that does not exist', async () => {
    serve({ share: Response.json({ error: { code: 'NOT_FOUND' } }, { status: 404 }) });
    render(<ContinueSharedSessionPage />);

    expect(
      await screen.findByText('This shared conversation could not be found.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('removes a half-copied conversation, says nothing was kept, and retries on request', async () => {
    let failCopy = true;
    serve({
      share: () => Response.json({ title: 'Shared plan', messages: sharedMessages(3) }),
      bulk: () => (failCopy ? new Response(null, { status: 503 }) : Response.json({ inserted: 3 })),
    });
    render(<ContinueSharedSessionPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The shared messages could not be copied, so no new conversation was kept.',
    );
    expect(calls(`/api/chat/conversations/${CREATED}`, 'DELETE')).toHaveLength(1);
    expect(replace).not.toHaveBeenCalled();

    failCopy = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith(`/chat/${CREATED}`));
  });

  it('warns about a partial copy when the half copy cannot be removed', async () => {
    serve({
      share: Response.json({ title: 'Shared plan', messages: sharedMessages(3) }),
      bulk: () => new Response(null, { status: 503 }),
      discard: () => new Response(null, { status: 500 }),
    });
    render(<ContinueSharedSessionPage />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The shared messages could not all be copied. A partial copy may be in your chat list.',
    );
  });

  it('keeps server text out of the failure it shows', async () => {
    serve({ share: new Response('upstream connect error', { status: 502 }) });
    render(<ContinueSharedSessionPage />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This shared conversation could not be opened.');
    expect(alert).not.toHaveTextContent('upstream');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
