/**
 * providerStreamWiring.test.ts — Tests for streamChatCompletionViaProvider,
 * the glue between the AGI Cloud account token (deviceAuth.ts) and the
 * already-implemented SSE client (integrations/providerStreamClient.ts).
 *
 * Previously this function was a permanent stub that always threw
 * AGI_ACCOUNT_WEB_AUTH_NOT_WIRED regardless of input — these tests cover the
 * real wiring that replaced it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExtensionContext } from './__mocks__/vscode';
import { CancellationTokenSource } from './__mocks__/vscode';

vi.mock('../integrations/providerStreamClient', () => ({
  streamFromProvider: vi.fn(),
}));
vi.mock('../platform/config', () => ({
  Config: {
    useProviderStream: vi.fn(() => false),
  },
}));

import {
  chatCompletion,
  streamChatCompletionViaProvider,
  setAccountToken,
  AgiWorkforceApiError,
} from '../utils/api';
import { streamFromProvider } from '../integrations/providerStreamClient';
import { Config } from '../platform/config';
import { requireCatalogModel, requireCatalogModelOutside } from './catalogModelFixtures';

const PROVIDER_STREAM_SUPPORTED = new Set(['anthropic', 'openai', 'ollama', 'google']);
const OPENAI_MODEL = requireCatalogModel('openai').id;
const ANTHROPIC_MODEL = requireCatalogModel('anthropic').id;
const UNSUPPORTED_PROVIDER_MODEL = requireCatalogModelOutside(PROVIDER_STREAM_SUPPORTED).id;

describe('streamChatCompletionViaProvider', () => {
  let ctx: InstanceType<typeof ExtensionContext>;
  let secrets: import('vscode').SecretStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(Config.useProviderStream).mockReturnValue(false);
    ctx = new ExtensionContext();
    secrets = ctx.secrets as unknown as import('vscode').SecretStorage;
  });

  it('routes production cloud utility completions through provider streaming when enabled', async () => {
    await setAccountToken(secrets, 'account-token-123');
    vi.mocked(Config.useProviderStream).mockReturnValue(true);
    vi.mocked(streamFromProvider).mockImplementation(async function* () {
      yield { type: 'text-delta', delta: 'wired' } as const;
      yield { type: 'stop', reason: 'end_turn' } as const;
    });

    const result = await chatCompletion(
      secrets,
      [{ role: 'user', content: 'explain this diagnostic' }],
      new CancellationTokenSource().token,
      OPENAI_MODEL,
    );

    expect(result).toBe('wired');
    expect(streamFromProvider).toHaveBeenCalledOnce();
  });

  it('throws a clear, actionable error when no AGI Cloud account token is stored', async () => {
    const cts = new CancellationTokenSource();
    await expect(
      streamChatCompletionViaProvider(
        secrets,
        [{ role: 'user', content: 'hi' }],
        { onToken: vi.fn(), onDone: vi.fn(), onError: vi.fn() },
        cts.token,
        ANTHROPIC_MODEL,
      ),
    ).rejects.toThrow(/sign in to agi cloud/i);
  });

  it('throws when the resolved model maps to a provider the gateway does not support', async () => {
    await setAccountToken(secrets, 'account-token-123');
    const cts = new CancellationTokenSource();
    await expect(
      streamChatCompletionViaProvider(
        secrets,
        [{ role: 'user', content: 'hi' }],
        { onToken: vi.fn(), onDone: vi.fn(), onError: vi.fn() },
        cts.token,
        UNSUPPORTED_PROVIDER_MODEL,
      ),
    ).rejects.toThrow(/does not yet support/i);
  });

  it('streams text-delta chunks through onToken and calls onDone on a clean stop', async () => {
    await setAccountToken(secrets, 'account-token-123');
    vi.mocked(streamFromProvider).mockImplementation(async function* () {
      yield { type: 'text-delta', delta: 'Hello' } as const;
      yield { type: 'text-delta', delta: ' world' } as const;
      yield { type: 'stop', reason: 'end_turn' } as const;
    });

    const onToken = vi.fn();
    const onDone = vi.fn();
    const cts = new CancellationTokenSource();

    await streamChatCompletionViaProvider(
      secrets,
      [{ role: 'user', content: 'hi' }],
      { onToken, onDone, onError: vi.fn() },
      cts.token,
      ANTHROPIC_MODEL,
    );

    expect(onToken).toHaveBeenNthCalledWith(1, 'Hello');
    expect(onToken).toHaveBeenNthCalledWith(2, ' world');
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('routes tool-use chunks to the matching StreamCallbacks hooks', async () => {
    await setAccountToken(secrets, 'account-token-123');
    vi.mocked(streamFromProvider).mockImplementation(async function* () {
      yield { type: 'tool-use-start', toolUseId: 't1', name: 'search' } as const;
      yield { type: 'tool-use-delta', toolUseId: 't1', deltaJson: '{"q":"x"}' } as const;
      yield { type: 'tool-use-end', toolUseId: 't1' } as const;
      yield { type: 'stop', reason: 'tool_use' } as const;
    });

    const onToolUseStart = vi.fn();
    const onToolUseDelta = vi.fn();
    const onToolUseEnd = vi.fn();
    const cts = new CancellationTokenSource();

    await streamChatCompletionViaProvider(
      secrets,
      [{ role: 'user', content: 'hi' }],
      {
        onToken: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn(),
        onToolUseStart,
        onToolUseDelta,
        onToolUseEnd,
      },
      cts.token,
      ANTHROPIC_MODEL,
    );

    expect(onToolUseStart).toHaveBeenCalledWith('t1', 'search');
    expect(onToolUseDelta).toHaveBeenCalledWith('t1', '{"q":"x"}');
    expect(onToolUseEnd).toHaveBeenCalledWith('t1');
  });

  it('calls onError (not onDone) when the gateway yields an error chunk', async () => {
    await setAccountToken(secrets, 'account-token-123');
    vi.mocked(streamFromProvider).mockImplementation(async function* () {
      yield { type: 'error', message: 'upstream exploded', retryable: true } as const;
    });

    const onError = vi.fn();
    const onDone = vi.fn();
    const cts = new CancellationTokenSource();

    await streamChatCompletionViaProvider(
      secrets,
      [{ role: 'user', content: 'hi' }],
      { onToken: vi.fn(), onDone, onError },
      cts.token,
      ANTHROPIC_MODEL,
    );

    expect(onError).toHaveBeenCalledWith(expect.any(AgiWorkforceApiError));
    expect(onError.mock.calls[0][0].message).toBe('upstream exploded');
    expect(onDone).not.toHaveBeenCalled();
  });

  it('rejects cancellation without completing a partial provider response', async () => {
    await setAccountToken(secrets, 'account-token-123');
    const cts = new CancellationTokenSource();
    vi.mocked(streamFromProvider).mockImplementation(async function* () {
      yield { type: 'text-delta', delta: 'partial' } as const;
      cts.cancel();
      yield { type: 'text-delta', delta: 'must-not-apply' } as const;
    });
    const onToken = vi.fn();
    const onDone = vi.fn();

    await expect(
      streamChatCompletionViaProvider(
        secrets,
        [{ role: 'user', content: 'fix this code' }],
        { onToken, onDone, onError: vi.fn() },
        cts.token,
        ANTHROPIC_MODEL,
      ),
    ).rejects.toMatchObject({ code: 'CANCELLED' });

    expect(onToken).toHaveBeenCalledWith('partial');
    expect(onToken).not.toHaveBeenCalledWith('must-not-apply');
    expect(onDone).not.toHaveBeenCalled();
  });
});
