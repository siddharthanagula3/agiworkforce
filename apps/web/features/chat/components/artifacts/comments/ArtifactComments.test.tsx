import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: HeadersInit = {}) => ({ ...headers, 'x-csrf-token': 't' })),
  getCsrfToken: vi.fn(async () => 't'),
}));

const { ArtifactPreview } = await import('../ArtifactPreview');
const { useArtifactsStore } = await import('../../../stores/artifacts-store');
const { resetArtifactCommentsCache } = await import('./artifact-comments-client');

const ARTIFACT_ID = '4f3e2d1c-0b9a-4c8d-8e7f-6a5b4c3d2e1f';

interface StoredComment {
  id: string;
  artifactId: string;
  parentId: string | null;
  anchor: Record<string, unknown>;
  body: string;
  author: 'user';
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

let server: StoredComment[] = [];
let nextId = 1;
const requests: { method: string; url: string; body: unknown }[] = [];

function comment(body: string, anchor: Record<string, unknown>, parentId: string | null = null) {
  const id = `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`;
  return {
    id,
    artifactId: ARTIFACT_ID,
    parentId,
    anchor,
    body,
    author: 'user' as const,
    resolvedAt: null,
    createdAt: '2026-10-19T10:00:00.000Z',
    updatedAt: '2026-10-19T10:00:00.000Z',
  };
}

function seed() {
  useArtifactsStore.getState().addArtifact({
    id: ARTIFACT_ID,
    type: 'document',
    title: 'Plan',
    language: 'markdown',
    content: '# Plan\n\nWe will ship the beta in March after review.',
    messageId: 'msg-1',
    conversationId: 'conv-1',
  });
}

function renderPanel(onRequestEdits = vi.fn(() => true)) {
  const artifact = useArtifactsStore.getState().artifacts.find((a) => a.id === ARTIFACT_ID)!;
  render(
    <ArtifactPreview
      artifact={artifact}
      variant="panel"
      versionHistory={useArtifactsStore.getState().getArtifactVersions(ARTIFACT_ID)}
      onRequestEdits={onRequestEdits}
    />,
  );
  return onRequestEdits;
}

function selectText(phrase: string) {
  const preview = screen.getByTestId('artifact-markdown-preview');
  const walker = document.createTreeWalker(preview, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node && !node.textContent?.includes(phrase)) node = walker.nextNode();
  const start = node!.textContent!.indexOf(phrase);
  const range = document.createRange();
  range.setStart(node!, start);
  range.setEnd(node!, start + phrase.length);
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
  act(() => {
    document.dispatchEvent(new Event('selectionchange'));
  });
}

describe('artifact comments', () => {
  beforeEach(() => {
    server = [];
    nextId = 1;
    requests.length = 0;
    resetArtifactCommentsCache();
    useArtifactsStore.getState().reset();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 0;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        requests.push({ method, url, body });
        if (method === 'GET') return new Response(JSON.stringify({ comments: server }));
        if (method === 'POST') {
          const created = comment(
            body.body,
            body.anchor ?? { kind: 'artifact' },
            body.parentId ?? null,
          );
          server.push(created);
          return new Response(JSON.stringify({ comment: created }), { status: 201 });
        }
        const id = url.split('/').pop()!;
        if (method === 'PATCH') {
          const target = server.find((entry) => entry.id === id)!;
          target.resolvedAt = body.resolved ? '2026-10-19T11:00:00.000Z' : null;
          return new Response(JSON.stringify({ comment: target }));
        }
        server = server.filter((entry) => entry.id !== id);
        return new Response(null, { status: 204 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.getSelection()?.removeAllRanges();
  });

  it('comments on a selected passage and lists it as a thread', async () => {
    seed();
    renderPanel();
    selectText('ship the beta in March');
    fireEvent.click(screen.getByTestId('selection-comment'));

    const panel = await screen.findByTestId('artifact-comments-panel');
    expect(within(panel).getByText('"ship the beta in March"')).toBeInTheDocument();
    fireEvent.change(within(panel).getByLabelText('Add a comment'), {
      target: { value: 'Is March firm?' },
    });
    fireEvent.click(within(panel).getByRole('button', { name: 'Comment' }));

    await waitFor(() =>
      expect(within(panel).getAllByTestId('artifact-comment-thread')).toHaveLength(1),
    );
    const post = requests.find((request) => request.method === 'POST')!;
    expect(post.url).toBe(`/api/artifacts/${ARTIFACT_ID}/comments`);
    expect(post.body).toMatchObject({
      body: 'Is March firm?',
      anchor: { kind: 'text', quote: 'ship the beta in March' },
    });
    expect(screen.getByTestId('artifact-comments-toggle')).toHaveAccessibleName('Comments, 1 open');
  });

  it('replies, resolves and hides resolved threads', async () => {
    server = [comment('Check the date', { kind: 'text', quote: 'March' })];
    seed();
    renderPanel();
    fireEvent.click(screen.getByTestId('artifact-comments-toggle'));
    const thread = await screen.findByTestId('artifact-comment-thread');

    fireEvent.click(within(thread).getByRole('button', { name: 'Reply' }));
    fireEvent.change(within(thread).getByLabelText('Reply'), { target: { value: 'Confirmed' } });
    fireEvent.click(within(thread).getByRole('button', { name: 'Reply' }));
    await waitFor(() => expect(within(thread).getByText('Confirmed')).toBeInTheDocument());
    expect(requests.find((request) => request.method === 'POST')!.body).toMatchObject({
      parentId: server[0]!.id,
    });

    fireEvent.click(within(thread).getByRole('button', { name: 'Resolve' }));
    await waitFor(() =>
      expect(screen.queryByTestId('artifact-comment-thread')).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show resolved (1)' }));
    expect(await screen.findByTestId('artifact-comment-thread')).toBeInTheDocument();
  });

  it('asks before deleting, naming that it cannot be undone', async () => {
    server = [comment('Remove me', { kind: 'artifact' })];
    seed();
    renderPanel();
    fireEvent.click(screen.getByTestId('artifact-comments-toggle'));
    const thread = await screen.findByTestId('artifact-comment-thread');
    fireEvent.click(within(thread).getByRole('button', { name: 'Delete comment' }));
    const dialog = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    expect(dialog).toHaveTextContent('cannot be recovered');
    expect(requests.some((request) => request.method === 'DELETE')).toBe(false);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(requests.some((request) => request.method === 'DELETE')).toBe(true));
  });

  it('sends every open comment to the assistant in one request', async () => {
    server = [
      comment('Say April', { kind: 'text', quote: 'March' }),
      comment('Add an owner', { kind: 'artifact' }),
    ];
    seed();
    const onRequestEdits = renderPanel();
    fireEvent.click(screen.getByTestId('artifact-comments-toggle'));
    fireEvent.click(await screen.findByTestId('artifact-comments-send-all'));
    const prompt = (onRequestEdits.mock.calls[0] as unknown as [string])[0];
    expect(prompt).toContain('1. On the passage "March": Say April');
    expect(prompt).toContain('2. On the whole artifact: Add an owner');
  });

  it('says so and offers a retry when comments cannot load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: 'down' }), { status: 500 })),
    );
    seed();
    renderPanel();
    fireEvent.click(screen.getByTestId('artifact-comments-toggle'));
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
