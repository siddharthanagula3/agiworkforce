import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VideoGenerationJob } from '@/lib/server/video-generation-jobs';

vi.mock('server-only', () => ({}));

import {
  downloadVideoProviderOutput,
  pollVideoProvider,
  requestRunwayVideoCancellation,
  VideoProviderOutputError,
} from './video-provider-output-service';

const fetchMock = vi.fn();
global.fetch = fetchMock;

function job(overrides: Partial<VideoGenerationJob> = {}): VideoGenerationJob {
  const now = new Date().toISOString();
  return {
    id: '11111111-1111-4111-8111-111111111111',
    userId: 'user-1',
    organizationId: null,
    idempotencyKey: 'agi.media.web.video.operation-123',
    requestHash: 'a'.repeat(64),
    billingLeaseToken: 'lease-video',
    provider: 'google',
    model: 'synthetic-google-video-model',
    workflowRunId: 'wrun-video-1',
    providerTaskId: 'operations/provider-task',
    prompt: 'a sunset',
    durationSecs: 6,
    resolution: '720p',
    sourceSurface: 'web',
    estimatedCostCents: 240,
    estimatedDurationSecs: 180,
    status: 'processing',
    providerStartedAt: new Date().toISOString(),
    cancelRequestedAt: null,
    providerCancelAttemptedAt: null,
    providerCancelAcknowledgedAt: null,
    cancelAttempts: 0,
    cancelLastError: null,
    progress: null,
    assetId: null,
    publicError: null,
    billingOutcome: null,
    reconcileFailures: 0,
    nextAttemptAt: now,
    reconcileClaimToken: null,
    reconcileClaimExpiresAt: null,
    createdAt: now,
    updatedAt: now,
    terminalAt: null,
    ...overrides,
  };
}

function mp4Bytes(): Uint8Array {
  return Uint8Array.from([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x00, 0x00,
  ]);
}

