import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const screenshotHarness = vi.hoisted(() => ({
  callbacks: [] as Array<(file: File) => void>,
}));

vi.mock('../AttachmentMenu', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  return {
    AttachmentMenu: (props: {
      children?: import('react').ReactNode;
      onScreenshot?: (file: File) => void;
    }) =>
      React.createElement(
        'div',
        null,
        props.children,
        React.createElement(
          'button',
          {
            type: 'button',
            onClick: () => {
              if (props.onScreenshot) screenshotHarness.callbacks.push(props.onScreenshot);
            },
          },
          'Start screenshot',
        ),
      ),
  };
});

import { ChatInput } from '../ChatInput';
import { useChatStore } from '../../stores/chatStore';
import { useModelStore } from '../../stores/modelStore';

// The root test graph runs dozens of package suites concurrently. This test is
// synchronous and completes in well under a second when focused, but React's
// jsdom render can be scheduler-starved past Vitest's 5 s default under that
// load. Keep the extra budget scoped to the affected integration-style test.
const ROOT_GRAPH_TEST_TIMEOUT_MS = 15_000;
const DROPS_STALE_SCREENSHOT_TEST =
  'drops a screenshot that completes after the same account starts a new auth incarnation';

describe('ChatInput screenshot ownership', () => {
  beforeEach(() => {
    screenshotHarness.callbacks.length = 0;
    useChatStore.setState({
      activeConversationId: 'conv-a',
      draftContent: '',
      draftsByConversation: {},
      isStreaming: false,
      conversations: [],
    });
    useModelStore.setState({ selectedModelId: 'auto-economy', models: [] });
  });

  afterEach(() => cleanup());

  it(
    DROPS_STALE_SCREENSHOT_TEST,
    () => {
      const onSend = vi.fn();
      const common = {
        onSend,
        onStop: vi.fn(),
        onModelSelectorClick: vi.fn(),
        hasMessages: false,
      };
      const { rerender } = render(
        <ChatInput
          {...common}
          conversationId="conv-a"
          attachmentContextKey="managed:account-a:session-1"
        />,
      );

      fireEvent.click(screen.getByRole('button', { name: 'Start screenshot' }));
      const finishAccountAScreenshot = screenshotHarness.callbacks[0];
      expect(finishAccountAScreenshot).toBeTypeOf('function');

      rerender(
        <ChatInput
          {...common}
          conversationId="conv-a"
          attachmentContextKey="managed:account-a:session-2"
        />,
      );
      const accountBFile = new File(['account B'], 'account-b.txt', { type: 'text/plain' });
      const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
      fireEvent.change(fileInput!, { target: { files: [accountBFile] } });

      act(() => {
        finishAccountAScreenshot?.(
          new File(['account A screenshot'], 'account-a-screenshot.png', { type: 'image/png' }),
        );
      });

      expect(screen.getByText('account-b.txt')).toBeTruthy();
      expect(screen.queryByText('account-a-screenshot.png')).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'Send message (Enter)' }));
      expect(onSend).toHaveBeenCalledWith(
        'Please analyze the attached file.',
        'ask',
        undefined,
        [accountBFile],
        false,
      );
    },
    ROOT_GRAPH_TEST_TIMEOUT_MS,
  );

  it('merges a delayed screenshot with a file added meanwhile in the same destination', () => {
    const onSend = vi.fn();
    render(
      <ChatInput
        onSend={onSend}
        onStop={vi.fn()}
        onModelSelectorClick={vi.fn()}
        hasMessages={false}
        conversationId="conv-a"
        attachmentContextKey="managed:account-a"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Start screenshot' }));
    const finishScreenshot = screenshotHarness.callbacks[0];
    const regularFile = new File(['notes'], 'notes.txt', { type: 'text/plain' });
    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    fireEvent.change(fileInput!, { target: { files: [regularFile] } });

    const screenshot = new File(['pixels'], 'screenshot.png', { type: 'image/png' });
    act(() => finishScreenshot?.(screenshot));

    expect(screen.getByText('notes.txt')).toBeTruthy();
    expect(screen.getByText('screenshot.png')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Send message (Enter)' }));
    expect(onSend).toHaveBeenCalledWith(
      'Please analyze the attached files.',
      'ask',
      undefined,
      [regularFile, screenshot],
      false,
    );
  });
});
