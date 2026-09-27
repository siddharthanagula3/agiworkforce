import {
  chargeMicrousdForProviderCost,
  resolveFeatureRate,
  type RateCardFeature,
} from '@agiworkforce/types';

import { resolveTurnCodeExecutionTools, type TurnCodeExecutionInput } from './execution-tools';

const SECONDS_PER_HOUR = 3_600;
const OPENAI_SESSION_SECONDS = 20 * 60;
const ANTHROPIC_MINIMUM_BILLED_SECONDS = 5 * 60;
const ANTHROPIC_FREE_WEB_TOOL = /^web_(?:search|fetch)_(\d{8})$/;
const ANTHROPIC_FREE_WEB_TOOL_FROM = 20_260_209;
const ANTHROPIC_CODE_EXECUTION_TOOL = /^code_execution_\d{8}$/;
const OPENAI_CODE_INTERPRETER_TOOL = 'code_interpreter';
const OPENAI_CODE_INTERPRETER_CALL = 'code_interpreter_call';
const MAX_SCAN_NODES = 5_000;

const FEATURE_BY_PROVIDER = {
  openai: 'hosted_code_execution_openai_session',
  anthropic: 'hosted_code_execution_anthropic_hour',
} as const satisfies Record<string, RateCardFeature>;

type HostedProvider = keyof typeof FEATURE_BY_PROVIDER;

export interface HostedCodeExecutionTrace {
  readonly containerIds: readonly string[];
  readonly codeExecutionRequests: number;
}

export interface HostedCodeExecutionCharge {
  readonly feature: RateCardFeature;
  readonly containers: number;
  readonly billedUnits: number;
  readonly providerCostMicrousd: number;
  readonly chargeMicrousd: number;
}

export const EMPTY_HOSTED_CODE_EXECUTION_TRACE: HostedCodeExecutionTrace = {
  containerIds: [],
  codeExecutionRequests: 0,
};

function hostedProvider(provider: string): HostedProvider | null {
  const normalized = provider.trim().toLowerCase();
  return normalized === 'openai' || normalized === 'anthropic' ? normalized : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toolType(tool: unknown): string | null {
  const type = asRecord(tool)?.['type'];
  return typeof type === 'string' ? type : null;
}

export function isHostedCodeExecutionTool(tool: unknown): boolean {
  const type = toolType(tool);
  return (
    type !== null &&
    (type === OPENAI_CODE_INTERPRETER_TOOL || ANTHROPIC_CODE_EXECUTION_TOOL.test(type))
  );
}

function anthropicCodeExecutionIsFree(requestTools: readonly unknown[]): boolean {
  return requestTools.some((tool) => {
    const match = ANTHROPIC_FREE_WEB_TOOL.exec(toolType(tool) ?? '');
    return match !== null && Number(match[1]) >= ANTHROPIC_FREE_WEB_TOOL_FROM;
  });
}

export function traceHostedCodeExecution(
  trace: HostedCodeExecutionTrace,
  payload: unknown,
): HostedCodeExecutionTrace {
  const containers = new Set(trace.containerIds);
  let requests = trace.codeExecutionRequests;
  let visited = 0;
  const visit = (value: unknown): void => {
    if (visited++ > MAX_SCAN_NODES) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const node = asRecord(value);
    if (!node) return;
    const callContainerId = node['container_id'];
    if (node['type'] === OPENAI_CODE_INTERPRETER_CALL && typeof callContainerId === 'string') {
      containers.add(callContainerId);
    }
    const container = asRecord(node['container']);
    const containerId = container?.['id'];
    if (typeof containerId === 'string' && typeof container?.['expires_at'] === 'string') {
      containers.add(containerId);
    }
    const counted = asRecord(node['server_tool_use'])?.['code_execution_requests'];
    if (typeof counted === 'number' && Number.isFinite(counted) && counted > requests) {
      requests = counted;
    }
    Object.values(node).forEach(visit);
  };
  visit(payload);
  return { containerIds: [...containers], codeExecutionRequests: requests };
}

function hostedCost(
  provider: HostedProvider,
  containers: number,
  elapsedSeconds: number,
): { billedUnits: number; providerCostMicrousd: number } {
  const rate = resolveFeatureRate(FEATURE_BY_PROVIDER[provider]).providerCogsMicrousd ?? 0;
  const billedUnits =
    provider === 'openai'
      ? containers * Math.max(1, Math.ceil(elapsedSeconds / OPENAI_SESSION_SECONDS))
      : (containers * Math.max(ANTHROPIC_MINIMUM_BILLED_SECONDS, elapsedSeconds)) /
        SECONDS_PER_HOUR;
  return { billedUnits, providerCostMicrousd: Math.ceil(billedUnits * rate) };
}

export function priceHostedCodeExecution(input: {
  provider: string;
  requestTools: readonly unknown[];
  trace: HostedCodeExecutionTrace;
  elapsedMs: number;
}): HostedCodeExecutionCharge | null {
  const provider = hostedProvider(input.provider);
  if (!provider) return null;
  const containers =
    input.trace.containerIds.length > 0
      ? input.trace.containerIds.length
      : input.trace.codeExecutionRequests > 0
        ? 1
        : 0;
  if (containers === 0) return null;
  if (provider === 'anthropic' && anthropicCodeExecutionIsFree(input.requestTools)) return null;
  const elapsedSeconds = Math.max(0, input.elapsedMs) / 1_000;
  const { billedUnits, providerCostMicrousd } = hostedCost(provider, containers, elapsedSeconds);
  return {
    feature: FEATURE_BY_PROVIDER[provider],
    containers,
    billedUnits,
    providerCostMicrousd,
    chargeMicrousd: chargeMicrousdForProviderCost(providerCostMicrousd),
  };
}

export function hostedCodeExecutionReserveMicrousd(input: TurnCodeExecutionInput): number {
  const provider = hostedProvider(input.provider);
  if (!provider) return 0;
  if (!resolveTurnCodeExecutionTools(input).tools.some(isHostedCodeExecutionTool)) return 0;
  return chargeMicrousdForProviderCost(hostedCost(provider, 1, 0).providerCostMicrousd);
}
