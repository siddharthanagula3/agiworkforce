import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatStreamRuntimeProvider, useChatStreamRuntime } from './ChatStreamRuntimeProvider';
import { useChatStream } from '@/lib/hooks/useChatStream';

vi.mock('@/lib/hooks/useChatStream', () => ({
  useChatStream: vi.fn(),
}));

const mockedUseChatStream = vi.mocked(useChatStream);

function RuntimeProbe({ label }: { label: string }) {
  const runtime = useChatStreamRuntime();
  return <div>{`${label}:${runtime.isStreaming ? 'streaming' : 'idle'}`}</div>;
}

describe('ChatStreamRuntimeProvider', () => {
  beforeEach(() => {
    mockedUseChatStream.mockReturnValue({
      sendMessage: vi.fn(),
      stopGeneration: vi.fn(),
      continueGeneration: vi.fn(),
      resumeInteractiveCardTurn: vi.fn(),
      resolveToolApproval: vi.fn(),
      isStreaming: true,
    });
  });

  it('keeps one stream owner mounted while conversation-page consumers are replaced', () => {
    function Harness({ conversation }: { conversation: string }) {
      return (
        <ChatStreamRuntimeProvider>
          <RuntimeProbe key={conversation} label={conversation} />
        </ChatStreamRuntimeProvider>
      );
    }

    const view = render(<Harness conversation="conversation-a" />);
    expect(screen.getByText('conversation-a:streaming')).toBeDefined();

    view.rerender(<Harness conversation="conversation-b" />);

    expect(screen.getByText('conversation-b:streaming')).toBeDefined();
    expect(mockedUseChatStream).toHaveBeenCalledTimes(2);
  });

  it('fails loudly when a page bypasses the persistent chat layout', () => {
    expect(() => render(<RuntimeProbe label="orphan" />)).toThrow(
      'useChatStreamRuntime must be used within ChatStreamRuntimeProvider',
    );
  });
});
