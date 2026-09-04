import {
  ChatSyncPullResponseSchema,
  ChatSyncPushResponseSchema,
  type ArtifactSyncPushItem,
  type ArtifactWireDelta,
  type ChatSyncPushResponse,
} from '@agiworkforce/cloud-contracts';
import { selectNextCursor } from '@agiworkforce/sync';

const MAX_PULL_PAGES = 100;
const SYNC_PROTOCOL_VERSION = 2;
const CURSOR_REJECTED_STATUS = 400;
const CURSOR_REJECTED_ERROR_CODE = 'VALIDATION_ERROR';

/**
 * Thrown when GET /api/chat/sync rejects the `since` cursor as malformed
 * (400 VALIDATION_ERROR from apps/web/app/api/chat/sync/route.ts). Callers
 * persisting the cursor across mounts should treat this as a signal to
 * discard the stored value and resync from the beginning.
 */
export class ArtifactSyncCursorRejectedError extends Error {
  constructor() {
    super('artifact sync cursor was rejected by the server');
    this.name = 'ArtifactSyncCursorRejectedError';
  }
}

async function isCursorRejection(response: Response): Promise<boolean> {
  if (response.status !== CURSOR_REJECTED_STATUS) return false;
  try {
    const body = (await response.clone().json()) as { error?: { code?: string } };
    return body?.error?.code === CURSOR_REJECTED_ERROR_CODE;
  } catch {
    return false;
  }
}

export interface PullArtifactCloudChangesOptions {
  cursor: string;
  getToken: () => Promise<string | null>;
  applyDeltas: (deltas: ReadonlyArray<ArtifactWireDelta>) => void;
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
  signal?: AbortSignal;
}

export async function pullArtifactCloudChanges({
  cursor,
  getToken,
  applyDeltas,
  fetchImpl = fetch,
  signal,
}: PullArtifactCloudChangesOptions): Promise<string> {
  const token = await getToken();
  if (!token) {
    throw new Error('artifact sync authentication is unavailable');
  }

  let nextCursor = cursor;
  for (let pageNumber = 0; pageNumber < MAX_PULL_PAGES; pageNumber += 1) {
    const response = await fetchImpl(`/api/chat/sync?since=${encodeURIComponent(nextCursor)}`, {
      headers: { Authorization: `Bearer ${token}` },
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) {
      if (await isCursorRejection(response)) {
        throw new ArtifactSyncCursorRejectedError();
      }
      throw new Error(`artifact sync pull failed with status ${response.status}`);
    }

    const parsed = ChatSyncPullResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new Error('invalid artifact sync response');
    }

    signal?.throwIfAborted();
    if (parsed.data.artifacts.length > 0) {
      applyDeltas(parsed.data.artifacts);
    }

    const previousCursor = nextCursor;
    nextCursor = selectNextCursor(previousCursor, parsed.data.cursor);
    if (!parsed.data.hasMore) {
      return nextCursor;
    }
    if (nextCursor === previousCursor) {
      throw new Error('artifact sync cursor did not advance on a saturated page');
    }
  }

  throw new Error(`artifact sync exceeded ${MAX_PULL_PAGES} pages`);
}

export interface PushArtifactCloudChangesOptions {
  artifacts: ReadonlyArray<ArtifactSyncPushItem>;
  getToken: () => Promise<string | null>;
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
  signal?: AbortSignal;
}

export async function pushArtifactCloudChanges({
  artifacts,
  getToken,
  fetchImpl = fetch,
  signal,
}: PushArtifactCloudChangesOptions): Promise<ChatSyncPushResponse | null> {
  if (artifacts.length === 0) return null;

  const token = await getToken();
  if (!token) {
    throw new Error('artifact sync authentication is unavailable');
  }

  const response = await fetchImpl('/api/chat/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ protocolVersion: SYNC_PROTOCOL_VERSION, artifacts }),
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) {
    throw new Error(`artifact sync push failed with status ${response.status}`);
  }

  const parsed = ChatSyncPushResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error('invalid artifact sync push response');
  }
  return parsed.data;
}
