import {
  computeDerivedArtifactId,
  deriveArtifacts,
  removeArtifactBlocks as removeArtifactBlocksShared,
  splitProseAroundArtifacts as splitProseAroundArtifactsShared,
  type ArtifactProseSplit,
  hasArtifacts as hasArtifactsShared,
  extractArtifactTitle,
  extractCodeBlocks,
  artifactInclusionForPolicy,
  type DeriveArtifactsOptions,
  type DerivedCodeBlock,
  type ArtifactDerivationPolicy,
} from '@agiworkforce/artifacts';
import type { SharedArtifact } from '@agiworkforce/types';
import { parseChartArtifact } from '@agiworkforce/types/chart-spec';
import type { ArtifactData } from '../components/artifacts/ArtifactPreview';

export { extractCodeBlocks, extractArtifactTitle };

export function isInlineVisualizationFence(language: string | undefined, content: string): boolean {
  const normalized = language?.toLowerCase();
  return (
    normalized === 'mermaid' ||
    normalized === 'chart' ||
    (normalized === 'json' && parseChartArtifact(content).ok)
  );
}
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

export function codeBlockEditorArtifact(
  markdown: string,
  context: ExtractArtifactsContext,
  blocks: DerivedCodeBlock[],
  ordinal: number,
): ArtifactData | null {
  const [artifact] = deriveArtifacts(markdown, {
    conversationId: context.conversationId,
    messageId: context.messageId,
    include: (block) => block.ordinal === ordinal,
    blocks,
  });
  if (!artifact) return null;
  return {
    ...toArtifactData(artifact),
    id: computeDerivedArtifactId(
      context.conversationId,
      `${context.messageId ?? ''}:editor`,
      ordinal,
    ),
  };
}

export function removeArtifactBlocks(
  markdown: string,
  artifacts: ReadonlyArray<Pick<ArtifactData, 'content' | 'language'>>,
  policy?: ArtifactDerivationPolicy,
): string {
  return removeArtifactBlocksShared(markdown, artifacts, {
    include: artifactInclusionForPolicy(policy),
    keepInline: (block) => isInlineVisualizationFence(block.language, block.content),
  });
}

export function splitProseAroundArtifacts(
  markdown: string,
  artifacts: ReadonlyArray<Pick<ArtifactData, 'content' | 'language'>>,
  policy?: ArtifactDerivationPolicy,
): ArtifactProseSplit {
  return splitProseAroundArtifactsShared(markdown, artifacts, {
    include: artifactInclusionForPolicy(policy),
    keepInline: (block) => isInlineVisualizationFence(block.language, block.content),
  });
}

export function hasArtifacts(markdown: string): boolean {
  return hasArtifactsShared(markdown);
}
