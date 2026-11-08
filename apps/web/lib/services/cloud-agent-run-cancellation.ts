import 'server-only';

import type { DatabaseAdapter } from '@agiworkforce/data-layer';
import { CLOUD_AGENT_CANCELLATION_POLL_MS } from '@/lib/deadline-policy';
import { logger } from '@/lib/logger';
import { isCloudAgentRunCancellationRequested } from './cloud-agent-run-service';

interface CloudAgentRunCancellationInput {
  db: DatabaseAdapter;
  userId: string;
  runId: string;
  controller: AbortController;
}

export async function* withCloudAgentRunCancellation<T>(
  generator: AsyncGenerator<T, unknown>,
  input: CloudAgentRunCancellationInput,
): AsyncGenerator<T, unknown> {
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = (): void => {
    closed = true;
    clearTimeout(timer);
  };
  const poll = async (): Promise<void> => {
    if (closed || input.controller.signal.aborted) return;
    try {
      const requested = await isCloudAgentRunCancellationRequested(input.db, {
        userId: input.userId,
        runId: input.runId,
      });
      if (!closed && requested) input.controller.abort();
    } catch (error) {
      if (!closed)
        logger.warn({ error, runId: input.runId }, 'Could not read the run cancellation request');
    }
    if (!closed && !input.controller.signal.aborted)
      timer = setTimeout(() => void poll(), CLOUD_AGENT_CANCELLATION_POLL_MS);
  };
  input.controller.signal.addEventListener('abort', stop, { once: true });
  if (!input.controller.signal.aborted)
    timer = setTimeout(() => void poll(), CLOUD_AGENT_CANCELLATION_POLL_MS);
  try {
    return yield* generator;
  } finally {
    stop();
    input.controller.signal.removeEventListener('abort', stop);
  }
}
