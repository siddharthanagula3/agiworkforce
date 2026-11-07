import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
type ScanModule0 = typeof import('@agiworkforce/unified-chat');

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

vi.mock('@agiworkforce/unified-chat', async (importOriginal) => {
  const actual = await importOriginal<ScanModule0>();
  return {
    ...actual,
    MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
  };
});

import { MessageBubble } from '../MessageBubble';
import { computeDerivedArtifactId } from '@agiworkforce/artifacts';
import { _sharedArtifactStore, useArtifactsStore } from '../../../stores/artifacts-store';

const MESSAGE_ID = 'msg-interrupted';
const CONVERSATION_ID = 'conv-1';
const NOTICE = 'interrupted-artifact-notice';

function assistantMessage() {
  return {
    id: MESSAGE_ID,
    role: 'assistant' as const,
    content: 'Here is the page.',
    timestamp: new Date('2026-09-07T00:00:00.000Z'),
    sessionId: CONVERSATION_ID,
  };
}

function storeArtifact(interrupted: boolean) {
  useArtifactsStore.getState().upsertArtifact({
    id: 'artifact-1',
    type: 'html',
    language: 'html',
    title: 'Stopped artifact',
    content: '<!DOCTYPE html>\n<html>\n  <body>',
    messageId: MESSAGE_ID,
    conversationId: CONVERSATION_ID,
    ...(interrupted ? { interrupted: true } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  useArtifactsStore.getState().reset();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })),
  );
});

