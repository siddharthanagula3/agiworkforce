import type { z } from 'zod';
import {
  ArtifactRuntimeCompleteResponseSchema,
  ArtifactRuntimeConnectorsResponseSchema,
  ArtifactRuntimeErrorResponseSchema,
  type ArtifactRuntimeConnector,
} from '@agiworkforce/cloud-contracts';
import { createManagedChatIdempotencyKey } from '@agiworkforce/utils/managed-chat-idempotency';
import { addCsrfHeaders } from '@/lib/client/csrf';
import {
  LIVE_ARTIFACTS_API_PATH,
  LiveArtifactListResponseSchema,
  LiveArtifactResponseSchema,
  liveArtifactPath,
  liveArtifactRuntimeCompletePath,
  liveArtifactRuntimeConnectorsPath,
  type LiveArtifact,
  type LiveArtifactBindingRequest,
  type LiveArtifactRefreshPolicy,
} from './live-artifact-contract';

const REQUEST_FAILED = 'The request failed. Try again.';

export class LiveArtifactRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
    this.name = 'LiveArtifactRequestError';
  }
}

async function send(
  path: string,
  init: { method: string; body?: unknown; headers?: Record<string, string>; signal?: AbortSignal },
): Promise<unknown> {
  init.signal?.throwIfAborted();
  const mutating = init.method !== 'GET';
  const baseHeaders: Record<string, string> = {
    ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    ...(init.headers ?? {}),
  };
  const response = await fetch(path, {
    method: init.method,
    credentials: 'same-origin',
    headers: mutating ? await addCsrfHeaders(baseHeaders) : baseHeaders,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    ...(init.signal ? { signal: init.signal } : {}),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const refusal = ArtifactRuntimeErrorResponseSchema.safeParse(payload);
    throw new LiveArtifactRequestError(
      refusal.success ? refusal.data.error.message : REQUEST_FAILED,
      response.status,
      refusal.success ? (refusal.data.error.code ?? null) : null,
    );
  }
  return payload;
}

function parseWith<T>(schema: z.ZodType<T>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (!result.success) throw new Error(REQUEST_FAILED);
  return result.data;
}

export async function listLiveArtifacts(signal?: AbortSignal): Promise<LiveArtifact[]> {
  const payload = await send(LIVE_ARTIFACTS_API_PATH, {
    method: 'GET',
    ...(signal ? { signal } : {}),
  });
  return parseWith(LiveArtifactListResponseSchema, payload).artifacts;
}

export async function readLiveArtifact(
  artifactId: string,
  signal?: AbortSignal,
): Promise<LiveArtifact | null> {
  const payload = await send(liveArtifactPath(artifactId), {
    method: 'GET',
    ...(signal ? { signal } : {}),
  });
  return parseWith(LiveArtifactResponseSchema, payload).artifact;
}

export async function saveLiveArtifact(
  artifactId: string,
  binding: LiveArtifactBindingRequest,
): Promise<LiveArtifact> {
  const payload = await send(liveArtifactPath(artifactId), { method: 'PUT', body: binding });
  const artifact = parseWith(LiveArtifactResponseSchema, payload).artifact;
  if (!artifact) throw new Error(REQUEST_FAILED);
  return artifact;
}

export async function setLiveArtifactRefreshPolicy(
  artifactId: string,
  refreshPolicy: LiveArtifactRefreshPolicy,
): Promise<LiveArtifact> {
  const payload = await send(liveArtifactPath(artifactId), {
    method: 'PATCH',
    body: { refreshPolicy },
  });
  const artifact = parseWith(LiveArtifactResponseSchema, payload).artifact;
  if (!artifact) throw new Error(REQUEST_FAILED);
  return artifact;
}

export async function removeLiveArtifact(artifactId: string): Promise<void> {
  await send(liveArtifactPath(artifactId), { method: 'DELETE' });
}

export async function describeLiveArtifactConnectors(
  artifactId: string,
  connectors: readonly string[],
  signal?: AbortSignal,
): Promise<ArtifactRuntimeConnector[]> {
  const payload = await send(liveArtifactRuntimeConnectorsPath(artifactId, connectors), {
    method: 'GET',
    ...(signal ? { signal } : {}),
  });
  return parseWith(ArtifactRuntimeConnectorsResponseSchema, payload).connectors;
}

export async function completeLiveArtifactPrompt(
  artifactId: string,
  request: { prompt: string; connectors: readonly string[] },
  signal?: AbortSignal,
): Promise<string> {
  const payload = await send(liveArtifactRuntimeCompletePath(artifactId), {
    method: 'POST',
    body: { prompt: request.prompt, connectors: [...request.connectors], allowedTools: [] },
    headers: {
      'Idempotency-Key': createManagedChatIdempotencyKey({
        surface: 'web',
        purpose: 'artifact',
        operationId: crypto.randomUUID(),
      }),
    },
    ...(signal ? { signal } : {}),
  });
  return parseWith(ArtifactRuntimeCompleteResponseSchema, payload).text;
}
