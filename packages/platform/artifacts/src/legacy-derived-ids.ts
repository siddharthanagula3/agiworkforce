import {
  computeDerivedArtifactId,
  deriveArtifacts,
  extractCodeBlocks,
  extractTrailingUnclosedBlock,
} from './artifact-derivation';

/**
 * Derived artifact ids key on a block's ordinal. Until the fence parser learned
 * fence lengths and nesting, any line opening with three backticks closed a
 * block, so stored messages that nest fences split into other blocks and the
 * ids saved for them no longer match. This keeps that splitting only to map
 * the old ids onto the new ones; nothing derives artifacts from it.
 */
const LEGACY_FENCED_CODE_RE = /^```([^\n`]*)\r?\n([\s\S]*?)^```/gm;
const LEGACY_CLOSING_FENCE_LENGTH = 3;

export interface LegacyCodeBlock {
  ordinal: number;
  content: string;
  contentStart: number;
  contentEnd: number;
}

export function extractLegacyCodeBlocks(markdown: string): LegacyCodeBlock[] {
  const blocks: LegacyCodeBlock[] = [];
  const re = new RegExp(LEGACY_FENCED_CODE_RE.source, LEGACY_FENCED_CODE_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(markdown)) !== null) {
    const raw = match[2] ?? '';
    const contentEnd = match.index + match[0].length - LEGACY_CLOSING_FENCE_LENGTH;
    blocks.push({
      ordinal: blocks.length,
      content: raw.trim(),
      contentStart: contentEnd - raw.length,
      contentEnd,
    });
  }
  return blocks;
}

export interface LegacyArtifactIdAdoption {
  id: string;
  legacyId: string;
}

/**
 * For each block whose derived id changed, the id the old parser gave the block
 * that held the same content. A block adopts an old id only when exactly one
 * old block lies inside its content, and never an old id that a current block
 * of the message can still hold state under: one that derives an artifact, or
 * the unclosed block an interrupted answer ends with.
 */
export function legacyArtifactIdAdoptions(
  markdown: string,
  scope: { conversationId?: string; messageId?: string },
): LegacyArtifactIdAdoption[] {
  const legacy = extractLegacyCodeBlocks(markdown);
  if (legacy.length === 0) return [];
  const idFor = (ordinal: number) =>
    computeDerivedArtifactId(scope.conversationId, scope.messageId, ordinal);
  const blocks = extractCodeBlocks(markdown);
  const claimedIds = new Set(
    deriveArtifacts(markdown, { ...scope, blocks }).map((artifact) => artifact.id),
  );
  const trailing = extractTrailingUnclosedBlock(markdown, blocks);
  if (trailing) claimedIds.add(idFor(trailing.ordinal));
  const adoptions: LegacyArtifactIdAdoption[] = [];
  for (const block of blocks) {
    const start = markdown.indexOf('\n', block.startIndex) + 1;
    const end = markdown.lastIndexOf('\n', block.endIndex - 1) + 1;
    const inside = legacy.filter((old) => old.contentStart >= start && old.contentEnd <= end);
    if (inside.length !== 1) continue;
    const id = idFor(block.ordinal);
    const legacyId = idFor(inside[0]!.ordinal);
    if (legacyId === id || claimedIds.has(legacyId)) continue;
    adoptions.push({ id, legacyId });
  }
  return adoptions;
}
