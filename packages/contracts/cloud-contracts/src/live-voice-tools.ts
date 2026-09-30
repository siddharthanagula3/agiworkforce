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
