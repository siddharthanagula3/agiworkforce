/**
 * Chat Completion Handler Tests
 * Unit tests for the AI Chat Service that provides unified interface for AI providers
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_ANTHROPIC_COLLABORATION_MODEL,
  DEFAULT_GOOGLE_FAST_MODEL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_PERPLEXITY_MODEL,
} from '@shared/config/supported-models';
import {
  sendAIMessage,
  isProviderConfigured,
  getConfiguredProviders,
  type AIMessage,
  type AIProvider,
} from './chat-completion-handler';

// Mock the unified LLM service
vi.mock('@core/ai/llm/unified-language-model', () => ({
  unifiedLLMService: {
    sendMessage: vi.fn(),
  },
}));

// Mock user AI preferences
vi.mock('@core/ai/llm/user-ai-preferences', () => ({
  loadUserAIPreferences: vi.fn(),
}));

describe('Chat Completion Handler', () => {
  let mockUnifiedLLMService: { sendMessage: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.clearAllMocks();
    const { unifiedLLMService } = await import('@core/ai/llm/unified-language-model');
    mockUnifiedLLMService = unifiedLLMService as unknown as {
      sendMessage: ReturnType<typeof vi.fn>;
    };

    // Suppress console logs during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('sendAIMessage', () => {
    const mockMessages: AIMessage[] = [{ role: 'user', content: 'Hello, how are you?' }];

    it('should send message to OpenAI provider successfully', async () => {
      mockUnifiedLLMService.sendMessage.mockResolvedValueOnce({
        content: 'I am doing well, thank you!',
        usage: { promptTokens: 10, completionTokens: 15, totalTokens: 25 },
        model: 'gpt-5.4',
      });

      const result = await sendAIMessage('openai', mockMessages);

      expect(result).toBe('I am doing well, thank you!');
      expect(mockUnifiedLLMService.sendMessage).toHaveBeenCalledWith({
        provider: 'openai',
        messages: [{ role: 'user', content: 'Hello, how are you?' }],
        model: DEFAULT_OPENAI_MODEL,
        temperature: undefined,
        maxTokens: undefined,
        stream: false,
      });
    });

    it('should send message to Anthropic provider with custom model', async () => {
      mockUnifiedLLMService.sendMessage.mockResolvedValueOnce({
        content: 'Response from Claude',
        model: 'claude-haiku-4.5',
      });

      const result = await sendAIMessage('anthropic', mockMessages, 'claude-haiku-4.5');

      expect(result).toBe('Response from Claude');
      expect(mockUnifiedLLMService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'anthropic',
          model: 'claude-haiku-4.5',
        }),
      );
    });

    it('should send message to Google provider', async () => {
      mockUnifiedLLMService.sendMessage.mockResolvedValueOnce({
        content: 'Response from Gemini',
        model: DEFAULT_GOOGLE_FAST_MODEL,
      });

      const result = await sendAIMessage('google', mockMessages);

      expect(result).toBe('Response from Gemini');
      expect(mockUnifiedLLMService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'google',
          model: DEFAULT_GOOGLE_FAST_MODEL,
        }),
      );
    });

    it('should send message to Perplexity provider', async () => {
      mockUnifiedLLMService.sendMessage.mockResolvedValueOnce({
        content: 'Response from Perplexity',
        model: DEFAULT_PERPLEXITY_MODEL,
      });

      const result = await sendAIMessage('perplexity', mockMessages);

      expect(result).toBe('Response from Perplexity');
      expect(mockUnifiedLLMService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'perplexity',
          model: DEFAULT_PERPLEXITY_MODEL,
        }),
      );
    });

    it('should apply custom options correctly', async () => {
      mockUnifiedLLMService.sendMessage.mockResolvedValueOnce({
        content: 'Custom response',
      });

      await sendAIMessage('openai', mockMessages, 'gpt-5.4', {
        temperature: 0.5,
        maxTokens: 1000,
        stream: true,
      });

      expect(mockUnifiedLLMService.sendMessage).toHaveBeenCalledWith({
        provider: 'openai',
        messages: expect.any(Array),
        model: 'gpt-5.4',
        temperature: 0.5,
        maxTokens: 1000,
        stream: true,
      });
    });

    it('should handle messages with different roles', async () => {
      const messagesWithRoles: AIMessage[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is 2+2?' },
        { role: 'assistant', content: '2+2 equals 4.' },
        { role: 'user', content: 'Thanks!' },
      ];

      mockUnifiedLLMService.sendMessage.mockResolvedValueOnce({
        content: "You're welcome!",
      });

      await sendAIMessage('openai', messagesWithRoles);

      expect(mockUnifiedLLMService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'What is 2+2?' },
            { role: 'assistant', content: '2+2 equals 4.' },
            { role: 'user', content: 'Thanks!' },
          ],
        }),
      );
    });

    it('should throw error when LLM service fails', async () => {
      mockUnifiedLLMService.sendMessage.mockRejectedValueOnce(new Error('API rate limit exceeded'));

      await expect(sendAIMessage('openai', mockMessages)).rejects.toThrow(
        'API rate limit exceeded',
      );
    });

    it('should throw error with provider name when unknown error occurs', async () => {
      mockUnifiedLLMService.sendMessage.mockRejectedValueOnce('Unknown error');

      await expect(sendAIMessage('anthropic', mockMessages)).rejects.toThrow(
        'Failed to send message to anthropic',
      );
    });

    it('should filter out optional message properties', async () => {
      const messagesWithOptionalProps: AIMessage[] = [
        {
          id: 'msg-123',
          role: 'user',
          content: 'Hello',
          timestamp: '2024-01-01T00:00:00Z',
        },
      ];

      mockUnifiedLLMService.sendMessage.mockResolvedValueOnce({
        content: 'Hi there!',
      });

      await sendAIMessage('openai', messagesWithOptionalProps);

      expect(mockUnifiedLLMService.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      );
    });

    it('should use default model for each provider', async () => {
      mockUnifiedLLMService.sendMessage.mockResolvedValue({ content: 'OK' });

      // Test OpenAI default
      await sendAIMessage('openai', mockMessages);
      expect(mockUnifiedLLMService.sendMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({ model: DEFAULT_OPENAI_MODEL }),
      );

      // Test Anthropic default
      await sendAIMessage('anthropic', mockMessages);
      expect(mockUnifiedLLMService.sendMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({ model: DEFAULT_ANTHROPIC_COLLABORATION_MODEL }),
      );

      // Test Google default
      await sendAIMessage('google', mockMessages);
      expect(mockUnifiedLLMService.sendMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({ model: DEFAULT_GOOGLE_FAST_MODEL }),
      );

      // Test Perplexity default
      await sendAIMessage('perplexity', mockMessages);
      expect(mockUnifiedLLMService.sendMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({ model: DEFAULT_PERPLEXITY_MODEL }),
      );
    });
  });

  describe('isProviderConfigured', () => {
    it('should return true for all providers (proxy-based)', () => {
      const providers: AIProvider[] = ['openai', 'anthropic', 'google', 'perplexity'];

      providers.forEach((provider) => {
        expect(isProviderConfigured(provider)).toBe(true);
      });
    });
  });

  describe('getConfiguredProviders', () => {
    it('should return all available providers', () => {
      const providers = getConfiguredProviders();

      expect(providers).toContain('openai');
      expect(providers).toContain('anthropic');
      expect(providers).toContain('google');
      expect(providers).toContain('perplexity');
      expect(providers.length).toBe(4);
    });
  });
});
