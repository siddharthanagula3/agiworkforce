import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  canUseBillingPlanCapability,
  getTierPolicy,
  normalizeBillingPlanTier,
  type ModelMetadata,
} from '@agiworkforce/types';
import {
  LIVE_VOICE_WORK_TASK_TOOL,
  MAX_AGIWORK_GOAL_CHARS,
  type LiveVoiceClientHandoff,
} from '@agiworkforce/cloud-contracts';
import { loadConnectorToolPermissions } from '@/app/api/llm/v1/chat/completions/lib/connector-tool-permissions';
import { appendWebSearchTool } from '@/app/api/llm/v1/chat/completions/lib/request-processor';
import { loadMcpToolDefs } from '@/app/api/llm/v1/chat/completions/lib/tool-loop';
import { policyAutoApprovesTool } from '@/app/api/llm/v1/chat/completions/lib/tool-metadata';
import {
  CREATE_FOLDER_TOOL,
  e2bExecutionToolDefs,
  EDIT_FILE_TOOL,
  EXECUTE_CODE_TOOL,
  LIST_FILES_TOOL,
  READ_FILE_TOOL,
  resolveCodeExecutionTools,
  WRITE_FILE_TOOL,
} from '@/lib/e2b/execution-tools';
import { e2bProvisioningReady } from '@/lib/e2b/gate';
import { e2bChatTemplate } from '@/lib/e2b/chat-template';
import { parseQualifiedToolName } from '@/lib/mcp-tool-executor';
import { getCustomRemoteMcpLimit } from '@/lib/services/free-plan-entitlements';
import {
  createManagedOfficeFileToolDefinition,
  MANAGED_OFFICE_FILE_TOOL_NAME,
} from '@/lib/services/managed-office-file-service';
import { URL_FETCH_TOOL, urlFetchToolDef } from '@/lib/url-fetch/url-fetch-tool';
import { loadUserConnectorToolCatalog } from '@/lib/user-connector-tools';
import { WEB_SEARCH_TOOL } from '@/lib/web-search/web-search-tool';
import {
  toolApprovalPolicyOption,
  type ToolApprovalPolicy,
} from '@shared/types/toolApprovalPolicy';

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
  policyTool?: string;
}