describe('WEB-USE-STREAMING-ARTIFACT-INTERRUPTING-01 · transcript card', () => {
  it('says the artifact on the card is a fragment and offers the way to a whole one', async () => {
    const onRegenerate = vi.fn();
    storeArtifact(true);

    render(<MessageBubble message={assistantMessage()} onRegenerate={onRegenerate} />);

    expect(screen.getByTestId(NOTICE).textContent).toMatch(/stopped before it finished/i);

    await userEvent.click(screen.getByRole('button', { name: 'Regenerate' }));

    expect(onRegenerate).toHaveBeenCalledWith(MESSAGE_ID);
  });

  it('offers no regenerate control to a host that cannot run one', () => {
    storeArtifact(true);

    render(<MessageBubble message={assistantMessage()} />);

    expect(screen.getByTestId(NOTICE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Regenerate' })).toBeNull();
  });

  it('stays silent for an artifact that finished', () => {
    storeArtifact(false);

    render(<MessageBubble message={assistantMessage()} onRegenerate={vi.fn()} />);

    expect(screen.queryByTestId(NOTICE)).toBeNull();
  });
});


type BubbleMessage = Parameters<typeof MessageBubble>[0]['message'];
type Metadata = NonNullable<BubbleMessage['metadata']>;
const pendingTool: NonNullable<Metadata['tools']>[number] = {
  id: 'tool-1',
  name: 'file_read',
  status: 'awaiting_approval',
  requiresApproval: true,
  toolCallId: 'call-1',
};
const projection: NonNullable<Metadata['cloudApproval']> = {
  schemaVersion: 1,
  runId: '5c8e9b8e-cbad-4e76-87cf-e17e7d828c40',
  calls: [{ toolCallId: 'call-1', name: 'file_read' }],
};

describe('partial artifact approval presentation', () => {
  it.each<Metadata>([
    { cloudApproval: projection },
    { tools: [pendingTool] },
    {
      cloudApproval: {
        ...projection,
        calls: [
          { toolCallId: 'decided', name: 'file_read', approvalDecision: 'approved' },
          ...projection.calls,
        ],
      },
    },
  ])('withholds recovery for pending metadata %j', (metadata) => {
    storeArtifact(true);
    const snapshot = useArtifactsStore.getState().getMessageArtifacts(MESSAGE_ID);
    const onRegenerate = vi.fn();
    render(<MessageBubble message={{ ...assistantMessage(), metadata }} onRegenerate={onRegenerate} />);
    const notice = screen.getByTestId(NOTICE);
    expect(notice).toHaveTextContent('partial while the response awaits approval');
    expect(notice).not.toHaveTextContent(/stopped|regenerate/i);
    expect(within(notice).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Regenerate response' })).toBeNull();
    expect(onRegenerate).not.toHaveBeenCalled();
    expect(useArtifactsStore.getState().getMessageArtifacts(MESSAGE_ID)).toEqual(snapshot);
  });

  it.each(['approved', 'rejected'] as const)(
    'restores recovery after a metadata-only %s projection despite stale tools',
    async (approvalDecision) => {
      storeArtifact(true);
      const onRegenerate = vi.fn();
      const message = assistantMessage();
      const pending = { ...message, metadata: { cloudApproval: projection, tools: [pendingTool] } };
      const { rerender } = render(<MessageBubble message={pending} onRegenerate={onRegenerate} />);
      expect(screen.getByTestId(NOTICE)).toHaveTextContent('awaits approval');
      rerender(
        <MessageBubble
          message={{
            ...pending,
            metadata: {
              ...pending.metadata,
              cloudApproval: {
                ...projection,
                calls: projection.calls.map((call) => ({ ...call, approvalDecision })),
              },
            },
          }}
          onRegenerate={onRegenerate}
        />,
      );
      expect(screen.getByTestId(NOTICE)).toHaveTextContent('stopped before it finished');
      await userEvent.click(within(screen.getByTestId(NOTICE)).getByRole('button', { name: 'Regenerate' }));
      expect(onRegenerate).toHaveBeenCalledWith(MESSAGE_ID);
      expect(pending.metadata.cloudApproval.calls[0]).not.toHaveProperty('approvalDecision');
    },
  );

  it.each<Metadata>([
    { finishReason: 'stopped' },
    { tools: [{ ...pendingTool, status: 'failed' }] },
    { tools: [{ ...pendingTool, approved: false }] },
  ])('keeps ordinary recovery without pending approval %j', (metadata) => {
    storeArtifact(true);
    render(<MessageBubble message={{ ...assistantMessage(), metadata }} onRegenerate={vi.fn()} />);
    expect(within(screen.getByTestId(NOTICE)).getByRole('button', { name: 'Regenerate' })).toBeInTheDocument();
  });

  it('does not invent partial evidence for a finished artifact awaiting approval', () => {
    storeArtifact(false);
    render(<MessageBubble message={{ ...assistantMessage(), metadata: { cloudApproval: projection } }} />);
    expect(screen.queryByTestId(NOTICE)).toBeNull();
  });

  it('does not reconstruct interrupted evidence on a cold open-fence message', () => {
    render(<MessageBubble message={{
      ...assistantMessage(),
      content: '```html\n<div>partial',
      metadata: { cloudApproval: projection },
    }} />);
    expect(screen.queryByTestId(NOTICE)).toBeNull();
    expect(useArtifactsStore.getState().getMessageArtifacts(MESSAGE_ID)).toHaveLength(0);
  });
});


describe('partial artifact lifecycle boundaries (characterization)', () => {
  it('does not infer a partial marker from the shared snapshot used after rehydration', () => {
    storeArtifact(true);
    const shared = _sharedArtifactStore.getState().artifacts[0]!;
    expect(shared).not.toHaveProperty('interrupted');
    useArtifactsStore.getState().reset();
    useArtifactsStore.getState().addArtifactForMessage(MESSAGE_ID, shared, CONVERSATION_ID);
    render(<MessageBubble message={{ ...assistantMessage(), metadata: { cloudApproval: projection } }} />);
    expect(screen.queryByTestId(NOTICE)).toBeNull();
    expect(useArtifactsStore.getState().getMessageArtifacts(MESSAGE_ID)[0]?.content).toBe(shared.content);
  });

  it('characterizes an existing partial winning over parsed completion after the fence closes', () => {
    const id = computeDerivedArtifactId(CONVERSATION_ID, MESSAGE_ID, 0);
    useArtifactsStore.getState().upsertArtifact({
      id, messageId: MESSAGE_ID, conversationId: CONVERSATION_ID,
      type: 'html', language: 'html', title: 'My draft', content: '<!DOCTYPE html>\n<html>\n<body>', interrupted: true,
    });
    const message = {
      ...assistantMessage(),
      content: '```html\n<!DOCTYPE html>\n<html>\n<head><title>Finished page</title></head>\n<body><main><h1>Complete</h1><p>The complete document.</p></main></body>\n</html>\n```',
    };
    render(<MessageBubble message={message} onRegenerate={vi.fn()} />);
    expect(screen.getByTestId(NOTICE)).toHaveTextContent('stopped before it finished');
    const artifact = useArtifactsStore.getState().getMessageArtifacts(MESSAGE_ID).find((item) => item.id === id);
    expect(artifact?.content).toBe('<!DOCTYPE html>\n<html>\n<body>');
    expect(artifact?.interrupted).toBe(true);
    expect(artifact?.title).toBe('My draft');
  });
});
