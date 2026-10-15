import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AgentQuestionCard, useAgentQuestionStore } from '../AgentQuestionCard';

describe('AgentQuestionCard', () => {
  beforeEach(() => {
    useAgentQuestionStore.setState({ byConversation: {} });
  });

  afterEach(() => cleanup());

  it('answers a single-choice question with the chosen option', () => {
    const onAnswer = vi.fn(async () => {});
    useAgentQuestionStore.getState().ask('conv-1', {
      id: 'q-1',
      question: 'Which branch?',
      choices: ['main', 'dev'],
      multiSelect: false,
    });
    render(<AgentQuestionCard conversationId="conv-1" onAnswer={onAnswer} />);

    fireEvent.click(screen.getByRole('button', { name: 'dev' }));

    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ id: 'q-1' }), 'dev');
  });

  it('collects several choices before answering a multi-select question', () => {
    const onAnswer = vi.fn(async () => {});
    useAgentQuestionStore.getState().ask('conv-1', {
      id: 'q-2',
      question: 'Which files?',
      choices: ['a.ts', 'b.ts', 'c.ts'],
      multiSelect: true,
    });
    render(<AgentQuestionCard conversationId="conv-1" onAnswer={onAnswer} />);

    fireEvent.click(screen.getByRole('button', { name: 'a.ts' }));
    fireEvent.click(screen.getByRole('button', { name: 'c.ts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Answer' }));

    expect(onAnswer).toHaveBeenCalledWith(expect.objectContaining({ id: 'q-2' }), ['a.ts', 'c.ts']);
  });

  it('shows nothing for another conversation', () => {
    useAgentQuestionStore.getState().ask('conv-2', {
      id: 'q-3',
      question: 'Elsewhere?',
      choices: ['yes'],
      multiSelect: false,
    });
    const { container } = render(<AgentQuestionCard conversationId="conv-1" onAnswer={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});
