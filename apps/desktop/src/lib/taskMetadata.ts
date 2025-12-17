import type { Attachment } from '../stores/unifiedChatStore';

export type TaskMetadata = {
  intents: string[];
  requiresVision: boolean;
  tokenEstimate: number;
  costPriority: 'low' | 'balanced';
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

  // Creative/generation tasks - route to Google Gemini
  if (CREATIVE_KEYWORDS.some((keyword) => lowerContent.includes(keyword))) {
    intents.add('creative');
  }

  // Automation/DevOps tasks - route to Claude
  if (AUTOMATION_KEYWORDS.some((keyword) => lowerContent.includes(keyword))) {
    intents.add('automation');
  }

  // Terminal/command tasks - route to Claude
  if (TERMINAL_KEYWORDS.some((keyword) => lowerContent.includes(keyword))) {
    intents.add('terminal');
  }

  if (!intents.size) {
    intents.add('general');
  }

  const requiresVision =
    attachments?.some(
      (attachment) => attachment.type === 'image' || attachment.type === 'screenshot',
    ) ?? false;

  // Check for video attachments - also route to vision-capable models
  const hasVideo =
    attachments?.some((attachment) => attachment.mimeType?.startsWith('video/')) ?? false;

  return {
    intents: Array.from(intents),
    requiresVision: requiresVision || hasVideo,
    tokenEstimate: Math.min(2000, Math.max(32, content.length)),
    costPriority: preferredCost,
  };
}
