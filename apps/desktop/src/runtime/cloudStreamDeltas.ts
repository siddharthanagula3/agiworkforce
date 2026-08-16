import type {
  Artifact,
  CloudMessageProjection,
  GeneratedFileEntry,
  StreamEvent,
  ToolCall,
  WebSearchResult,
} from '@agiworkforce/unified-chat';
import {
  parseAgentEventDelta,
  parseGeneratedFilesDelta,
  parseSearchResultsDelta,
  parseToolApprovalRequestDelta,
  parseToolResultDelta,
  parseToolStatusDelta,
  resolveGeneratedFileUri,
} from '@agiworkforce/cloud-contracts';
import { applyAgentActivityEvent, type AgentActivityState } from '@agiworkforce/client-runtime';

interface ToolCallBufferEntry {
  id: string;
  name: string;
  argsJson: string;
}

export interface CloudStreamDeltaSink {
  onChunk: (text: string) => void;
  onEvent: (payload: Record<string, unknown>) => void;
  getFinishReason: () => string | undefined;
  getStreamError: () => { message: string; code?: string; retryable?: boolean } | undefined;
  isSuspended: () => boolean;
  getAccumulatedContent: () => string;
  getPendingApprovalCalls: () => {
    toolCallId: string;
    name: string;
    args: Record<string, unknown>;
  }[];
  getToolResult: (toolCallId: string) => { content: string; isError: boolean } | undefined;
  getAgentActivity: () => AgentActivityState | undefined;
  getMessageProjection: () => CloudStreamMessageProjection;
}

export type CloudStreamMessageProjection = CloudMessageProjection;

function mergeById<T extends { id: string }>(
  previous: T[] | undefined,
  next: T[] | undefined,
): T[] | undefined {
  const merged = new Map<string, T>();
  for (const item of previous ?? []) merged.set(item.id, item);
  for (const item of next ?? []) merged.set(item.id, item);
  return merged.size > 0 ? [...merged.values()] : undefined;
}

export function mergeCloudStreamMessageProjections(
  previous: CloudStreamMessageProjection | undefined,
  next: CloudStreamMessageProjection | undefined,
): CloudStreamMessageProjection {
  const toolCalls = mergeById(previous?.toolCalls, next?.toolCalls);
  const webSearchResults = mergeById(previous?.webSearchResults, next?.webSearchResults);
  const generatedFiles = mergeById(previous?.generatedFiles, next?.generatedFiles);
  const artifacts = mergeById(previous?.artifacts, next?.artifacts);
  return {
    ...(previous ?? {}),
    ...(next ?? {}),
    ...(toolCalls ? { toolCalls } : {}),
    ...(webSearchResults ? { webSearchResults } : {}),
    ...(generatedFiles ? { generatedFiles } : {}),
    ...(artifacts ? { artifacts } : {}),
  };
}

export function hasRenderableCloudMessageOutput(
  content: string,
  projection: CloudStreamMessageProjection,
): boolean {
  const codeResult = projection.codeExecutionResult;
  return (
    content.trim().length > 0 ||
    (projection.generatedFiles?.length ?? 0) > 0 ||
    (projection.artifacts?.length ?? 0) > 0 ||
    (projection.webSearchResults?.some((search) => search.results.length > 0) ?? false) ||
    Boolean(
      codeResult &&
      (codeResult.stdout.trim() ||
        codeResult.stderr.trim() ||
        (codeResult.images?.length ?? 0) > 0),
    )
  );
}

