import 'server-only';

import type { ModelMetadata } from '@agiworkforce/types';
import { appendWebSearchTool } from '@/app/api/llm/v1/chat/completions/lib/request-processor';
import { resolveCodeExecutionTools } from '@/lib/e2b/execution-tools';

/**
 * The tools a live voice session's delegated backend model may run.
 *
 * A live session delegates to a provider-hosted `responses` turn. That turn
 * runs inside the provider: there is no stream back through our route, so no
 * step of ours sits between the model and a tool call. Every tool the chat
 * completions route offers therefore falls into one of two classes.
 *
 * Provider-hosted tools run: the provider executes them and folds the result
 * into the same turn, which is why the shapes are taken from the resolvers the
 * completions route uses rather than written out again here. A shape that
 * drifts from those does not degrade, it fails the whole session, as
 * `code_interpreter` without its `container` already did on the chat path.
 *
 * Function tools do not, and `LIVE_VOICE_TOOL_REGISTRY` records why for each,
 * because every one of them needs a step this session does not have.
 *
 * The turn is billed to the live session's own reservation, so a hosted tool
 * costs what it costs inside that block; no separate budget is opened here,
 * and none is bypassed.
 */

export type LiveVoiceToolClass = 'hosted' | 'function';
export type LiveVoiceToolRisk = 'read' | 'compute' | 'write';

export interface LiveVoiceToolCapability {
  id: string;
  label: string;
  toolClass: LiveVoiceToolClass;
  risk: LiveVoiceToolRisk;
  /** Reachable from a voice turn. A false here always carries a reason. */
  reachable: boolean;
  /** Why an unreachable tool is unreachable, or how a reachable one is bounded. */
  reason: string;
  /** How long the voice UI waits before offering to cancel the call. */
  timeoutMs: number;
  requiresApproval: boolean;
}

const DEFAULT_TOOL_TIMEOUT_MS = 20_000;
const LONG_TOOL_TIMEOUT_MS = 45_000;

export const LIVE_VOICE_TOOL_REGISTRY: readonly LiveVoiceToolCapability[] = [
  {
    id: 'web_search',
    label: 'Searching the web',
    toolClass: 'hosted',
    risk: 'read',
    reachable: true,
    reason: 'the provider runs it inside the delegated turn and folds the result back in',
    timeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
    requiresApproval: false,
  },
  {
    id: 'web_search_preview',
    label: 'Searching the web',
    toolClass: 'hosted',
    risk: 'read',
    reachable: true,
    reason: 'the provider runs it inside the delegated turn and folds the result back in',
    timeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
    requiresApproval: false,
  },
  {
    id: 'code_interpreter',
    label: 'Running code',
    toolClass: 'hosted',
    risk: 'compute',
    reachable: true,
    reason: 'the provider owns the container, so no workspace of ours is opened by a voice turn',
    timeoutMs: LONG_TOOL_TIMEOUT_MS,
    requiresApproval: false,
  },
  {
    id: 'url_fetch',
    label: 'Fetching a page',
    toolClass: 'function',
    risk: 'read',
    reachable: false,
    reason: 'executed by our egress-guarded fetcher, which the delegation cannot call',
    timeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
    requiresApproval: false,
  },
  {
    id: 'web_search_fallback',
    label: 'Searching the web',
    toolClass: 'function',
    risk: 'read',
    reachable: false,
    reason: 'executed by our search backend, which the delegation cannot call',
    timeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
    requiresApproval: false,
  },
  {
    id: 'run_code',
    label: 'Running code',
    toolClass: 'function',
    risk: 'compute',
    reachable: false,
    reason: 'needs the sandbox executor and its per-turn workspace',
    timeoutMs: LONG_TOOL_TIMEOUT_MS,
    requiresApproval: false,
  },
  {
    id: 'write_file',
    label: 'Writing a file',
    toolClass: 'function',
    risk: 'write',
    reachable: false,
    reason: 'needs the sandbox executor and its per-turn workspace',
    timeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
    requiresApproval: true,
  },
  {
    id: 'read_file',
    label: 'Reading a file',
    toolClass: 'function',
    risk: 'read',
    reachable: false,
    reason: 'needs the sandbox executor and its per-turn workspace',
    timeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
    requiresApproval: false,
  },
  {
    id: 'agi_work',
    label: 'Working on a task',
    toolClass: 'function',
    risk: 'write',
    reachable: false,
    reason:
      'a multi-turn plan with approval checkpoints, and the provider-side delegation has no callback into the tool loop that could pause for one',
    timeoutMs: LONG_TOOL_TIMEOUT_MS,
    requiresApproval: true,
  },
  {
    id: 'connectors',
    label: 'Using a connector',
    toolClass: 'function',
    risk: 'write',
    reachable: false,
    reason: 'per-call approval is evaluated by the tool loop, which is not in this path',
    timeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
    requiresApproval: true,
  },
] as const;

export const LIVE_VOICE_EXCLUDED_TOOLS: Readonly<Record<string, string>> = Object.fromEntries(
  LIVE_VOICE_TOOL_REGISTRY.filter((tool) => !tool.reachable).map((tool) => [tool.id, tool.reason]),
);

export function findLiveVoiceTool(toolId: string): LiveVoiceToolCapability | null {
  return LIVE_VOICE_TOOL_REGISTRY.find((tool) => tool.id === toolId) ?? null;
}

export interface LiveVoiceToolDescriptor {
  id: string;
  label: string;
  timeoutMs: number;
  requiresApproval: boolean;
}

export function describeLiveVoiceTool(toolId: string): LiveVoiceToolDescriptor {
  const tool = findLiveVoiceTool(toolId);
  return {
    id: toolId,
    label: tool?.label ?? 'Working on it',
    timeoutMs: tool?.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS,
    requiresApproval: tool?.requiresApproval ?? false,
  };
}

/** What the session response hands the client, so the registry has one home. */
export function describeLiveVoiceTools(toolIds: readonly string[]): LiveVoiceToolDescriptor[] {
  return toolIds.map(describeLiveVoiceTool);
}

export function describeDelegationTools(tools: readonly unknown[]): string[] {
  const names: string[] = [];
  for (const tool of tools) {
    if (typeof tool !== 'object' || tool === null) continue;
    const record = tool as Record<string, unknown>;
    const name = record['name'] ?? record['type'];
    if (typeof name === 'string' && !names.includes(name)) names.push(name);
  }
  return names;
}

export function resolveLiveVoiceDelegationTools(backendModel: ModelMetadata): unknown[] {
  const provider = String(backendModel.provider).toLowerCase();
  const capabilities = backendModel.capabilities;
  if (capabilities?.tools === false) return [];

  const tools = appendWebSearchTool(provider, undefined, capabilities) ?? [];
  return capabilities?.codeExecution === true
    ? [...tools, ...resolveCodeExecutionTools(provider)]
    : tools;
}
