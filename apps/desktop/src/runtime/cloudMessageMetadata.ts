/**
 * Managed-cloud assistant-message metadata budgeting (DES-C06).
 *
 * `POST /api/chat/conversations/:id/messages` validates `metadata` against
 * `MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH` (32 000 serialized chars, see
 * `packages/contracts/cloud-contracts/src/conversations.ts`), enforced
 * server-side in `apps/web/lib/server/neon-chat.ts`. Desktop used to POST the
 * whole stream projection unchecked, `thinking`, `toolCalls`, `webSearchResults`,
 * `generatedFiles` AND full artifact `content` all sharing that one budget. A
 * single real artifact (a 20-50 KB HTML page) overflowed it, the POST 400'd, and
 * `CloudRuntime.persistAssistantTurn` rethrew: the ENTIRE assistant turn was
 * lost on reopen, not just the oversized field.
 *
 * Web never had this problem because artifacts never enter message metadata.
 * they live in the dedicated row-per-artifact `web_artifacts` table
 * (`apps/web/app/api/chat/sync/route.ts`). Desktop has no such table, so this
 * module does two things instead:
 *
 *  1. DROPS RE-DERIVABLE ARTIFACTS. With DES-C05's client-side derivation
 *     landed, an artifact whose content is verbatim inside the message body is
 *     reconstructed from `message.content` on reopen with the SAME deterministic
 *     id. Persisting its bytes is pure duplication, so it is removed. Lossless.
 *  2. BUDGET-TRIMS WHAT REMAINS. If the metadata is still over the cap, optional
 *     projections are dropped in a fixed least-valuable-first order until it
 *     fits, and the names of the dropped fields are recorded in
 *     `metadataTrimmed` so the transcript can say so (`MessageBubble` renders
 *     the note). Losing a thinking trace beats losing the answer.
 *
 * Never dropped: `finishReason`, `streamError`, `cloudApproval` and
 * `cloudAgentRun`. Those are control state, a dropped `cloudApproval` would
 * strand a suspended tool-approval turn with no way to resume it, and a dropped
 * `streamError` would silently retract a truncation warning.
 *
 * @module cloudMessageMetadata
 */

import {
  MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH,
  managedCloudMetadataLength,
} from '@agiworkforce/cloud-contracts';

export const TRIMMABLE_METADATA_FIELDS = [
  'artifacts',
  'thinking',
  'toolCalls',
  'webSearchResults',
  'codeExecutionResult',
  'generatedFiles',
  'agentActivity',
] as const;

export type TrimmableMetadataField = (typeof TRIMMABLE_METADATA_FIELDS)[number];

export interface BoundedCloudMessageMetadata {
  metadata: Record<string, unknown> | undefined;
  trimmed: TrimmableMetadataField[];
  droppedRederivableArtifacts: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripRederivableArtifacts(
  metadata: Record<string, unknown>,
  content: string,
): { metadata: Record<string, unknown>; dropped: number } {
  const artifacts = metadata['artifacts'];
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    return { metadata, dropped: 0 };
  }
  const kept = artifacts.filter((artifact) => {
    if (!isRecord(artifact)) return true;
    const artifactContent = artifact['content'];
    if (typeof artifactContent !== 'string' || artifactContent.length === 0) return true;
    return !content.includes(artifactContent);
  });
  const dropped = artifacts.length - kept.length;
  if (dropped === 0) return { metadata, dropped: 0 };

  const next = { ...metadata };
  if (kept.length === 0) {
    delete next['artifacts'];
  } else {
    next['artifacts'] = kept;
  }
  return { metadata: next, dropped };
}

/**
 * Build a metadata object guaranteed to satisfy the managed-cloud budget.
 *
 * @param metadata Raw merged projection (agent activity + run ref + approval +
 *   stream projection), exactly as `persistAssistantTurn` assembled it.
 * @param content The assistant message body being persisted alongside it. Used
 *   to detect re-derivable artifacts; it has its OWN, much larger cap
 *   (`MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH`) and is never touched here.
 * @param maxLength Override for tests; defaults to the contract's cap.
 */
export function buildBoundedCloudMessageMetadata(
  metadata: Record<string, unknown>,
  content: string,
  maxLength: number = MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH,
): BoundedCloudMessageMetadata {
  const stripped = stripRederivableArtifacts(metadata, content);
  let working = stripped.metadata;
  const trimmed: TrimmableMetadataField[] = [];

  const fits = (candidate: Record<string, unknown>): boolean => {
    const withNote =
      trimmed.length > 0 ? { ...candidate, metadataTrimmed: [...trimmed] } : candidate;
    return managedCloudMetadataLength(withNote) <= maxLength;
  };

  for (const field of TRIMMABLE_METADATA_FIELDS) {
    if (fits(working)) break;
    if (!(field in working)) continue;
    const next = { ...working };
    delete next[field];
    working = next;
    trimmed.push(field);
  }

  const withNote = trimmed.length > 0 ? { ...working, metadataTrimmed: [...trimmed] } : working;

  return {
    metadata: Object.keys(withNote).length > 0 ? withNote : undefined,
    trimmed,
    droppedRederivableArtifacts: stripped.dropped,
  };
}

export function exceedsManagedCloudMetadataBudget(
  metadata: Record<string, unknown> | undefined,
  maxLength: number = MANAGED_CLOUD_CHAT_MAX_METADATA_LENGTH,
): boolean {
  if (!metadata) return false;
  return managedCloudMetadataLength(metadata) > maxLength;
}
