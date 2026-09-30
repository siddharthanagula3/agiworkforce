import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  LIVE_VOICE_TOOL_INPUT_PREVIEW_MAX_CHARS,
  LIVE_VOICE_WORK_TASK_TOOL,
  liveVoiceWorkTaskGoal,
  type LiveVoiceToolCallRequest,
  type LiveVoiceToolCallResponse,
  type LiveVoiceToolFile,
} from '@agiworkforce/cloud-contracts';
import type { AgentEventToolCategory } from '@agiworkforce/types/protocol';
import { loadConnectorToolPermissions } from '@/app/api/llm/v1/chat/completions/lib/connector-tool-permissions';
import { resolveToolCallGate } from '@/app/api/llm/v1/chat/completions/lib/tool-call-gate';
import { loadToolApprovalPolicy } from '@/app/api/llm/v1/chat/completions/lib/tool-approval-policy';
import {
  applyToolResultSecretPolicy,
  canonicalToolSummary,
  executeOfferedToolCall,
  recordToolCallAudit,
} from '@/app/api/llm/v1/chat/completions/lib/tool-loop';
import { policyAutoApprovesTool } from '@/app/api/llm/v1/chat/completions/lib/tool-metadata';
import {
  markConversationGoogleUserData,
  readsGoogleUserData,
} from '@/lib/connectors/google-user-data';
import { bindMcpTask } from '@/lib/connectors/mcp-state-store';
import { capOutput, EXECUTE_CODE_TOOL, isExecutionTool } from '@/lib/e2b/execution-tools';
import { logger } from '@/lib/logger';
import { executeWebMcpTool, parseQualifiedToolName } from '@/lib/mcp-tool-executor';
import { persistGeneratedFileBytes } from '@/lib/server/generated-file-persist';
import { modelKeepsInputsOutOfTraining } from '@/lib/server/provider-training-opt-out';
import { readWorkspaceWebDomainPolicy } from '@/lib/services/connector-policy-service';
import {
  generateManagedOfficeFile,
  isManagedOfficeFileTool,
} from '@/lib/services/managed-office-file-service';
import { executeUrlFetch, fenceFetchedPage, URL_FETCH_TOOL } from '@/lib/url-fetch/url-fetch-tool';
import { makeUserConnectorExecutor } from '@/lib/user-connector-tools';

const VOICE_TOOL_SURFACE = 'voice';
const MAX_VOICE_TOOL_OUTPUT_CHARS = 32_000;

const MESSAGE = {
  notOffered: 'That tool is not available in this voice session.',
  blocked: "The user's tool permissions block this action, so it did not run.",
  declined: 'The user declined this action, so it did not run.',
  malformed: 'The arguments for this call were not a JSON object, so it did not run.',
  workTaskGoal: 'The task needs a goal in words, so it did not start.',
  googleUserDataMayTrain:
    "Google connectors do not run in this voice session because its model's provider may train on what it is sent.",
  workTaskHandedOff:
    'The task is starting in the chat as an AGI Work task. It runs in the background and is tracked in Tasks, so tell the user where to follow it.',
} as const;

interface ToolRunResult {
  content: string;
  isError: boolean;
  files?: LiveVoiceToolFile[];
}

export interface LiveVoiceToolCallInput {
  db: DatabaseAdapter;
  userId: string;
  organizationId: string | null;
  conversationId: string;
  modelId: string;
  offeredTools: readonly string[];
  call: LiveVoiceToolCallRequest;
  signal?: AbortSignal;
}

