import type { Attachment } from '../stores/unifiedChatStore';
import { routeIntelligentlySync, type IntentType, type AutoMode } from './modelRouter';

/**
 * Task metadata passed from frontend to Rust backend
 * Contains intent classification and routing decisions
 */
export type TaskMetadata = {
  // Legacy fields (backward compatible)
  intents: string[];
  requiresVision: boolean;
  tokenEstimate: number;
  costPriority: 'low' | 'balanced';

  // New intelligent routing fields (January 2026)
  /** Primary classified intent type */
  intentType?: IntentType;
  /** Model category for routing (chat, image, video, search, tts, stt, music) */
  modelCategory?: 'chat' | 'image' | 'video' | 'search' | 'tts' | 'stt' | 'music';
  /** Selected model from intelligent routing */
  selectedModel?: string;
  /** Tool categories that should be available */
  suggestedToolCategories?: string[];
  /** Whether tools should auto-execute (full autonomy mode) */
  autoExecuteTools?: boolean;
  /** Classification confidence (0-1) */
  confidence?: number;
  /** Routing reasoning for debugging */
  routingReason?: string;
};

const CODE_KEYWORDS = [
  'code',
  'refactor',
  'bug',
  'compile',
  'test',
  'build',
  'git',
  'repo',
  'function',
  'class',
  'debug',
  'error',
  'fix',
];
const WRITING_KEYWORDS = [
  'write',
  'blog',
  'email',
  'copy',
  'content',
  'summarize',
  'draft',
  'article',
  'essay',
];
const RESEARCH_KEYWORDS = [
  'research',
  'analyze',
  'investigate',
  'compare',
  'explain',
  'how does',
  'what is',
];
const CREATIVE_KEYWORDS = [
  'generate',
  'create',
  'make',
  'draw',
  'design',
  'image',
  'picture',
  'art',
  'logo',
  'illustration',
  'video',
  'animation',
];
const AUTOMATION_KEYWORDS = [
  'automate',
  'script',
  'devops',
  'deploy',
  'ci',
  'cd',
  'pipeline',
  'workflow',
  'cron',
];
const TERMINAL_KEYWORDS = [
  'run',
  'execute',
  'command',
  'terminal',
  'shell',
  'bash',
  'npm',
  'yarn',
  'pip',
];

/**
 * Derive task metadata from user content and attachments
 *
 * This function performs intelligent intent classification and routing:
 * 1. Analyzes user message to determine intent (chat, coding, image-gen, etc.)
 * 2. Selects the appropriate model category (chat, image, video, search, etc.)
 * 3. Suggests tools that should be available for the task
 * 4. Determines if tools should auto-execute (full autonomy mode)
 *
 * @param content - User's message content
 * @param attachments - Optional file attachments
 * @param preferredCost - Cost preference ('low' for Hobby, 'balanced' for Pro+)
 * @param autoMode - Auto mode from user's selection (affects model pool)
 * @returns TaskMetadata with intelligent routing information
 */
export function deriveTaskMetadata(
  content: string,
  attachments?: Attachment[],
  preferredCost: 'low' | 'balanced' = 'balanced',
  autoMode?: AutoMode,
): TaskMetadata {
  const lowerContent = content.toLowerCase();
  const intents = new Set<string>();

  // Legacy keyword-based intent detection (for backward compatibility)
  if (CODE_KEYWORDS.some((keyword) => lowerContent.includes(keyword))) {
    intents.add('code');
  }

  if (WRITING_KEYWORDS.some((keyword) => lowerContent.includes(keyword))) {
    intents.add('writing');
  }

  if (RESEARCH_KEYWORDS.some((keyword) => lowerContent.includes(keyword))) {
    intents.add('research');
  }

  if (CREATIVE_KEYWORDS.some((keyword) => lowerContent.includes(keyword))) {
    intents.add('creative');
  }

  if (AUTOMATION_KEYWORDS.some((keyword) => lowerContent.includes(keyword))) {
    intents.add('automation');
  }

  if (TERMINAL_KEYWORDS.some((keyword) => lowerContent.includes(keyword))) {
    intents.add('terminal');
  }

  if (!intents.size) {
    intents.add('general');
  }

  const hasImages =
    attachments?.some(
      (attachment) => attachment.type === 'image' || attachment.type === 'screenshot',
    ) ?? false;

  const hasAudio =
    attachments?.some((attachment) => attachment.mimeType?.startsWith('audio/')) ?? false;

  const hasVideo =
    attachments?.some((attachment) => attachment.mimeType?.startsWith('video/')) ?? false;

  const requiresVision = hasImages || hasVideo;

  // Use intelligent routing if auto mode is specified
  const effectiveAutoMode =
    autoMode || (preferredCost === 'low' ? 'auto-economy' : 'auto-balanced');

  try {
    const routingResult = routeIntelligentlySync(content, effectiveAutoMode, {
      hasImages,
      hasAudio,
      hasVideo,
    });

    return {
      // Legacy fields
      intents: Array.from(intents),
      requiresVision,
      tokenEstimate: Math.min(2000, Math.max(32, content.length)),
      costPriority: preferredCost,

      // New intelligent routing fields
      intentType: routingResult.intent.primary,
      modelCategory: routingResult.modelCategory,
      selectedModel: routingResult.selectedModel,
      suggestedToolCategories: routingResult.suggestedTools.map((t) => t.tool.category),
      autoExecuteTools: routingResult.autoExecuteTools,
      confidence: routingResult.confidence,
      routingReason: routingResult.reason,
    };
  } catch {
    // Fallback to basic metadata if routing fails
    return {
      intents: Array.from(intents),
      requiresVision,
      tokenEstimate: Math.min(2000, Math.max(32, content.length)),
      costPriority: preferredCost,
    };
  }
}
