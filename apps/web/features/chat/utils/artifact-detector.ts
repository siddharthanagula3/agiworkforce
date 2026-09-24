import {
  deriveArtifacts,
  removeArtifactBlocks as removeArtifactBlocksShared,
  hasArtifacts as hasArtifactsShared,
  extractArtifactTitle,
  isRenderableArtifact,
  extractCodeBlocks,
  artifactInclusionForPolicy,
  type DeriveArtifactsOptions,
  type DerivedCodeBlock,
  type ArtifactDerivationPolicy,
} from '@agiworkforce/artifacts';
import type { SharedArtifact } from '@agiworkforce/types';
import type { ArtifactData } from '../components/artifacts/ArtifactPreview';

export { extractCodeBlocks, extractArtifactTitle };
export const shouldRenderAsArtifact = isRenderableArtifact;

export interface ExtractArtifactsContext {
  conversationId?: string;
  messageId?: string;
}

function toArtifactData(a: SharedArtifact): ArtifactData {
  return {
    id: a.id,
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

export function extractArtifacts(
  markdown: string,
  context: ExtractArtifactsContext = {},
  blocks?: DerivedCodeBlock[],
  policy?: ArtifactDerivationPolicy,
): ArtifactData[] {
  const opts: DeriveArtifactsOptions = {
    conversationId: context.conversationId,
    messageId: context.messageId,
    include: artifactInclusionForPolicy(policy),
    blocks,
  };
  return deriveArtifacts(markdown, opts).map(toArtifactData);
}

export function removeArtifactBlocks(
  markdown: string,
  artifacts: ReadonlyArray<Pick<ArtifactData, 'content' | 'language'>>,
  policy?: ArtifactDerivationPolicy,
): string {
  return removeArtifactBlocksShared(markdown, artifacts, {
    include: artifactInclusionForPolicy(policy),
  });
}

export function hasArtifacts(markdown: string): boolean {
  return hasArtifactsShared(markdown);
}

// `getArtifactStats` lived here and was exported for "analytics" with no caller