const DEFAULT_TOOL_TIMEOUT_MS = 20_000;
const LONG_TOOL_TIMEOUT_MS = 45_000;
const SANDBOX_TOOL_REASON =
  "the voice client hands the call to our tool route, which runs it in the conversation's sandbox behind the chat approval gate";

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
    policyTool: WEB_SEARCH_TOOL,
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
    policyTool: WEB_SEARCH_TOOL,
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
    policyTool: EXECUTE_CODE_TOOL,
  },
  {
    id: 'url_fetch',
    label: 'Fetching a page',
    toolClass: 'function',
    risk: 'read',
    reachable: true,
    reason:
      'the voice client hands the call to our tool route, which runs the egress-guarded fetcher behind the chat approval gate',
    timeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
    requiresApproval: false,
    policyTool: URL_FETCH_TOOL,
  },
  {
    id: MANAGED_OFFICE_FILE_TOOL_NAME,
    label: 'Creating a file',
    toolClass: 'function',
    risk: 'write',
    reachable: true,
    reason:
      'the voice client hands the call to our tool route, which creates the file in the Library behind the chat approval gate',
    timeoutMs: LONG_TOOL_TIMEOUT_MS,
    requiresApproval: true,
    policyTool: MANAGED_OFFICE_FILE_TOOL_NAME,
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
    id: EXECUTE_CODE_TOOL,
    label: 'Running code',
    toolClass: 'function',
    risk: 'compute',
    reachable: true,
    reason: SANDBOX_TOOL_REASON,
    timeoutMs: LONG_TOOL_TIMEOUT_MS,
    requiresApproval: false,
    policyTool: EXECUTE_CODE_TOOL,
  },
  {
    id: WRITE_FILE_TOOL,
    label: 'Writing a file',
    toolClass: 'function',
    risk: 'write',
    reachable: true,
    reason: SANDBOX_TOOL_REASON,
    timeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
    requiresApproval: true,
    policyTool: WRITE_FILE_TOOL,
  },
  {
    id: EDIT_FILE_TOOL,
    label: 'Editing a file',
    toolClass: 'function',
    risk: 'write',
    reachable: true,
    reason: SANDBOX_TOOL_REASON,
    timeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
    requiresApproval: true,
    policyTool: EDIT_FILE_TOOL,
  },
  {
    id: CREATE_FOLDER_TOOL,
    label: 'Creating a folder',
    toolClass: 'function',
    risk: 'write',
    reachable: true,
    reason: SANDBOX_TOOL_REASON,
    timeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
    requiresApproval: true,
    policyTool: CREATE_FOLDER_TOOL,
  },
  {
    id: READ_FILE_TOOL,
    label: 'Reading a file',
    toolClass: 'function',
    risk: 'read',
    reachable: true,
    reason: SANDBOX_TOOL_REASON,
    timeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
    requiresApproval: false,
    policyTool: READ_FILE_TOOL,
  },
  {
    id: LIST_FILES_TOOL,
    label: 'Listing files',
    toolClass: 'function',
    risk: 'read',
    reachable: true,
    reason: SANDBOX_TOOL_REASON,
    timeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
    requiresApproval: false,
    policyTool: LIST_FILES_TOOL,
  },
  {
    id: LIVE_VOICE_WORK_TASK_TOOL,
    label: 'Starting a task',
    toolClass: 'function',
    risk: 'write',
    reachable: true,
    reason:
      'the voice client hands the goal to the chat as an AGI Work turn, which starts the durable run, tracks it in Tasks and stops there for any approval its plan needs',
    timeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
    requiresApproval: true,
    policyTool: LIVE_VOICE_WORK_TASK_TOOL,
  },
  {
    id: 'connectors',
    label: 'Using a connector',
    toolClass: 'function',
    risk: 'write',
    reachable: true,
    reason:
      'the voice client hands each call to our tool route, which applies the chat approval gate and shows any approval on screen',
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
  const tool =
    findLiveVoiceTool(toolId) ??
    (parseQualifiedToolName(toolId) ? findLiveVoiceTool('connectors') : null);
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

export interface LiveVoiceDelegationTools {
  tools: unknown[];
  withheld: LiveVoiceToolCapability[];
}

export function resolveLiveVoiceDelegationTools(
  backendModel: ModelMetadata,
  toolApprovalPolicy: ToolApprovalPolicy,
  options: { hostedSearch: boolean } = { hostedSearch: true },
): LiveVoiceDelegationTools {
  const provider = String(backendModel.provider).toLowerCase();
  const capabilities = backendModel.capabilities;
  if (capabilities?.tools === false) return { tools: [], withheld: [] };

  const hosted = [
    ...(options.hostedSearch ? (appendWebSearchTool(provider, undefined, capabilities) ?? []) : []),
    ...(capabilities?.codeExecution === true && !e2bProvisioningReady()
      ? resolveCodeExecutionTools(provider)
      : []),
  ];
  const tools: unknown[] = [];
  const withheld: LiveVoiceToolCapability[] = [];
  for (const tool of hosted) {
    const id = describeDelegationTools([tool])[0] ?? '';
    const capability = findLiveVoiceTool(id);
    if (policyAutoApprovesTool(toolApprovalPolicy, capability?.policyTool ?? id)) {
      tools.push(tool);
    } else if (capability) {
      withheld.push(capability);
    }
  }
  return { tools, withheld };
}

const DELEGATION_FUNCTION_NAME = /^[a-zA-Z0-9_-]{1,64}$/;

interface ChatFunctionTool {
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface LiveVoiceFunctionTools {
  tools: Record<string, unknown>[];
  names: string[];
}

function delegationFunctionTool(
  name: string,
  description: string,
  parameters: Record<string, unknown>,
): Record<string, unknown> {
  return { type: 'function', name, description, parameters, strict: false };
}

function liveVoiceWorkTaskToolDef(): ChatFunctionTool {
  return {
    function: {
      name: LIVE_VOICE_WORK_TASK_TOOL,
      description:
        'Start an AGI Work task: a longer piece of work that runs in the background with a plan, ' +
        'is tracked in Tasks and keeps going after this voice session ends. Use it when the user ' +
        'asks for work that takes many steps, such as research, a report or a multi-step job. ' +
        "Pass the goal in the user's words, with every detail they gave.",
      parameters: {
        type: 'object',
        properties: {
          goal: {
            type: 'string',
            maxLength: MAX_AGIWORK_GOAL_CHARS,
            description: 'What the task should achieve, with the details the user gave.',
          },
        },
        required: ['goal'],
        additionalProperties: false,
      },
    },
  };
}

export async function resolveLiveVoiceFunctionTools(input: {
  db: DatabaseAdapter;
  userId: string;
  organizationId: string | null;
  planTier: string | null;
  backendModel: ModelMetadata;
  connectorsAllowed: boolean;
  clientHandoffs: readonly LiveVoiceClientHandoff[];
}): Promise<LiveVoiceFunctionTools> {
  const tierPolicy = getTierPolicy(input.planTier);
  if (input.backendModel.capabilities?.tools === false || tierPolicy.allowToolUse === false) {
    return { tools: [], names: [] };
  }
  const permissions = await loadConnectorToolPermissions(
    input.db,
    input.userId,
    input.organizationId,
  );
  const [operatorTools, connectorCatalog] = !input.connectorsAllowed
    ? [[], { tools: [] }]
    : await Promise.all([
        loadMcpToolDefs(),
        loadUserConnectorToolCatalog(input.userId, {
          customConnectorLimit: getCustomRemoteMcpLimit(input.planTier) ?? undefined,
          planTier: input.planTier,
          organizationId: input.organizationId,
          isToolDenied: permissions.isConnectorToolDenied,
        }),
      ]);
  const productTools: ChatFunctionTool[] = [
    ...(tierPolicy.allowSearch ? [urlFetchToolDef()] : []),
    createManagedOfficeFileToolDefinition(),
    ...(input.clientHandoffs.includes(LIVE_VOICE_WORK_TASK_TOOL) &&
    canUseBillingPlanCapability(normalizeBillingPlanTier(input.planTier), 'agi_work')
      ? [liveVoiceWorkTaskToolDef()]
      : []),
    ...(e2bProvisioningReady()
      ? e2bExecutionToolDefs({ officeRendering: e2bChatTemplate() !== null })
      : []),
  ];
  const candidates = [
    ...productTools.map((tool) => ({
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
    })),
    ...[...operatorTools, ...connectorCatalog.tools].map((tool) => ({
      name: tool.qualifiedName,
      description: tool.description,
      parameters: tool.inputSchema,
    })),
  ];
  const tools: Record<string, unknown>[] = [];
  const names: string[] = [];
  for (const candidate of candidates) {
    if (!DELEGATION_FUNCTION_NAME.test(candidate.name)) continue;
    if (names.includes(candidate.name) || permissions.isDenied(candidate.name)) continue;
    names.push(candidate.name);
    tools.push(delegationFunctionTool(candidate.name, candidate.description, candidate.parameters));
  }
  return { tools, names };
}

export const LIVE_VOICE_SITE_RULES_NOTICE =
  'Searching the web is off in this voice session because the workspace limits which sites ' +
  'can be read, and a voice search cannot keep to that limit. If the user asks for a search, ' +
  'say so in one sentence and suggest typing the request in the chat. Never answer as if a ' +
  'search had run.';

export function formatLiveVoiceApprovalNotice(functionTools: readonly string[]): string | null {
  if (functionTools.length === 0) return null;
  return (
    "Some actions need the user's approval before they run. When one does, the app shows the " +
    'request on the screen and the action waits. Tell the user in one short sentence that it is ' +
    'waiting for their approval on screen. A spoken yes does not approve it, and never say an ' +
    'action ran until its result comes back.'
  );
}

export function formatWithheldLiveVoiceTools(
  withheld: readonly LiveVoiceToolCapability[],
  toolApprovalPolicy: ToolApprovalPolicy,
): string | null {
  const actions = [...new Set(withheld.map((tool) => tool.label))];
  if (actions.length === 0) return null;
  const { label } = toolApprovalPolicyOption(toolApprovalPolicy);
  const list = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(
    actions.map((action, index) => (index === 0 ? action : action.toLowerCase())),
  );
  return (
    `${list} ${actions.length === 1 ? 'is' : 'are'} off in this voice session. The user's Tool ` +
    `approvals setting ("${label}") asks before each of these, and a voice session cannot stop ` +
    'to ask. If the user asks for something that needs one, say so in one sentence and suggest ' +
    'typing the request in the chat, where each action can be approved. Never answer as if one ' +
    'of them had run.'
  );
}
