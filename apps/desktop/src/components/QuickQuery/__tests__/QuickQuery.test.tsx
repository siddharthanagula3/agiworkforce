import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { QuickQuery } from '../index';
import { useModelStore } from '../../../stores/modelStore';
import { useAccountStore } from '../../../stores/auth';
import { TooltipProvider } from '../../ui/Tooltip';

function renderQuickQuery(props: ComponentProps<typeof QuickQuery>) {
  return render(
    <TooltipProvider>
      <QuickQuery {...props} />
    </TooltipProvider>,
  );
}

describe('QuickQuery', () => {
  beforeEach(() => {
    useAccountStore.setState({
      plan: 'hobby',
      account: {
        ...useAccountStore.getState().account,
        plan: 'hobby',
      },
    });

    useModelStore.setState({
      selectedModel: null,
      selectedProvider: 'managed_cloud',
    });
  });

  it('shows only hobby-tier auto modes for hobby users', async () => {
    renderQuickQuery({ open: true, onClose: vi.fn(), onSubmit: vi.fn() });

    fireEvent.click(screen.getByRole('button', { name: /auto \(economy\)/i }));

    expect(screen.getAllByText('Auto (Economy)').length).toBeGreaterThan(0);
    expect(screen.queryByText('Auto Balanced')).not.toBeInTheDocument();
    expect(screen.queryByText('Auto (Best Model)')).not.toBeInTheDocument();
  });

  it('submits with the best allowed auto mode when nothing is selected', async () => {
    const onSubmit = vi.fn();
    renderQuickQuery({ open: true, onClose: vi.fn(), onSubmit });

    fireEvent.change(screen.getByPlaceholderText('Ask anything...'), {
      target: { value: 'hello from hobby' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('hello from hobby', 'auto-economy');
    });
  });

  it('shows balanced auto mode for pro users', async () => {
    useAccountStore.setState({
      plan: 'pro',
      account: {
        ...useAccountStore.getState().account,
        plan: 'pro',
      },
    });

    renderQuickQuery({ open: true, onClose: vi.fn(), onSubmit: vi.fn() });

    fireEvent.click(screen.getByRole('button', { name: /auto balanced/i }));

    expect(screen.getAllByText('Auto (Economy)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Auto Balanced').length).toBeGreaterThan(0);
    expect(screen.queryByText('Auto (Best Model)')).not.toBeInTheDocument();
  });
});
