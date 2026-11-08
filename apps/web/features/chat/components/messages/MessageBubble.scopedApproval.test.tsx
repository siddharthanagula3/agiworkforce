import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { AgentActivityState } from '@agiworkforce/client-runtime';
import { ToolApprovalProvider } from '@/lib/hooks/useChatStream';
import { useChatToolAllowanceStore } from '../../stores/chat-tool-allowance-store';
import { MessageBubble } from './MessageBubble';

type UsechatstreamModule = typeof import('@/lib/hooks/useChatStream');

const liveness = vi.hoisted(() => ({ live: true }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/hooks/useChatStream', async (importOriginal) => ({
  ...(await importOriginal<UsechatstreamModule>()),
  isApprovalTurnLive: () => liveness.live,
}));

const name = 'mcp__github__get_pull_request_diff';
const conversationId = 'scope-review-chat';
const toolCallId = 'scope-review-call';
const resolve = vi.fn().mockResolvedValue(undefined);

function message(
  canonical: boolean,
  scopes: Array<'once' | 'session' | 'always'>,
): Parameters<typeof MessageBubble>[0]['message'] {
  const activity: AgentActivityState = {
    schemaVersion: 1,
    sessionId: 'scope-session',
    turnId: 'scope-turn',
    lastSequence: 1,
    status: 'awaiting-approval',
    startedAtMs: 1,
    updatedAtMs: 2,
    entries: [
      {
        kind: 'tool',
        id: 'scope-tool',
        toolCallId,
        name,
        category: 'connector',
        summary: 'Review pull request',
        status: 'awaiting-approval',
        startedAtMs: 1,
        approval: { id: 'scope-approval', riskLevel: 'low' },
        input: { pull_number: 7 },
      },
    ],
  };
  return {
    id: 'scope-message',
    sessionId: conversationId,
    role: 'assistant',
    content: 'Review the requested pull request.',
    timestamp: new Date(),
    metadata: {
      tools: [
        {
          id: 'scope-tool',
          toolCallId,
          name,
          status: 'awaiting_approval',
          requiresApproval: true,
          parameters: { pull_number: 7 },
          approvalReview: { riskTier: 'low', destructive: false, scopes },
        },
      ],
      ...(canonical ? { agentActivity: activity } : {}),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  liveness.live = true;
  useChatToolAllowanceStore.setState({ allowedByConversation: {} });
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected network call')));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

for (const canonical of [false, true]) {
  describe(canonical ? 'canonical activity approval' : 'legacy tool timeline approval', () => {
    it('uses the server scopes once, without replaying a browser-local chat allowance', () => {
      useChatToolAllowanceStore.getState().allowForChat(conversationId, name);
      render(
        <ToolApprovalProvider value={resolve}>
          <MessageBubble message={message(canonical, ['once'])} />
        </ToolApprovalProvider>,
      );
      const groups = screen.getAllByRole('group', { name: /Decision for/ });
      expect(groups).toHaveLength(1);
      const group = within(groups[0]!);
      expect(group.queryByRole('button', { name: 'Allow for this chat' })).toBeNull();
      expect(group.queryByRole('button', { name: 'Always allow' })).toBeNull();
      expect(resolve).not.toHaveBeenCalled();
      expect(screen.queryByRole('group', { name: /Remember permission/ })).toBeNull();
      fireEvent.click(group.getByRole('button', { name: 'Allow once' }));
      expect(resolve).toHaveBeenCalledExactlyOnceWith('scope-message', toolCallId, 'approved');
    });

    it('refreshes a narrowed server review without retaining stale scope controls', () => {
      const original = message(canonical, ['once', 'session', 'always']);
      const rendered = render(
        <ToolApprovalProvider value={resolve}>
          <MessageBubble message={original} />
        </ToolApprovalProvider>,
      );
      expect(screen.getByRole('button', { name: 'Always allow' })).toBeInTheDocument();
      rendered.rerender(
        <ToolApprovalProvider value={resolve}>
          <MessageBubble
            message={{
              ...original,
              metadata: {
                ...original.metadata,
                tools: original.metadata!.tools!.map((tool) => ({
                  ...tool,
                  approvalReview: { riskTier: 'low', destructive: false, scopes: ['once'] },
                })),
              },
            }}
          />
        </ToolApprovalProvider>,
      );
      expect(screen.queryByRole('button', { name: 'Always allow' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Allow for this chat' })).toBeNull();
      expect(resolve).not.toHaveBeenCalled();
    });

    it('sends a scoped decision to the current resolver without writing a second local permission', () => {
      render(
        <ToolApprovalProvider value={resolve}>
          <MessageBubble message={message(canonical, ['once', 'session'])} />
        </ToolApprovalProvider>,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Allow for this chat' }));
      expect(resolve).toHaveBeenCalledExactlyOnceWith(
        'scope-message',
        toolCallId,
        'approved-for-session',
      );
      expect(useChatToolAllowanceStore.getState().allowedByConversation).toEqual({});
    });
  });
}

it('denies or always allows the tool from the public chat', () => {
  const denied = render(
    <ToolApprovalProvider value={resolve}>
      <MessageBubble message={message(true, ['once', 'session', 'always'])} />
    </ToolApprovalProvider>,
  );
  const deniedGroup = within(screen.getByRole('group', { name: /Decision for/ }));
  expect(deniedGroup.getByRole('button', { name: 'Allow once' })).toBeEnabled();
  fireEvent.click(deniedGroup.getByRole('button', { name: 'Deny' }));
  expect(resolve).toHaveBeenCalledExactlyOnceWith('scope-message', toolCallId, 'rejected');
  denied.unmount();
  resolve.mockClear();

  render(
    <ToolApprovalProvider value={resolve}>
      <MessageBubble message={message(true, ['once', 'session', 'always'])} />
    </ToolApprovalProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Always allow' }));
  expect(resolve).toHaveBeenCalledExactlyOnceWith('scope-message', toolCallId, 'approved-always');
});

it('keeps a decided server review disabled while canonical activity catches up', () => {
  const original = message(true, ['once', 'session']);
  render(
    <ToolApprovalProvider value={resolve}>
      <MessageBubble
        message={{
          ...original,
          metadata: {
            ...original.metadata,
            tools: original.metadata!.tools!.map((tool) => ({
              ...tool,
              approved: true,
              status: 'running',
            })),
          },
        }}
      />
    </ToolApprovalProvider>,
  );
  const group = within(screen.getByRole('group', { name: /Decision for/ }));
  expect(group.getByRole('button', { name: 'Allow once' })).toBeDisabled();
  expect(group.getByRole('button', { name: 'Allow for this chat' })).toBeDisabled();
  expect(resolve).not.toHaveBeenCalled();
});

for (const canonical of [false, true]) {
  it(`keeps explicit Resend recovery for an expired ${canonical ? 'canonical' : 'legacy'} approval`, () => {
    liveness.live = false;
    const onRegenerate = vi.fn();
    render(
      <ToolApprovalProvider value={resolve}>
        <MessageBubble message={message(canonical, ['once'])} onRegenerate={onRegenerate} />
      </ToolApprovalProvider>,
    );

    expect(
      screen.getByText(
        'This response is partial. The approval request can no longer be resumed; send a new message to try again.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Waiting for approval\. This response is partial/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Regenerate response' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Resend' }));
    expect(onRegenerate).toHaveBeenCalledExactlyOnceWith('scope-message');
    expect(resolve).not.toHaveBeenCalled();
  });
}
