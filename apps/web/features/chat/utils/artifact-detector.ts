/**
 * Web artifact adapter.
 *
 * Delegates ALL derivation to the canonical shared service
 * (`@agiworkforce/artifacts`) and maps the
 * platform-agnostic `SharedArtifact` to the web `ArtifactData` view type.
 *
 * Do NOT reimplement derivation here — the shared service is the single source
 * of truth (Step 1a of the shared-packages consolidation). Its deterministic
 * ids (`uuidv5(conversationId:messageId:ordinal)`) are what enable cross-surface
 * de-dup + cloud sync; the old per-surface `Date.now()`/`randomUUID()` ids did
 * not. Pass message context to `extractArtifacts` to get those stable ids.
 */
import {
  deriveArtifacts,
  removeArtifactBlocks as removeArtifactBlocksShared,
  hasArtifacts as hasArtifactsShared,
  extractArtifactTitle,
  isRenderableArtifact,
  extractCodeBlocks,
  type DeriveArtifactsOptions,
} from '@agiworkforce/artifacts';
import type { SharedArtifact } from '@agiworkforce/types';
import type { ArtifactData } from '../components/artifacts/ArtifactPreview';

// Re-export the shared classification helpers under their historical web names
// so any future caller resolves to the canonical implementation.
export { extractCodeBlocks, extractArtifactTitle };
export const shouldRenderAsArtifact = isRenderableArtifact;

/** Context that makes derived artifact ids deterministic + cross-surface stable. */
export interface ExtractArtifactsContext {
  conversationId?: string;
  messageId?: string;
}

/** Map a platform-agnostic SharedArtifact to the web ArtifactData view type. */
function toArtifactData(a: SharedArtifact): ArtifactData {
  return {
    id: a.id,
    // The derivation only emits html | react | svg | mermaid | code — all of
    // which are valid ArtifactData types.
    type: a.type as ArtifactData['type'],
    language: a.language,
    title: a.title,
    content: a.content,
    // No `versions` / `currentVersion`: this used to emit a synthesised
    // one-entry history ("Initial version") for every derived artifact, which
    // is what made every artifact report version 1. Version history is owned by
    // the shared store's content-keyed `versionsById` and read through
    // `getArtifactVersions`; the panel passes it to ArtifactPreview as
    // `versionHistory`.
  };
}

/**
 * Derive renderable artifacts from a message's markdown (web policy), as
 * `ArtifactData`. Pass `context` (conversation + message ids) for deterministic,
 * sync-stable ids — without it, ids collide across messages.
 */
export function extractArtifacts(
  markdown: string,
  context: ExtractArtifactsContext = {},
): ArtifactData[] {
  const opts: DeriveArtifactsOptions = {
    conversationId: context.conversationId,
    messageId: context.messageId,
    include: 'renderable',
  };
  return deriveArtifacts(markdown, opts).map(toArtifactData);
}

/** Strip derived artifact code blocks from the chat body to avoid duplication. */
export function removeArtifactBlocks(
  markdown: string,
  artifacts: ReadonlyArray<Pick<ArtifactData, 'content' | 'language'>>,
): string {
  return removeArtifactBlocksShared(markdown, artifacts);
}

/** Whether the message contains at least one renderable artifact. */
export function hasArtifacts(markdown: string): boolean {
  return hasArtifactsShared(markdown);
}

// `getArtifactStats` lived here and was exported for "analytics" with no caller
// anywhere in the repo. Its only non-trivial field, `totalVersions`, summed
// `artifact.versions?.length || 1` over the synthesised one-entry histories
// above, so it could only ever return the artifact count. Removed with them.
