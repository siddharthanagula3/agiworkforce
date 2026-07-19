import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomModelsSettings } from './CustomModelsSettings';

const useSettingsStoreMock = vi.fn();

vi.mock('@shared/stores/web-settings-store', () => ({
  useSettingsStore: () => useSettingsStoreMock(),
}));

describe('CustomModelsSettings', () => {
  beforeEach(() => {
    useSettingsStoreMock.mockReturnValue({ customModels: [] });
  });

  it('does not offer banned provider presets', async () => {
    render(<CustomModelsSettings />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Model' }));
    expect(
      await screen.findByText('Connect an OpenAI-compatible local or supported provider endpoint.'),
    ).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('combobox', { name: 'Provider Preset' }));

    expect(screen.queryByRole('option', { name: 'Together AI' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Fireworks' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Groq' })).toBeInTheDocument();
  });
});
