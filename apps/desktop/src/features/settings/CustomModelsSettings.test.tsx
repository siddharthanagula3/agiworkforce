import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CustomModelsSettings } from './CustomModelsSettings';
import { validateCustomModelEndpoint } from './customModelEndpoint';

const store = {
  customModels: [] as unknown[],
  addCustomModel: vi.fn(),
  updateCustomModel: vi.fn(),
  removeCustomModel: vi.fn(),
};

vi.mock('../../stores/settingsStore', () => ({
  useSettingsStore: (selector: (state: typeof store) => unknown) => selector(store),
}));

const REFUSED_ENDPOINTS = [
  'http://169.254.169.254',
  'http://169.254.169.254/latest/meta-data/',
  'http://localhost',
  'http://localhost:11434/v1',
  'https://localhost:11434/v1',
  'https://127.0.0.1/v1',
  'https://[::1]/v1',
  'https://10.0.0.5/v1',
  'https://172.16.4.4/v1',
  'https://192.168.1.1/v1',
  'https://100.64.0.1/v1',
  'https://router.local/v1',
  'https://gateway.internal/v1',
  'http://api.example.com/v1',
  'https://user:secret@api.example.com/v1',
  'file:///etc/passwd',
  'not a url',
  '',
];

const ACCEPTED_ENDPOINTS = [
  'https://api.example.com/v1',
  'https://api.groq.com/openai/v1',
  'https://gateway.example.co.uk:8443/v1',
  'https://203.0.113.10/v1',
];

describe('custom model endpoint validation', () => {
  it.each(REFUSED_ENDPOINTS)('refuses %s', (endpoint) => {
    const result = validateCustomModelEndpoint(endpoint);
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.normalized).toBeUndefined();
  });

  it.each(ACCEPTED_ENDPOINTS)('accepts %s', (endpoint) => {
    expect(validateCustomModelEndpoint(endpoint)).toMatchObject({ valid: true });
  });

  it('keeps no credentials in what it hands back', () => {
    expect(validateCustomModelEndpoint('https://api.example.com/v1/').normalized).toBe(
      'https://api.example.com/v1',
    );
  });
});

describe('CustomModelsSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.customModels = [];
  });

  it('offers no endpoint preset that points at this machine', () => {
    render(<CustomModelsSettings />);
    expect(screen.getByText(/belong under Local Models/i)).toBeInTheDocument();
  });

  it.each([
    ['http://169.254.169.254', /must use https/i],
    ['https://169.254.169.254/v1', /private network/i],
    ['http://localhost:11434/v1', /must use https/i],
    ['https://localhost:11434/v1', /own machine or network/i],
  ])('refuses to save %s and says why', async (endpoint, message) => {
    const user = userEvent.setup();
    render(<CustomModelsSettings />);

    await user.click(screen.getByRole('button', { name: /add model/i }));
    await user.type(screen.getByLabelText(/display name/i), 'Team endpoint');
    await user.type(screen.getByLabelText(/base url/i), endpoint);
    await user.type(screen.getByLabelText(/model id/i), 'some-model');
    await user.click(screen.getByRole('button', { name: /^add model$/i }));

    await waitFor(() => {
      expect(screen.getByText(message)).toBeInTheDocument();
    });
    expect(store.addCustomModel).not.toHaveBeenCalled();
  });

  it('saves an https endpoint on a public host', async () => {
    const user = userEvent.setup();
    render(<CustomModelsSettings />);

    await user.click(screen.getByRole('button', { name: /add model/i }));
    await user.type(screen.getByLabelText(/display name/i), 'Team endpoint');
    await user.type(screen.getByLabelText(/base url/i), 'https://api.example.com/v1');
    await user.type(screen.getByLabelText(/model id/i), 'some-model');
    await user.click(screen.getByRole('button', { name: /^add model$/i }));

    await waitFor(() => {
      expect(store.addCustomModel).toHaveBeenCalledWith(
        expect.objectContaining({ baseUrl: 'https://api.example.com/v1' }),
      );
    });
  });
});
