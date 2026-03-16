/**
 * Tests for QuickModelSelector (web)
 *
 * Covers: provider grouping, search/filter, thinking budget, tier gating,
 * auto mode selection, and context window / pricing display.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QuickModelSelector } from './QuickModelSelector';

// ---- Mocks ----

// Mock the model store so tests control selectedModelId / thinkingBudget
const mockSetSelectedModelId = vi.fn();
const mockSetThinkingBudget = vi.fn();

const DEFAULT_MODEL_STATE = {
  selectedModelId: 'auto-economy',
  thinkingEnabled: false,
  thinkingBudget: 0,
  setSelectedModelId: mockSetSelectedModelId,
  setThinkingBudget: mockSetThinkingBudget,
};

let modelStoreState = { ...DEFAULT_MODEL_STATE };

vi.mock('@shared/stores/model-store', () => ({
  useModelStore: () => modelStoreState,
}));

// Mock user profile — default to free plan
let userPlan: string | null = 'free';
vi.mock('@shared/stores/user-profile-store', () => ({
  useUserProfileStore: (selector: (s: any) => any) =>
    selector({ user: userPlan ? { plan: userPlan } : null }),
}));

// Mock LLM constants — keep real implementation but control a small subset
vi.mock('@/constants/llm', async () => {
  const actual = await vi.importActual<typeof import('@/constants/llm')>('@/constants/llm');
  return {
    ...actual,
    // Use a small catalog for test speed / determinism
    getAllModels: () => [
      {
        id: 'claude-sonnet-4.6',
        name: 'Claude Sonnet 4.6',
        provider: 'anthropic',
        modelType: 'chat',
        contextWindow: 200_000,
        inputCost: 3,
        outputCost: 15,
        qualityTier: 'best',
        bestFor: ['coding'],
        capabilities: { tools: true, vision: true, thinking: true, search: false },
      },
      {
        id: 'claude-haiku-4.5',
        name: 'Claude Haiku 4.5',
        provider: 'anthropic',
        modelType: 'chat',
        contextWindow: 200_000,
        inputCost: 1,
        outputCost: 5,
        qualityTier: 'fast',
        bestFor: ['general'],
        capabilities: { tools: true, vision: false, thinking: false, search: false },
      },
      {
        id: 'gpt-5.2',
        name: 'GPT-5.2',
        provider: 'openai',
        modelType: 'chat',
        contextWindow: 400_000,
        inputCost: 1.75,
        outputCost: 14,
        qualityTier: 'best',
        bestFor: ['coding'],
        capabilities: { tools: true, vision: true, thinking: false, search: false },
      },
      {
        id: 'gemini-3.1-pro-preview',
        name: 'Gemini 3.1 Pro',
        provider: 'google',
        modelType: 'chat',
        contextWindow: 2_000_000,
        inputCost: 2,
        outputCost: 12,
        qualityTier: 'best',
        bestFor: ['long-context'],
        capabilities: { tools: true, vision: true, thinking: true, search: false },
      },
    ],
    isModelAllowedForTier: (modelId: string, tier: string) => {
      const econModels = ['claude-haiku-4.5'];
      const proModels = ['claude-sonnet-4.6', 'gemini-3.1-pro-preview'];
      if (tier === 'free' || tier === 'hobby') return econModels.includes(modelId);
      if (tier === 'pro') return [...econModels, ...proModels].includes(modelId);
      if (tier === 'max' || tier === 'enterprise')
        return [...econModels, ...proModels, 'gpt-5.2'].includes(modelId);
      return false;
    },
    getAllowedAutoModesForTier: (tier: string | null | undefined) => {
      if (tier === 'max' || tier === 'enterprise')
        return ['auto-economy', 'auto-balanced', 'auto-premium'];
      if (tier === 'pro') return ['auto-economy', 'auto-balanced'];
      return ['auto-economy'];
    },
    PROVIDERS_IN_ORDER: ['managed_cloud', 'anthropic', 'openai', 'google'],
    PROVIDER_LABELS: {
      managed_cloud: 'Managed Cloud',
      anthropic: 'Anthropic',
      openai: 'OpenAI',
      google: 'Google',
    },
    getModelMetadata: (id: string) => {
      const map: Record<string, any> = {
        'claude-sonnet-4.6': {
          capabilities: { thinking: true },
          name: 'Claude Sonnet 4.6',
        },
        'claude-haiku-4.5': {
          capabilities: { thinking: false },
          name: 'Claude Haiku 4.5',
        },
        'gpt-5.2': { capabilities: { thinking: false }, name: 'GPT-5.2' },
      };
      return map[id] ?? null;
    },
  };
});

// ---- Helpers ----

function renderSelector(props: Partial<Parameters<typeof QuickModelSelector>[0]> = {}) {
  return render(<QuickModelSelector {...props} />);
}

// ---- Tests ----

describe('QuickModelSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    modelStoreState = { ...DEFAULT_MODEL_STATE };
    userPlan = 'free';
  });

  describe('rendering', () => {
    it('renders search input', () => {
      renderSelector();
      expect(screen.getByPlaceholderText('Search models...')).toBeDefined();
    });

    it('renders "Models" heading', () => {
      renderSelector();
      expect(screen.getByText('Models')).toBeDefined();
    });

    it('renders Auto Selection section when not searching', () => {
      renderSelector();
      expect(screen.getByText('Auto Selection')).toBeDefined();
    });
  });

  describe('auto modes', () => {
    it('shows only auto-economy for free tier', () => {
      userPlan = 'free';
      renderSelector();
      expect(screen.getByText('Auto (Economy)')).toBeDefined();
      expect(screen.queryByText('Auto (Balanced)')).toBeNull();
      expect(screen.queryByText('Auto (Premium)')).toBeNull();
    });

    it('shows economy and balanced for pro tier', () => {
      userPlan = 'pro';
      renderSelector();
      expect(screen.getByText('Auto (Economy)')).toBeDefined();
      expect(screen.getByText('Auto (Balanced)')).toBeDefined();
      expect(screen.queryByText('Auto (Premium)')).toBeNull();
    });

    it('shows all three auto modes for max tier', () => {
      userPlan = 'max';
      renderSelector();
      expect(screen.getByText('Auto (Economy)')).toBeDefined();
      expect(screen.getByText('Auto (Balanced)')).toBeDefined();
      expect(screen.getByText('Auto (Premium)')).toBeDefined();
    });

    it('shows auto mode active hint when auto mode is selected', () => {
      modelStoreState = { ...DEFAULT_MODEL_STATE, selectedModelId: 'auto-economy' };
      renderSelector();
      expect(screen.getByText('Best model selected automatically for each request')).toBeDefined();
    });

    it('hides auto mode hint when a specific model is selected', () => {
      modelStoreState = { ...DEFAULT_MODEL_STATE, selectedModelId: 'claude-haiku-4.5' };
      renderSelector();
      expect(screen.queryByText('Best model selected automatically for each request')).toBeNull();
    });

    it('calls setSelectedModelId and onClose when auto mode is selected', () => {
      const onClose = vi.fn();
      renderSelector({ onClose });
      fireEvent.click(screen.getByText('Auto (Economy)'));
      expect(mockSetSelectedModelId).toHaveBeenCalledWith('auto-economy');
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('provider grouping', () => {
    it('shows anthropic group heading', () => {
      userPlan = 'free';
      renderSelector();
      expect(screen.getByText('Anthropic')).toBeDefined();
    });

    it('shows claude-haiku (allowed for free tier)', () => {
      userPlan = 'free';
      renderSelector();
      expect(screen.getByText('Claude Haiku 4.5')).toBeDefined();
    });

    it('shows claude-sonnet as locked for free tier', () => {
      userPlan = 'free';
      renderSelector();
      // Model appears but with lock indicator
      expect(screen.getByText('Claude Sonnet 4.6')).toBeDefined();
      // The button should be disabled
      const btn = screen.getByRole('button', { name: 'Claude Sonnet 4.6' });
      expect(btn).toHaveProperty('disabled', true);
    });

    it('shows claude-sonnet as unlocked for pro tier', () => {
      userPlan = 'pro';
      renderSelector();
      const btn = screen.getByRole('button', { name: 'Claude Sonnet 4.6' });
      expect(btn).toHaveProperty('disabled', false);
    });

    it('calls setSelectedModelId when an unlocked model is clicked', () => {
      userPlan = 'free';
      const onClose = vi.fn();
      renderSelector({ onClose });
      fireEvent.click(screen.getByRole('button', { name: 'Claude Haiku 4.5' }));
      expect(mockSetSelectedModelId).toHaveBeenCalledWith('claude-haiku-4.5');
      expect(onClose).toHaveBeenCalled();
    });

    it('does not call setSelectedModelId when a locked model is clicked', () => {
      userPlan = 'free';
      renderSelector();
      fireEvent.click(screen.getByRole('button', { name: 'Claude Sonnet 4.6' }));
      expect(mockSetSelectedModelId).not.toHaveBeenCalled();
    });
  });

  describe('search/filter', () => {
    it('hides Auto Selection section when searching', () => {
      renderSelector();
      fireEvent.change(screen.getByPlaceholderText('Search models...'), {
        target: { value: 'haiku' },
      });
      expect(screen.queryByText('Auto Selection')).toBeNull();
    });

    it('shows only matching models when search query is entered', () => {
      userPlan = 'pro';
      renderSelector();
      fireEvent.change(screen.getByPlaceholderText('Search models...'), {
        target: { value: 'haiku' },
      });
      expect(screen.getByText('Claude Haiku 4.5')).toBeDefined();
      expect(screen.queryByText('Claude Sonnet 4.6')).toBeNull();
    });

    it('shows no-results state when nothing matches', () => {
      renderSelector();
      fireEvent.change(screen.getByPlaceholderText('Search models...'), {
        target: { value: 'xxxxxxxxxnotamodel' },
      });
      expect(screen.getByText(/No models found/)).toBeDefined();
    });

    it('clears search when X button is clicked', () => {
      renderSelector();
      const input = screen.getByPlaceholderText('Search models...');
      fireEvent.change(input, { target: { value: 'haiku' } });
      expect(screen.getByLabelText('Clear search')).toBeDefined();
      fireEvent.click(screen.getByLabelText('Clear search'));
      expect((input as HTMLInputElement).value).toBe('');
    });
  });

  describe('context window and pricing', () => {
    it('shows formatted context window for unlocked models', () => {
      userPlan = 'free';
      renderSelector();
      // Claude Haiku 4.5 has 200K ctx window and is unlocked for free
      expect(screen.getByText('200K ctx')).toBeDefined();
    });

    it('shows pricing for unlocked models', () => {
      userPlan = 'free';
      renderSelector();
      // Claude Haiku: $1/$5 per 1M
      expect(screen.getByText('$1/$5')).toBeDefined();
    });
  });

  describe('thinking budget', () => {
    it('renders thinking budget options', () => {
      renderSelector();
      expect(screen.getByLabelText('Set thinking budget to Off')).toBeDefined();
      expect(screen.getByLabelText('Set thinking budget to 8K')).toBeDefined();
    });

    it('thinking buttons are disabled when selected model does not support thinking', () => {
      modelStoreState = { ...DEFAULT_MODEL_STATE, selectedModelId: 'claude-haiku-4.5' };
      renderSelector();
      const offBtn = screen.getByLabelText('Set thinking budget to Off');
      expect(offBtn).toHaveProperty('disabled', true);
    });

    it('thinking buttons are enabled when selected model supports thinking', () => {
      modelStoreState = { ...DEFAULT_MODEL_STATE, selectedModelId: 'claude-sonnet-4.6' };
      renderSelector();
      const btn8k = screen.getByLabelText('Set thinking budget to 8K');
      expect(btn8k).toHaveProperty('disabled', false);
    });

    it('calls setThinkingBudget when budget option is clicked', () => {
      modelStoreState = { ...DEFAULT_MODEL_STATE, selectedModelId: 'claude-sonnet-4.6' };
      renderSelector();
      fireEvent.click(screen.getByLabelText('Set thinking budget to 8K'));
      expect(mockSetThinkingBudget).toHaveBeenCalledWith(8192);
    });

    it('does not call setThinkingBudget when model lacks thinking support', () => {
      modelStoreState = { ...DEFAULT_MODEL_STATE, selectedModelId: 'claude-haiku-4.5' };
      renderSelector();
      fireEvent.click(screen.getByLabelText('Set thinking budget to 8K'));
      expect(mockSetThinkingBudget).not.toHaveBeenCalled();
    });

    it('highlights the currently active budget option', () => {
      modelStoreState = {
        ...DEFAULT_MODEL_STATE,
        selectedModelId: 'claude-sonnet-4.6',
        thinkingEnabled: true,
        thinkingBudget: 4096,
      };
      renderSelector();
      const btn4k = screen.getByLabelText('Set thinking budget to 4K');
      expect(btn4k.className).toContain('amber');
    });
  });

  describe('onClose callback', () => {
    it('calls onClose after selecting a model', () => {
      userPlan = 'free';
      const onClose = vi.fn();
      renderSelector({ onClose });
      fireEvent.click(screen.getByRole('button', { name: 'Claude Haiku 4.5' }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
