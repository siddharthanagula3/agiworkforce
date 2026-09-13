import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@agiworkforce/unified-chat', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/unified-chat')>();
  return {
    ...actual,
    MarkdownRenderer: ({ content }: { content: string }) => <div>{content}</div>,
  };
});

import {
  MessageBubble,
  MessageInlineEditProvider,
  type MessageInlineEditController,
} from '../MessageBubble';

function userMessage(id = 'msg-1') {
  return {
    id,
    role: 'user' as const,
    content: 'The message the user wants back',
    timestamp: new Date('2026-09-13T00:00:00.000Z'),
    sessionId: 'conv-1',
  };
}

function renderWithController(controller: MessageInlineEditController, id = 'msg-1') {
  render(
    <MessageInlineEditProvider value={controller}>
      <MessageBubble message={userMessage(id)} />
    </MessageInlineEditProvider>,
  );
}

/**
 * ArrowUp on an empty composer is the surface asking for the last user turn,
 * and the transcript owns the editor, so the request reaches the bubble
 * through the same controller a click on Edit uses.
 */
describe('a surface asking the bubble to open its editor', () => {
  it('opens the editor for the message the surface named', () => {
    const controller: MessageInlineEditController = {
      beginEdit: () => true,
      submitEdit: vi.fn(),
      requestedEditMessageId: 'msg-1',
      onEditRequestHandled: vi.fn(),
    };

    renderWithController(controller);

    expect(screen.getByRole('textbox')).toHaveValue('The message the user wants back');
    expect(controller.onEditRequestHandled).toHaveBeenCalledTimes(1);
  });

  it('leaves a message the surface did not name alone', () => {
    const controller: MessageInlineEditController = {
      beginEdit: () => true,
      submitEdit: vi.fn(),
      requestedEditMessageId: 'another-message',
      onEditRequestHandled: vi.fn(),
    };

    renderWithController(controller);

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(controller.onEditRequestHandled).not.toHaveBeenCalled();
  });

  it('respects a refusal from the surface guard', () => {
    const controller: MessageInlineEditController = {
      beginEdit: () => false,
      submitEdit: vi.fn(),
      requestedEditMessageId: 'msg-1',
      onEditRequestHandled: vi.fn(),
    };

    renderWithController(controller);

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(controller.onEditRequestHandled).toHaveBeenCalledTimes(1);
  });
});