function resolveOwnedGeneratedFileUri(uri: string, apiBaseUrl: string): string | undefined {
  try {
    const browserOrigin =
      typeof globalThis.location?.origin === 'string' ? globalThis.location.origin : undefined;
    const base = apiBaseUrl || browserOrigin;
    if (!base) return undefined;
    const resolved = new URL(resolveGeneratedFileUri(uri, apiBaseUrl), base);
    if (resolved.origin !== new URL(base).origin || !resolved.pathname.startsWith('/api/files/')) {
      return undefined;
    }
    return apiBaseUrl
      ? resolved.toString()
      : `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return undefined;
  }
}

function toSearchResultItem(source: {
  url: string;
  title: string;
  encrypted_content?: string;
}): WebSearchResult['results'][number] {
  const url = source.url;
  const title = source.title || url;
  const snippet = source.encrypted_content;
  let domain: string | undefined;
  if (url) {
    try {
      domain = new URL(url).hostname;
    } catch {
      domain = undefined;
    }
  }
  return { url, title, snippet, domain };
}

function mapSearchResultsPayload(payload: unknown): WebSearchResult | null {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload as Record<string, unknown>;

  const errorShape =
    raw['content'] &&
    typeof raw['content'] === 'object' &&
    !Array.isArray(raw['content']) &&
    (raw['content'] as Record<string, unknown>)['type'] === 'web_search_tool_result_error';

  const parsed = parseSearchResultsDelta(payload);
  if (!parsed && !errorShape) return null;

  const results = (parsed?.sources ?? []).map(toSearchResultItem);
  return {
    id:
      (typeof raw['tool_use_id'] === 'string' && raw['tool_use_id']) ||
      `search-${Date.now().toString(36)}`,
    query: typeof raw['query'] === 'string' ? raw['query'] : 'Web search',
    results,
    resultCount: results.length,
    status: errorShape ? 'failed' : 'completed',
  };
}

function mapCodeExecutionResultPayload(payload: unknown): {
  stdout: string;
  stderr: string;
  returnCode: number;
  images?: Array<{ mediaType: string; data: string }>;
} | null {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload as Record<string, unknown>;
  const content = Array.isArray(raw['content'])
    ? (raw['content'] as Record<string, unknown>[])
    : [];

  const textItem = content.find((c) => c['type'] === 'text');
  const rawText = (textItem?.['text'] as string) || '';
  const images = content
    .filter((c) => c['type'] === 'image')
    .map((c) => {
      const src = c['source'] as Record<string, unknown> | undefined;
      return {
        mediaType: (src?.['media_type'] as string) || 'image/png',
        data: (src?.['data'] as string) || '',
      };
    })
    .filter((img) => img.data);

  const stdout = rawText.match(/<stdout>([\s\S]*?)<\/stdout>/)?.[1] ?? rawText;
  const stderr = rawText.match(/<stderr>([\s\S]*?)<\/stderr>/)?.[1] ?? '';
  const returnCode = parseInt(rawText.match(/<return_code>(\d+)<\/return_code>/)?.[1] ?? '0', 10);

  return { stdout, stderr, returnCode, images: images.length > 0 ? images : undefined };
}

export function createCloudStreamDeltaSink(
  emit: (event: StreamEvent) => void,
  apiBaseUrl: string,
  initialAgentActivity?: AgentActivityState,
): CloudStreamDeltaSink {
  const toolCallBuffer = new Map<string, ToolCallBufferEntry>();
  let inThinkingBlock = false;
  let finishReason: string | undefined;
  let streamError: { message: string; code?: string; retryable?: boolean } | undefined;
  let suspended = false;
  let accumulatedContent = '';
  let agentActivity: AgentActivityState | undefined = initialAgentActivity;
  let thinking = '';
  const projectedToolCalls = new Map<string, ToolCall>();
  const projectedArtifacts = new Map<string, Artifact>();
  const projectedSearches = new Map<string, WebSearchResult>();
  const projectedFiles = new Map<string, GeneratedFileEntry>();
  let codeExecutionResult: CloudStreamMessageProjection['codeExecutionResult'];
  let usage: CloudStreamMessageProjection['usage'];
  let researchStatus:
    | {
        phase: 'planning' | 'searching' | 'synthesizing' | 'complete' | 'error';
        label?: string;
        iteration?: number;
        maxIterations?: number;
        searches?: number;
        sources?: number;
        elapsedMs?: number;
        error?: string;
      }
    | undefined;
  const pendingApprovalCalls: {
    toolCallId: string;
    name: string;
    args: Record<string, unknown>;
  }[] = [];
  const toolResults = new Map<string, { content: string; isError: boolean }>();

  const onChunk = (text: string): void => {
    if (text === '<thinking>') {
      inThinkingBlock = true;
      return;
    }
    if (text === '</thinking>') {
      inThinkingBlock = false;
      return;
    }
    if (!inThinkingBlock) {
      accumulatedContent += text;
    } else {
      thinking += text;
    }
    emit({ type: inThinkingBlock ? 'thinking' : 'content', content: text });
  };

  const accumulateUsage = (raw: unknown): void => {
    if (!raw || typeof raw !== 'object') return;
    const source = raw as Record<string, unknown>;
    const read = (...keys: string[]): number | undefined => {
      for (const key of keys) {
        const value = source[key];
        if (typeof value === 'number' && Number.isFinite(value)) return value;
      }
      return undefined;
    };
    const details = (key: string, field: string): number | undefined => {
      const bag = source[key];
      if (!bag || typeof bag !== 'object') return undefined;
      const value = (bag as Record<string, unknown>)[field];
      return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
    };

    const next = {
      inputTokens: read('prompt_tokens', 'input_tokens'),
      outputTokens: read('completion_tokens', 'output_tokens'),
      cacheReadTokens:
        details('prompt_tokens_details', 'cached_tokens') ??
        details('input_tokens_details', 'cached_tokens') ??
        read('cache_read_input_tokens', 'prompt_cache_hit_tokens'),
      cacheWriteTokens: read('cache_creation_input_tokens'),
      reasoningTokens:
        details('completion_tokens_details', 'reasoning_tokens') ??
        details('output_tokens_details', 'reasoning_tokens'),
    };
    if (Object.values(next).every((value) => value === undefined)) return;

    const merged = { ...(usage ?? {}) };
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined) continue;
      const field = key as keyof NonNullable<CloudStreamMessageProjection['usage']>;
      merged[field] = (merged[field] ?? 0) + value;
    }
    usage = merged;
  };

  const onEvent = (payload: Record<string, unknown>): void => {
    const choices = Array.isArray(payload['choices']) ? payload['choices'] : [];
    const delta =
      choices.length > 0 && choices[0] && typeof choices[0] === 'object'
        ? ((choices[0] as Record<string, unknown>)['delta'] as Record<string, unknown> | undefined)
        : undefined;

    const rawFinishReason =
      choices.length > 0 && choices[0] && typeof choices[0] === 'object'
        ? (choices[0] as Record<string, unknown>)['finish_reason']
        : undefined;
    if (typeof rawFinishReason === 'string' && rawFinishReason) {
      finishReason = rawFinishReason;
    }

    accumulateUsage(payload['usage']);

    const agentEnvelope = parseAgentEventDelta(delta?.['x_agent_event']);
    if (agentEnvelope) {
      agentActivity = applyAgentActivityEvent(agentActivity, agentEnvelope);
      emit({ type: 'agent_event', envelope: agentEnvelope });
    }

    if (!streamError) {
      const rawStreamError = delta?.['x_stream_error'];
      if (
        rawStreamError &&
        typeof rawStreamError === 'object' &&
        typeof (rawStreamError as { message?: unknown }).message === 'string' &&
        (rawStreamError as { message: string }).message
      ) {
        const r = rawStreamError as { message: string; code?: unknown; retryable?: unknown };
        streamError = {
          message: r.message,
          ...(typeof r.code === 'string' ? { code: r.code } : {}),
          ...(typeof r.retryable === 'boolean' ? { retryable: r.retryable } : {}),
        };
      } else if (typeof rawStreamError === 'string' && rawStreamError) {
        streamError = { message: rawStreamError };
      }
    }

    const toolCalls = Array.isArray(delta?.['tool_calls']) ? delta['tool_calls'] : [];
    for (const entry of toolCalls) {
      if (!entry || typeof entry !== 'object') continue;

      const toolCall = entry as Record<string, unknown>;
      const functionData =
        toolCall['function'] && typeof toolCall['function'] === 'object'
          ? (toolCall['function'] as Record<string, unknown>)
          : null;
      const callId =
        (typeof toolCall['id'] === 'string' && toolCall['id']) ||
        `tool-${toolCall['index'] ?? toolCallBuffer.size}`;
      const existing = toolCallBuffer.get(callId) ?? {
        id: callId,
        name: typeof functionData?.['name'] === 'string' ? functionData['name'] : 'tool',
        argsJson: '',
      };

      const nextName =
        typeof functionData?.['name'] === 'string' && functionData['name'].length > 0
          ? functionData['name']
          : existing.name;
      const nextArgsJson =
        existing.argsJson +
        (typeof functionData?.['arguments'] === 'string' ? functionData['arguments'] : '');

      toolCallBuffer.set(callId, { id: callId, name: nextName, argsJson: nextArgsJson });

      let parsedArgs: Record<string, unknown> = {};
      if (nextArgsJson.trim().length > 0) {
        try {
          const parsedJson: unknown = JSON.parse(nextArgsJson);
          if (parsedJson && typeof parsedJson === 'object' && !Array.isArray(parsedJson)) {
            parsedArgs = parsedJson as Record<string, unknown>;
          } else {
            parsedArgs = { value: parsedJson };
          }
        } catch {
          parsedArgs = { _partial: nextArgsJson };
        }
      }

      emit({ type: 'tool_call', toolCall: { id: callId, name: nextName, args: parsedArgs } });
      projectedToolCalls.set(callId, {
        id: callId,
        name: nextName,
        args: parsedArgs,
        status: 'running',
      });
    }

    const artifactPayload =
      payload['artifact'] && typeof payload['artifact'] === 'object'
        ? (payload['artifact'] as Artifact)
        : null;
    if (
      artifactPayload?.id &&
      artifactPayload?.type &&
      typeof artifactPayload.content === 'string'
    ) {
      projectedArtifacts.set(artifactPayload.id, artifactPayload);
      emit({ type: 'artifact', artifact: artifactPayload });
    }

    const search = mapSearchResultsPayload(delta?.['x_search_results']);
    if (search) {
      projectedSearches.set(search.id, search);
      emit({ type: 'search_results', search });
    }

    const codeResult = mapCodeExecutionResultPayload(delta?.['x_code_result']);
    if (codeResult) {
      codeExecutionResult = codeResult;
      emit({ type: 'code_execution_result', result: codeResult });
      emit({
        type: 'tool_result',
        toolCallId: 'status:code_execution',
        ...(codeResult.returnCode !== 0
          ? { error: codeResult.stderr || 'Execution failed' }
          : { result: codeResult.stdout || '' }),
      });
      const existing = projectedToolCalls.get('status:code_execution');
      projectedToolCalls.set('status:code_execution', {
        id: 'status:code_execution',
        name: existing?.name ?? 'code_execution',
        args: existing?.args ?? {},
        status: codeResult.returnCode !== 0 ? 'failed' : 'completed',
        ...(codeResult.returnCode !== 0
          ? { error: codeResult.stderr || 'Execution failed' }
          : { result: codeResult.stdout || '' }),
      });
    }

    const rawResearchStatus = delta?.['x_research_status'];
    if (rawResearchStatus && typeof rawResearchStatus === 'object') {
      const r = rawResearchStatus as Record<string, unknown>;
      const phase = r['phase'];
      if (
        phase === 'planning' ||
        phase === 'searching' ||
        phase === 'synthesizing' ||
        phase === 'complete' ||
        phase === 'error'
      ) {
        researchStatus = {
          phase,
          label: typeof r['label'] === 'string' ? r['label'] : undefined,
          iteration:
            typeof r['iteration'] === 'number' ? r['iteration'] : researchStatus?.iteration,
          maxIterations:
            typeof r['max_iterations'] === 'number'
              ? r['max_iterations']
              : researchStatus?.maxIterations,
          searches: typeof r['searches'] === 'number' ? r['searches'] : researchStatus?.searches,
          sources: typeof r['sources'] === 'number' ? r['sources'] : researchStatus?.sources,
          elapsedMs:
            typeof r['elapsed_ms'] === 'number' ? r['elapsed_ms'] : researchStatus?.elapsedMs,
          error:
            phase === 'error'
              ? typeof r['label'] === 'string'
                ? r['label']
                : 'Research run failed'
              : undefined,
        };
        emit({ type: 'research_status', status: { ...researchStatus } });
      }
    }

    const toolStatus = parseToolStatusDelta(delta?.['x_tool_status']);
    if (toolStatus) {
      const syntheticId = `status:${toolStatus.name}`;
      if (toolStatus.status === 'completed' || toolStatus.status === 'failed') {
        const existing = projectedToolCalls.get(syntheticId);
        projectedToolCalls.set(syntheticId, {
          id: syntheticId,
          name: existing?.name ?? toolStatus.name,
          args: existing?.args ?? toolStatus.args ?? {},
          status: toolStatus.status,
          ...(toolStatus.status === 'failed'
            ? { error: toolStatus.status_phrase ?? 'Tool failed' }
            : { result: toolStatus.status_phrase ?? '' }),
        });
        emit({
          type: 'tool_result',
          toolCallId: syntheticId,
          ...(toolStatus.status === 'failed'
            ? { error: toolStatus.status_phrase ?? 'Tool failed' }
            : { result: toolStatus.status_phrase ?? '' }),
        });
      } else {
        projectedToolCalls.set(syntheticId, {
          id: syntheticId,
          name: toolStatus.name,
          args: toolStatus.args ?? {},
          status: 'running',
        });
        emit({
          type: 'tool_call',
          toolCall: { id: syntheticId, name: toolStatus.name, args: toolStatus.args ?? {} },
        });
      }
    }

    const approvalRequest = parseToolApprovalRequestDelta(delta?.['x_tool_approval_request']);
    if (approvalRequest) {
      suspended = true;
      pendingApprovalCalls.push({
        toolCallId: approvalRequest.tool_call_id,
        name: approvalRequest.name,
        args: approvalRequest.args,
      });
      projectedToolCalls.set(approvalRequest.tool_call_id, {
        id: approvalRequest.tool_call_id,
        name: approvalRequest.name,
        args: approvalRequest.args,
        status: 'awaiting_approval',
        requiresApproval: true,
      });
      emit({
        type: 'tool_approval_request',
        toolCallId: approvalRequest.tool_call_id,
        name: approvalRequest.name,
        args: approvalRequest.args,
      });
    }

    const toolResult = parseToolResultDelta(delta?.['x_tool_result']);
    if (toolResult) {
      toolResults.set(toolResult.tool_call_id, {
        content: toolResult.content,
        isError: toolResult.is_error,
      });
      const existing = projectedToolCalls.get(toolResult.tool_call_id);
      projectedToolCalls.set(toolResult.tool_call_id, {
        id: toolResult.tool_call_id,
        name: existing?.name ?? 'tool',
        args: existing?.args ?? {},
        status: toolResult.is_error ? 'failed' : 'completed',
        requiresApproval: false,
        ...(toolResult.is_error ? { error: toolResult.content } : { result: toolResult.content }),
      });
      emit({
        type: 'tool_result',
        toolCallId: toolResult.tool_call_id,
        ...(toolResult.is_error ? { error: toolResult.content } : { result: toolResult.content }),
      });
    }

    const generatedFiles: GeneratedFileEntry[] = parseGeneratedFilesDelta(
      delta?.['x_generated_files'],
    ).flatMap((f): GeneratedFileEntry[] => {
      const uri = resolveOwnedGeneratedFileUri(f.uri, apiBaseUrl);
      if (!uri) return [];
      return [
        {
          id: f.id,
          fileName: f.file_name,
          mimeType: f.mime_type,
          uri,
          byteCount: f.byte_count,
          kind: f.kind,
          ...(f.checksum_sha256 ? { checksumSha256: f.checksum_sha256 } : {}),
          surface: f.surface,
          previewable: f.previewable,
        },
      ];
    });
    if (generatedFiles.length > 0) {
      for (const file of generatedFiles) projectedFiles.set(file.id, file);
      emit({ type: 'generated_files', files: generatedFiles });
    }
  };

  return {
    onChunk,
    onEvent,
    getFinishReason: () => finishReason,
    getStreamError: () => streamError,
    isSuspended: () => suspended,
    getAccumulatedContent: () => accumulatedContent,
    getPendingApprovalCalls: () => [...pendingApprovalCalls],
    getToolResult: (toolCallId) => toolResults.get(toolCallId),
    getAgentActivity: () => agentActivity,
    getMessageProjection: () => ({
      ...(finishReason ? { finishReason } : {}),
      ...(streamError ? { streamError } : {}),
      ...(thinking ? { thinking } : {}),
      ...(projectedToolCalls.size > 0 ? { toolCalls: [...projectedToolCalls.values()] } : {}),
      ...(projectedSearches.size > 0 ? { webSearchResults: [...projectedSearches.values()] } : {}),
      ...(projectedFiles.size > 0 ? { generatedFiles: [...projectedFiles.values()] } : {}),
      ...(projectedArtifacts.size > 0 ? { artifacts: [...projectedArtifacts.values()] } : {}),
      ...(codeExecutionResult ? { codeExecutionResult } : {}),
      ...(researchStatus ? { research: { ...researchStatus } } : {}),
      ...(usage ? { usage: { ...usage } } : {}),
    }),
  };
}
