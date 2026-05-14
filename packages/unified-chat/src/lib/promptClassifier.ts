/**
 * Zero-latency heuristic prompt classifier for auto model routing.
 *
 * Architecture mirrors LiteLLM's Complexity Router + NVIDIA's task-taxonomy:
 *   Tier 1 — keyword pattern matching (sub-millisecond, zero cost)
 *   Tier 2 — token-count signals (prompt length)
 *   Tier 3 — attachment signals (vision, document)
 *
 * Maps each classified task to a RoutingSlot scoped by the active auto-mode
 * tier (economy → balanced → premium), so model selection always respects
 * the user's chosen quality/cost envelope.
 *
 * References:
 *   LiteLLM Auto Routing: https://docs.litellm.ai/docs/proxy/auto_routing
 *   NVIDIA prompt-task-and-complexity-classifier (HuggingFace, DeBERTa-v3)
 *   OpenRouter Auto Router (NotDiamond under the hood)
 *   RouteLLM paper: https://arxiv.org/abs/2406.18665
 */

import { getRoutingSlotModel, type RoutingSlot } from '@agiworkforce/types';
import type { RoutingDecision, RoutingTaskType } from '@agiworkforce/types';

// ---------------------------------------------------------------------------
// Task taxonomy (mirrors NVIDIA 11-category classifier + extras)
// ---------------------------------------------------------------------------
export type ClassifiedTask =
  | 'computer_use' // Desktop automation, clicking, screen control
  | 'image_generation' // Generate / draw / paint images
  | 'video_generation' // Animate / generate video
  | 'deep_research' // Comprehensive multi-source analysis with citations
  | 'search' // Real-time lookup, current events, live data
  | 'coding' // Code generation, debugging, refactoring
  | 'reasoning' // Multi-step logic, math, proof, analysis
  | 'vision' // Prompt with image attachment
  | 'long_context' // Very long document or prompt
  | 'creative_writing' // Stories, poems, scripts, fiction
  | 'simple_chat' // Short conversational question
  | 'general'; // Default fallback

export interface ClassificationResult {
  task: ClassifiedTask;
  slot: RoutingSlot;
  reason: string;
  signals: string[];
}

