/**
 * Shared Mock Fixtures
 * Centralized mocking for external APIs (OpenAI, Anthropic, Stripe, etc.)
 * All surfaces should import from this file
 */

import { vi } from 'vitest';

/**
 * Mock OpenAI client for all surfaces
 * Mocks both completions and image generation
 */
export function mockOpenAI() {
  return vi.mock('@openai/sdk', () => ({
    default: class OpenAI {
      chat = {
        completions: {
          create: vi.fn().mockResolvedValue({
            id: 'chatcmpl-test-123',
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: 'gpt-4o',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: 'This is a mocked response from OpenAI',
                },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 20,
              total_tokens: 30,
            },
          }),
        },
      };

      images = {
        generate: vi.fn().mockResolvedValue({
          created: Math.floor(Date.now() / 1000),
          data: [
            {
              url: 'https://example.com/generated-image.png',
              revised_prompt: 'Generated image',
            },
          ],
        }),
      };
    },
  }));
}

/**
 * Mock Anthropic client for all surfaces
 * Mocks message creation with streaming support simulation
 */
export function mockAnthropic() {
  return vi.mock('@anthropic-ai/sdk', () => ({
    default: class Anthropic {
      messages = {
        create: vi.fn().mockResolvedValue({
          id: 'msg-test-123',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'This is a mocked response from Anthropic',
            },
          ],
          model: 'claude-3-5-sonnet-20241022',
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: {
            input_tokens: 10,
            output_tokens: 20,
          },
        }),
      };
    },
  }));
}

/**
 * Mock Google Gemini client for all surfaces
 */
export function mockGemini() {
  return vi.mock('@google/generative-ai', () => ({
    GoogleGenerativeAI: class GoogleGenerativeAI {
      getGenerativeModel() {
        return {
          generateContent: vi.fn().mockResolvedValue({
            response: {
              text: () => 'This is a mocked response from Gemini',
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: 'This is a mocked response from Gemini',
                      },
                    ],
                  },
                  finishReason: 0,
                },
              ],
              usageMetadata: {
                promptTokenCount: 10,
                candidatesTokenCount: 20,
              },
            },
          }),
        };
      }
    },
  }));
}

/**
 * Mock Stripe for billing tests
 */
export function mockStripe() {
  return vi.mock('stripe', () => ({
    default: class Stripe {
      webhooks = {
        constructEvent: vi.fn().mockReturnValue({
          id: 'evt_test_123',
          object: 'event',
          api_version: '2024-04-10',
          created: Math.floor(Date.now() / 1000),
          type: 'charge.succeeded',
          data: {
            object: {
              id: 'ch_test_123',
              object: 'charge',
              amount: 10000,
              currency: 'usd',
              status: 'succeeded',
            },
          },
          request: {
            id: null,
            idempotency_key: null,
          },
        }),
      };

      charges = {
        create: vi.fn().mockResolvedValue({
          id: 'ch_test_123',
          object: 'charge',
          amount: 10000,
          currency: 'usd',
          status: 'succeeded',
          paid: true,
        }),
      };

      customers = {
        create: vi.fn().mockResolvedValue({
          id: 'cus_test_123',
          object: 'customer',
          email: 'test@example.com',
        }),
      };
    },
  }));
}

/**
 * Setup all default mocks
 * Call in beforeEach() of test files
 */
export function setupDefaultMocks() {
  vi.clearAllMocks();
  mockOpenAI();
  mockAnthropic();
  mockGemini();
  mockStripe();
}

/**
 * Cleanup mocks after tests
 * Call in afterEach() if needed
 */
export function cleanupMocks() {
  vi.restoreAllMocks();
  vi.clearAllMocks();
}

/**
 * Mock fetch for web-related tests (for web search, external API calls)
 */
export function mockFetch() {
  global.fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: [] }),
      text: async () => '{}',
    }),
  ) as any;
}

/**
 * Mock localStorage for browser-based apps
 */
export function mockLocalStorage() {
  const store: Record<string, string> = {};

  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: vi.fn((key: string) => store[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value.toString();
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      clear: vi.fn(() => {
        Object.keys(store).forEach((key) => delete store[key]);
      }),
    },
  });
}

/**
 * Mock window.matchMedia for media query tests (mobile, desktop responsive)
 */
export function mockMatchMedia(matches: boolean = false) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}
