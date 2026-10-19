import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useChatStore } from '@shared/stores/web-chat-store';
import { useProjectChatDefaults } from './use-project-chat-defaults';

const pending = () => useChatStore.getState().getComposerToggles(null);

beforeEach(() => {
  useChatStore.getState().reset();
});

describe('useProjectChatDefaults', () => {
  it('switches on the project tools for the new chat being drafted', () => {
    renderHook(() =>
      useProjectChatDefaults({
        projectId: 'proj-1',
        chatDefaults: { codeExecution: true, skillName: 'brand-voice' },
        conversationId: null,
      }),
    );

    expect(pending()).toMatchObject({
      codeExecutionEnabled: true,
      selectedSkillName: 'brand-voice',
    });
  });

  it('does not switch a tool back on after the user turned it off in the same draft', () => {
    const { rerender } = renderHook(
      (props: { chatDefaults: { codeExecution: boolean } }) =>
        useProjectChatDefaults({ projectId: 'proj-1', conversationId: null, ...props }),
      { initialProps: { chatDefaults: { codeExecution: true } } },
    );
    useChatStore.getState().setComposerToggles({ codeExecutionEnabled: false }, null);

    rerender({ chatDefaults: { codeExecution: true } });

    expect(pending().codeExecutionEnabled).toBe(false);
  });

  it('leaves an open conversation and a project without defaults alone', () => {
    renderHook(() =>
      useProjectChatDefaults({
        projectId: 'proj-1',
        chatDefaults: { codeExecution: true },
        conversationId: 'conv-1',
      }),
    );
    renderHook(() =>
      useProjectChatDefaults({ projectId: 'proj-2', chatDefaults: {}, conversationId: null }),
    );

    expect(pending().codeExecutionEnabled).toBe(false);
    expect(useChatStore.getState().getComposerToggles('conv-1').codeExecutionEnabled).toBe(false);
  });
});
