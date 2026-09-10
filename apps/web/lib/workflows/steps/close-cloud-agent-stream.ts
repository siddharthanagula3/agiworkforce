import 'server-only';

import { getWritable } from 'workflow';

import { createBoundedDurableWriter } from '../durable-stream-write';
import { reportUnreadableStream } from './durable-stream-frames';

const CLOUD_AGENT_STREAM_DONE_FRAME = 'data: [DONE]\n\n';

export async function closeCloudAgentWorkflowStream(runId: string): Promise<void> {
  'use step';
  const writer = getWritable<Uint8Array>().getWriter();
  const stream = createBoundedDurableWriter(writer, {
    onUnreadable: reportUnreadableStream(runId, 'close'),
  });
  await stream.write(new TextEncoder().encode(CLOUD_AGENT_STREAM_DONE_FRAME));
  await stream.close();
}
