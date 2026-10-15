import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/tauri-mock', async (importOriginal) => ({
  ...(await importOriginal<TauriMockModule>()),
  invoke: vi.fn(),
  isTauriContext: vi.fn(() => false),
}));

vi.mock('@/api/byok', () => ({
  createByokFork: vi.fn(),
  deleteApiKey: vi.fn(),
  listLockedApiKeys: vi.fn(),
  listSavedApiKeys: vi.fn(),
}));

vi.mock('@/api/mcp', async (importOriginal) => ({
  ...(await importOriginal<McpModule>()),
  McpClient: { saveApiKey: vi.fn() },
}));

import { invoke } from '@/lib/tauri-mock';
import { deleteApiKey, listLockedApiKeys, listSavedApiKeys } from '@/api/byok';
import { VAULT_STATE_CHANGED_EVENT } from '../masterPasswordVault';
import { BYOKApiKeysSection } from '../tabs/ModelsKeys';

type TauriMockModule = typeof import('@/lib/tauri-mock');
type McpModule = typeof import('@/api/mcp');

function providerRow(name: string): HTMLElement {
  const row = screen.getByText(name).closest('div.px-4');
  if (!(row instanceof HTMLElement)) throw new Error(`No row for ${name}`);
  return row;
}

describe('BYOK API keys section', () => {
  beforeEach(() => {
    vi.mocked(listSavedApiKeys).mockResolvedValue(['openai']);
    vi.mocked(listLockedApiKeys).mockResolvedValue([]);
    vi.mocked(deleteApiKey).mockResolvedValue(undefined);
    vi.mocked(invoke).mockResolvedValue({
      provider: 'openai',
      available: true,
      configured: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows keys saved in an earlier session and lets the user test them', async () => {
    render(<BYOKApiKeysSection />);

    const openai = providerRow('OpenAI');
    expect(
      await within(openai).findByText('Key saved on this device. Use Test to check it.'),
    ).toBeInTheDocument();
    const testButton = within(openai).getByRole('button', { name: 'Test' });
    expect(testButton).toBeEnabled();
    expect(within(providerRow('Anthropic')).getByRole('button', { name: 'Test' })).toBeDisabled();

    fireEvent.click(testButton);
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('llm_check_provider_status', { provider: 'openai' }),
    );
    expect(await within(openai).findByText('Verified and ready.')).toBeInTheDocument();
  });

  it('says a saved key is locked while the vault is locked, and clears it on unlock', async () => {
    vi.mocked(listLockedApiKeys).mockResolvedValue(['openai']);
    render(<BYOKApiKeysSection />);

    const openai = providerRow('OpenAI');
    expect(await within(openai).findByText(/^Locked\. Unlock your saved keys/)).toBeInTheDocument();
    expect(within(providerRow('Anthropic')).queryByText(/^Locked\./)).toBeNull();

    vi.mocked(listLockedApiKeys).mockResolvedValue([]);
    window.dispatchEvent(new CustomEvent(VAULT_STATE_CHANGED_EVENT));

    expect(
      await within(openai).findByText('Key saved on this device. Use Test to check it.'),
    ).toBeInTheDocument();
    expect(within(openai).queryByText(/^Locked\./)).toBeNull();
  });

  it('shows no locked state when the vault status cannot be read', async () => {
    vi.mocked(listLockedApiKeys).mockRejectedValue(new Error('not available'));
    render(<BYOKApiKeysSection />);

    expect(
      await within(providerRow('OpenAI')).findByText(
        'Key saved on this device. Use Test to check it.',
      ),
    ).toBeInTheDocument();
  });

  it('removes a key only after a confirmation that names the consequence', async () => {
    render(<BYOKApiKeysSection />);

    fireEvent.click(await screen.findByRole('button', { name: 'Remove the OpenAI key' }));
    expect(deleteApiKey).not.toHaveBeenCalled();
    expect(await screen.findByText(/cannot send until you save a key again/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remove key' }));

    await waitFor(() => expect(deleteApiKey).toHaveBeenCalledWith('openai'));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Remove the OpenAI key' })).toBeNull(),
    );
    expect(within(providerRow('OpenAI')).getByRole('button', { name: 'Test' })).toBeDisabled();
  });

  it('says so when saved keys cannot be read', async () => {
    vi.mocked(listSavedApiKeys).mockRejectedValue(new Error('database locked'));
    render(<BYOKApiKeysSection />);

    expect(await screen.findByRole('alert')).toHaveTextContent('database locked');
  });
});
