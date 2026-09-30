import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type { ChatMessage } from '@/types/chat';

jest.mock('@/lib/models', () => {
  const model = {
    id: 'fixture-model',
    name: 'Fixture',
    provider: 'fixture-provider',
    contextWindow: 1000,
    maxOutput: 100,
    supportsVision: false,
    supportsThinking: false,
    tier: 'economy',
  };
  return {
    getModelById: (id: string) => (id === model.id ? model : undefined),
    MODEL_LIST: [model],
  };
});

jest.mock('@/src/features/model-picker/service', () => ({
  getManagedDisplayName: () => 'Fixture model',
}));

import { ContextDetailsSheet } from '@/src/features/chat/components/ContextDetailsSheet';
import { summarizeContext } from '@/src/features/memory/services/contextBudgeter';

function message(id: string, role: 'user' | 'assistant', content: string, files = 0): ChatMessage {
  return {
    id,
    role,
    content,
    createdAt: '2026-09-28T10:00:00.000Z',
    ...(files > 0
      ? {
          attachments: Array.from({ length: files }, (_, index) => ({
            id: `${id}-file-${index}`,
            name: 'notes.txt',
          })),
        }
      : {}),
  } as unknown as ChatMessage;
}

const messages = [
  message('m1', 'user', 'Summarize this file for me please', 2),
  message('m2', 'assistant', 'Here is the summary of the file you shared.'),
  message('m3', 'user', 'Thanks'),
];

describe('context details', () => {
  it('breaks the thread down by who wrote it and what is attached', () => {
    const rows = summarizeContext(messages);
    expect(rows.map((row) => [row.key, row.count])).toEqual([
      ['user', 2],
      ['assistant', 1],
      ['attachments', 2],
    ]);
    expect(rows[0].tokens).toBeGreaterThan(0);
  });

  it('shows usage against the model window and offers a fresh chat', () => {
    const onStartFreshChat = jest.fn();
    const onClose = jest.fn();
    const { getByTestId, getByText } = render(
      <ContextDetailsSheet
        visible
        modelId="fixture-model"
        messages={messages}
        onClose={onClose}
        onStartFreshChat={onStartFreshChat}
      />,
    );

    expect(getByTestId('context-details-usage').props.children).toMatch(/of 1,000 tokens/);
    expect(getByText('Fixture model')).toBeTruthy();
    fireEvent.press(getByText('Start a new chat'));
    expect(onClose).toHaveBeenCalled();
    expect(onStartFreshChat).toHaveBeenCalled();
  });
});
