import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMPOSER_SEND_ACCEPTED, ChatInput } from '../ChatInput';
import { SkillMentionPicker } from '../SkillMentionPicker';
import { useChatStore } from '../../stores/chatStore';
import { useModelStore } from '../../stores/modelStore';

function renderComposer(onSend = vi.fn(() => COMPOSER_SEND_ACCEPTED)) {
  render(
    <ChatInput
      onSend={onSend}
      onStop={vi.fn()}
      onModelSelectorClick={vi.fn()}
      hasMessages
      conversationId="conv-1"
      supportsResearch={false}
      slashCommandHost={{ togglePlanMode: vi.fn(), openRewindTimeline: vi.fn() }}
    />,
  );
  return { onSend, textarea: screen.getByRole('textbox') as HTMLTextAreaElement };
}

describe('composer keys during input-method composition', () => {
  beforeEach(() => {
    useChatStore.setState({
      activeConversationId: 'conv-1',
      draftContent: '',
      draftsByConversation: {},
      isStreaming: false,
      conversations: [],
    });
    useModelStore.setState({ selectedModelId: 'auto-economy', models: [] });
  });

  afterEach(() => cleanup());

  it('does not send while Enter confirms a candidate', () => {
    const { onSend, textarea } = renderComposer();
    fireEvent.change(textarea, { target: { value: 'hello' } });

    fireEvent.keyDown(textarea, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(textarea, { key: 'Enter', keyCode: 229 });
    expect(onSend).not.toHaveBeenCalled();

    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledOnce();
  });

  it('leaves an open slash menu untouched while a candidate is being confirmed', () => {
    const { onSend, textarea } = renderComposer();
    fireEvent.change(textarea, { target: { value: '/' } });

    const composingEnter = new KeyboardEvent('keydown', {
      key: 'Enter',
      isComposing: true,
      bubbles: true,
      cancelable: true,
    });
    textarea.dispatchEvent(composingEnter);

    expect(composingEnter.defaultPrevented).toBe(false);
    expect(onSend).not.toHaveBeenCalled();

    const plainEnter = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    textarea.dispatchEvent(plainEnter);
    expect(plainEnter.defaultPrevented).toBe(true);
  });
});

describe('SkillMentionPicker during input-method composition', () => {
  afterEach(() => cleanup());

  it('selects on a plain Enter but not on the Enter that confirms a candidate', () => {
    const onSelect = vi.fn();
    render(
      <SkillMentionPicker
        query=""
        skills={[{ id: 'skill-a', name: 'Skill A', category: 'general' }]}
        onSelect={onSelect}
        onClose={vi.fn()}
      />,
    );

    fireEvent.keyDown(window, { key: 'Enter', isComposing: true });
    fireEvent.keyDown(window, { key: 'Enter', keyCode: 229 });
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
