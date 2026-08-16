import type { Agent } from '@/stores/agentStore';

export const MAX_AGENT_NAME_LEN = 200;
export const MAX_AGENT_STRING_LEN = 4_000;
export const MAX_AGENTS_PER_UPDATE = 50;

const VALID_AGENT_STATUSES = new Set(['running', 'completed', 'failed', 'waiting']);

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function parseAgent(raw: unknown): Agent | null {
  if (!isObject(raw)) return null;

  const id = raw['id'];
  const name = raw['name'];
  const model = raw['model'];
  const status = raw['status'];
  const currentStep = raw['currentStep'];
  const progress = raw['progress'];
  const startedAt = raw['startedAt'];
  const updatedAt = raw['updatedAt'];

  if (!isString(id) || id.length === 0 || id.length > MAX_AGENT_STRING_LEN) return null;
  if (!isString(name) || name.length === 0 || name.length > MAX_AGENT_NAME_LEN) return null;
  if (!isString(model) || model.length === 0 || model.length > MAX_AGENT_STRING_LEN) return null;
  if (!isString(status) || !VALID_AGENT_STATUSES.has(status)) return null;
  if (!isString(currentStep) || currentStep.length > MAX_AGENT_STRING_LEN) return null;
  if (!isNumber(progress) || progress < 0 || progress > 100) return null;
  if (!isString(startedAt) || startedAt.length === 0) return null;
  if (!isString(updatedAt) || updatedAt.length === 0) return null;

  const currentAction = raw['currentAction'];
  const totalSteps = raw['totalSteps'];
  const stepsCompleted = raw['stepsCompleted'];
  const steps = raw['steps'];
  const toolCalls = raw['toolCalls'];
  const artifacts = raw['artifacts'];

  if (
    currentAction !== undefined &&
    (!isString(currentAction) || currentAction.length > MAX_AGENT_STRING_LEN)
  ) {
    return null;
  }
  if (totalSteps !== undefined && (!isNumber(totalSteps) || totalSteps < 0)) return null;
  if (stepsCompleted !== undefined && (!isNumber(stepsCompleted) || stepsCompleted < 0)) {
    return null;
  }

  const safeSteps = Array.isArray(steps) ? steps.filter(isObject) : [];
  const safeToolCalls = Array.isArray(toolCalls) ? toolCalls.filter(isObject) : [];
  const safeArtifacts =
    artifacts !== undefined && Array.isArray(artifacts) ? artifacts.filter(isObject) : undefined;

  const agent: Agent = {
    id,
    name,
    model,
    status: status as Agent['status'],
    currentStep,
    progress,
    startedAt,
    updatedAt,
    steps: safeSteps as unknown as Agent['steps'],
    toolCalls: safeToolCalls as unknown as Agent['toolCalls'],
  };
  if (currentAction !== undefined) agent.currentAction = currentAction;
  if (totalSteps !== undefined) agent.totalSteps = totalSteps;
  if (stepsCompleted !== undefined) agent.stepsCompleted = stepsCompleted;
  if (safeArtifacts !== undefined) {
    agent.artifacts = safeArtifacts as unknown as Agent['artifacts'];
  }

  return agent;
}
