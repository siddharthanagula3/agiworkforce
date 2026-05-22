/**
 * H43 — CustomModelsSettings tests
 *
 * Covers: render without crash, list display, add-model form validation,
 * delete model, and test-connection button interaction.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CustomModelsSettings } from '../CustomModelsSettings';
import type { CustomModelConfig } from '../../../types/customModel';

// ── Radix UI / jsdom compat polyfills ────────────────────────────────────────
if (typeof Element.prototype.hasPointerCapture === 'undefined') {
  Element.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
}
if (typeof Element.prototype.setPointerCapture === 'undefined') {
  Element.prototype.setPointerCapture = vi.fn();
}
if (typeof Element.prototype.releasePointerCapture === 'undefined') {
  Element.prototype.releasePointerCapture = vi.fn();
}

class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

// ── Store mock ────────────────────────────────────────────────────────────────

const mockAddCustomModel = vi.fn();
const mockUpdateCustomModel = vi.fn();
const mockRemoveCustomModel = vi.fn();
let mockCustomModels: CustomModelConfig[] = [];

vi.mock('../../../stores/settingsStore', () => ({
  useSettingsStore: vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      customModels: mockCustomModels,
      addCustomModel: mockAddCustomModel,
      updateCustomModel: mockUpdateCustomModel,
      removeCustomModel: mockRemoveCustomModel,
    }),
  ),
}));

// Mock fetch so test-connection does not hit the network
const mockFetch = vi.fn();
global.fetch = mockFetch;

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SAMPLE_MODEL: CustomModelConfig = {
  id: 'groq/llama-3.3-70b-versatile-abc123',
  displayName: 'Groq Llama 3.3 70B',
  provider: 'Groq',
  baseUrl: 'https://api.groq.com/openai/v1',
  modelId: 'llama-3.3-70b-versatile',
  apiKeyRef: 'stored',
  contextWindow: 32768,
  supportsStreaming: true,
  supportsTools: true,
  supportsVision: false,
  status: 'connected',
  lastVerified: '2026-02-20T12:00:00Z',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CustomModelsSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCustomModels = [];
    mockFetch.mockResolvedValue({ ok: true });
  });

  describe('Empty state', () => {
    it('renders without crashing when no models are configured', () => {
      render(<CustomModelsSettings />);
      expect(screen.getByText(/no custom models configured/i)).toBeInTheDocument();
    });

    it('shows the Add Model button', () => {
      render(<CustomModelsSettings />);
      expect(screen.getByRole('button', { name: /add model/i })).toBeInTheDocument();
    });

    it('shows the section heading', () => {
      render(<CustomModelsSettings />);
      expect(screen.getByText(/custom model endpoints/i)).toBeInTheDocument();
    });
  });

  describe('Model list', () => {
    beforeEach(() => {
      mockCustomModels = [SAMPLE_MODEL];
    });

    it('displays the model display name', () => {
      render(<CustomModelsSettings />);
      expect(screen.getByText('Groq Llama 3.3 70B')).toBeInTheDocument();
    });

    it('displays the provider badge', () => {
      render(<CustomModelsSettings />);
      expect(screen.getByText('Groq')).toBeInTheDocument();
    });

    it('displays connected status for a connected model', () => {
      render(<CustomModelsSettings />);
      expect(screen.getByText(/connected/i)).toBeInTheDocument();
    });

    it('shows edit and delete action buttons', () => {
      render(<CustomModelsSettings />);
      expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    });

    it('calls removeCustomModel when delete is confirmed', async () => {
      render(<CustomModelsSettings />);
      const deleteBtn = screen.getByRole('button', { name: /delete/i });
      await userEvent.click(deleteBtn);

      // The delete button opens a confirmation dialog; confirm it
      const confirmBtn = await screen.findByRole('button', { name: /^Delete$/i });
      await userEvent.click(confirmBtn);

      expect(mockRemoveCustomModel).toHaveBeenCalledWith(SAMPLE_MODEL.id);
    });
  });

  describe('Add model dialog', () => {
    it('opens the dialog when Add Model is clicked', async () => {
      render(<CustomModelsSettings />);
      await userEvent.click(screen.getByRole('button', { name: /add model/i }));
      await waitFor(() => {
        expect(screen.getByText(/add custom model/i)).toBeInTheDocument();
      });
    });

    it('shows required form fields in the dialog', async () => {
      render(<CustomModelsSettings />);
      await userEvent.click(screen.getByRole('button', { name: /add model/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/base url/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/model id/i)).toBeInTheDocument();
      });
    });

    it('shows a validation error when saving with empty display name', async () => {
      render(<CustomModelsSettings />);
      await userEvent.click(screen.getByRole('button', { name: /add model/i }));

      await waitFor(() => {
        expect(screen.getByText(/add custom model/i)).toBeInTheDocument();
      });

      // Click save without filling required fields
      await userEvent.click(screen.getByRole('button', { name: /add model$/i }));

      await waitFor(() => {
        expect(screen.getByText(/display name is required/i)).toBeInTheDocument();
      });
    });

    it('shows validation error when base URL is missing', async () => {
      render(<CustomModelsSettings />);
      await userEvent.click(screen.getByRole('button', { name: /add model/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
      });

      await userEvent.type(screen.getByLabelText(/display name/i), 'My Model');
      // Leave base URL empty and click save
      await userEvent.click(screen.getByRole('button', { name: /add model$/i }));

      await waitFor(() => {
        expect(screen.getByText(/base url is required/i)).toBeInTheDocument();
      });
    });

    it('calls addCustomModel when all required fields are filled and saved', async () => {
      render(<CustomModelsSettings />);
      await userEvent.click(screen.getByRole('button', { name: /add model/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/display name/i)).toBeInTheDocument();
      });

      await userEvent.type(screen.getByLabelText(/display name/i), 'Test Model');
      await userEvent.type(screen.getByLabelText(/base url/i), 'https://api.example.com/v1');
      await userEvent.type(screen.getByLabelText(/model id/i), 'test-model-1');

      await userEvent.click(screen.getByRole('button', { name: /add model$/i }));

      await waitFor(() => {
        expect(mockAddCustomModel).toHaveBeenCalledWith(
          expect.objectContaining({
            displayName: 'Test Model',
            baseUrl: 'https://api.example.com/v1',
            modelId: 'test-model-1',
          }),
        );
      });
    });

    it('closes dialog on Cancel click', async () => {
      render(<CustomModelsSettings />);
      await userEvent.click(screen.getByRole('button', { name: /add model/i }));

      await waitFor(() => {
        expect(screen.getByText(/add custom model/i)).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /cancel/i }));

      await waitFor(() => {
        expect(screen.queryByText(/add custom model/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Test Connection button', () => {
    it('shows Test Connection button in dialog', async () => {
      render(<CustomModelsSettings />);
      await userEvent.click(screen.getByRole('button', { name: /add model/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /test connection/i })).toBeInTheDocument();
      });
    });

    it('shows error when Test Connection clicked without base URL', async () => {
      render(<CustomModelsSettings />);
      await userEvent.click(screen.getByRole('button', { name: /add model/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /test connection/i })).toBeInTheDocument();
      });

      await userEvent.click(screen.getByRole('button', { name: /test connection/i }));

      await waitFor(() => {
        expect(screen.getByText(/base url is required/i)).toBeInTheDocument();
      });
    });
  });

  describe('Edit model dialog', () => {
    beforeEach(() => {
      mockCustomModels = [SAMPLE_MODEL];
    });

    it('opens edit dialog with model name pre-filled', async () => {
      render(<CustomModelsSettings />);
      await userEvent.click(screen.getByRole('button', { name: /edit/i }));

      await waitFor(() => {
        expect(screen.getByText(/edit custom model/i)).toBeInTheDocument();
      });

      const displayNameInput = screen.getByLabelText(/display name/i) as HTMLInputElement;
      expect(displayNameInput.value).toBe(SAMPLE_MODEL.displayName);
    });

    it('calls updateCustomModel when saving edits', async () => {
      render(<CustomModelsSettings />);
      await userEvent.click(screen.getByRole('button', { name: /edit/i }));

      await waitFor(() => {
        expect(screen.getByText(/edit custom model/i)).toBeInTheDocument();
      });

      // Click Save Changes
      await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(mockUpdateCustomModel).toHaveBeenCalledWith(
          SAMPLE_MODEL.id,
          expect.objectContaining({ id: SAMPLE_MODEL.id }),
        );
      });
    });
  });
});
