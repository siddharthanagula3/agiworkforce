import { afterEach, describe, expect, it, vi } from 'vitest';
import { AGENT_EVENT_SCHEMA_VERSION, classifyManagedQuotaErrorCode } from '@agiworkforce/types';
import {
  callCloud,
  CloudAgentGatewayError,
  DEFAULT_GATEWAY_BASE,
} from '../src/features/computer-use/cloudAgentClient';

afterEach(() => vi.unstubAllGlobals());

async function failure(status: number, body: string): Promise<CloudAgentGatewayError> {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body, { status })),
  );
  try {
    await callCloud(
      [{ role: 'user', content: 'Read this page' }],
      'test-token',
      DEFAULT_GATEWAY_BASE,
    );
  } catch (error) {
    expect(error).toBeInstanceOf(CloudAgentGatewayError);
    return error as CloudAgentGatewayError;
  }
  throw new Error('The gateway failure was incorrectly accepted');
}

function streamResponse(frames: unknown[], byteWidth = 7): Response {
  const bytes = new TextEncoder().encode(
    frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('') + 'data: [DONE]\n\n',
  );
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (let offset = 0; offset < bytes.length; offset += byteWidth) {
          controller.enqueue(bytes.slice(offset, offset + byteWidth));
        }
        controller.close();
      },
    }),
    { status: 200 },
  );
}

function agentFrame(event: Record<string, unknown>): unknown {
  return {
    choices: [
      {
        index: 0,
        delta: {
          x_agent_event: {
            schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
            sessionId: 'browser-session',
            turnId: 'browser-turn',
            sequence: 0,
            emittedAtMs: Date.now(),
            event,
          },
        },
      },
    ],
  };
}

async function streamingFailure(frames: unknown[]): Promise<CloudAgentGatewayError> {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => streamResponse(frames, 1)),
  );
  try {
    await callCloud(
      [{ role: 'user', content: 'Read this page' }],
      'test-token',
      DEFAULT_GATEWAY_BASE,
    );
  } catch (error) {
    expect(error).toBeInstanceOf(CloudAgentGatewayError);
    return error as CloudAgentGatewayError;
  }
  throw new Error('The streaming failure was incorrectly accepted');
}

describe('browser gateway provider schema and streamed failures', () => {
  const providerError = {
    message: 'The provider rejected this request. Try again, or choose another model.',
    code: 'provider_rejected_request',
    retryable: false,
  };

  it('sends object tool schemas without rejected top-level composition keywords', async () => {
    const fetch = vi.fn(async () =>
      streamResponse([{ choices: [{ delta: { content: 'Ready.' }, finish_reason: 'stop' }] }]),
    );
    vi.stubGlobal('fetch', fetch);
    await callCloud([], 'test-token', DEFAULT_GATEWAY_BASE);
    const request = fetch.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(request[1].body as string) as {
      tools: Array<{
        function: { name: string; description: string; parameters: Record<string, unknown> };
      }>;
    };
    expect(body.tools.length).toBeGreaterThan(0);
    for (const tool of body.tools) {
      expect(tool.function.parameters.type).toBe('object');
      for (const keyword of ['oneOf', 'allOf', 'anyOf']) {
        expect(tool.function.parameters).not.toHaveProperty(keyword);
      }
    }
    const selection = body.tools.find((tool) => tool.function.name === 'select_option')!;
    expect(selection.function.description).toContain('either value or label');
    expect(selection.function.parameters).toMatchObject({
      required: ['index'],
      additionalProperties: false,
    });
    const type = body.tools.find((tool) => tool.function.name === 'type')!;
    expect(type.function.description).toContain('preserving its selection');
    expect(type.function.description).not.toContain('click-focus');
  });

  it('rejects the canonical server error envelope before the following error marker and terminal', async () => {
    const error = await streamingFailure([
      agentFrame({ type: 'error', ...providerError }),
      { choices: [{ delta: { x_stream_error: providerError }, index: 0 }] },
      agentFrame({ type: 'stop', reason: 'error' }),
    ]);
    expect(error).toMatchObject({
      status: 200,
      code: providerError.code,
      message: providerError.message,
    });
  });

  it('rejects an x_stream_error even after partial text and tool fragments', async () => {
    const error = await streamingFailure([
      {
        choices: [
          {
            delta: {
              content: 'I will act.',
              tool_calls: [
                {
                  index: 0,
                  id: 'action-call',
                  type: 'function',
                  function: { name: 'click', arguments: '{"index":3}' },
                },
              ],
            },
          },
        ],
      },
      { choices: [{ delta: { x_stream_error: providerError }, finish_reason: 'stop' }] },
    ]);
    expect(error.message).toBe(providerError.message);
    expect(error.code).toBe(providerError.code);
  });

  it('rejects a top-level gateway error delivered with HTTP 200', async () => {
    const error = await streamingFailure([{ error: { type: 'upstream_error', ...providerError } }]);
    expect(error.message).toBe(providerError.message);
    expect(error.code).toBe(providerError.code);
  });

  it.each([
    { choices: [{ delta: {}, finish_reason: 'error' }] },
    agentFrame({ type: 'stop', reason: 'error' }),
    { choices: [{ delta: { x_stream_error: { message: 5, code: 'provider_error' } } }] },
    {
      choices: [
        {
          delta: {
            x_stream_error: {
              ...providerError,
              message: 'TypeError: private diagnostic at /Users/private/provider.ts:12:3',
            },
          },
        },
      ],
    },
    {
      choices: [
        {
          delta: { x_stream_error: { ...providerError, message: 'API_KEY=privatecredential123' } },
        },
      ],
    },
  ])('fails closed without raw internal text for frame %j', async (frame) => {
    const error = await streamingFailure([frame]);
    expect(error.message).toBe('AGI Cloud request failed while streaming. Try again.');
    expect(error.status).toBe(200);
  });

  it('reports the canonical rolling quota reason from a streamed error', async () => {
    const code = 'rolling_five_hour_limit_reached';
    const error = await streamingFailure([
      { choices: [{ delta: { x_stream_error: { message: 'Usage limit reached.', code } } }] },
    ]);
    expect(error.message).toBe(classifyManagedQuotaErrorCode(code)?.reason);
    expect(error.code).toBe(code);
  });

  it('cancels the open reader and rejects promptly without waiting for cancellation cleanup', async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(
                  new TextEncoder().encode(
                    `data: ${JSON.stringify({
                      choices: [{ delta: { x_stream_error: providerError } }],
                    })}\n\n`,
                  ),
                );
              },
              cancel,
            }),
            { status: 200 },
          ),
      ),
    );
    await expect(callCloud([], 'test-token', DEFAULT_GATEWAY_BASE)).rejects.toMatchObject({
      message: providerError.message,
      code: providerError.code,
    });
    expect(cancel).toHaveBeenCalledOnce();
  });
});

