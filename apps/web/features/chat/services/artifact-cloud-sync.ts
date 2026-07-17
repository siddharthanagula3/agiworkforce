import { ChatSyncPullResponseSchema, type ArtifactWireDelta } from '@agiworkforce/cloud-contracts';
import { selectNextCursor } from '@agiworkforce/sync';

const MAX_PULL_PAGES = 100;

export interface PullArtifactCloudChangesOptions {
  cursor: string;
  getToken: () => Promise<string | null>;
  applyDeltas: (deltas: ReadonlyArray<ArtifactWireDelta>) => void;
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
  signal?: AbortSignal;
}

/**
 * Pull every currently available chat-sync page and apply only its artifact
 * overlay. Web conversations/messages already use their account-backed CRUD
 * APIs; this caller exists specifically so first-class Desktop Cloud artifacts
 * are no longer stranded in `web_artifacts`.
 */
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
