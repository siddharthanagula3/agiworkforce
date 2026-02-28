import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { GoogleProvider } from '@/lib/llm-providers/google';
import type { LLMProviderRequest } from '@/lib/llm-providers/base';

function makeOkResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeGoogleSuccessBody() {
  return {
    candidates: [
      {
        content: {
          parts: [{ text: 'Hello from Gemini' }],
        },
        finishReason: 'STOP',
      },
    ],
    usageMetadata: {
      promptTokenCount: 12,
      candidatesTokenCount: 5,
      totalTokenCount: 17,
    },
  };
}

function baseRequest(overrides: Partial<LLMProviderRequest> = {}): LLMProviderRequest {
  return {
    model: 'gemini-3-flash-preview',
    messages: [{ role: 'user', content: 'Hello' }],
    ...overrides,
  };
}

describe('GoogleProvider', () => {
  let provider: GoogleProvider;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    provider = new GoogleProvider('google-test-key');
    fetchSpy = vi.fn().mockResolvedValue(makeOkResponse(makeGoogleSuccessBody()));
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('sends MCP-style JSON Schema tools as parametersJsonSchema for Gemini', async () => {
    await provider.sendRequest(
      baseRequest({
        tools: [
          {
            type: 'function',
            function: {
              name: 'list_resources',
              description: 'List resources from an MCP server',
              parameters: {
                schema: {
                  $schema: 'https://json-schema.org/draft/2020-12/schema',
                  type: 'object',
                  properties: {
                    server: { type: 'string' },
                    tags: { type: 'array' },
                  },
                  required: ['server'],
                  additionalProperties: false,
                },
              },
            },
          },
        ],
      }),
    );

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    const declaration = body.tools[0].functionDeclarations[0];

    expect(declaration.parameters).toBeUndefined();
    expect(declaration.parametersJsonSchema).toEqual({
      type: 'object',
      properties: {
        server: { type: 'string' },
        tags: { type: 'array', items: {} },
      },
      required: ['server'],
      additionalProperties: false,
    });
  });

  it('keeps simple OpenAI tool schemas on the parameters field', async () => {
    await provider.sendRequest(
      baseRequest({
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather for a city',
              parameters: {
                type: 'object',
                properties: {
                  city: { type: 'string' },
                },
                required: ['city'],
              },
            },
          },
        ],
      }),
    );

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    const declaration = body.tools[0].functionDeclarations[0];

    expect(declaration.parameters).toEqual({
      type: 'object',
      properties: {
        city: { type: 'string' },
      },
      required: ['city'],
    });
    expect(declaration.parametersJsonSchema).toBeUndefined();
  });
});
