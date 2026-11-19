import { createHash } from 'node:crypto';

/**
 * Where a relayed segment waits until the rest of its part arrives. No row
 * records these keys, so the layout itself is how erasure and the purge cron
 * find them: by person, then by workspace, then by upload.
 */
export const RELAY_SEGMENTS_PREFIX = 'relay-segments/';

const PERSONAL_WORKSPACE = 'personal';

interface RelaySegmentUpload {
  userId: string;
  organizationId: string | null;
  uploadId: string;
}

export function relaySegmentPersonPrefix(userId: string): string {
  return `${RELAY_SEGMENTS_PREFIX}${userId}/`;
}

function relaySegmentWorkspacePrefix(userId: string, organizationId: string | null): string {
  return `${relaySegmentPersonPrefix(userId)}${organizationId ?? PERSONAL_WORKSPACE}/`;
}

export function relaySegmentInWorkspace(key: string, organizationId: string): boolean {
  if (!key.startsWith(RELAY_SEGMENTS_PREFIX)) return false;
  const [, workspace] = key.slice(RELAY_SEGMENTS_PREFIX.length).split('/');
  return workspace === organizationId;
}

export function relaySegmentKey(
  upload: RelaySegmentUpload,
  partNumber: number,
  offset: number,
): string {
  const uploadHash = createHash('sha256').update(upload.uploadId).digest('hex').slice(0, 32);
  return `${relaySegmentWorkspacePrefix(upload.userId, upload.organizationId)}${uploadHash}/${partNumber}-${offset}`;
}
