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
