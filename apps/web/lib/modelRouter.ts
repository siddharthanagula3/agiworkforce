import {
  getAllModels,
  getModelMetadata,
  normalizeModelId,
  type ModelMetadata,
} from '@/constants/llm';
import { resolveAutoModeModel } from '@agiworkforce/types';
import type { RoutingTaskType } from '@agiworkforce/types';

export type TaskType = RoutingTaskType;

type RoutingResult = {
  modelId: string;
  taskType: TaskType;
  reason: string;
  wasRouted: boolean;
};

type AutoMode = 'auto' | 'auto-economy' | 'auto-balanced' | 'auto-premium';

type Detection = {
  taskType: TaskType;
  needsSearch: boolean;
  needsToolSearch: boolean;
  needsComputerUse: boolean;
  needsAgentic: boolean;
  needsVision: boolean;
  longContext: boolean;
};

const AUTO_MODES = new Set<AutoMode>(['auto', 'auto-economy', 'auto-balanced', 'auto-premium']);
const CHAT_MODEL_TYPES = new Set(['chat', 'code', 'reasoning', 'multimodal']);
const QUALITY_ORDER: Record<string, number> = {
  fast: 0,
  balanced: 1,
  best: 2,
};

function getQualityOrder(qualityTier: string | null | undefined): number {
  if (!qualityTier) {
    return QUALITY_ORDER['best'] ?? 2;
  }

  return QUALITY_ORDER[qualityTier] ?? QUALITY_ORDER['best'] ?? 2;
}

function isChatCandidate(model: ModelMetadata): boolean {
  return CHAT_MODEL_TYPES.has(model.modelType) && !AUTO_MODES.has(model.id as AutoMode);
}

function isManualSelection(selectedModel: string): boolean {
  return !AUTO_MODES.has((selectedModel || 'auto') as AutoMode);
}

function detectRoutingNeeds(message: string, hasImages: boolean): Detection {
  const normalized = message.toLowerCase();

  const needsComputerUse =
    /\b(browse|browser|click|scroll|navigate|open the website|fill out|submit the form|computer use|desktop automation|web automation)\b/i.test(
      normalized,
    );
  const needsToolSearch =
    /\b(tool search|search tools|find tools|which tool should|available tools|best tool for|find an mcp tool|search for mcp|discover tools)\b/i.test(
      normalized,
    );
  const needsSearch =
    /\b(latest|today|current|news|recent|compare|research|find on the web|look up|web search|search the internet|what changed)\b/i.test(
      normalized,
    );
  const needsAgentic =
    /\b(agent|autonomous|orchestrate|coordinate|multi-step|workflow|use tools|tool use|mcp|browser extension)\b/i.test(
      normalized,
    );
  const needsVision =
    hasImages ||
    /\b(image|screenshot|photo|diagram|vision|look at this|analyze this picture|what is in this)\b/i.test(
      normalized,
    );
  const longContext =
    /\b(large codebase|entire repo|whole repository|all files|deep dive|audit everything|long context|many files|full project)\b/i.test(
      normalized,
    );

  let taskType: TaskType = 'general';

  if (needsComputerUse) {
    taskType = 'computer-use';
  } else if (
    /\b(code|debug|implement|refactor|typescript|javascript|python|rust|react|component|api|test|fix the bug|cli|repo)\b/i.test(
      normalized,
    )
  ) {
    taskType = 'coding';
  } else if (
    /\b(reason|reasoning|step by step|prove|logic|theorem|solve|hard problem|think through)\b/i.test(
      normalized,
    )
  ) {
    taskType = 'reasoning';
  } else if (needsSearch) {
    taskType = 'research';
  } else if (needsAgentic || needsToolSearch) {
    taskType = 'agentic';
  } else if (needsVision) {
    taskType = 'multimodal';
  }

  return {
    taskType,
    needsSearch,
    needsToolSearch,
    needsComputerUse,
    needsAgentic,
    needsVision,
    longContext,
  };
}

function allowedQuality(autoMode: AutoMode): number {
  switch (autoMode) {
    case 'auto-economy':
      return QUALITY_ORDER['fast'] ?? 0;
    case 'auto-premium':
      return QUALITY_ORDER['best'] ?? 2;
    case 'auto':
    case 'auto-balanced':
    default:
      return QUALITY_ORDER['balanced'] ?? 1;
  }
}

function satisfiesHardRequirements(model: ModelMetadata, detection: Detection): boolean {
  const caps = model.capabilities;

  if (detection.needsVision && !caps.vision) {
    return false;
  }

  if (detection.needsComputerUse && !caps.computerUse) {
    return false;
  }

  if (detection.needsSearch && !(caps.search || caps.research)) {
    return false;
  }

  if (
    detection.needsToolSearch &&
    !(caps.tools && caps.thinking && (caps.search || caps.research))
  ) {
    return false;
  }

  if (detection.needsAgentic && !caps.tools) {
    return false;
  }

  return true;
}

function baseCandidates(autoMode: AutoMode, detection: Detection): ModelMetadata[] {
  const maxQuality = allowedQuality(autoMode);
  const allCandidates = getAllModels()
    .filter(isChatCandidate)
    .filter((model) => getQualityOrder(model.qualityTier) <= maxQuality);
  const hardEligibleCandidates = allCandidates.filter((model) =>
    satisfiesHardRequirements(model, detection),
  );

  if (hardEligibleCandidates.length > 0) {
    return hardEligibleCandidates;
  }

  const expandedCandidates = getAllModels().filter(isChatCandidate);
  const expandedHardEligibleCandidates = expandedCandidates.filter((model) =>
    satisfiesHardRequirements(model, detection),
  );

  return expandedHardEligibleCandidates.length > 0
    ? expandedHardEligibleCandidates
    : expandedCandidates;
}

