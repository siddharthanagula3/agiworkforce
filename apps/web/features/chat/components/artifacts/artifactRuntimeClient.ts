import {
  ArtifactRuntimeCompleteResponseSchema,
  ArtifactRuntimeConnectorsResponseSchema,
  ArtifactRuntimeErrorResponseSchema,
  artifactRuntimeCompletePath,
  artifactRuntimeConnectorsPath,
  artifactRuntimeStoragePath,
  parseArtifactStorageResponse,
  type ArtifactRuntimeCompleteRequest,
  type ArtifactRuntimeConnector,
  type ArtifactRuntimeConnectorsRequest,
  type ArtifactStorageRequest,
} from '@agiworkforce/cloud-contracts';
import { createManagedChatIdempotencyKey } from '@agiworkforce/utils/managed-chat-idempotency';
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

function storageBody(
  request: Exclude<ArtifactRuntimeRequest, { op: 'complete' }>,
): ArtifactStorageRequest {
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

async function post(
  path: string,
  body: ArtifactRuntimeCompleteRequest | ArtifactRuntimeConnectorsRequest | ArtifactStorageRequest,
  extraHeaders: Record<string, string> = {},
) {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: await addCsrfHeaders({ 'Content-Type': 'application/json', ...extraHeaders }),
    body: JSON.stringify(body),
  });
  if (response.status === 401) throw new ArtifactRuntimeSignInRequiredError();
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const refusal = ArtifactRuntimeErrorResponseSchema.safeParse(payload);
    throw new Error(
      refusal.success
        ? refusal.data.error.message
        : response.status === 413
          ? VALUE_TOO_LARGE
          : REQUEST_FAILED,
    );
  }
  return payload;
}

export async function describeArtifactRuntimeConnectors(
  token: string,
  connectors: readonly string[],
): Promise<ArtifactRuntimeConnector[]> {
  const parsed = ArtifactRuntimeConnectorsResponseSchema.safeParse(
    await post(artifactRuntimeConnectorsPath(token), { connectors: [...connectors] }),
  );
  if (!parsed.success) throw new Error(REQUEST_FAILED);
  return parsed.data.connectors;
}

export async function callArtifactRuntime(
  token: string,
  request: ArtifactRuntimeRequest,
  options: { allowedTools?: readonly string[] } = {},
): Promise<unknown> {
  if (request.op === 'complete') {
    const payload = await post(
      artifactRuntimeCompletePath(token),
      {
        prompt: request.prompt,
        connectors: request.connectors,
        allowedTools: [...(options.allowedTools ?? [])],
      },
      {
        'Idempotency-Key': createManagedChatIdempotencyKey({
          surface: 'web',
          purpose: 'artifact',
          operationId: crypto.randomUUID(),
        }),
      },
    );
    const parsed = ArtifactRuntimeCompleteResponseSchema.safeParse(payload);
    if (!parsed.success) throw new Error(REQUEST_FAILED);
    return parsed.data.text;
  }
  const body = storageBody(request);
  const parsed = parseArtifactStorageResponse(
    body.op,
    await post(artifactRuntimeStoragePath(token), body),
  );
  if (parsed === undefined) throw new Error(REQUEST_FAILED);
  return parsed;
}
