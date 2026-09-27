import {
  chargeMicrousdForProviderCost,
  resolveFeatureRate,
  type RateCardFeature,
} from '@agiworkforce/types';

import { resolveTurnCodeExecutionTools, type TurnCodeExecutionInput } from './execution-tools';

export type HostedCodeExecutionProvider = 'anthropic' | 'openai';

export function hostedCodeExecutionProviderOf(
  provider: string,
): HostedCodeExecutionProvider | null {
  return Object.hasOwn(FEATURE_BY_PROVIDER, provider)
    ? (provider as HostedCodeExecutionProvider)
    : null;
}

export interface HostedCodeExecutionPriceInput {
  provider: HostedCodeExecutionProvider;
  usage: unknown;
  container: unknown;
  requestHadWebSearchOrFetch: boolean;
  elapsedMs?: number;
}

export interface HostedCodeExecutionPrice {
  microusd: number;
  sessions: number;
  containerMs: number;
}

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const OPENAI_SESSION_MS = 20 * MS_PER_MINUTE;
const ANTHROPIC_MINIMUM_BILLED_MS = 5 * MS_PER_MINUTE;
const ANTHROPIC_CODE_EXECUTION_TOOL = /^code_execution_\d{8}$/;
const OPENAI_CODE_INTERPRETER_TOOL = 'code_interpreter';
const OPENAI_CODE_INTERPRETER_CALL = 'code_interpreter_call';
const MAX_SCAN_NODES = 5_000;

const FEATURE_BY_PROVIDER: Readonly<Record<HostedCodeExecutionProvider, RateCardFeature>> = {
  openai: 'hosted_code_execution_openai_session',
  anthropic: 'hosted_code_execution_anthropic_hour',
};

const NO_HOSTED_CODE_EXECUTION: HostedCodeExecutionPrice = {
  microusd: 0,
  sessions: 0,
  containerMs: 0,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function containerIds(container: unknown): Set<string> {
  const ids = new Set<string>();
  const addContainerObject = (value: unknown): void => {
    const node = asRecord(value);
    const id = nonEmptyString(node?.['id']);
    if (id && nonEmptyString(node?.['expires_at'])) ids.add(id);
  };
  const direct = nonEmptyString(container);
  if (direct) ids.add(direct);
  addContainerObject(container);
  let visited = 0;
  const visit = (value: unknown, topLevel: boolean): void => {
    if (visited++ > MAX_SCAN_NODES) return;
    if (Array.isArray(value)) {
      for (const item of value) {
        const id = topLevel ? nonEmptyString(item) : null;
        if (id) ids.add(id);
        else visit(item, false);
      }
      return;
    }
    const node = asRecord(value);
    if (!node) return;
    const callContainerId = nonEmptyString(node['container_id']);
    if (node['type'] === OPENAI_CODE_INTERPRETER_CALL && callContainerId) {
      ids.add(callContainerId);
    }
    addContainerObject(node['container']);
    for (const child of Object.values(node)) visit(child, false);
  };
  visit(container, true);
  return ids;
}

function codeExecutionRequests(usage: unknown): number {
  const counted = asRecord(asRecord(usage)?.['server_tool_use'])?.['code_execution_requests'];
  return typeof counted === 'number' && Number.isFinite(counted) && counted > 0 ? counted : 0;
}

function billedContainerMs(
  provider: HostedCodeExecutionProvider,
  containers: number,
  elapsedMs: number,
): { sessions: number; containerMs: number } {
  if (provider === 'openai') {
    const sessions = containers * Math.max(1, Math.ceil(elapsedMs / OPENAI_SESSION_MS));
    return { sessions, containerMs: sessions * OPENAI_SESSION_MS };
  }
  return {
    sessions: containers,
    containerMs: containers * Math.max(ANTHROPIC_MINIMUM_BILLED_MS, elapsedMs),
  };
}

function providerCostMicrousd(
  provider: HostedCodeExecutionProvider,
  sessions: number,
  containerMs: number,
): number {
  const rate = resolveFeatureRate(FEATURE_BY_PROVIDER[provider]).providerCogsMicrousd ?? 0;
  const units = provider === 'openai' ? sessions : containerMs / MS_PER_HOUR;
  return Math.ceil(units * rate);
}

export function priceHostedCodeExecution(
  input: HostedCodeExecutionPriceInput,
): HostedCodeExecutionPrice {
  if (input.provider === 'anthropic' && input.requestHadWebSearchOrFetch) {
    return NO_HOSTED_CODE_EXECUTION;
  }
  const seen = containerIds(input.container).size;
  const containers =
    seen > 0
      ? seen
      : input.provider === 'anthropic' && codeExecutionRequests(input.usage) > 0
        ? 1
        : 0;
  if (containers === 0) return NO_HOSTED_CODE_EXECUTION;
  const elapsedMs = Math.max(0, input.elapsedMs ?? 0);
  const { sessions, containerMs } = billedContainerMs(input.provider, containers, elapsedMs);
  return {
    microusd: providerCostMicrousd(input.provider, sessions, containerMs),
    sessions,
    containerMs,
  };
}

function isHostedCodeExecutionTool(tool: unknown): boolean {
  const type = asRecord(tool)?.['type'];
  return (
    typeof type === 'string' &&
    (type === OPENAI_CODE_INTERPRETER_TOOL || ANTHROPIC_CODE_EXECUTION_TOOL.test(type))
  );
}

export function hostedCodeExecutionReserveMicrousd(input: TurnCodeExecutionInput): number {
  const provider = input.provider.trim().toLowerCase();
  if (provider !== 'openai' && provider !== 'anthropic') return 0;
  if (!resolveTurnCodeExecutionTools(input).tools.some(isHostedCodeExecutionTool)) return 0;
  const { sessions, containerMs } = billedContainerMs(provider, 1, 0);
  return chargeMicrousdForProviderCost(providerCostMicrousd(provider, sessions, containerMs));
}