function parseArguments(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw.trim() || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function toolCategory(name: string): AgentEventToolCategory {
  if (name === URL_FETCH_TOOL) return 'web-fetch';
  if (name === EXECUTE_CODE_TOOL) return 'code-execution';
  if (isExecutionTool(name)) return 'filesystem';
  if (isManagedOfficeFileTool(name)) return 'artifact';
  return parseQualifiedToolName(name) ? 'connector' : 'other';
}

function inputPreview(args: Record<string, unknown>): string | null {
  if (Object.keys(args).length === 0) return null;
  const text = JSON.stringify(args, null, 2);
  return text.length > LIVE_VOICE_TOOL_INPUT_PREVIEW_MAX_CHARS
    ? `${text.slice(0, LIVE_VOICE_TOOL_INPUT_PREVIEW_MAX_CHARS - 1)}…`
    : text;
}

function boundedOutput(output: string): string {
  return output.length > MAX_VOICE_TOOL_OUTPUT_CHARS
    ? `${output.slice(0, MAX_VOICE_TOOL_OUTPUT_CHARS)}\n[output truncated for voice]`
    : output;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function runUrlFetch(input: LiveVoiceToolCallInput, args: Record<string, unknown>) {
  const outcome = await executeUrlFetch(args, {
    domainPolicy: await readWorkspaceWebDomainPolicy(input.db, input.organizationId),
    ...(input.signal ? { signal: input.signal } : {}),
  });
  if (!outcome.ok) {
    return { content: `Fetch failed (${outcome.errorCode}): ${outcome.error}`, isError: true };
  }
  return {
    content: fenceFetchedPage(outcome.url, outcome.title, outcome.content),
    isError: false,
  };
}

async function runOfficeFile(
  input: LiveVoiceToolCallInput,
  args: Record<string, unknown>,
): Promise<ToolRunResult> {
  const generated = await generateManagedOfficeFile(args);
  if (!generated.ok) return { content: generated.message, isError: true };
  const persisted = await persistGeneratedFileBytes({
    userId: input.userId,
    organizationId: input.organizationId,
    data: generated.data,
    mimeType: generated.mimeType,
    filename: generated.filename,
    provider: 'agi-managed-office',
    origin: 'managed-office-tool',
    model: input.modelId,
    conversationId: input.conversationId,
    extraMetadata: { format: args['format'] },
  });
  if (!persisted.ok) return { content: 'The Office file could not be saved.', isError: true };
  return {
    files: [{ name: persisted.file.file_name, uri: persisted.file.uri }],
    content: JSON.stringify({
      ok: true,
      file: {
        name: persisted.file.file_name,
        uri: persisted.file.uri,
        mime_type: persisted.file.mime_type,
        byte_count: persisted.file.byte_count,
      },
    }),
    isError: false,
  };
}

async function runMcpTool(
  input: LiveVoiceToolCallInput,
  serverId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolRunResult> {
  if (readsGoogleUserData(serverId, toolName)) {
    if (!modelKeepsInputsOutOfTraining(input.modelId)) {
      return { content: MESSAGE.googleUserDataMayTrain, isError: true };
    }
    await markConversationGoogleUserData(input.db, input.userId, input.conversationId);
  }
  const connectorExecutor = makeUserConnectorExecutor(input.userId, input.organizationId);
  const connector = await connectorExecutor(
    serverId,
    toolName,
    args,
    input.signal ? { signal: input.signal } : {},
  );
  if (connector.handled) {
    return { content: capOutput(connector.content), isError: connector.isError };
  }
  const result = await executeWebMcpTool(
    serverId,
    toolName,
    args,
    input.signal ? { signal: input.signal } : undefined,
  );
  if (
    result.task &&
    !(await bindMcpTask({ userId: input.userId, connectorId: serverId, task: result.task }))
  ) {
    return {
      content: 'The MCP server started a task, but its task binding could not be saved.',
      isError: true,
    };
  }
  const text = result.content
    .map((block) => {
      if (block.type === 'text') return block.text;
      if (block.type === 'resource') {
        return block.resource.text ?? `[resource: ${block.resource.uri}]`;
      }
      if (block.type === 'image') return '[image result]';
      return '';
    })
    .filter(Boolean)
    .join('\n');
  return {
    content: capOutput(
      text || (result.task ? `MCP task started: ${result.task.taskId}` : '(no output)'),
    ),
    isError: result.isError === true,
  };
}

async function runTool(
  input: LiveVoiceToolCallInput,
  args: Record<string, unknown>,
): Promise<ToolRunResult> {
  const name = input.call.name;
  try {
    if (name === LIVE_VOICE_WORK_TASK_TOOL) {
      return liveVoiceWorkTaskGoal(input.call.arguments)
        ? { content: MESSAGE.workTaskHandedOff, isError: false }
        : { content: MESSAGE.workTaskGoal, isError: true };
    }
    if (name === URL_FETCH_TOOL) return await runUrlFetch(input, args);
    if (isManagedOfficeFileTool(name)) return await runOfficeFile(input, args);
    const parsed = parseQualifiedToolName(name);
    if (parsed) return await runMcpTool(input, parsed.serverId, parsed.toolName, args);
    return { content: MESSAGE.notOffered, isError: true };
  } catch (error) {
    return { content: capOutput(`The tool failed: ${errorText(error)}`), isError: true };
  }
}

async function runSandboxTool(
  input: LiveVoiceToolCallInput,
  args: Record<string, unknown>,
): Promise<ToolRunResult> {
  const result = await executeOfferedToolCall({
    call: { id: input.call.callId, qualifiedName: input.call.name, args },
    offeredTools: new Set(input.offeredTools),
    userId: input.userId,
    organizationId: input.organizationId,
    conversationId: input.conversationId,
    model: input.modelId,
    requestId: `voice:${input.conversationId}`,
    planTier: null,
    surface: VOICE_TOOL_SURFACE,
    ...(input.signal ? { signal: input.signal } : {}),
  });
  const files = (result.generatedFiles ?? []).map((file) => ({
    name: file.file_name,
    uri: file.uri,
  }));
  return {
    content:
      files.length > 0
        ? `${result.content}\n\nSaved to the Library: ${files.map((file) => file.name).join(', ')}`
        : result.content,
    isError: result.isError,
    ...(files.length > 0 ? { files } : {}),
  };
}

async function auditCall(
  input: LiveVoiceToolCallInput,
  status: 'completed' | 'failed' | 'blocked',
  durationMs?: number,
): Promise<void> {
  await recordToolCallAudit({
    userId: input.userId,
    organizationId: input.organizationId,
    surface: VOICE_TOOL_SURFACE,
    toolName: input.call.name,
    category: toolCategory(input.call.name),
    status,
    ...(durationMs === undefined ? {} : { durationMs }),
  }).catch((error: unknown) => {
    logger.error(
      { error, userId: input.userId, toolName: input.call.name },
      'Voice tool call audit event could not be recorded',
    );
  });
}

export async function handleLiveVoiceToolCall(
  input: LiveVoiceToolCallInput,
): Promise<LiveVoiceToolCallResponse> {
  const { call } = input;
  if (!input.offeredTools.includes(call.name)) {
    return { status: 'blocked', output: MESSAGE.notOffered };
  }
  const args = parseArguments(call.arguments);
  if (!args) return { status: 'completed', output: MESSAGE.malformed, isError: true };

  const [toolApprovalPolicy, permissions] = await Promise.all([
    loadToolApprovalPolicy(input.db, input.userId),
    loadConnectorToolPermissions(input.db, input.userId, input.organizationId),
  ]);
  const approvalMode = input.offeredTools.some(
    (name) =>
      parseQualifiedToolName(name) !== null || !policyAutoApprovesTool(toolApprovalPolicy, name),
  )
    ? 'manual'
    : 'auto';
  const gate = resolveToolCallGate(
    {
      qualifiedName: call.name,
      savedLevel: permissions.levelFor(call.name),
      batchIntroducesUntrustedContent: false,
    },
    {
      approvalMode,
      toolApprovalPolicy,
      unattended: false,
      deviceHostPresent: false,
      untrustedContentInContext: true,
      sensitiveSourceAvailable: true,
    },
  );

  if (gate.verdict === 'deny') {
    await auditCall(input, 'blocked');
    return { status: 'blocked', output: MESSAGE.blocked };
  }
  if (gate.verdict === 'ask' && !call.decision) {
    return {
      status: 'approval_required',
      approval: {
        callId: call.callId,
        name: call.name,
        summary: canonicalToolSummary(call.name, toolCategory(call.name), args),
        input: inputPreview(args),
      },
    };
  }
  if (gate.verdict === 'ask' && call.decision === 'rejected') {
    await auditCall(input, 'blocked');
    return { status: 'declined', output: MESSAGE.declined };
  }

  if (isExecutionTool(call.name)) {
    const result = await runSandboxTool(input, args);
    return {
      status: 'completed',
      output: boundedOutput(result.content),
      isError: result.isError,
      ...(result.files ? { files: result.files } : {}),
    };
  }

  const startedAt = Date.now();
  const result = await runTool(input, args);
  const output = await applyToolResultSecretPolicy(input.userId, call.name, result.content);
  await auditCall(input, result.isError ? 'failed' : 'completed', Date.now() - startedAt);
  return {
    status: 'completed',
    output: boundedOutput(output),
    isError: result.isError,
    ...(result.files ? { files: result.files } : {}),
  };
}
