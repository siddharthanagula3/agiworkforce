import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { getModelReasoning, listCanonicalModels } from '@agiworkforce/types';
import { useModelStore } from '../../stores/modelStore';
import { ThinkingControl } from '../ThinkingControl';

/**
 * DES-C03 — the composer had no thinking control at all, so `thinkingEnabled`
 * sat at its initial `false` and every managed request serialised
 * `thinking_mode: false`. Model ids come from the registry, never hardcoded.
 */
function catalogModelIdWhere(predicate: (id: string) => boolean): string {
  const match = listCanonicalModels().find((model) => predicate(model.id));
  if (!match) throw new Error('No catalog model matches this reasoning shape');
  return match.id;
}

const alwaysOnModelId = catalogModelIdWhere(
  (id) => getModelReasoning(id).canDisableThinking === false,
);
const switchableModelId = catalogModelIdWhere((id) => {
  const reasoning = getModelReasoning(id);
  if (reasoning.control === 'none' || reasoning.control === 'always_on') return false;
  if (
    reasoning.control === 'effort_levels' &&
    (reasoning.supportedEfforts ?? []).includes('none')
  ) {
    return false;
  }
  return (reasoning.canDisableThinking ?? true) && reasoning.capable;
});
const noReasoningModelId = catalogModelIdWhere((id) => {
  const reasoning = getModelReasoning(id);
  return reasoning.control === 'none' && reasoning.capable === false;
});

describe('ThinkingControl', () => {
  beforeEach(() => {
    useModelStore.setState({ thinkingEnabled: false });
  });

  it('renders a static always-on badge and snaps the store on for a model that cannot disable thinking', () => {
    render(<ThinkingControl modelId={alwaysOnModelId} />);

    expect(screen.getByTestId('thinking-always-on')).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(useModelStore.getState().thinkingEnabled).toBe(true);
  });

  it('renders an operable switch for a model with a real on/off contract', async () => {
    render(<ThinkingControl modelId={switchableModelId} />);

    const toggle = screen.getByRole('switch', { name: 'Toggle extended thinking' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');

    await userEvent.click(toggle);
    expect(useModelStore.getState().thinkingEnabled).toBe(true);
    expect(
      screen.getByRole('switch', { name: 'Toggle extended thinking' }).getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('renders nothing for a model with no thinking contract', () => {
    const { container } = render(<ThinkingControl modelId={noReasoningModelId} />);

    expect(container.firstChild).toBeNull();
    expect(useModelStore.getState().thinkingEnabled).toBe(false);
  });
});
