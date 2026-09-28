import { addCsrfHeaders } from '@/lib/client/csrf';
import type { ArtifactRuntimeRequest } from '@/lib/artifact-sandbox';

export class ArtifactRuntimeSignInRequiredError extends Error {
  constructor() {
    super("Sign in to use this app's AI and saved data.");
    this.name = 'ArtifactRuntimeSignInRequiredError';
  }
}

const REQUEST_FAILED = 'The request failed. Try again.';
const VALUE_TOO_LARGE = 'That value is too large to save.';

function storageBody(request: Exclude<ArtifactRuntimeRequest, { op: 'complete' }>) {
  switch (request.op) {
    case 'storage.get':
      return { op: 'get', key: request.key, shared: request.shared };
    case 'storage.set':
      return { op: 'set', key: request.key, value: request.value, shared: request.shared };
    case 'storage.delete':
      return { op: 'delete', key: request.key, shared: request.shared };
    case 'storage.list':
      return { op: 'list', prefix: request.prefix, shared: request.shared };
  }
}

function errorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const error = (payload as { error?: unknown }).error;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return null;
}

export async function callArtifactRuntime(
  token: string,
  request: ArtifactRuntimeRequest,
): Promise<unknown> {
  const path = request.op === 'complete' ? 'complete' : 'storage';
  const response = await fetch(`/api/artifacts/runtime/${encodeURIComponent(token)}/${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: await addCsrfHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(
      request.op === 'complete' ? { prompt: request.prompt } : storageBody(request),
    ),
  });
  if (response.status === 401) throw new ArtifactRuntimeSignInRequiredError();
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      errorMessage(payload) ?? (response.status === 413 ? VALUE_TOO_LARGE : REQUEST_FAILED),
    );
  }
  if (request.op !== 'complete') return payload;
  const text = payload && typeof payload === 'object' ? (payload as { text?: unknown }).text : null;
  if (typeof text !== 'string') throw new Error(REQUEST_FAILED);
  return text;
}
