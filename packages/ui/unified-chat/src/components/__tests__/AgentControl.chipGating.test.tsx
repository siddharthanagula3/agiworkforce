import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AgentControl } from '../AgentControl';
import { useAgentControlStore } from '../../stores/agentControlStore';
import { requireCatalogModel } from '../../test/modelCatalogFixtures';

const effortModel = requireCatalogModel(
  (model) =>
    model.availability !== 'coming_soon' &&
    model.availability !== 'unavailable' &&
    Boolean(model.reasoning?.supportedEfforts?.includes('medium')) &&
    Boolean(model.reasoning?.supportedEfforts?.includes('high')),
  'a live model with medium and high reasoning efforts',
);

/**
 * Desktop honours reasoning effort but NOT agent-mode enforcement, so the two
 * chips must be independently switchable.
 *
 * Both previously sat behind a single `supportsAgentControl` flag. Desktop sets
 * that false because Managed Cloud owns approval policy, which silently cost it
 * the effort control as well. These pin both halves: effort can render without
 * mode, and — the part that matters for safety — turning effort on must never
 * surface the Ask/Auto/Plan/Bypass permission chip.
 */
describe('AgentControl chip gating', () => {
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

  const renderControl = (props: { showMode?: boolean; showEffort?: boolean }) =>
    render(
      <AgentControl
        conversationId="conversation-1"
        projectId={null}
        modelId={effortModel.id}
        {...props}
      />,
    );

  it('renders effort without the mode chip — the desktop case', () => {
    renderControl({ showMode: false, showEffort: true });
    expect(screen.getByLabelText('Reasoning effort')).toBeTruthy();
    // The permission control must stay absent: advertising Bypass on a surface
    // whose runtime ignores agentMode would promise a guarantee we do not keep.
    expect(screen.queryByLabelText(/^Agent mode/)).toBeNull();
  });

  it('renders the mode chip without effort', () => {
    renderControl({ showMode: true, showEffort: false });
    expect(screen.getByLabelText(/^Agent mode/)).toBeTruthy();
    expect(screen.queryByLabelText('Reasoning effort')).toBeNull();
  });

  it('renders both by default so existing surfaces are unchanged', () => {
    renderControl({});
    expect(screen.getByLabelText('Reasoning effort')).toBeTruthy();
    expect(screen.getByLabelText(/^Agent mode/)).toBeTruthy();
  });
});
