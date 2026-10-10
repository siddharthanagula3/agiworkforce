import { z } from 'zod';

import { MAX_AGIWORK_GOAL_CHARS } from './cloud-agent-runs';

export const LIVE_VOICE_TOOL_DECISIONS = ['approved', 'rejected'] as const;
export const LIVE_VOICE_TOOL_ARGUMENTS_MAX_CHARS = 65_536;
export const LIVE_VOICE_TOOL_INPUT_PREVIEW_MAX_CHARS = 4_000;

export const LiveVoiceToolCallRequestSchema = z.object({
  callId: z.string().min(1).max(128),
  name: z.string().min(1).max(128),
  arguments: z.string().max(LIVE_VOICE_TOOL_ARGUMENTS_MAX_CHARS),
  decision: z.enum(LIVE_VOICE_TOOL_DECISIONS).optional(),
});

export const LiveVoiceToolApprovalSchema = z.object({
  callId: z.string().min(1).max(128),
  name: z.string().min(1).max(128),
  summary: z.string().min(1).max(500),
  input: z.string().max(LIVE_VOICE_TOOL_INPUT_PREVIEW_MAX_CHARS).nullable(),
});

export const LiveVoiceToolFileSchema = z.object({
  name: z.string().min(1).max(500),
  uri: z.string().min(1).max(2_048),
});
export type LiveVoiceToolFile = z.infer<typeof LiveVoiceToolFileSchema>;

export const LiveVoiceToolCallResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('completed'),
    output: z.string(),
    isError: z.boolean(),
    files: z.array(LiveVoiceToolFileSchema).max(20).optional(),
  }),
  z.object({ status: z.literal('approval_required'), approval: LiveVoiceToolApprovalSchema }),
  z.object({ status: z.literal('declined'), output: z.string() }),
  z.object({ status: z.literal('blocked'), output: z.string() }),
]);

export type LiveVoiceToolDecision = (typeof LIVE_VOICE_TOOL_DECISIONS)[number];
export type LiveVoiceToolCallRequest = z.infer<typeof LiveVoiceToolCallRequestSchema>;
export type LiveVoiceToolApproval = z.infer<typeof LiveVoiceToolApprovalSchema>;
export type LiveVoiceToolCallResponse = z.infer<typeof LiveVoiceToolCallResponseSchema>;

export interface LiveVoicePendingApproval extends LiveVoiceToolApproval {
  deciding: boolean;
}

export const LIVE_VOICE_WORK_TASK_TOOL = 'agi_work';

export const LIVE_VOICE_CLIENT_HANDOFFS = [LIVE_VOICE_WORK_TASK_TOOL] as const;
export type LiveVoiceClientHandoff = (typeof LIVE_VOICE_CLIENT_HANDOFFS)[number];

const LiveVoiceWorkTaskArgumentsSchema = z.object({
  goal: z.string().trim().min(1).max(MAX_AGIWORK_GOAL_CHARS),
});

export function liveVoiceWorkTaskGoal(args: string): string | null {
  try {
    const parsed = LiveVoiceWorkTaskArgumentsSchema.safeParse(JSON.parse(args));
    return parsed.success ? parsed.data.goal : null;
  } catch {
    return null;
  }
}

export function liveVoiceToolCallPath(sessionId: string): string {
  return `/api/voice/live/sessions/${encodeURIComponent(sessionId)}/tools`;
}

interface LiveVoiceFunctionCall {
  callId: string;
  name: string;
  arguments: string;
}

export function liveVoiceFunctionCallOf(event: unknown): LiveVoiceFunctionCall | null {
  if (!event || typeof event !== 'object') return null;
  const record = event as { type?: unknown; item?: unknown };
  if (record.type !== 'response.output_item.done') return null;
  const item = record.item as
    { type?: unknown; call_id?: unknown; name?: unknown; arguments?: unknown } | undefined;
  if (item?.type !== 'function_call') return null;
  if (typeof item.call_id !== 'string' || typeof item.name !== 'string') return null;
  return {
    callId: item.call_id,
    name: item.name,
    arguments: typeof item.arguments === 'string' ? item.arguments : '{}',
  };
}

