import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AgentControl } from '../AgentControl';
import { useAgentControlStore } from '../../stores/agentControlStore';
import { requireCatalogModel } from '../../test/modelCatalogFixtures';

const effortModel = requireCatalogModel(
  (model) =>
    Boolean(model.reasoning?.supportedEfforts?.includes('medium')) &&
    Boolean(model.reasoning?.supportedEfforts?.includes('high')),
  'a model with medium and high reasoning efforts',
);
const constrainedEffortModel = requireCatalogModel(
  (model) =>
    model.reasoning?.supportedEfforts?.length === 4 &&
    model.reasoning.supportedEfforts.includes('medium'),
  'a model with a four-step reasoning effort ladder',
);

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
      <AgentControl conversationId="conversation-1" projectId={null} modelId={effortModel.id} />,
    );
    expect(screen.getByRole('button', { name: 'Agent mode: Ask before edits' })).toBeTruthy();

    act(() => useAgentControlStore.getState().setMode('conversation-1', 'auto'));

    expect(screen.getByRole('button', { name: 'Agent mode: Edit automatically' })).toBeTruthy();
  });

  it('updates the compact effort slider when the conversation override changes', () => {
    render(
      <AgentControl conversationId="conversation-1" projectId={null} modelId={effortModel.id} />,
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

  it('uses only the selected model’s catalog-supported effort levels', () => {
    render(
      <AgentControl
        conversationId="conversation-1"
        projectId={null}
        modelId={constrainedEffortModel.id}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reasoning effort' }));
    const slider = screen.getByRole('slider', { name: 'Reasoning effort' });
    expect(slider.getAttribute('aria-valuemin')).toBe('0');
    expect(slider.getAttribute('aria-valuemax')).toBe(
      String(constrainedEffortModel.reasoning!.supportedEfforts!.length - 1),
    );
    expect(slider.getAttribute('aria-valuetext')).toBe('Medium');
  });

  it('requires explicit confirmation before bypassing tool permissions', () => {
    render(
      <AgentControl conversationId="conversation-1" projectId={null} modelId={effortModel.id} />,
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
