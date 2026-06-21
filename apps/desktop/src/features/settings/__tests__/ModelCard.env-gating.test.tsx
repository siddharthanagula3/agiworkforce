/**
 * P3 Phase A — Environment gating unit tests for the desktop model picker.
 *
 * Proves:
 *   (a) Every model in the real catalog (getAllModels) has envSelectable=true —
 *       no current model sets requiresEnvironment, so Phase A MUST NOT alter
 *       any existing model's appearance or selectability.
 *   (b) A synthetic model with requiresEnvironment:'e2b' is disabled and exposes
 *       the correct human-readable reason from evaluateModelEnvironment.
 *   (c) ModelCard renders the reason text when disabled=true and suppresses
 *       the onClick handler.
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { getAllModels, getModelEnvironmentGate } from '../../../constants/llm';
import type { ModelMetadata } from '../../../constants/llm';
import { ModelCard } from '../ModelCard';

// ---------------------------------------------------------------------------
// (a) Prove over the real catalog — no current model is env-gated
// ---------------------------------------------------------------------------

describe('getModelEnvironmentGate — real catalog safety', () => {
  it('returns envSelectable:true for every model currently in the catalog', () => {
    const allModels = getAllModels();
    expect(allModels.length).toBeGreaterThan(0);

    const locked = allModels.filter((m) => {
      const { envSelectable } = getModelEnvironmentGate(m);
      return !envSelectable;
    });

    expect(locked).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Shared synthetic model fixtures
// ---------------------------------------------------------------------------

function makeModel(overrides: Partial<ModelMetadata> = {}): ModelMetadata {
  return {
    id: 'test-model',
    name: 'Test Model',
    provider: 'anthropic',
    modelType: 'chat',
    contextWindow: 128_000,
    inputCost: 1.0,
    outputCost: 5.0,
    capabilities: {
      streaming: true,
      tools: true,
      vision: false,
      json: true,
      thinking: false,
      computerUse: false,
      agentic: true,
      imageGen: false,
      videoGen: false,
      search: false,
      research: false,
      codeExecution: false,
    },
    speed: 'fast',
    quality: 'good',
    qualityTier: 'balanced',
    bestFor: ['general purpose'],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// (b) Synthetic model with requiresEnvironment:'e2b' is locked
// ---------------------------------------------------------------------------

describe('getModelEnvironmentGate — env-gated synthetic model', () => {
  it('returns envSelectable:false with correct reason for requiresEnvironment:e2b', () => {
    const model = makeModel({ requiresEnvironment: 'e2b' });
    const { envSelectable, reason } = getModelEnvironmentGate(model);

    expect(envSelectable).toBe(false);
    expect(reason).toBe('Requires managed compute (currently in private beta)');
  });

  it('returns envSelectable:false with correct reason for requiresEnvironment:local-runtime', () => {
    const model = makeModel({ requiresEnvironment: 'local-runtime' });
    const { envSelectable, reason } = getModelEnvironmentGate(model);

    expect(envSelectable).toBe(false);
    expect(reason).toBe('Requires a local model runtime to be installed');
  });

  it('returns envSelectable:true when requiresEnvironment is absent', () => {
    const model = makeModel({ requiresEnvironment: undefined });
    const { envSelectable, reason } = getModelEnvironmentGate(model);

    expect(envSelectable).toBe(true);
    expect(reason).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// (c) ModelCard renders reason text when disabled and suppresses onClick
// ---------------------------------------------------------------------------

describe('ModelCard — disabled (env-locked) state', () => {
  it('shows the disabledReason text when disabled=true (full card)', () => {
    const model = makeModel({ requiresEnvironment: 'e2b' });
    const reason = 'Requires managed compute (currently in private beta)';

    render(<ModelCard model={model} disabled disabledReason={reason} />);

    expect(screen.getByText(reason)).toBeInTheDocument();
  });

  it('does not call onClick when disabled (full card)', async () => {
    const user = userEvent.setup();
    const model = makeModel({ requiresEnvironment: 'e2b' });
    const handleClick = vi.fn();

    render(<ModelCard model={model} disabled onClick={handleClick} />);

    const card = screen.getByText(model.name).closest('div');
    if (card) await user.click(card);

    expect(handleClick).not.toHaveBeenCalled();
  });

  it('shows the disabledReason in title attr for compact (list) view', () => {
    const model = makeModel({ requiresEnvironment: 'e2b' });
    const reason = 'Requires managed compute (currently in private beta)';

    render(<ModelCard model={model} compact disabled disabledReason={reason} />);

    // In compact mode the reason is set as the title attribute on the wrapper div
    const wrapper = screen.getByTitle(reason);
    expect(wrapper).toBeInTheDocument();
  });

  it('calls onClick normally when NOT disabled', async () => {
    const user = userEvent.setup();
    const model = makeModel();
    const handleClick = vi.fn();

    render(<ModelCard model={model} onClick={handleClick} />);

    const card = screen.getByText(model.name).closest('div');
    if (card) await user.click(card);

    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
