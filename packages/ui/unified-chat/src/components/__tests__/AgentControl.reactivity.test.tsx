import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AgentControl } from '../AgentControl';
import { useAgentControlStore } from '../../stores/agentControlStore';

describe('AgentControl reactive state', () => {
  beforeEach(() => {
    useAgentControlStore.setState({ byConversation: {}, byProject: {} });
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('updates the mode chip when the conversation override changes', () => {
    render(
      <AgentControl conversationId="conversation-1" projectId={null} modelProviderId="openai" />,
    );
    expect(screen.getByRole('button', { name: 'Agent mode: Ask before edits' })).toBeTruthy();

    act(() => useAgentControlStore.getState().setMode('conversation-1', 'auto'));

    expect(screen.getByRole('button', { name: 'Agent mode: Edit automatically' })).toBeTruthy();
  });

  it('updates the effort chip when the conversation override changes', () => {
    render(
      <AgentControl conversationId="conversation-1" projectId={null} modelProviderId="openai" />,
    );
    expect(screen.getByRole('button', { name: 'Effort: Medium' })).toBeTruthy();

    act(() => useAgentControlStore.getState().setEffort('conversation-1', 'high'));

    expect(screen.getByRole('button', { name: 'Effort: High' })).toBeTruthy();
  });

  it('requires explicit confirmation before bypassing tool permissions', () => {
    render(
      <AgentControl conversationId="conversation-1" projectId={null} modelProviderId="openai" />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Agent mode: Ask before edits' }));
    fireEvent.click(screen.getByRole('button', { name: /Bypass permissions/i }));

    expect(useAgentControlStore.getState().resolve('conversation-1', null).mode).toBe('ask');
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText('Bypass all tool permissions?')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Enable Bypass' }));

    expect(useAgentControlStore.getState().resolve('conversation-1', null).mode).toBe('bypass');
  });
});
