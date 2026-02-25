/**
 * LLM Provider Factory Tests
 *
 * Tests the real LLMProviderFactory methods using mocked provider classes.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// server-only must be mocked before any other imports that trigger it
vi.mock('server-only', () => ({}));

// Mock logger before importing factory
vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock prompt cache helper
vi.mock('@/lib/prompt-cache-helper', () => ({
  shouldEnablePromptCache: vi.fn(() => false),
}));

// Mock getOptionalEnv
const mockEnvValues: Record<string, string | undefined> = {};
vi.mock('@/utils/env', () => ({
  getOptionalEnv: vi.fn((key: string) => mockEnvValues[key]),
}));

// Mock all provider classes
const mockOpenAIProvider = {
  sendRequest: vi.fn(),
  streamRequest: vi.fn(),
};

const mockAnthropicProvider = {
  sendRequest: vi.fn(),
  streamRequest: vi.fn(),
};

const mockGoogleProvider = {
  sendRequest: vi.fn(),
  streamRequest: vi.fn(),
};

const mockXAIProvider = {
  sendRequest: vi.fn(),
  streamRequest: vi.fn(),
};

const mockQwenProvider = {
  sendRequest: vi.fn(),
  streamRequest: vi.fn(),
};

const mockMoonshotProvider = {
  sendRequest: vi.fn(),
  streamRequest: vi.fn(),
};

const mockDeepSeekProvider = {
  sendRequest: vi.fn(),
  streamRequest: vi.fn(),
};

const mockPerplexityProvider = {
  sendRequest: vi.fn(),
  streamRequest: vi.fn(),
};

const mockZhipuProvider = {
  sendRequest: vi.fn(),
  streamRequest: vi.fn(),
};

vi.mock('@/lib/llm-providers/openai', () => ({
  OpenAIProvider: vi.fn().mockImplementation(function () {
    return mockOpenAIProvider;
  }),
}));

vi.mock('@/lib/llm-providers/anthropic', () => ({
  AnthropicProvider: vi.fn().mockImplementation(function () {
    return mockAnthropicProvider;
  }),
}));

vi.mock('@/lib/llm-providers/google', () => ({
  GoogleProvider: vi.fn().mockImplementation(function () {
    return mockGoogleProvider;
  }),
}));

vi.mock('@/lib/llm-providers/xai', () => ({
  XAIProvider: vi.fn().mockImplementation(function () {
    return mockXAIProvider;
  }),
}));

vi.mock('@/lib/llm-providers/qwen', () => ({
  QwenProvider: vi.fn().mockImplementation(function () {
    return mockQwenProvider;
  }),
}));

vi.mock('@/lib/llm-providers/moonshot', () => ({
  MoonshotProvider: vi.fn().mockImplementation(function () {
    return mockMoonshotProvider;
  }),
}));

vi.mock('@/lib/llm-providers/deepseek', () => ({
  DeepSeekProvider: vi.fn().mockImplementation(function () {
    return mockDeepSeekProvider;
  }),
}));

vi.mock('@/lib/llm-providers/perplexity', () => ({
  PerplexityProvider: vi.fn().mockImplementation(function () {
    return mockPerplexityProvider;
  }),
}));

vi.mock('@/lib/llm-providers/zhipu', () => ({
  ZhipuProvider: vi.fn().mockImplementation(function () {
    return mockZhipuProvider;
  }),
}));

import { LLMProviderFactory } from '@/lib/llm-providers/factory';
import { AnthropicProvider } from '@/lib/llm-providers/anthropic';
import { OpenAIProvider } from '@/lib/llm-providers/openai';
import { GoogleProvider } from '@/lib/llm-providers/google';

describe('LLMProviderFactory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockEnvValues).forEach((key) => delete mockEnvValues[key]);
  });

  // =========================================================================
  // createProvider
  // =========================================================================
  describe('createProvider', () => {
    it('returns an AnthropicProvider instance when apiKey is passed', () => {
      const provider = LLMProviderFactory.createProvider('anthropic', 'sk-ant-test');
      expect(provider).toBe(mockAnthropicProvider);
      expect(AnthropicProvider).toHaveBeenCalledWith('sk-ant-test', undefined);
    });

    it('returns an OpenAIProvider instance when apiKey is passed', () => {
      const provider = LLMProviderFactory.createProvider('openai', 'sk-openai-test');
      expect(provider).toBe(mockOpenAIProvider);
      expect(OpenAIProvider).toHaveBeenCalledWith('sk-openai-test', undefined);
    });

    it('returns a GoogleProvider instance when apiKey is passed', () => {
      const provider = LLMProviderFactory.createProvider('google', 'google-api-key');
      expect(provider).toBe(mockGoogleProvider);
      expect(GoogleProvider).toHaveBeenCalledWith('google-api-key', undefined);
    });

    it('returns null for an unknown provider', () => {
      const provider = LLMProviderFactory.createProvider('unknown-xyz', 'some-key');
      expect(provider).toBeNull();
    });

    it('returns null when no API key is configured', () => {
      // No apiKey argument and no env var set
      const provider = LLMProviderFactory.createProvider('anthropic');
      expect(provider).toBeNull();
    });

    it('picks up API key from environment via getOptionalEnv', () => {
      mockEnvValues['ANTHROPIC_API_KEY'] = 'env-anthropic-key';
      const provider = LLMProviderFactory.createProvider('anthropic');
      expect(provider).toBe(mockAnthropicProvider);
    });

    it('is case-insensitive for provider names', () => {
      const provider = LLMProviderFactory.createProvider('ANTHROPIC', 'sk-ant-test');
      expect(provider).toBe(mockAnthropicProvider);
    });
  });

  // =========================================================================
  // getProviderFromModel
  // =========================================================================
  describe('getProviderFromModel', () => {
    const testCases = [
      // OpenAI
      { model: 'gpt-4', expected: 'openai' },
      { model: 'gpt-4-turbo', expected: 'openai' },
      { model: 'gpt-3.5-turbo', expected: 'openai' },
      { model: 'GPT-4', expected: 'openai' },

      // Anthropic
      { model: 'claude-3-5-sonnet-20241022', expected: 'anthropic' },
      { model: 'claude-3-opus', expected: 'anthropic' },
      { model: 'claude-3-sonnet', expected: 'anthropic' },
      { model: 'claude-2.1', expected: 'anthropic' },
      { model: 'CLAUDE-3-opus', expected: 'anthropic' },

      // Google
      { model: 'gemini-pro', expected: 'google' },
      { model: 'gemini-1.5-pro', expected: 'google' },
      { model: 'GEMINI-PRO', expected: 'google' },

      // xAI
      { model: 'grok-1', expected: 'xai' },
      { model: 'grok-4', expected: 'xai' },

      // Qwen
      { model: 'qwen-max', expected: 'qwen' },
      { model: 'qwen-turbo', expected: 'qwen' },

      // Moonshot
      { model: 'kimi-k2.5', expected: 'moonshot' },
      { model: 'kimi-chat', expected: 'moonshot' },

      // DeepSeek
      { model: 'deepseek-chat', expected: 'deepseek' },
      { model: 'deepseek-r1', expected: 'deepseek' },

      // Perplexity
      { model: 'sonar', expected: 'perplexity' },
      { model: 'sonar-pro', expected: 'perplexity' },

      // Unknown defaults to openai
      { model: 'unknown-model', expected: 'openai' },
      { model: '', expected: 'openai' },
    ];

    it.each(testCases)('routes $model to $expected', ({ model, expected }) => {
      expect(LLMProviderFactory.getProviderFromModel(model)).toBe(expected);
    });
  });

  // =========================================================================
  // mapModelIdToApiId
  // =========================================================================
  describe('mapModelIdToApiId', () => {
    it('maps claude-opus-4.6 to claude-opus-4-6-20251101', () => {
      expect(LLMProviderFactory.mapModelIdToApiId('claude-opus-4.6')).toBe(
        'claude-opus-4-6-20251101',
      );
    });

    it('maps claude-opus-4-6 (hyphen alias) to claude-opus-4-6-20251101', () => {
      expect(LLMProviderFactory.mapModelIdToApiId('claude-opus-4-6')).toBe(
        'claude-opus-4-6-20251101',
      );
    });

    it('maps claude-sonnet-4.5 to claude-sonnet-4-5-20250929', () => {
      expect(LLMProviderFactory.mapModelIdToApiId('claude-sonnet-4.5')).toBe(
        'claude-sonnet-4-5-20250929',
      );
    });

    it('maps claude-haiku-4.5 to claude-haiku-4-5-20251001', () => {
      expect(LLMProviderFactory.mapModelIdToApiId('claude-haiku-4.5')).toBe(
        'claude-haiku-4-5-20251001',
      );
    });

    it('maps gpt-5-pro to gpt-5-pro-2025-10-06', () => {
      expect(LLMProviderFactory.mapModelIdToApiId('gpt-5-pro')).toBe('gpt-5-pro-2025-10-06');
    });

    it('maps o3 to o3-2025-04-16', () => {
      expect(LLMProviderFactory.mapModelIdToApiId('o3')).toBe('o3-2025-04-16');
    });

    it('returns the original model ID when no mapping exists', () => {
      expect(LLMProviderFactory.mapModelIdToApiId('some-custom-model')).toBe('some-custom-model');
    });

    it('is case-insensitive for model ID lookup', () => {
      expect(LLMProviderFactory.mapModelIdToApiId('CLAUDE-OPUS-4.6')).toBe(
        'claude-opus-4-6-20251101',
      );
    });
  });

  // =========================================================================
  // sendRequest
  // =========================================================================
  describe('sendRequest', () => {
    it('calls provider.sendRequest and returns its response', async () => {
      const fakeResponse = {
        content: 'Hello',
        model: 'claude-opus-4-6-20251101',
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
      };
      mockAnthropicProvider.sendRequest.mockResolvedValueOnce(fakeResponse);

      const result = await LLMProviderFactory.sendRequest(
        'anthropic',
        {
          model: 'claude-opus-4.6',
          messages: [{ role: 'user', content: 'Hello' }],
        },
        'sk-ant-test',
      );

      expect(result).toEqual(fakeResponse);
      expect(mockAnthropicProvider.sendRequest).toHaveBeenCalled();
    });

    it('throws when provider is not configured', async () => {
      await expect(
        LLMProviderFactory.sendRequest('anthropic', {
          model: 'claude-opus-4.6',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      ).rejects.toThrow(/not configured/i);
    });

    it('maps internal model ID to API model ID before calling provider', async () => {
      mockAnthropicProvider.sendRequest.mockResolvedValueOnce({
        content: '',
        model: 'claude-opus-4-6-20251101',
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      });

      await LLMProviderFactory.sendRequest(
        'anthropic',
        {
          model: 'claude-opus-4.6',
          messages: [{ role: 'user', content: 'Hi' }],
        },
        'sk-ant-test',
      );

      const calledRequest = mockAnthropicProvider.sendRequest.mock.calls[0]?.[0];
      expect(calledRequest?.model).toBe('claude-opus-4-6-20251101');
    });
  });

  // =========================================================================
  // streamRequest
  // =========================================================================
  describe('streamRequest', () => {
    it('calls provider.streamRequest and returns a stream', async () => {
      const fakeStream = new ReadableStream();
      mockAnthropicProvider.streamRequest.mockResolvedValueOnce(fakeStream);

      const result = await LLMProviderFactory.streamRequest(
        'anthropic',
        {
          model: 'claude-opus-4.6',
          messages: [{ role: 'user', content: 'Hi' }],
        },
        'sk-ant-test',
      );

      expect(result).toBe(fakeStream);
    });

    it('throws when provider is not configured for streaming', async () => {
      await expect(
        LLMProviderFactory.streamRequest('anthropic', {
          model: 'claude-opus-4.6',
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      ).rejects.toThrow(/not configured/i);
    });
  });
});
