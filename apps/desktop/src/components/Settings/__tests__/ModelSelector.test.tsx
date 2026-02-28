import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModelSelector } from '../ModelSelector';
import { useUnifiedAuthStore } from '../../../stores/auth';
import { useModelStore } from '../../../stores/modelStore';

vi.mock('../ModelCard', () => ({
  ModelCard: ({ model, onClick }: { model: { name: string }; onClick?: () => void }) => (
    <button onClick={onClick}>{model.name}</button>
  ),
}));

function setAuthPlan(plan: 'hobby' | 'pro' | 'free' | 'max' | 'enterprise') {
  const current = useUnifiedAuthStore.getState();
  useUnifiedAuthStore.setState({
    plan,
    account: { ...current.account, plan },
  });
}

describe('ModelSelector', () => {
  beforeEach(() => {
    setAuthPlan('hobby');

    useModelStore.setState({
      selectedModel: null,
      favorites: [],
      recentModels: [],
    });
  });

  it('hides higher-tier managed cloud models for hobby users', () => {
    render(<ModelSelector />);

    expect(screen.getByText('Auto (Economy)')).toBeInTheDocument();
    expect(screen.queryByText('Auto Balanced')).not.toBeInTheDocument();
    expect(screen.queryByText('GPT-5.2 Codex (Low)')).not.toBeInTheDocument();
  });

  it('shows pro-tier managed cloud models for pro users', () => {
    setAuthPlan('pro');

    render(<ModelSelector />);

    expect(screen.getByText('Auto Balanced')).toBeInTheDocument();
    expect(screen.getByText('GPT-5.2 Codex (Low)')).toBeInTheDocument();
  });
});
