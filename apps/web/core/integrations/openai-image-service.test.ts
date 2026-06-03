/**
 * GPT Image Service Tests
 * Unit tests for OpenAI GPT Image generation integration
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  OpenAIImageService,
  openAIImageService,
  type OpenAIImageGenerationRequest,
} from './openai-image-service';

// Mock auth token (replaces former cloudDb.auth.getSession usage)
vi.mock('@shared/lib/get-auth-token', () => ({
  getAuthToken: vi.fn(),
}));

import { getAuthToken } from '@shared/lib/get-auth-token';

describe('GPT Image Service', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  const mockGetAuthToken = vi.mocked(getAuthToken);

  beforeEach(async () => {
    vi.clearAllMocks();

    // Default: authenticated
    mockGetAuthToken.mockResolvedValue('test-token');

    // Setup fetch mock
    mockFetch = vi.fn();
    global.fetch = mockFetch as unknown as typeof fetch;

    // Suppress console logs during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = OpenAIImageService.getInstance();
      const instance2 = OpenAIImageService.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should export singleton as openAIImageService', () => {
      expect(openAIImageService).toBeInstanceOf(OpenAIImageService);
    });
  });

  describe('generateImage', () => {
    const mockRequest: OpenAIImageGenerationRequest = {
      prompt: 'A beautiful sunset over mountains',
      size: '1024x1024',
      quality: 'standard',
      style: 'vivid',
      n: 1,
      model: 'gpt-image-2',
    };

    it('should generate image successfully', async () => {
      const mockResponse = {
        created: Math.floor(Date.now() / 1000),
        data: [
          {
            url: 'https://images.openai.com/image123.png',
            revised_prompt: 'A stunning sunset with vibrant colors',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const results = await openAIImageService.generateImage(mockRequest);

      expect(results.length).toBe(1);
      expect(results![0]!.url!).toBe('https://images.openai.com/image123.png');
      expect(results![0]!.prompt!).toBe(mockRequest.prompt);
      expect(results![0]!.revisedPrompt!).toBe('A stunning sunset with vibrant colors');
      expect(results![0]!.size!).toBe('1024x1024');
      expect(results![0]!.quality!).toBe('medium');
      expect(results![0]!.style!).toBe('vivid');
      expect(results![0]!.model!).toBe('gpt-image-2');
      expect(results![0]!.createdAt!).toBeInstanceOf(Date);
    });

    it('should throw error for empty prompt', async () => {
      await expect(openAIImageService.generateImage({ prompt: '' })).rejects.toThrow(
        new Error('Image generation prompt is required'), // AUDIT-FIX: vitest 4.x string arg broken
      );

      await expect(openAIImageService.generateImage({ prompt: '   ' })).rejects.toThrow(
        new Error('Image generation prompt is required'), // AUDIT-FIX: vitest 4.x
      );
    });

    it('should pass multi-image requests through to the proxy', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            created: Date.now() / 1000,
            data: [{ url: 'https://example.com/image.png' }],
          }),
      });

      await openAIImageService.generateImage({
        prompt: 'Test',
        model: 'gpt-image-2',
        n: 2,
      });

      const requestBody = JSON.parse(mockFetch!.mock.calls[0]![1]!.body!);
      expect(requestBody.n).toBe(2);
    });

    it('should throw error when not authenticated', async () => {
      mockGetAuthToken.mockResolvedValueOnce(null);

      await expect(openAIImageService.generateImage({ prompt: 'Test' })).rejects.toMatchObject({
        message: expect.stringContaining('User not authenticated'), // AUDIT-FIX: vitest 4.x; actual msg is longer
      });
    });

    it('should throw error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () =>
          Promise.resolve({
            error: { message: 'Content policy violation' },
          }),
      });

      await expect(openAIImageService.generateImage({ prompt: 'Test' })).rejects.toThrow(
        new Error('Content policy violation'), // AUDIT-FIX: vitest 4.x
      );
    });

    it('should handle API error without message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.resolve({}),
      });

      await expect(openAIImageService.generateImage({ prompt: 'Test' })).rejects.toThrow(
        new Error('API error: 500 Internal Server Error'), // AUDIT-FIX: vitest 4.x
      );
    });

    it('should use default values when not provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            created: Date.now() / 1000,
            data: [{ url: 'https://example.com/image.png' }],
          }),
      });

      await openAIImageService.generateImage({ prompt: 'Simple test' });

      const requestBody = JSON.parse(mockFetch!.mock.calls[0]![1]!.body!);
      expect(requestBody.size).toBe('1024x1024');
      expect(requestBody.quality).toBe('medium');
      expect(requestBody.style).toBeUndefined();
      expect(requestBody.n).toBe(1);
      expect(requestBody.model).toBe('gpt-image-2');
    });

    it('should not include style for GPT Image 2', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            created: Date.now() / 1000,
            data: [{ url: 'https://example.com/image.png' }],
          }),
      });

      await openAIImageService.generateImage({
        prompt: 'Test',
        model: 'gpt-image-2',
      });

      const requestBody = JSON.parse(mockFetch!.mock.calls[0]![1]!.body!);
      expect(requestBody.style).toBeUndefined();
    });

    it('should trim prompt before sending', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            created: Date.now() / 1000,
            data: [{ url: 'https://example.com/image.png' }],
          }),
      });

      await openAIImageService.generateImage({ prompt: '  Test prompt  ' });

      const requestBody = JSON.parse(mockFetch!.mock.calls[0]![1]!.body!);
      expect(requestBody.prompt).toBe('Test prompt');
    });

    it('should send correct request format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            created: Date.now() / 1000,
            data: [{ url: 'https://example.com/image.png' }],
          }),
      });

      await openAIImageService.generateImage(mockRequest);

      expect(mockFetch).toHaveBeenCalledWith(
        '/.netlify/functions/media-proxies/openai-image-proxy',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-token',
          },
        }),
      );
    });

    it('should generate unique IDs for each image', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            created: timestamp,
            data: [
              { url: 'https://example.com/image1.png' },
              { url: 'https://example.com/image2.png' },
            ],
          }),
      });

      // Use GPT Image 2 which supports multiple images
      const results = await openAIImageService.generateImage({
        prompt: 'Test',
        model: 'gpt-image-2',
        n: 2,
      });

      expect(results![0]!.id!).toBe(`${timestamp}-0`);
      expect(results![1]!.id!).toBe(`${timestamp}-1`);
    });
  });

  describe('estimateCost', () => {
    describe('GPT Image 2 pricing', () => {
      it('should calculate standard 1024x1024 cost', () => {
        const cost = openAIImageService.estimateCost({
          prompt: 'Test',
          model: 'gpt-image-2',
          quality: 'standard',
          size: '1024x1024',
        });

        expect(cost).toBe(0.053);
      });

      it('should calculate standard 1024x1792 cost', () => {
        const cost = openAIImageService.estimateCost({
          prompt: 'Test',
          model: 'gpt-image-2',
          quality: 'standard',
          size: '1024x1792',
        });

        expect(cost).toBe(0.08);
      });

      it('should calculate standard 1792x1024 cost', () => {
        const cost = openAIImageService.estimateCost({
          prompt: 'Test',
          model: 'gpt-image-2',
          quality: 'standard',
          size: '1792x1024',
        });

        expect(cost).toBe(0.08);
      });

      it('should calculate HD 1024x1024 cost', () => {
        const cost = openAIImageService.estimateCost({
          prompt: 'Test',
          model: 'gpt-image-2',
          quality: 'hd',
          size: '1024x1024',
        });

        expect(cost).toBe(0.211);
      });

      it('should calculate HD 1024x1792 cost', () => {
        const cost = openAIImageService.estimateCost({
          prompt: 'Test',
          model: 'gpt-image-2',
          quality: 'hd',
          size: '1024x1792',
        });

        expect(cost).toBe(0.317);
      });

      it('should calculate HD 1792x1024 cost', () => {
        const cost = openAIImageService.estimateCost({
          prompt: 'Test',
          model: 'gpt-image-2',
          quality: 'hd',
          size: '1792x1024',
        });

        expect(cost).toBe(0.317);
      });
    });

    describe('legacy size normalization', () => {
      it('should calculate 1024x1024 cost', () => {
        const cost = openAIImageService.estimateCost({
          prompt: 'Test',
          model: 'gpt-image-2',
          size: '1024x1024',
        });

        expect(cost).toBe(0.053);
      });

      it('should calculate 512x512 cost', () => {
        const cost = openAIImageService.estimateCost({
          prompt: 'Test',
          model: 'gpt-image-2',
          size: '512x512' as '1024x1024',
        });

        expect(cost).toBe(0.053);
      });

      it('should calculate 256x256 cost', () => {
        const cost = openAIImageService.estimateCost({
          prompt: 'Test',
          model: 'gpt-image-2',
          size: '256x256' as '1024x1024',
        });

        expect(cost).toBe(0.053);
      });
    });

    it('should use default values', () => {
      const cost = openAIImageService.estimateCost({ prompt: 'Test' });

      // Default: gpt-image-2, standard/medium, 1024x1024
      expect(cost).toBe(0.053);
    });

    it('should return fallback cost for unknown size', () => {
      const cost = openAIImageService.estimateCost({
        prompt: 'Test',
        model: 'gpt-image-2',
        size: 'unknown' as '1024x1024',
      });

      expect(cost).toBe(0.053);
    });
  });
});
