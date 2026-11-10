import {
  CallerToolResumeRequestSchema,
  type CallerToolResumeRequest,
} from '@agiworkforce/cloud-contracts';
import type { CallerToolContinuation, ToolCall } from '../computer-use/toolHandoff';
import {
  createChromeCallerToolCustody,
  readChromeCallerToolCustody,
  CallerToolCustodyError,
  type ChromeCallerToolCustody,
  type CallerToolCustodyStorage,
} from './callerToolCustody';
import type {
  ChromeManagedToolHandoffOutcome,
  ChromeManagedToolResult,
} from './managedChatHandler';

type Dispatch = (
  calls: ToolCall[],
  checkpoint: CallerToolContinuation,
) => Promise<ChromeManagedToolHandoffOutcome>;
export async function executeOwnedCallerToolCalls(input: {
  checkpoint: CallerToolContinuation;
  custody: ChromeCallerToolCustody;
  dispatch: Dispatch;
  signal?: AbortSignal;
  completedCallIds?: readonly string[];
  beforeAction?: () => Promise<void>;
}): Promise<ChromeManagedToolHandoffOutcome> {
  const checkpoint = structuredClone(input.checkpoint);
  const completed = new Set(input.completedCallIds ?? []);
  const results: ChromeManagedToolResult[] = [];
  for (const call of checkpoint.calls) {
    if (input.signal?.aborted) return { status: 'cancelled' };
    let checked = false;
    if (input.beforeAction && !completed.has(call.id)) {
      await input.beforeAction();
      checked = true;
    }
    if (input.signal?.aborted) return { status: 'cancelled' };
    let saved = await input.custody.claimAction(checkpoint, call.id);
    if (!saved) {
      if (input.beforeAction && !checked) await input.beforeAction();
      if (input.signal?.aborted) return { status: 'cancelled' };
      const outcome = await input.dispatch([structuredClone(call)], structuredClone(checkpoint));
      if (outcome.status === 'cancelled' || input.signal?.aborted) return { status: 'cancelled' };
      if (outcome.results.length !== 1 || outcome.results[0]?.toolCallId !== call.id)
        throw new CallerToolCustodyError(
          'The browser result does not match its individual action.',
        );
      saved = await input.custody.completeAction(
        checkpoint,
        { tool_call_id: call.id, content: outcome.results[0].content },
        outcome.results[0].observation,
        outcome.results[0].browserContext,
        outcome.results[0].taskTabs,
      );
    }
    results.push({ toolCallId: saved.tool_call_id, content: saved.content });
  }
  return { status: 'resolved', results };
}

export async function recoverCallerToolCheckpoint(input: {
  saved: NonNullable<Awaited<ReturnType<typeof readChromeCallerToolCustody>>>;
  checkpoint: CallerToolContinuation;
  dispatch: Dispatch;
  assertCurrent: () => void;
  beforeAction: () => Promise<void>;
  signal?: AbortSignal;
  storage?: CallerToolCustodyStorage;
}): Promise<CallerToolResumeRequest> {
  const saved = structuredClone(input.saved);
  const checkpoint = structuredClone(input.checkpoint);
  if (saved.terminal || saved.runId !== checkpoint.run_id)
    throw new CallerToolCustodyError('The browser checkpoint belongs to another or finished task.');
  const custody = createChromeCallerToolCustody(saved.binding, input.assertCurrent, input.storage);
  await custody.admit(saved.requestId, JSON.parse(saved.toolsJson));
  await custody.bindRun(checkpoint.run_id);
  if (saved.step?.cursor.next_event_sequence === checkpoint.next_event_sequence) {
    if (
      JSON.stringify(saved.step.calls) !== JSON.stringify(checkpoint.calls) ||
      saved.step.cursor.turn_id !== checkpoint.turn_id ||
      saved.step.cursor.schema_version !== checkpoint.schema_version
    )
      throw new CallerToolCustodyError(
        'The live browser checkpoint changed. No action was repeated.',
      );
    if (saved.step.state === 'completed') return saved.step.receipt!;
    if (!saved.step.actions || saved.step.actions.some((action) => action.state !== 'completed'))
      throw new CallerToolCustodyError(
        'A browser action may already have run. No action was repeated.',
      );
  } else {
    await custody.claim(checkpoint);
  }
  const outcome = await executeOwnedCallerToolCalls({
    checkpoint,
    custody,
    dispatch: input.dispatch,
    signal: input.signal,
    beforeAction: input.beforeAction,
    completedCallIds:
      saved.step?.cursor.next_event_sequence === checkpoint.next_event_sequence
        ? saved.step.actions?.map((action) => action.callId)
        : [],
  });
  if (outcome.status === 'cancelled') throw new DOMException('Cancelled.', 'AbortError');
  const { calls: _calls, ...cursor } = checkpoint;
  const receipt = CallerToolResumeRequestSchema.parse({
    ...cursor,
    tool_results: outcome.results.map((result) => ({
      tool_call_id: result.toolCallId,
      content: result.content,
    })),
  });
  return custody.complete(checkpoint, receipt);
}