export interface LiveVoiceToolResult {
  callId: string;
  name: string;
  output: string;
  isError: boolean;
  files: readonly LiveVoiceToolFile[];
}

export interface LiveVoiceToolBridgeOptions {
  callTool: (request: LiveVoiceToolCallRequest) => Promise<LiveVoiceToolCallResponse>;
  send: (event: Record<string, unknown>) => void;
  onApprovalsChanged: (approvals: readonly LiveVoicePendingApproval[]) => void;
  onToolCompleted?: (name: string) => void;
  onToolResult?: (result: LiveVoiceToolResult) => void;
}

interface OpenFunctionCall extends LiveVoiceFunctionCall {
  output: string | null;
  approval: LiveVoiceToolApproval | null;
  deciding: boolean;
}

export class LiveVoiceToolBridge {
  private readonly calls = new Map<string, OpenFunctionCall>();
  private disposed = false;

  constructor(private readonly options: LiveVoiceToolBridgeOptions) {}

  get busy(): boolean {
    return this.calls.size > 0;
  }

  observe(event: unknown): boolean {
    const call = liveVoiceFunctionCallOf(event);
    if (!call || this.disposed) return false;
    if (this.calls.has(call.callId)) return true;
    this.calls.set(call.callId, { ...call, output: null, approval: null, deciding: false });
    void this.run(call.callId);
    return true;
  }

  approvals(): LiveVoicePendingApproval[] {
    const pending: LiveVoicePendingApproval[] = [];
    for (const call of this.calls.values()) {
      if (call.approval && call.output === null) {
        pending.push({ ...call.approval, deciding: call.deciding });
      }
    }
    return pending;
  }

  async decide(callId: string, decision: LiveVoiceToolDecision): Promise<void> {
    const call = this.calls.get(callId);
    if (!call?.approval || call.deciding || call.output !== null) return;
    call.deciding = true;
    this.publish();
    await this.run(callId, decision);
  }

  cancel(): void {
    if (this.calls.size === 0) return;
    this.calls.clear();
    this.publish();
  }

  dispose(): void {
    this.disposed = true;
    this.cancel();
  }

