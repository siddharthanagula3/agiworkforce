import 'server-only';

import { getWritable } from 'workflow';

import { logger } from '@/lib/logger';
import { createBoundedDurableWriter } from '../durable-stream-write';

export function reportUnreadableStream(runId: string, site: string): () => void {
  return () => {
    logger.warn(
      { runId, site },
      'The durable stream stopped taking events; the journal keeps them and the run settles anyway',
    );
  };
}

export async function writeDurableFrames(
  runId: string,
  site: string,
  frames: readonly string[],
): Promise<void> {
  const writer = getWritable<Uint8Array>().getWriter();
  try {
    const stream = createBoundedDurableWriter(writer, {
      onUnreadable: reportUnreadableStream(runId, site),
    });
    const encoder = new TextEncoder();
    for (const frame of frames) {
      await stream.write(encoder.encode(frame));
    }
  } finally {
    writer.releaseLock();
  }
}