function scoreModel(model: ModelMetadata, detection: Detection, autoMode: AutoMode): number {
  let score = 0;
  const caps = model.capabilities;
  const bestFor = model.bestFor.join(' ').toLowerCase();

  if (detection.needsVision) {
    score += caps.vision ? 70 : -1000;
  }

  if (detection.needsComputerUse) {
    score += caps.computerUse ? 120 : -1000;
  }

  if (detection.needsSearch) {
    score += caps.search || caps.research ? 90 : -120;
  }

  if (detection.needsToolSearch) {
    score += caps.tools && caps.thinking && (caps.search || caps.research) ? 120 : -1000;
  }

  if (detection.needsAgentic) {
    score += caps.agentic ? 70 : 0;
    score += caps.tools ? 24 : -40;
  }

  if (detection.longContext && model.contextWindow >= 200_000) {
    score += 20;
  }

  switch (detection.taskType) {
    case 'coding':
      score += model.modelType === 'code' ? 45 : 0;
      score += caps.codeExecution ? 30 : 0;
      score += caps.tools ? 16 : 0;
      score += bestFor.includes('code') || bestFor.includes('coding') ? 20 : 0;
      break;
    case 'reasoning':
      score += model.modelType === 'reasoning' ? 40 : 0;
      score += caps.thinking ? 42 : 0;
      score += bestFor.includes('reason') || bestFor.includes('thinking') ? 18 : 0;
      break;
    case 'research':
      score += caps.search || caps.research ? 42 : 0;
      score += bestFor.includes('research') ? 16 : 0;
      break;
    case 'agentic':
      score += caps.agentic ? 40 : 0;
      score += caps.tools ? 18 : 0;
      score += bestFor.includes('tool') || bestFor.includes('agent') ? 16 : 0;
      break;
    case 'computer-use':
      score += caps.computerUse ? 42 : 0;
      score += caps.agentic ? 12 : 0;
      break;
    case 'multimodal':
      score += caps.vision ? 44 : 0;
      score += model.modelType === 'multimodal' ? 16 : 0;
      break;
    case 'general':
    default:
      score += model.qualityTier === 'balanced' ? 16 : 0;
      score += model.qualityTier === 'best' && autoMode === 'auto-premium' ? 22 : 0;
      break;
  }

  const qualityScore =
    model.qualityTier === 'best' ? 24 : model.qualityTier === 'balanced' ? 16 : 8;
  score += qualityScore;

  if (autoMode === 'auto-economy') {
    score -= (model.inputCost + model.outputCost) * 4;
  } else if (autoMode === 'auto-balanced') {
    score -= (model.inputCost + model.outputCost) * 1.5;
  }

  return score;
}

function humanizeTask(taskType: TaskType): string {
  switch (taskType) {
    case 'computer-use':
      return 'browser/computer use';
    case 'multimodal':
      return 'vision';
    default:
      return taskType;
  }
}

function selectModel(autoMode: AutoMode, message: string, hasImages: boolean): RoutingResult {
  const detection = detectRoutingNeeds(message, hasImages);
  const candidates = baseCandidates(autoMode, detection);

  const ranked = candidates
    .map((model) => ({
      model,
      score: scoreModel(model, detection, autoMode),
    }))
    .sort((left, right) => right.score - left.score);

  const winner = ranked[0]?.model;

  if (!winner) {
    return {
      modelId: resolveAutoModeModel(autoMode) ?? 'auto-economy',
      taskType: detection.taskType,
      reason: `No eligible ${humanizeTask(detection.taskType)} model found. Falling back safely.`,
      wasRouted: true,
    };
  }

  const reasonParts = [`${humanizeTask(detection.taskType)} task`];
  if (detection.needsSearch) reasonParts.push('fresh web access');
  if (detection.needsToolSearch) reasonParts.push('tool discovery');
  if (detection.needsComputerUse) reasonParts.push('computer use');
  if (detection.needsVision) reasonParts.push('vision support');
  if (detection.needsAgentic) reasonParts.push('tool orchestration');
  if (winner.capabilities.thinking && detection.taskType === 'reasoning') {
    reasonParts.push('extended thinking');
  }

  return {
    modelId: winner.id,
    taskType: detection.taskType,
    reason: `Auto routed to ${winner.name} for ${reasonParts.join(' + ')}.`,
    wasRouted: true,
  };
}

export function getModelForRequest(
  selectedModel: string,
  message: string,
  hasImages: boolean = false,
): RoutingResult {
  if (isManualSelection(selectedModel)) {
    const canonicalModelId = normalizeModelId(selectedModel) ?? selectedModel;
    const metadata = getModelMetadata(canonicalModelId);
    return {
      modelId: canonicalModelId,
      taskType: 'general',
      reason: `Manual selection: ${metadata?.name ?? canonicalModelId}`,
      wasRouted: false,
    };
  }

  const autoMode = AUTO_MODES.has((selectedModel || 'auto') as AutoMode)
    ? ((selectedModel || 'auto') as AutoMode)
    : 'auto-balanced';

  return selectModel(autoMode, message, hasImages);
}