describe('video provider output service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['GOOGLE_BASE_URL'];
    process.env['GOOGLE_API_KEY'] = 'google-secret';
    process.env['OPENROUTER_API_KEY'] = 'openrouter-test-secret';
    process.env['RUNWAY_API_KEY'] = 'runway-secret';
  });

  afterEach(() => {
    delete process.env['GOOGLE_API_KEY'];
    delete process.env['GOOGLE_BASE_URL'];
    delete process.env['OPENROUTER_API_KEY'];
    delete process.env['RUNWAY_API_KEY'];
  });

  it('accepts the documented full Google operation name without path injection', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ name: 'operations/provider-task', done: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(pollVideoProvider(job())).resolves.toMatchObject({ status: 'processing' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/operations/provider-task',
      expect.objectContaining({
        headers: { 'x-goog-api-key': 'google-secret' },
      }),
    );

    await expect(
      pollVideoProvider(job({ providerTaskId: 'operations/ok/../../admin' })),
    ).rejects.toBeInstanceOf(VideoProviderOutputError);
  });

  it('preserves a safe Google resource prefix ending in operations/id', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          name: 'models/synthetic-video-model/operations/provider-task',
          done: false,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await expect(
      pollVideoProvider(
        job({ providerTaskId: 'models/synthetic-video-model/operations/provider-task' }),
      ),
    ).resolves.toMatchObject({ status: 'processing' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/synthetic-video-model/operations/provider-task',
      expect.anything(),
    );
  });

  it('preserves the documented dotted Google model resource segment', async () => {
    const operationName = 'models/fixture-video-model.preview/operations/fixture-provider-task';
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ name: operationName, done: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(pollVideoProvider(job({ providerTaskId: operationName }))).resolves.toMatchObject({
      status: 'processing',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `https://generativelanguage.googleapis.com/v1beta/${operationName}`,
      expect.anything(),
    );

    await expect(
      pollVideoProvider(
        job({ providerTaskId: 'models/fixture-video-model.preview/operations/../admin' }),
      ),
    ).rejects.toBeInstanceOf(VideoProviderOutputError);
  });

  it('polls through the canonical validated GOOGLE_BASE_URL resolver', async () => {
    process.env['GOOGLE_BASE_URL'] = 'https://gateway.ai.cloudflare.com/v1/acct/gw/google/v1beta';
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ name: 'operations/provider-task', done: false }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(pollVideoProvider(job())).resolves.toMatchObject({ status: 'processing' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://gateway.ai.cloudflare.com/v1/acct/gw/google/v1beta/operations/provider-task',
      expect.objectContaining({ headers: { 'x-goog-api-key': 'google-secret' } }),
    );
  });

  it('sends the Google key server-side and streams validated video bytes to a temp file', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(mp4Bytes().buffer as ArrayBuffer, {
        status: 200,
        headers: { 'content-type': 'video/mp4', 'content-length': '16' },
      }),
    );

    const downloaded = await downloadVideoProviderOutput(job(), {
      url: 'https://generativelanguage.googleapis.com/v1beta/files/video:download?alt=media',
    });
    try {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({
          headers: { 'x-goog-api-key': 'google-secret' },
          redirect: 'manual',
        }),
      );
      expect(downloaded.byteSize).toBe(16);
      expect(await readFile(downloaded.filePath)).toEqual(Buffer.from(mp4Bytes()));
    } finally {
      await downloaded.cleanup();
    }
  });

  it('revalidates redirects and never forwards the Google key to an untrusted host', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: 'https://attacker.example/video.mp4' },
      }),
    );

    await expect(
      downloadVideoProviderOutput(job(), {
        url: 'https://generativelanguage.googleapis.com/v1beta/files/video:download',
      }),
    ).rejects.toMatchObject({ retryable: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('follows an allowlisted Google download redirect without forwarding the API key', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: 'https://storage.googleapis.com/veo-output/video.mp4?signed=1' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(mp4Bytes().buffer as ArrayBuffer, {
          status: 200,
          headers: { 'content-type': 'video/mp4' },
        }),
      );

    const downloaded = await downloadVideoProviderOutput(job(), {
      url: 'https://generativelanguage.googleapis.com/v1beta/files/video:download',
    });
    try {
      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
        headers: { 'x-goog-api-key': 'google-secret' },
      });
      expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ headers: {} });
      expect(downloaded.byteSize).toBe(16);
    } finally {
      await downloaded.cleanup();
    }
  });

  it('accepts Runway official ephemeral output host but never returns that URL as data', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(mp4Bytes().buffer as ArrayBuffer, {
        status: 200,
        headers: { 'content-type': 'video/mp4' },
      }),
    );
    const downloaded = await downloadVideoProviderOutput(
      job({ provider: 'runway', providerTaskId: 'runway-task' }),
      { url: 'https://dnznrvs05pmza.cloudfront.net/output.mp4?_jwt=signed' },
    );
    try {
      expect(downloaded).not.toHaveProperty('url');
      expect(downloaded.byteSize).toBe(16);
    } finally {
      await downloaded.cleanup();
    }
  });

  it('uses OpenRouter task truth and ignores unsigned provider output URLs', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'provider-task',
          status: 'completed',
          usage: { cost: 0.0107 },
          unsigned_urls: ['https://untrusted.example/provider-output.mp4'],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await pollVideoProvider(
      job({ provider: 'openrouter', providerTaskId: 'provider-task' }),
    );

    expect(result).toEqual({
      status: 'completed',
      output: { openRouterContentIndex: 0 },
      actualCostCents: 2,
    });
    expect(JSON.stringify(result)).not.toContain('untrusted.example');
  });

  it('downloads OpenRouter output through its authenticated content endpoint only', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(mp4Bytes().buffer as ArrayBuffer, {
        status: 200,
        headers: { 'content-type': 'video/mp4', 'content-length': '16' },
      }),
    );
    const openRouterJob = job({
      provider: 'openrouter',
      providerTaskId: 'provider-task',
    });

    const downloaded = await downloadVideoProviderOutput(openRouterJob, {
      openRouterContentIndex: 0,
    });
    try {
      expect(fetchMock).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/videos/provider-task/content?index=0',
        expect.objectContaining({
          headers: { Authorization: 'Bearer openrouter-test-secret' },
          redirect: 'error',
        }),
      );
      expect(downloaded).not.toHaveProperty('url');
      expect(downloaded.byteSize).toBe(16);
      expect(await readFile(downloaded.filePath)).toEqual(Buffer.from(mp4Bytes()));
    } finally {
      await downloaded.cleanup();
    }
  });

  it('refuses an OpenRouter provider URL in place of authenticated content identity', async () => {
    await expect(
      downloadVideoProviderOutput(
        job({ provider: 'openrouter', providerTaskId: 'provider-task' }),
        { url: 'https://untrusted.example/provider-output.mp4' },
      ),
    ).rejects.toMatchObject({ retryable: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses Runway official DELETE task cancellation and treats 204 only as acknowledgement', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const runwayJob = job({
      provider: 'runway',
      providerTaskId: 'runway-task',
      cancelRequestedAt: new Date().toISOString(),
    });

    await expect(requestRunwayVideoCancellation(runwayJob)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.dev.runwayml.com/v1/tasks/runway-task',
      expect.objectContaining({
        method: 'DELETE',
        headers: {
          Authorization: 'Bearer runway-secret',
          'X-Runway-Version': '2024-11-06',
        },
      }),
    );
  });

  it('maps Runway official CANCELED terminal state to a failed AGI result', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'runway-task', status: 'CANCELED' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(
      pollVideoProvider(job({ provider: 'runway', providerTaskId: 'runway-task' })),
    ).resolves.toMatchObject({ status: 'failed' });
  });

  it('maps Runway THROTTLED to queued and honors Retry-After', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'runway-task', status: 'THROTTLED' }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'retry-after': '42' },
      }),
    );

    await expect(
      pollVideoProvider(job({ provider: 'runway', providerTaskId: 'runway-task' })),
    ).resolves.toEqual({ status: 'queued', progress: undefined, retryAfterSeconds: 42 });
  });

  it('classifies Runway SAFETY failures without exposing the provider diagnostic as copy', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'runway-task',
          status: 'FAILED',
          failure: 'provider diagnostic must remain private',
          failureCode: 'SAFETY.INPUT.TEXT',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await pollVideoProvider(
      job({ provider: 'runway', providerTaskId: 'runway-task' }),
    );

    expect(result).toEqual({
      status: 'failed',
      error: 'Runway safety checks could not deliver this video.',
      providerFailureCode: 'SAFETY.INPUT.TEXT',
      moderated: true,
    });
    expect(JSON.stringify(result)).not.toContain('provider diagnostic');
  });

  it('never projects ordinary Runway failure diagnostics or provider URLs to clients', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'runway-task',
          status: 'FAILED',
          failure: 'download https://provider.example/internal/result.mp4 failed',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await pollVideoProvider(
      job({ provider: 'runway', providerTaskId: 'runway-task' }),
    );

    expect(result).toEqual({ status: 'failed', error: 'Runway could not generate this video.' });
    expect(JSON.stringify(result)).not.toContain('provider.example');
  });

  it('never projects Google operation diagnostics or provider URLs to clients', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          name: 'operations/provider-task',
          done: true,
          error: {
            code: 13,
            message: 'internal output https://storage.googleapis.com/private/result.mp4 failed',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const result = await pollVideoProvider(job());

    expect(result).toEqual({
      status: 'failed',
      error: 'Google Veo could not generate this video.',
    });
    expect(JSON.stringify(result)).not.toContain('storage.googleapis.com');
  });

  it('carries provider Retry-After through retryable rate-limit failures', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 429, headers: { 'retry-after': '120' } }),
    );

    await expect(
      pollVideoProvider(job({ provider: 'runway', providerTaskId: 'runway-task' })),
    ).rejects.toMatchObject({ retryable: true, retryAfterSeconds: 120 });
  });

  it('classifies provider status timeouts and malformed responses as unverifiable retries', async () => {
    fetchMock
      .mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'))
      .mockResolvedValueOnce(
        new Response('not-json', { status: 200, headers: { 'content-type': 'application/json' } }),
      );
    const runway = job({ provider: 'runway', providerTaskId: 'runway-task' });

    await expect(pollVideoProvider(runway)).rejects.toMatchObject({ retryable: true });
    await expect(pollVideoProvider(runway)).rejects.toMatchObject({ retryable: true });
  });

  it('refuses to invent a Google cancellation request', async () => {
    await expect(requestRunwayVideoCancellation(job())).rejects.toMatchObject({
      retryable: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
