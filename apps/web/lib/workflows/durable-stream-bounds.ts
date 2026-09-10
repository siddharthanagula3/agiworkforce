import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import {
  DURABLE_STREAM_DETACH_DEADLINE_MS,
  DURABLE_STREAM_SILENCE_DEADLINE_MS,
} from '@/lib/deadline-policy';
import { logger } from '@/lib/logger';
import { endStalledCloudAgentRun } from '@/lib/services/cloud-agent-run-termination';

export const DURABLE_STREAM_SILENT_CODE = 'run_stream_silent';

export const DURABLE_STREAM_SILENT_MESSAGE =
  'This turn stopped reporting progress and was ended. Nothing further was charged for it.';

export const DURABLE_STREAM_DETACH_REASON = 'function_budget';

export interface DurableStreamBoundOptions {
  silenceMs?: number;
  detachMs?: number;
  onSilence: () => Promise<void>;
  onDetach?: () => Promise<void>;
  runId?: string | undefined;
}

const encoder = new TextEncoder();

function sseFrame(payload: unknown): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

const DONE_FRAME = encoder.encode('data: [DONE]\n\n');

function silenceFrame(): Uint8Array {
  return sseFrame({
    choices: [
      {
        delta: {
          x_stream_error: {
            message: DURABLE_STREAM_SILENT_MESSAGE,
            code: DURABLE_STREAM_SILENT_CODE,
            retryable: true,
          },
        },
        index: 0,
      },
    ],
  });
}

function detachFrame(runId: string | undefined): Uint8Array {
  return sseFrame({
    choices: [
      {
        delta: {
          x_run_detached: {
            ...(runId ? { run_id: runId } : {}),
            reason: DURABLE_STREAM_DETACH_REASON,
          },
        },
        index: 0,
      },
    ],
  });
}

type Verdict = 'silent' | 'detach';

// Silence past the bound means the workflow died: close with the terminal error frame
// and end the run. A healthy stream at the detach bound is handed back to the client,
// which re-attaches through the journal while the run continues. Must sit inside the
// heartbeat wrapper: a keepalive this server writes is not evidence the workflow is alive.
export function boundDurableStreamLifetime(
  source: ReadableStream<Uint8Array>,
  options: DurableStreamBoundOptions,
): ReadableStream<Uint8Array> {
  const silenceMs = options.silenceMs ?? DURABLE_STREAM_SILENCE_DEADLINE_MS;
  const detachMs = options.detachMs ?? DURABLE_STREAM_DETACH_DEADLINE_MS;
  const reader = source.getReader();

  let announce: (verdict: Verdict) => void = () => undefined;
  const verdict = new Promise<Verdict>((resolve) => {
    announce = resolve;
  });
  let silenceTimer: ReturnType<typeof setTimeout> = setTimeout(() => announce('silent'), silenceMs);
  const detachTimer: ReturnType<typeof setTimeout> = setTimeout(() => announce('detach'), detachMs);
  const restartSilenceTimer = (): void => {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => announce('silent'), silenceMs);
  };
  const stopTimers = (): void => {
    clearTimeout(silenceTimer);
    clearTimeout(detachTimer);
  };

  let settled = false;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (settled) return;
      const outcome = await Promise.race([reader.read(), verdict]);
      if (settled) return;

      if (outcome === 'silent' || outcome === 'detach') {
        settled = true;
        stopTimers();
        controller.enqueue(outcome === 'silent' ? silenceFrame() : detachFrame(options.runId));
        controller.enqueue(DONE_FRAME);
        await reader.cancel().catch(() => undefined);
        if (outcome === 'silent') await options.onSilence();
        else await options.onDetach?.();
        controller.close();
        return;
      }

      if (outcome.done) {
        settled = true;
        stopTimers();
        controller.close();
        return;
      }
      restartSilenceTimer();
      controller.enqueue(outcome.value);
    },
    cancel(reason) {
      settled = true;
      stopTimers();
      void reader.cancel(reason).catch(() => undefined);
    },
  });
}

export interface DurableTurnStreamInput {
  readable: ReadableStream<Uint8Array>;
  db: DatabaseAdapter;
  userId: string;
  runId: string;
  workflowRunId: string;
  requestId: string;
}

export function boundDurableTurnStream(input: DurableTurnStreamInput): ReadableStream<Uint8Array> {
  const context = {
    userId: input.userId,
    requestId: input.requestId,
    runId: input.runId,
    workflowRunId: input.workflowRunId,
  };
  return boundDurableStreamLifetime(input.readable, {
    runId: input.runId,
    onSilence: async () => {
      logger.error(
        { ...context, event: 'durable_stream_silent' },
        'Durable stream went silent past its bound; ending the run and cancelling the world',
      );
      await endStalledCloudAgentRun(input.db, {
        runId: input.runId,
        userId: input.userId,
        workflowRunId: input.workflowRunId,
        message: DURABLE_STREAM_SILENT_MESSAGE,
        code: DURABLE_STREAM_SILENT_CODE,
        summary: 'Stopped reporting progress.',
      }).catch((error: unknown) => {
        logger.warn({ ...context, error }, 'A silent durable run was not journalled');
      });
    },
    onDetach: async () => {
      logger.info(
        { ...context, event: 'durable_stream_detached' },
        'Durable stream reached this function budget; the run continues and the client re-attaches',
      );
    },
  });
}
