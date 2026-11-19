import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('@/lib/client/csrf', () => ({
  addCsrfHeaders: vi.fn(async (headers: HeadersInit = {}) => ({ ...headers, 'x-csrf-token': 't' })),
  getCsrfToken: vi.fn(async () => 't'),
}));

const { ArtifactPreview } = await import('./ArtifactPreview');
const { useArtifactsStore } = await import('../../stores/artifacts-store');
const { resetArtifactCommentsCache } = await import('./comments/artifact-comments-client');

const ARTIFACT_ID = '7d1f0c2a-5b3e-4a9c-8f6d-2e4b6a8c0d1e';
const QUOTE = 'Approval is required.';
const POLICY = ['## Domestic policy', '', QUOTE, '', '## International policy', '', QUOTE, ''].join(
  '\n',
);

interface PostedBody {
  body: string;
  anchor: { kind: string; quote: string; prefix: string; suffix: string };
}

let server: Record<string, unknown>[] = [];
const posts: PostedBody[] = [];

function seed() {
  useArtifactsStore.getState().addArtifact({
    id: ARTIFACT_ID,
    type: 'document',
    title: 'Policies',
    language: 'markdown',
    content: POLICY,
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

function quoteNodes(): Text[] {
  const preview = screen.getByTestId('artifact-markdown-preview');
  const walker = document.createTreeWalker(preview, NodeFilter.SHOW_TEXT);
  const found: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if ((node as Text).data.includes(QUOTE)) found.push(node as Text);
  }
  return found;
}

function selectOccurrence(index: number) {
  const node = quoteNodes()[index]!;
  const range = document.createRange();
  range.setStart(node, 0);
  range.setEnd(node, QUOTE.length);
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
  act(() => {
    document.dispatchEvent(new Event('selectionchange'));
  });
}

describe('artifact comment selection identity', () => {
  beforeEach(() => {
    server = [];
    posts.length = 0;
    resetArtifactCommentsCache();
    useArtifactsStore.getState().reset();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 0;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        if (method === 'GET') return new Response(JSON.stringify({ comments: server }));
        const body = JSON.parse(String(init?.body)) as PostedBody;
        posts.push(body);
        const created = {
          id: '00000000-0000-4000-8000-000000000001',
          artifactId: ARTIFACT_ID,
          parentId: null,
          anchor: body.anchor,
          body: body.body,
          author: 'user',
          resolvedAt: null,
          createdAt: '2026-11-10T10:00:00.000Z',
          updatedAt: '2026-11-10T10:00:00.000Z',
        };
        server.push(created);
        return new Response(JSON.stringify({ comment: created }), { status: 201 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete (window as unknown as { Highlight?: unknown }).Highlight;
    window.getSelection()?.removeAllRanges();
  });

  it('saves the context of the second passage when the second passage is selected', async () => {
    seed();
    renderPanel();
    expect(quoteNodes()).toHaveLength(2);

    selectOccurrence(1);
    fireEvent.click(screen.getByTestId('selection-comment'));
    const panel = await screen.findByTestId('artifact-comments-panel');
    fireEvent.change(within(panel).getByLabelText('Add a comment'), {
      target: { value: 'Change this requirement for international work.' },
    });
    fireEvent.click(within(panel).getByRole('button', { name: 'Comment' }));

    await waitFor(() => expect(posts).toHaveLength(1));
    const { anchor } = posts[0]!;
    expect(anchor.quote).toBe(QUOTE);
    expect(anchor.prefix.trimEnd().endsWith('International policy')).toBe(true);
    expect(anchor.suffix.trim()).toBe('');
  });

  it('saves the first passage context when the first passage is selected', async () => {
    seed();
    renderPanel();

    selectOccurrence(0);
    fireEvent.click(screen.getByTestId('selection-comment'));
    const panel = await screen.findByTestId('artifact-comments-panel');
    fireEvent.change(within(panel).getByLabelText('Add a comment'), { target: { value: 'Hm' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Comment' }));

    await waitFor(() => expect(posts).toHaveLength(1));
    const { anchor } = posts[0]!;
    expect(anchor.prefix.trimEnd().endsWith('Domestic policy')).toBe(true);
    expect(anchor.suffix).toContain('International policy');
  });

  it('highlights the selected second passage after the comments sidebar is closed', async () => {
    const highlighted: Range[][] = [];
    const registry = new Map<string, unknown>();
    class FakeHighlight {
      readonly ranges: Range[];
      constructor(...ranges: Range[]) {
        this.ranges = ranges;
        highlighted.push(ranges);
      }
    }
    Object.defineProperty(window, 'CSS', {
      configurable: true,
      value: { highlights: registry },
    });
    (window as unknown as { Highlight: unknown }).Highlight = FakeHighlight;

    seed();
    renderPanel();
    selectOccurrence(1);
    fireEvent.click(screen.getByTestId('selection-comment'));
    const panel = await screen.findByTestId('artifact-comments-panel');
    fireEvent.change(within(panel).getByLabelText('Add a comment'), { target: { value: 'Hm' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Comment' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    await waitFor(() =>
      expect(screen.getByTestId('artifact-comments-toggle')).toHaveAccessibleName(
        'Comments, 1 open',
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close comments' }));
    await waitFor(() => expect(screen.queryByTestId('artifact-comments-panel')).toBeNull());

    const last = highlighted[highlighted.length - 1]!;
    expect(last).toHaveLength(1);
    expect(last[0]!.startContainer).toBe(quoteNodes()[1]);
  });

  it('sends the surrounding text of the selected passage to the assistant', () => {
    seed();
    const onRequestEdits = renderPanel();

    selectOccurrence(1);
    fireEvent.click(screen.getByTestId('selection-improve'));
    fireEvent.click(screen.getByTestId('selection-action-shorten'));

    const prompt = (onRequestEdits.mock.calls[0] as unknown as [string])[0];
    expect(prompt).toContain('It sits between:');
    expect(prompt).toContain('## International policy\n\n[selection]');
    expect(prompt).not.toMatch(/## Domestic policy\n\n\[selection\]/);
  });
});
