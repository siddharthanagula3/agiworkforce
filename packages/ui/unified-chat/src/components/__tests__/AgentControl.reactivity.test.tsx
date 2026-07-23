import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AgentControl } from '../AgentControl';
import { useAgentControlStore } from '../../stores/agentControlStore';

describe('AgentControl reactive state', () => {
  beforeEach(() => {
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    useAgentControlStore.setState({ byConversation: {}, byProject: {} });
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('updates the mode chip when the conversation override changes', () => {
    render(
      <AgentControl conversationId="conversation-1" projectId={null} modelId="gpt-5.6-luna" />,
    );
    expect(screen.getByRole('button', { name: 'Agent mode: Ask before edits' })).toBeTruthy();

    act(() => useAgentControlStore.getState().setMode('conversation-1', 'auto'));

    expect(screen.getByRole('button', { name: 'Agent mode: Edit automatically' })).toBeTruthy();
  });

  it('updates the compact effort slider when the conversation override changes', () => {
    render(
      <AgentControl conversationId="conversation-1" projectId={null} modelId="gpt-5.6-luna" />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reasoning effort' }));
    expect(
      screen.getByRole('slider', { name: 'Reasoning effort' }).getAttribute('aria-valuetext'),
    ).toBe('Medium');

    act(() => useAgentControlStore.getState().setEffort('conversation-1', 'high'));

    expect(
      screen.getByRole('slider', { name: 'Reasoning effort' }).getAttribute('aria-valuetext'),
    ).toBe('High');
  });

  it('hides effort for Haiku even though Anthropic has other effort-capable models', () => {
    render(
      <AgentControl conversationId="conversation-1" projectId={null} modelId="claude-haiku-4.5" />,
    );

    expect(screen.queryByRole('button', { name: 'Reasoning effort' })).toBeNull();
  });

  it('shows only Gemini Flash-Lite provider-supported effort levels', () => {
    render(
      <AgentControl
        conversationId="conversation-1"
        projectId={null}
        modelId="gemini-3.5-flash-lite"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reasoning effort' }));
    const slider = screen.getByRole('slider', { name: 'Reasoning effort' });
    expect(slider.getAttribute('aria-valuemin')).toBe('0');
    expect(slider.getAttribute('aria-valuemax')).toBe('3');
    expect(slider.getAttribute('aria-valuetext')).toBe('Medium');
    expect(screen.queryByRole('button', { name: /^Minimal / })).toBeNull();
  });

  it('requires explicit confirmation before bypassing tool permissions', () => {
    render(
      <AgentControl conversationId="conversation-1" projectId={null} modelId="gpt-5.6-luna" />,
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
