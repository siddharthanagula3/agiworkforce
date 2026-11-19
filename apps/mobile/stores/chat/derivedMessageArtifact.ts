import {
  EXPLICIT_ARTIFACT_DERIVATION_POLICY,
  artifactInclusionForPolicy,
  computeDerivedArtifactId,
  deriveArtifacts,
  extractCodeBlocks,
  extractTrailingUnclosedBlock,
  isExplicitlyRenderableArtifact,
  isMarkedMarkdownDocument,
  isRenderableArtifact,
} from '@agiworkforce/artifacts';
import {
  chartSpecFromFence,
  classifyAssistantFence,
} from '@agiworkforce/unified-chat/assistant-fence';
import type { SharedArtifact } from '@agiworkforce/types';
import { studyFenceContent } from '@/src/features/chat/components/artifact-viewers/study/studyContent';
import type { Artifact } from '@/types/chat';

export type MessageArtifactScope = 'local' | 'cloud';

interface FenceBlock {
  language: string;
  content: string;
}

function drawnInline(block: FenceBlock): boolean {
  const language = block.language.trim().toLowerCase();
  if (language === 'mermaid') return true;
  if (chartSpecFromFence(language, block.content)) return true;
  return classifyAssistantFence(language, block.content).kind !== 'code';
}

function derivationPolicy(
  scope: MessageArtifactScope,
  metadata: Record<string, unknown> | undefined,
) {
  const stamped = metadata?.['artifactDerivation'];
  if (stamped === EXPLICIT_ARTIFACT_DERIVATION_POLICY) return stamped;
  return scope === 'cloud' ? EXPLICIT_ARTIFACT_DERIVATION_POLICY : undefined;
}

/**
 * Mirrors the web transcript: a fence becomes an artifact card under the answer only when the
 * web would offer it as one, and never when the answer already draws it as a diagram, chart or
 * draft. Every other fence is the inline code card alone.
 */
export function offersMessageArtifact(
  block: FenceBlock,
  scope: MessageArtifactScope,
  metadata?: Record<string, unknown>,
): boolean {
  if (drawnInline(block)) return false;
  const include = artifactInclusionForPolicy(derivationPolicy(scope, metadata));
  if (include === 'explicit-renderable') {
    return isExplicitlyRenderableArtifact(block.language, block.content);
  }
  return (
    isRenderableArtifact(block.language, block.content) ||
    isMarkedMarkdownDocument(block.language, block.content)
  );
}

function offersCardUnderAnswer(
  block: FenceBlock,
  scope: MessageArtifactScope,
  metadata?: Record<string, unknown>,
): boolean {
  return (
    studyFenceContent(block.language, block.content) === null &&
    offersMessageArtifact(block, scope, metadata)
  );
}

export function withheldDerivedArtifactIds(
  content: string,
  conversationId: string,
  messageId: string,
  scope: MessageArtifactScope,
  metadata?: Record<string, unknown>,
): ReadonlySet<string> {
  return new Set(
    extractCodeBlocks(content)
      .filter((block) => !offersCardUnderAnswer(block, scope, metadata))
      .map((block) => computeDerivedArtifactId(conversationId, messageId, block.ordinal)),
  );
}

export function fencesShownAsCards(
  content: string,
  conversationId: string,
  messageId: string,
  scope: MessageArtifactScope,
  metadata: Record<string, unknown> | undefined,
  shownArtifactIds: ReadonlySet<string>,
): ReadonlySet<string> {
  return new Set(
    extractCodeBlocks(content)
      .filter(
        (block) =>
          shownArtifactIds.has(
            computeDerivedArtifactId(conversationId, messageId, block.ordinal),
          ) && offersCardUnderAnswer(block, scope, metadata),
      )
      .map((block) => block.content),
  );
}

export function withoutFencesShownAsCards(
  markdown: string,
  cardSources: ReadonlySet<string>,
  hideTrailingOpenFence: boolean,
): string {
  const blocks = extractCodeBlocks(markdown);
  let cleaned = markdown;
  if (hideTrailingOpenFence) {
    const open = extractTrailingUnclosedBlock(markdown, blocks);
    if (open) cleaned = cleaned.slice(0, open.startIndex);
  }
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index]!;
    if (cardSources.has(block.content)) {
      cleaned = cleaned.slice(0, block.startIndex) + cleaned.slice(block.endIndex);
    }
  }
  return cleaned;
}

export function liveMessageArtifacts(
  content: string,
  conversationId: string,
  messageId: string,
  createdAt: string,
  scope: MessageArtifactScope,
  metadata?: Record<string, unknown>,
): Artifact[] {
  return deriveArtifacts(content, {
    conversationId,
    messageId,
    include: (block) => offersCardUnderAnswer(block, scope, metadata),
    now: createdAt,
  }).map(messageArtifactFromShared);
}

export function offersStreamingArtifact(
  content: string,
  scope: MessageArtifactScope,
  metadata?: Record<string, unknown>,
): boolean {
  const block = extractTrailingUnclosedBlock(content);
  return block !== null && offersCardUnderAnswer(block, scope, metadata);
}

const KEPT_TYPES: ReadonlySet<Artifact['type']> = new Set(['chart', 'document', 'image']);

function previewLanguage(artifact: SharedArtifact): string | undefined {
  if (artifact.language && artifact.language !== 'text') return artifact.language;
  return artifact.type === 'svg' ? 'svg' : undefined;
}

export function messageArtifactFromShared(artifact: SharedArtifact): Artifact {
  const language = previewLanguage(artifact);
  return {
    id: artifact.id,
    type: KEPT_TYPES.has(artifact.type as Artifact['type'])
      ? (artifact.type as Artifact['type'])
      : 'code',
    title: artifact.title,
    content: artifact.content,
    ...(language ? { language } : {}),
  };
}
