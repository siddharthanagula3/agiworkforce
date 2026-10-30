import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { ArtifactsPanel } from './ArtifactsPanel';
import { generatedFileArtifactId, useArtifactsStore } from '../../stores/artifacts-store';
import { useStreamingArtifactStore } from '../../stores/streaming-artifact-store';
import { useChatStore, type Message } from '@shared/stores/web-chat-store';

vi.mock('./ArtifactPreview', () => ({
  ArtifactPreview: ({ artifact }: { artifact: { title?: string } }) => (
    <div data-testid="artifact-preview">{artifact.title}</div>
  ),
}));

const CONVERSATION_ID = 'conv-branch-artifacts';

function makeMessage(id: string, role: 'user' | 'assistant', parentId: string | null): Message {
  return {
    id,
    role,
    content: id,
    createdAt: `2026-01-01T00:00:0${id.length}Z`,
    parentId,
  } as unknown as Message;
}

// One prompt, two regenerated answers: only the answer on the visible path may
// contribute artifacts, or the panel shows an abandoned variant's work as part
// of the reply on screen.
const ROWS = [
  makeMessage('u1', 'user', null),
  makeMessage('a1', 'assistant', 'u1'),
  makeMessage('a2', 'assistant', 'u1'),
];

function seedArtifacts(): void {
  const store = useArtifactsStore.getState();
  store.addArtifactForMessage(
    'a1',
    {
      id: 'artifact-first',
      type: 'html',
      language: 'html',
      title: 'First draft',
      content: '<p>1</p>',
    },
    CONVERSATION_ID,
  );
  store.addArtifactForMessage(
    'a2',
    {
      id: 'artifact-second',
      type: 'html',
      language: 'html',
      title: 'Second draft',
      content: '<p>2</p>',
    },
    CONVERSATION_ID,
  );
}

beforeEach(() => {
  useArtifactsStore.getState().reset();
  useStreamingArtifactStore.getState().clearStreamingArtifact();
  useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, ROWS, 'a1');
  seedArtifacts();
  useArtifactsStore.getState().setPanelOpen(true);
});

afterEach(cleanup);

describe('ArtifactsPanel follows the visible branch', () => {
  it('presents a restored same-figure file alias once while retaining unique charts and stored downloads', () => {
    const identity = `matplotlib-v1:123e4567-e89b-12d3-a456-426614174000:${'a'.repeat(64)}`;
    const files = [
      {
        id: 'saved',
        fileName: 'monthly_sales_charts.png',
        mimeType: 'image/png',
        uri: '/api/files/saved',
        byteCount: 100,
        kind: 'image',
        checksumSha256: 'a'.repeat(64),
        renderIdentity: identity,
      },
      {
        id: 'alias',
        fileName: 'chart.png',
        mimeType: 'image/png',
        uri: '/api/files/alias',
        byteCount: 200,
        kind: 'image',
        checksumSha256: 'b'.repeat(64),
        renderIdentity: identity,
      },
      {
        id: 'unique',
        fileName: 'chart.png',
        mimeType: 'image/png',
        uri: '/api/files/unique',
        byteCount: 300,
        kind: 'image',
        checksumSha256: 'c'.repeat(64),
      },
    ];
    useChatStore
      .getState()
      .setActiveConversationWithMessages(
        CONVERSATION_ID,
        [ROWS[0]!, { ...ROWS[1]!, metadata: { generatedFiles: files } }, ROWS[2]!],
        'a1',
      );
    files.forEach((file, index) =>
      useArtifactsStore.getState().addArtifactForMessage(
        'a1',
        {
          id: generatedFileArtifactId(file.id),
          type: 'image',
          language: 'png',
          title: index === 2 ? 'Another chart' : file.fileName,
          content: file.uri,
        },
        CONVERSATION_ID,
      ),
    );
    useArtifactsStore.getState().selectArtifact(generatedFileArtifactId('saved'));
    render(<ArtifactsPanel />);
    expect(screen.getByRole('button', { name: 'Another chart' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'chart.png' })).toBeNull();
    expect(
      useArtifactsStore
        .getState()
        .getConversationArtifacts(CONVERSATION_ID)
        .some((artifact) => artifact.id === generatedFileArtifactId('alias')),
    ).toBe(true);
    expect(
      useChatStore.getState().messages.find((message) => message.id === 'a1')?.metadata
        ?.generatedFiles,
    ).toEqual(files);
  });

  it('lists only the artifacts written by messages on the active path', () => {
    useArtifactsStore.getState().selectArtifact('artifact-first');
    render(<ArtifactsPanel />);

    expect(screen.getByTestId('artifact-preview').textContent).toContain('First draft');
    expect(screen.queryByRole('button', { name: /Second draft/ })).toBeNull();
  });

  it('swaps the listed artifacts when the reader switches variant', () => {
    useArtifactsStore.getState().selectArtifact('artifact-first');
    render(<ArtifactsPanel />);
    expect(screen.getByTestId('artifact-preview').textContent).toContain('First draft');

    act(() => {
      useChatStore.getState().setActiveLeaf(CONVERSATION_ID, 'a2');
    });

    expect(screen.getByTestId('artifact-preview').textContent).toContain('Second draft');
  });

  it('keeps an artifact whose message the transcript has not loaded', () => {
    useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, [], null);
    render(<ArtifactsPanel />);

    expect(screen.getByTestId('artifact-preview')).toBeInTheDocument();
  });
});
