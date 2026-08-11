import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiKeysManager } from './ApiKeys';

const { createMutate, deleteMutate, mockApiKeysQuery } = vi.hoisted(() => ({
  createMutate: vi.fn(),
  deleteMutate: vi.fn(),
  mockApiKeysQuery: vi.fn(),
}));

vi.mock('@features/settings/hooks/use-settings-queries', () => ({
  useAPIKeys: () => mockApiKeysQuery(),
  useCreateAPIKey: () => ({ mutate: createMutate, isPending: false }),
  useDeleteAPIKey: () => ({ mutate: deleteMutate, isPending: false }),
}));

describe('ApiKeysManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiKeysQuery.mockReturnValue({
      data: [
        {
          id: 'key-1',
          name: 'CLI',
          key_prefix: '0123456789abcdef',
          scopes: ['inference:write'],
          created_at: '2026-07-30T00:00:00.000Z',
          last_used_at: null,
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it('shows persisted scopes and submits the selected least-privilege contract', async () => {
    const user = userEvent.setup();
    render(<ApiKeysManager />);

    expect(screen.getByText('Run inference')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New Key' }));

    const modelsScope = screen.getByRole('checkbox', { name: /Read model catalog/ });
    const inferenceScope = screen.getByRole('checkbox', { name: /Run inference/ });
    const usageScope = screen.getByRole('checkbox', { name: /Read usage/ });
    expect(modelsScope).toBeChecked();
    expect(inferenceScope).toBeChecked();
    expect(usageScope).not.toBeChecked();

    await user.click(modelsScope);
    await user.type(screen.getByPlaceholderText('e.g., Production API'), 'VS Code');
    const generateButton = screen.getByRole('button', { name: 'Generate Key' });
    await waitFor(() => expect(generateButton).toBeEnabled());
    await user.click(generateButton);

    await waitFor(() =>
      expect(createMutate).toHaveBeenCalledWith(
        { name: 'VS Code', scopes: ['inference:write'] },
        expect.objectContaining({ onSuccess: expect.any(Function) }),
      ),
    );
  });

  it('does not allow a key with no selected scope', async () => {
    render(<ApiKeysManager />);
    fireEvent.click(screen.getByRole('button', { name: 'New Key' }));
    fireEvent.change(screen.getByPlaceholderText('e.g., Production API'), {
      target: { value: 'No permissions' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: /Read model catalog/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Run inference/ }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Generate Key' })).toBeDisabled(),
    );
    expect(createMutate).not.toHaveBeenCalled();
  });

  it('shows an honest retry state instead of an empty key list after a load failure', async () => {
    const refetch = vi.fn();
    mockApiKeysQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: true,
      error: new Error('API keys took too long to load. Please try again.'),
      refetch,
    });

    render(<ApiKeysManager />);

    expect(screen.getByRole('alert')).toHaveTextContent('API keys took too long to load');
    expect(screen.queryByText('No API keys yet')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New Key' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
