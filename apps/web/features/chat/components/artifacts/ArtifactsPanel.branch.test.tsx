import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { ArtifactsPanel } from './ArtifactsPanel';
import { generatedFileArtifactId, useArtifactsStore } from '../../stores/artifacts-store';
import { useStreamingArtifactStore } from '../../stores/streaming-artifact-store';
import { useChatStore, type Message } from '@shared/stores/web-chat-store';

vi.mock('./ArtifactPreview', () => ({
  ArtifactPreview: ({ artifact, awaitingApproval }: {
    artifact: { title?: string };
    awaitingApproval?: boolean;
  }) => (
    <div data-testid="artifact-preview" data-awaiting-approval={String(awaitingApproval)}>
      {artifact.title}
    </div>
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


const pendingProjection: NonNullable<NonNullable<Message['metadata']>['cloudApproval']> = {
  schemaVersion: 1,
  runId: '5c8e9b8e-cbad-4e76-87cf-e17e7d828c40',
  calls: [{ toolCallId: 'call-1', name: 'file_read' }],
};

function pendingRows(): Message[] {
  return ROWS.map((message) => message.id === 'a1'
    ? { ...message, metadata: { cloudApproval: pendingProjection } }
    : message);
}

describe('selected artifact approval projection', () => {
  it('subscribes to metadata-only decisions without altering artifacts or titles', () => {
    const rows = pendingRows();
    useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, rows, 'a1');
    useArtifactsStore.getState().selectArtifact('artifact-first');
    const before = useArtifactsStore.getState().getConversationArtifacts(CONVERSATION_ID);
    render(<ArtifactsPanel />);
    expect(screen.getByTestId('artifact-preview')).toHaveAttribute('data-awaiting-approval', 'true');
    act(() => {
      useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, rows.map((message) =>
        message.id === 'a1' ? {
          ...message,
          metadata: {
            cloudApproval: {
              ...pendingProjection,
              calls: pendingProjection.calls.map((call) => ({ ...call, approvalDecision: 'rejected' as const })),
            },
            tools: [{ name: 'file_read', status: 'awaiting_approval', requiresApproval: true, toolCallId: 'call-1' }],
          },
        } : message,
      ), 'a1');
    });
    expect(screen.getByTestId('artifact-preview')).toHaveAttribute('data-awaiting-approval', 'false');
    expect(useArtifactsStore.getState().getConversationArtifacts(CONVERSATION_ID)).toEqual(before);
    expect(rows[1]?.metadata?.cloudApproval?.calls[0]).not.toHaveProperty('approvalDecision');
  });

  it('uses the newly visible branch, not the previously selected pending message', () => {
    useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, pendingRows(), 'a1');
    useArtifactsStore.getState().selectArtifact('artifact-first');
    render(<ArtifactsPanel />);
    expect(screen.getByTestId('artifact-preview')).toHaveAttribute('data-awaiting-approval', 'true');
    act(() => useChatStore.getState().setActiveLeaf(CONVERSATION_ID, 'a2'));
    expect(screen.getByTestId('artifact-preview')).toHaveTextContent('Second draft');
    expect(screen.getByTestId('artifact-preview')).toHaveAttribute('data-awaiting-approval', 'false');
  });

  it('follows selection between visible artifacts without borrowing another message approval', () => {
    const rows = pendingRows().map((message) => message.id === 'a2' ? { ...message, parentId: 'a1' } : message);
    useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, rows, 'a2');
    useArtifactsStore.getState().selectArtifact('artifact-first');
    render(<ArtifactsPanel />);
    expect(screen.getByTestId('artifact-preview')).toHaveAttribute('data-awaiting-approval', 'true');
    act(() => useArtifactsStore.getState().selectArtifact('artifact-second'));
    expect(screen.getByTestId('artifact-preview')).toHaveAttribute('data-awaiting-approval', 'false');
    act(() => useArtifactsStore.getState().selectArtifact('artifact-first'));
    expect(screen.getByTestId('artifact-preview')).toHaveAttribute('data-awaiting-approval', 'true');
  });

  it('does not borrow pending approval when the origin is missing', () => {
    useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, pendingRows(), 'a1');
    useArtifactsStore.getState().addArtifactForMessage('missing', {
      id: 'orphan', type: 'html', language: 'html', title: 'Orphan draft', content: '<p>partial', interrupted: true,
    }, CONVERSATION_ID);
    useArtifactsStore.getState().selectArtifact('orphan');
    render(<ArtifactsPanel />);
    expect(screen.getByTestId('artifact-preview')).toHaveTextContent('Orphan draft');
    expect(screen.getByTestId('artifact-preview')).toHaveAttribute('data-awaiting-approval', 'false');
  });

  it('does not carry approval across conversations, even with the same message id', () => {
    useChatStore.getState().setActiveConversationWithMessages(CONVERSATION_ID, pendingRows(), 'a1');
    useArtifactsStore.getState().selectArtifact('artifact-first');
    useArtifactsStore.getState().addArtifactForMessage('a1', {
      id: 'other-artifact', type: 'html', language: 'html', title: 'Other conversation', content: '<p>other</p>',
    }, 'other-conversation');
    render(<ArtifactsPanel />);
    expect(screen.getByTestId('artifact-preview')).toHaveAttribute('data-awaiting-approval', 'true');
    act(() => useChatStore.getState().setActiveConversationWithMessages('other-conversation', [ROWS[0]!, ROWS[1]!], 'a1'));
    expect(screen.getByTestId('artifact-preview')).toHaveTextContent('Other conversation');
    expect(screen.getByTestId('artifact-preview')).toHaveAttribute('data-awaiting-approval', 'false');
  });

  it('characterizes same-id partial selection hiding the resumed streaming view', () => {
    const artifact = useArtifactsStore.getState().getConversationArtifacts(CONVERSATION_ID)[0]!;
    useArtifactsStore.getState().upsertArtifact({ ...artifact, interrupted: true });
    useArtifactsStore.getState().selectArtifact('artifact-first');
    useStreamingArtifactStore.getState().setStreamingArtifact({
      artifactId: 'artifact-first', messageId: 'a1', conversationId: CONVERSATION_ID,
      type: 'html', language: 'html', title: 'Resuming', content: '<p>new chunk',
    });
    render(<ArtifactsPanel />);
    expect(screen.getByTestId('artifact-preview')).toHaveTextContent('First draft');
    expect(useStreamingArtifactStore.getState().streaming?.content).toBe('<p>new chunk');
  });
});