  private async run(callId: string, decision?: LiveVoiceToolDecision): Promise<void> {
    const call = this.calls.get(callId);
    if (!call) return;
    let response: LiveVoiceToolCallResponse;
    try {
      response = await this.options.callTool({
        callId: call.callId,
        name: call.name,
        arguments: call.arguments,
        ...(decision ? { decision } : {}),
      });
    } catch (error) {
      response = {
        status: 'completed',
        isError: true,
        output: `The action could not run: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    if (this.disposed || this.calls.get(callId) !== call) return;
    if (response.status === 'approval_required') {
      call.approval = response.approval;
      call.deciding = false;
      this.publish();
      return;
    }
    call.output = response.output;
    call.approval = null;
    call.deciding = false;
    if (response.status === 'completed' && !response.isError) {
      this.options.onToolCompleted?.(call.name);
    }
    this.options.onToolResult?.({
      callId: call.callId,
      name: call.name,
      output: response.output,
      isError: response.status !== 'completed' || response.isError,
      files: response.status === 'completed' ? (response.files ?? []) : [],
    });
    this.publish();
    this.flush();
  }

  private flush(): void {
    const calls = [...this.calls.values()];
    if (calls.length === 0 || calls.some((call) => call.output === null)) return;
    for (const call of calls) {
      this.options.send({
        type: 'response.item.create',
        item: { type: 'function_call_output', call_id: call.callId, output: call.output },
      });
    }
    this.calls.clear();
    this.options.send({ type: 'response.create' });
    this.publish();
  }

  private publish(): void {
    this.options.onApprovalsChanged(this.approvals());
  }
}

export interface LiveVoiceBackendUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  webSearchCalls: number;
}

const BACKEND_USAGE_EVENTS = new Set([
  'response.completed',
  'response.failed',
  'response.incomplete',
]);
const OUTPUT_ITEM_DONE = 'response.output_item.done';
const WEB_SEARCH_CALL_ITEM = 'web_search_call';

function tokenCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/**
 * What a Responses-delegated GPT-Live backend spent, read from the nested
 * events the session forwards in `response.event`. OpenAI's cost guide says to
 * count each backend response's `usage` once by response id, and the lifecycle
 * snapshots clear `output`, so web searches are counted from their output-item
 * events. No server-readable per-session source carries this usage.
 */
export class LiveVoiceBackendUsageMeter {
  private readonly responses = new Map<
    string,
    { inputTokens: number; outputTokens: number; cachedTokens: number }
  >();
  private readonly searches = new Set<string>();

  observe(event: unknown): void {
    if (!event || typeof event !== 'object') return;
    const nested = event as Record<string, unknown>;
    const type = nested['type'];
    if (type === OUTPUT_ITEM_DONE) {
      const item = nested['item'] as { id?: unknown; type?: unknown } | undefined;
      if (item?.type === WEB_SEARCH_CALL_ITEM && typeof item.id === 'string') {
        this.searches.add(item.id);
      }
      return;
    }
    if (typeof type !== 'string' || !BACKEND_USAGE_EVENTS.has(type)) return;
    const response = nested['response'] as { id?: unknown; usage?: unknown } | undefined;
    const usage = response?.usage as
      | {
          input_tokens?: unknown;
          output_tokens?: unknown;
          input_tokens_details?: { cached_tokens?: unknown } | null;
        }
      | undefined;
    if (typeof response?.id !== 'string' || !usage) return;
    const inputTokens = tokenCount(usage.input_tokens);
    this.responses.set(response.id, {
      inputTokens,
      outputTokens: tokenCount(usage.output_tokens),
      cachedTokens: Math.min(tokenCount(usage.input_tokens_details?.cached_tokens), inputTokens),
    });
  }

  report(): LiveVoiceBackendUsage | null {
    const usage: LiveVoiceBackendUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cachedTokens: 0,
      webSearchCalls: this.searches.size,
    };
    for (const response of this.responses.values()) {
      usage.inputTokens += response.inputTokens;
      usage.outputTokens += response.outputTokens;
      usage.cachedTokens += response.cachedTokens;
    }
    const empty = usage.inputTokens === 0 && usage.outputTokens === 0 && usage.webSearchCalls === 0;
    return empty ? null : usage;
  }
}

export interface LiveVoiceSource {
  url: string;
  title: string;
}

const URL_CITATION = 'url_citation';
const MESSAGE_ITEM = 'message';

function httpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/**
 * The web sources a delegated backend answer rests on, read from a finished
 * output item: url_citation annotations on its message text, and the sources
 * a web_search_call lists when the backend returns them.
 */
export function liveVoiceSourcesOf(event: unknown): LiveVoiceSource[] {
  if (!event || typeof event !== 'object') return [];
  const nested = event as Record<string, unknown>;
  if (nested['type'] !== OUTPUT_ITEM_DONE) return [];
  const item = nested['item'] as Record<string, unknown> | undefined;
  const sources: LiveVoiceSource[] = [];
  if (item?.['type'] === MESSAGE_ITEM && Array.isArray(item['content'])) {
    for (const part of item['content'] as Array<Record<string, unknown>>) {
      if (!Array.isArray(part?.['annotations'])) continue;
      for (const annotation of part['annotations'] as Array<Record<string, unknown>>) {
        const url = annotation?.['type'] === URL_CITATION ? httpUrl(annotation['url']) : null;
        if (url) {
          sources.push({
            url,
            title: typeof annotation['title'] === 'string' ? annotation['title'] : url,
          });
        }
      }
    }
  }
  if (item?.['type'] === WEB_SEARCH_CALL_ITEM) {
    const action = item['action'] as { sources?: unknown } | undefined;
    if (Array.isArray(action?.sources)) {
      for (const source of action.sources as Array<Record<string, unknown>>) {
        const url = httpUrl(source?.['url']);
        if (url) {
          sources.push({ url, title: typeof source['title'] === 'string' ? source['title'] : url });
        }
      }
    }
  }
  return sources;
}