describe('browser gateway public failure presentation', () => {
  it('presents the canonical rolling quota reason and preserves HTTP status/code', async () => {
    const code = 'rolling_five_hour_limit_reached';
    const error = await failure(
      429,
      JSON.stringify({
        error: {
          type: 'quota_error',
          code,
          message: 'Your rolling 5-hour usage limit is reached.',
        },
        internal: 'private diagnostic',
      }),
    );
    expect(error.message).toBe(classifyManagedQuotaErrorCode(code)?.reason);
    expect(error.status).toBe(429);
    expect(error.code).toBe(code);
    expect(error.message).not.toContain('callCloud');
    expect(error.message).not.toContain('private diagnostic');
  });

  it('shows the validated public service message on a 503', async () => {
    const message = 'The provider is temporarily unavailable. Please try again later.';
    const error = await failure(
      503,
      JSON.stringify({ error: { type: 'api_error', code: 'provider_unavailable', message } }),
    );
    expect(error.message).toBe(message);
    expect(error).toMatchObject({ status: 503, code: 'provider_unavailable' });
  });

  it.each([
    '<html><body>Private internal diagnostic and credentials</body></html>',
    JSON.stringify({
      stack: 'TypeError: internal failure at /Users/private/server.ts:12:3',
      token: 'not-public',
    }),
    JSON.stringify({
      error: {
        message: 'TypeError: internal failure at /Users/private/server.ts:12:3',
        type: 'api_error',
        code: 'server_error',
      },
    }),
    JSON.stringify({
      error: { message: 'API_KEY=privatecredential123', type: 'api_error', code: 'server_error' },
    }),
  ])('does not expose unvalidated/private response content: %s', async (body) => {
    const error = await failure(503, body);
    expect(error.message).toBe('AGI Cloud is temporarily unavailable. Try again later.');
  });

  it('keeps a 403 policy gate fail closed without implementation flags in the sentence', async () => {
    const error = await failure(
      403,
      JSON.stringify({
        error: {
          type: 'policy_error',
          code: 'managed_compute_private_beta',
          message: 'Private beta policy gate.',
        },
      }),
    );
    expect(error.message).toBe(
      'AGI Cloud browser actions are unavailable for this account right now.',
    );
    expect(error).toMatchObject({ status: 403, code: 'managed_compute_private_beta' });
  });

  it('keeps a 401 authentication failure actionable and fail closed', async () => {
    const error = await failure(
      401,
      JSON.stringify({
        error: { type: 'auth_error', code: 'session_expired', message: 'Private token diagnostic' },
      }),
    );
    expect(error.message).toBe('Sign in to AGI Cloud again from the extension drawer.');
    expect(error).toMatchObject({ status: 401, code: 'session_expired' });
  });

  it('cancels an oversized error reader and uses a generic bounded fallback', async () => {
    const cancel = vi.fn();
    const bytes = new TextEncoder().encode('<html>' + 'private'.repeat(100_000));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
      },
      cancel,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { status: 503 })),
    );
    await expect(
      callCloud([{ role: 'user', content: 'Read this page' }], 'test-token', DEFAULT_GATEWAY_BASE),
    ).rejects.toMatchObject({
      message: 'AGI Cloud is temporarily unavailable. Try again later.',
      status: 503,
    });
    expect(cancel).toHaveBeenCalledOnce();
  });
});