export interface ClassifyOptions {
  /** True when the user attached an image to the message. */
  hasImageAttachment?: boolean;
  /** True when a document/PDF is attached. */
  hasDocumentAttachment?: boolean;
  /** The active auto-mode ID — controls which tier of slots to use. */
  autoModeId?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Rough token estimate: 1 token ≈ 4 chars in English. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function matchesAny(text: string, patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[0];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Pattern banks — ordered from most-specific to least-specific
// ---------------------------------------------------------------------------

const COMPUTER_USE: RegExp[] = [
  /\b(automate|automation)\b/i,
  /\bclick (on|the)\b/i,
  /\bopen (the |an )?app\b/i,
  /\bcontrol (my |the )?screen\b/i,
  /\btake a screenshot\b/i,
  /\btype into\b/i,
  /\bscroll (down|up|to)\b/i,
  /\bnavigate to\b/i,
  /\bmove (my |the )?mouse\b/i,
  /\buse (the |my )?computer\b/i,
  /\bdesktop automation\b/i,
  /\bfill (in |out )?the form\b/i,
];

const IMAGE_GEN: RegExp[] = [
  /\bgenerate (an? |some )?image\b/i,
  /\bcreate (an? |a |some )?image\b/i,
  /\bdraw (me |a |an )?\b/i,
  /\bpaint (me |a |an )?\b/i,
  /\bvisuali[sz]e\b/i,
  /\bmake (a |an |some )?(picture|photo|image)\b/i,
  /\billustrat(e|ion)\b/i,
  /\b(ai |digital )?artwork\b/i,
  /\bdall.?e\b/i,
  /\bflux\b/i,
  /\bstable diffusion\b/i,
  /\bimage gen(erat(e|ion))?\b/i,
  /\bai (art|photo|picture|image)\b/i,
  /\bphotorealistic\b/i,
];

const VIDEO_GEN: RegExp[] = [
  /\bgenerate (a |an )?video\b/i,
  /\bcreate (a |an )?video\b/i,
  /\banimate\b/i,
  /\bmake (a |an )?clip\b/i,
  /\bvideo (generation|gen)\b/i,
  /\bsora\b/i,
  /\bveo\b/i,
];

const DEEP_RESEARCH: RegExp[] = [
  /\bcomprehensive (analysis|report|overview|study|review)\b/i,
  /\bdeep (dive|research|analysis)\b/i,
  /\bthorough (investigation|analysis|review)\b/i,
  /\bfind (sources|citations|references) (for|on|about)\b/i,
  /\bwrite a (research |detailed )?(report|paper|white ?paper)\b/i,
  /\bmulti.source\b/i,
  /\bwith (citations|references|sources)\b/i,
];

const SEARCH: RegExp[] = [
  /\bsearch (for|the)\b/i,
  /\blook up\b/i,
  /\bwhat('s| is) (the |a )?latest\b/i,
  /\bcurrent(ly)?\b.{0,30}(news|event|price|rate|status|version)\b/i,
  /\btoday('s)?\b/i,
  /\brecent(ly)?\b.{0,30}(happen|news|event|announc|updat|releas)\b/i,
  /\bwhat happened (to|with|in)\b/i,
  /\blatest (news|update|version|release)\b/i,
  /\breal.?time\b/i,
  /\bcurrent (price|rate|weather|status|version)\b/i,
  /\blive (data|price|feed)\b/i,
  /\bwho (is|are) .{2,40}\?("|')?$/i,
];

const CODING: RegExp[] = [
  /```[\w]*/, // code fence
  /\b(def |function |class |const |let |var |import |export |return |async )\b/,
  /\b(npm|yarn|pnpm|pip|cargo|gradle|maven|brew)\b/i,
  /\b(git|github|gitlab|commit|pull request|merge request)\b/i,
  /\b(debug|fix (the |a |this )?(bug|error|issue|problem|crash|exception))\b/i,
  /\b(write|implement|create|build|generate) (a |an |the )?(function|component|class|api|endpoint|module|script|program|service|hook|middleware|plugin|widget|route)\b/i,
  /\b(sql|query|database|schema|migration|orm)\b/i,
  /\b(regex|regular expression)\b/i,
  /\b(typescript|javascript|python|rust|go|java|c\+\+|c#|swift|kotlin|ruby|php|bash|shell)\b/i,
  /\b(unit test|integration test|test case|mock|stub|fixture|jest|vitest|pytest|cargo test)\b/i,
  /\b(algorithm|data structure|big.?o|complexity)\b/i,
  /\b(refactor|optimize|performance|memory leak|profil)\b/i,
  /\b(docker|kubernetes|container|deploy|ci.?cd|devops)\b/i,
  /[=><!]{2}|&&|\|\||\?\?/, // code operators
];

const REASONING: RegExp[] = [
  /\bstep.?by.?step\b/i,
  /\bthink (through|about|carefully)\b/i,
  /\banalyze\b/i,
  /\bprove (that|the|it)\b/i,
  /\b(calculate|compute|derive|evaluate)\b/i,
  /\b(equation|formula|theorem|lemma|proof)\b/i,
  /\b(logic|reasoning|argument|hypothesis|inference)\b/i,
  /\bwhy (does|is|are|do|did)\b/i,
  /\bexplain (why|how|the reason|the logic)\b/i,
  /\b(math|mathematics|calculus|linear algebra|statistics|probability|combinatorics)\b/i,
  /\b(solve|find the|what is the value of)\b/i,
  /\b(trade.?off|pros and cons|compare and contrast)\b/i,
  /\b(first principles|root cause|logical fallacy)\b/i,
];

const CREATIVE_WRITING: RegExp[] = [
  /\bwrite (a |an )?(short |long )?(story|poem|song|screenplay|script|narrative|novel|tale|fable|limerick|haiku|sonnet|essay|blog post|speech)\b/i,
  /\bcreative (writing|piece|story|content|work)\b/i,
  /\bfiction\b/i,
  /\b(plot|character arc|dialogue|narrative arc|world.?building|backstory)\b/i,
  /\b(protagonist|antagonist|villain|hero|setting|chapter)\b/i,
  /\bimagine (a |an |that |you('re| are))\b/i,
  /\bonce upon a time\b/i,
  /\bin (the style|the voice) of\b/i,
  /\bwrite me a\b/i,
  /\bcontinue (the |this |my )(story|narrative|poem|tale)\b/i,
];

// ---------------------------------------------------------------------------
// Slot map: task × tier → RoutingSlot
// ---------------------------------------------------------------------------

type Tier = 'economy' | 'balanced' | 'premium';

const SLOT_MAP: Record<ClassifiedTask, Record<Tier, RoutingSlot>> = {
  computer_use: {
    economy: 'computer_use',
    balanced: 'computer_use',
    premium: 'computer_use_premium',
  },
  image_generation: {
    economy: 'image_generation',
    balanced: 'image_generation',
    premium: 'image_generation',
  },
  video_generation: {
    economy: 'video_generation',
    balanced: 'video_generation',
    premium: 'video_generation',
  },
  deep_research: { economy: 'search_fast', balanced: 'search_premium', premium: 'search_premium' },
  search: { economy: 'search_fast', balanced: 'search_fast', premium: 'search_premium' },
  coding: { economy: 'coding_fast', balanced: 'coding_fast', premium: 'coding_premium' },
  reasoning: {
    economy: 'general_fast',
    balanced: 'general_balanced',
    premium: 'reasoning_premium',
  },
  vision: { economy: 'vision_fast', balanced: 'vision_fast', premium: 'vision_premium' },
  long_context: {
    economy: 'vision_premium',
    balanced: 'vision_premium',
    premium: 'vision_premium',
  },
  creative_writing: {
    economy: 'general_fast',
    balanced: 'creative_writing',
    premium: 'creative_writing_premium',
  },
  simple_chat: { economy: 'general_fast', balanced: 'general_fast', premium: 'general_balanced' },
  general: { economy: 'general_fast', balanced: 'general_balanced', premium: 'general_premium' },
};

const TASK_REASONS: Record<ClassifiedTask, string> = {
  computer_use: 'computer automation task',
  image_generation: 'image generation request',
  video_generation: 'video generation request',
  deep_research: 'in-depth research with citations',
  search: 'real-time web search required',
  coding: 'code generation task',
  reasoning: 'complex reasoning / analysis',
  vision: 'multimodal image input',
  long_context: 'long document analysis',
  creative_writing: 'creative writing task',
  simple_chat: 'quick conversational question',
  general: 'general purpose',
};

function autoModeToTier(autoModeId: string): Tier {
  if (autoModeId === 'auto-economy') return 'economy';
  if (autoModeId === 'auto-premium') return 'premium';
  return 'balanced';
}

// ---------------------------------------------------------------------------
// Classifier — pure function, zero I/O, sub-millisecond
// ---------------------------------------------------------------------------

export function classifyPrompt(
  content: string,
  options: ClassifyOptions = {},
): ClassificationResult {
  const { hasImageAttachment = false, autoModeId = 'auto-balanced' } = options;
  const tier = autoModeToTier(autoModeId);
  const tokens = estimateTokens(content);
  const signals: string[] = [];

  let match: string | null;

  // 1. Computer use — highest priority (user intent is unambiguous)
  if ((match = matchesAny(content, COMPUTER_USE))) {
    signals.push(`computer-use keyword: "${match}"`);
    return {
      task: 'computer_use',
      slot: SLOT_MAP.computer_use[tier],
      reason: TASK_REASONS.computer_use,
      signals,
    };
  }

  // 2. Image generation
  if ((match = matchesAny(content, IMAGE_GEN))) {
    signals.push(`image-gen keyword: "${match}"`);
    return {
      task: 'image_generation',
      slot: SLOT_MAP.image_generation[tier],
      reason: TASK_REASONS.image_generation,
      signals,
    };
  }

  // 3. Video generation
  if ((match = matchesAny(content, VIDEO_GEN))) {
    signals.push(`video-gen keyword: "${match}"`);
    return {
      task: 'video_generation',
      slot: SLOT_MAP.video_generation[tier],
      reason: TASK_REASONS.video_generation,
      signals,
    };
  }

  // 4. Deep research
  if ((match = matchesAny(content, DEEP_RESEARCH))) {
    signals.push(`deep-research keyword: "${match}"`);
    return {
      task: 'deep_research',
      slot: SLOT_MAP.deep_research[tier],
      reason: TASK_REASONS.deep_research,
      signals,
    };
  }

  // 5. Web search / real-time data
  if ((match = matchesAny(content, SEARCH))) {
    signals.push(`search keyword: "${match}"`);
    return { task: 'search', slot: SLOT_MAP.search[tier], reason: TASK_REASONS.search, signals };
  }

  // 6. Coding
  if ((match = matchesAny(content, CODING))) {
    signals.push(`coding keyword: "${match}"`);
    return { task: 'coding', slot: SLOT_MAP.coding[tier], reason: TASK_REASONS.coding, signals };
  }

  // 7. Reasoning / math
  if ((match = matchesAny(content, REASONING))) {
    signals.push(`reasoning keyword: "${match}"`);
    return {
      task: 'reasoning',
      slot: SLOT_MAP.reasoning[tier],
      reason: TASK_REASONS.reasoning,
      signals,
    };
  }

  // 8. Vision — image attachment (any prompt + image → vision model)
  if (hasImageAttachment) {
    signals.push('image attachment detected');
    return { task: 'vision', slot: SLOT_MAP.vision[tier], reason: TASK_REASONS.vision, signals };
  }

  // 9. Long context — very long prompt
  if (tokens > 2000) {
    signals.push(`long prompt (≈${tokens} tokens)`);
    return {
      task: 'long_context',
      slot: SLOT_MAP.long_context[tier],
      reason: TASK_REASONS.long_context,
      signals,
    };
  }

  // 10. Creative writing
  if ((match = matchesAny(content, CREATIVE_WRITING))) {
    signals.push(`creative-writing keyword: "${match}"`);
    return {
      task: 'creative_writing',
      slot: SLOT_MAP.creative_writing[tier],
      reason: TASK_REASONS.creative_writing,
      signals,
    };
  }

  // 11. Simple chat — short conversational message
  if (tokens < 40) {
    signals.push(`short prompt (≈${tokens} tokens)`);
    return {
      task: 'simple_chat',
      slot: SLOT_MAP.simple_chat[tier],
      reason: TASK_REASONS.simple_chat,
      signals,
    };
  }

  // 12. General fallback
  signals.push('no specific task signals detected');
  return { task: 'general', slot: SLOT_MAP.general[tier], reason: TASK_REASONS.general, signals };
}

// Map ClassifiedTask → RoutingTaskType for RoutingDecision
function toRoutingTaskType(task: ClassifiedTask): RoutingTaskType {
  switch (task) {
    case 'computer_use':
      return 'computer-use';
    case 'image_generation':
      return 'image_generation';
    case 'video_generation':
      return 'multimodal';
    case 'deep_research':
      return 'research';
    case 'search':
      return 'research';
    case 'coding':
      return 'coding';
    case 'reasoning':
      return 'reasoning';
    case 'vision':
      return 'multimodal';
    case 'long_context':
      return 'long_context';
    case 'creative_writing':
      return 'creative_writing';
    case 'simple_chat':
      return 'simple_chat';
    case 'general':
      return 'general';
  }
}

/** Human-readable label for routing decision badge in the UI. */
export const TASK_LABEL: Record<ClassifiedTask, string> = {
  computer_use: 'computer use',
  image_generation: 'image gen',
  video_generation: 'video gen',
  deep_research: 'deep research',
  search: 'web search',
  coding: 'coding',
  reasoning: 'reasoning',
  vision: 'vision',
  long_context: 'long doc',
  creative_writing: 'creative',
  simple_chat: 'chat',
  general: 'general',
};

/**
 * Classify a prompt and return a full RoutingDecision including the resolved
 * model ID. Call this when auto-mode is active, before sending to the runtime.
 */
export function buildRoutingDecision(
  content: string,
  options: ClassifyOptions = {},
): RoutingDecision & { task: ClassifiedTask } {
  const result = classifyPrompt(content, options);
  const routedModelId = getRoutingSlotModel(result.slot);
  return {
    routedModelId,
    taskType: toRoutingTaskType(result.task),
    reason: result.reason,
    wasRouted: true,
    timestamp: Date.now(),
    task: result.task,
  };
}
