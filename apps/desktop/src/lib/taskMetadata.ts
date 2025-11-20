import type { Attachment } from '../stores/unifiedChatStore';

export type TaskMetadata = {
  intents: string[];
  requiresVision: boolean;
  tokenEstimate: number;
  costPriority: 'low' | 'balanced';
};

const CODE_KEYWORDS = ['code', 'refactor', 'bug', 'compile', 'test', 'build', 'git', 'repo'];
const WRITING_KEYWORDS = ['write', 'blog', 'email', 'copy', 'content', 'summarize'];
const RESEARCH_KEYWORDS = ['research', 'analyze', 'investigate', 'compare'];

export function deriveTaskMetadata(
  content: string,
  attachments?: Attachment[],
  preferredCost: 'low' | 'balanced' = 'balanced',
): TaskMetadata {
  const lowerContent = content.toLowerCase();
  const intents = new Set<string>();

  if (CODE_KEYWORDS.some((keyword) => lowerContent.includes(keyword))) {
    intents.add('code');
  }

  if (WRITING_KEYWORDS.some((keyword) => lowerContent.includes(keyword))) {
    intents.add('writing');
  }

  if (RESEARCH_KEYWORDS.some((keyword) => lowerContent.includes(keyword))) {
    intents.add('research');
  }

  if (!intents.size) {
    intents.add('general');
  }

  const requiresVision =
    attachments?.some(
      (attachment) => attachment.type === 'image' || attachment.type === 'screenshot',
    ) ?? false;

  return {
    intents: Array.from(intents),
    requiresVision,
    tokenEstimate: Math.min(2000, Math.max(32, content.length)),
    costPriority: preferredCost,
  };
}
