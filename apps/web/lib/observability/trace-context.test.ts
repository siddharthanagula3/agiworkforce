// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  getTenantScope,
  newSpanId,
  newTraceId,
  runWithTraceContext,
  setTenantScope,
  type TraceContext,
} from './trace-context';

function baseContext(): TraceContext {
  return { traceId: newTraceId(), spanId: newSpanId(), sampled: true };
}

describe('tenant scope under a streaming producer', () => {
  it('is visible inside a ReadableStream pull invoked while still inside the run() call', async () => {
    const context = baseContext();
    const seen: unknown[] = [];

    await runWithTraceContext(context, async () => {
      setTenantScope({ organizationId: 'org-pull-inline', userId: 'user-pull-inline' });

      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          seen.push(getTenantScope());
          controller.enqueue(new Uint8Array([1]));
          controller.close();
        },
      });

      await stream.getReader().read();
    });

    expect(seen).toEqual([{ organizationId: 'org-pull-inline', userId: 'user-pull-inline' }]);
  });

  it('is visible inside a setTimeout continuation scheduled from the producer', async () => {
    const context = baseContext();
    let seen: unknown;

    await runWithTraceContext(context, async () => {
      setTenantScope({ organizationId: 'org-timeout', userId: 'user-timeout' });

      await new Promise<void>((resolve) => {
        setTimeout(() => {
          seen = getTenantScope();
          resolve();
        }, 0);
      });
    });

    expect(seen).toEqual({ organizationId: 'org-timeout', userId: 'user-timeout' });
  });

  it('survives into a pull invoked after runWithTraceContext has already returned the stream', async () => {
    const context = baseContext();
    let seenInsidePull: unknown;

    const stream = await runWithTraceContext(context, async () => {
      setTenantScope({ organizationId: 'org-detached', userId: 'user-detached' });
      return new ReadableStream<Uint8Array>({
        pull(controller) {
          seenInsidePull = getTenantScope();
          controller.enqueue(new Uint8Array([1]));
          controller.close();
        },
      });
    });

    expect(getTenantScope()).toEqual({ organizationId: undefined, userId: undefined });

    await stream.getReader().read();

    expect(seenInsidePull).toEqual({ organizationId: 'org-detached', userId: 'user-detached' });
  });

  it('survives across repeated pulls, each separated by a setTimeout, the way SSE chunks are paced', async () => {
    const context = baseContext();
    const seenPerChunk: unknown[] = [];
    const CHUNK_COUNT = 3;

    const stream = await runWithTraceContext(context, async () => {
      setTenantScope({ organizationId: 'org-multi-chunk', userId: 'user-multi-chunk' });
      let chunksSent = 0;
      return new ReadableStream<Uint8Array>({
        async pull(controller) {
          await new Promise((resolve) => setTimeout(resolve, 0));
          seenPerChunk.push(getTenantScope());
          chunksSent += 1;
          if (chunksSent >= CHUNK_COUNT) {
            controller.close();
          } else {
            controller.enqueue(new Uint8Array([chunksSent]));
          }
        },
      });
    });

    const reader = stream.getReader();
    for (let read = await reader.read(); !read.done; read = await reader.read());

    expect(seenPerChunk).toHaveLength(CHUNK_COUNT);
    for (const scope of seenPerChunk) {
      expect(scope).toEqual({ organizationId: 'org-multi-chunk', userId: 'user-multi-chunk' });
    }
  });
});
