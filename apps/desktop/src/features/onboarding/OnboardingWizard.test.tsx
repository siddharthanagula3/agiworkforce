import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OnboardingWizard } from './OnboardingWizard';

const invokeMock = vi.fn();

vi.mock('../../lib/tauri-mock', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
  isTauri: false,
  isTauriContext: () => false,
}));

vi.mock('../../api/ollama', () => ({
  OllamaClient: {
    isReadyForUse: vi.fn().mockResolvedValue({ available: false, modelCount: 0 }),
  },
}));

describe('OnboardingWizard BYOK submission', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
  });

  it('saves a pasted OpenRouter key via save_api_key with the canonical provider id', async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard onComplete={vi.fn()} />);

    const input = screen.getByLabelText('API key');
    await user.type(input, 'sk-or-v1-abcdefghijklmnopqrstuvwxyz');

    const goButton = await screen.findByRole('button', { name: 'Go' });
    await user.click(goButton);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('save_api_key', {
        provider: 'open_router',
        key: 'sk-or-v1-abcdefghijklmnopqrstuvwxyz',
      });
    });

    expect(invokeMock).not.toHaveBeenCalledWith('secret_manager_set', expect.anything());
  });

  it('saves a pasted Anthropic key via save_api_key with provider "anthropic"', async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard onComplete={vi.fn()} />);

    const input = screen.getByLabelText('API key');
    await user.type(input, 'sk-ant-abcdefghijklmnopqrstuvwxyz');

    const goButton = await screen.findByRole('button', { name: 'Go' });
    await user.click(goButton);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('save_api_key', {
        provider: 'anthropic',
        key: 'sk-ant-abcdefghijklmnopqrstuvwxyz',
      });
    });
  });
});
