import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBillingStore, type SubscriptionPlan } from '@shared/stores/web-auth-store';
import { useModelStore } from '@shared/stores/model-store';
import { getSelectableModels, isModelAllowedForTier } from '@shared/config/llm';
import { ChatComposerNew } from './ChatComposerNew';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}));

vi.mock('@features/settings/components/SettingsModalProvider', () => ({
  useSettingsModal: () => ({ isOpen: false, openSettings: vi.fn(), closeSettings: vi.fn() }),
}));

vi.mock('@features/chat/hooks/use-skills-list', () => ({
  useSkillsList: () => ({ skills: [], loading: false, error: null }),
}));

vi.mock('@features/chat/hooks/use-media-model-availability', () => ({
  useMediaModelAvailability: () => ({
    status: 'ready',
    error: null,
    admissionFor: vi.fn(),
    retry: vi.fn(),
  }),
}));

vi.mock('@features/connectors/hooks/use-connectors', () => ({
  useConnectors: () => ({
    connectedIds: new Set<string>(),
    sources: {} as Record<string, string>,
    customNames: {} as Record<string, string>,
  }),
}));

const PRO_SUBSCRIPTION: SubscriptionPlan = {
  tier: 'pro',
  display_name: 'Pro',
  status: 'active',
  current_period_end: null,
  plan_name: 'Pro',
};

function proModelWithoutCodeExecution(): string {
  const model = getSelectableModels().find(
    (candidate) =>
      !candidate.capabilities?.codeExecution &&
      isModelAllowedForTier(candidate.id, PRO_SUBSCRIPTION.tier),
  );
  if (!model) throw new Error('catalog has no Pro model without code execution to test the gate');
  return model.id;
}

describe('composer · disabled Run code row explains itself', () => {
  beforeEach(() => {
    useBillingStore.setState({
      subscription: PRO_SUBSCRIPTION,
      featureFlags: { advanced_model_access: true, code_execution: false },
    });
    useModelStore.setState({ selectedModelId: proModelWithoutCodeExecution() });
  });

  it('gives the greyed-out row a reason instead of an empty tooltip', () => {
    render(<ChatComposerNew onSend={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Add attachments and tools/ }));

    const runCode = screen.getByRole('button', { name: 'Run code' });

    expect(runCode).toBeDisabled();
    expect(runCode.getAttribute('title')).toMatch(/model/i);
  });

  it('leaves the tooltip off once the row is usable', () => {
    useBillingStore.setState({
      subscription: PRO_SUBSCRIPTION,
      featureFlags: { advanced_model_access: true, code_execution: true },
    });
    render(<ChatComposerNew onSend={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Add attachments and tools/ }));

    const runCode = screen.getByRole('button', { name: 'Run code' });

    expect(runCode).toBeEnabled();
    expect(runCode.getAttribute('title')).toBeNull();
  });
});
