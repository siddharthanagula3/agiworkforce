import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CHAT_LATENCY_POINT,
  chatLatencyMarkName,
  chatLatencyMeasureName,
  startChatLatencyTrace,
} from './chat-latency';

describe('chat latency trace', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('joins the server trace without asking the server to sample it', () => {
    const trace = startChatLatencyTrace();

    expect(trace.traceparent).toMatch(new RegExp(`^00-${trace.traceId}-[0-9a-f]{16}-00$`, 'u'));
  });

  it('marks the streamed lifecycle once and records paint on the next frame', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    const mark = vi.spyOn(performance, 'mark');
    const measure = vi.spyOn(performance, 'measure');
    const trace = startChatLatencyTrace();

    trace.markFetchIssued();
    trace.markFirstChunk();
    trace.markFirstChunk();
    trace.observeAssistantText('The first sentence is ready.');
    trace.scheduleFirstPaint();
    trace.scheduleFirstPaint();
    trace.markDone();

    expect(frames).toHaveLength(1);
    frames[0]?.(performance.now());

    for (const point of Object.values(CHAT_LATENCY_POINT)) {
      expect(mark).toHaveBeenCalledWith(chatLatencyMarkName(trace.traceId, point));
    }
    expect(
      mark.mock.calls.filter(
        ([name]) => name === chatLatencyMarkName(trace.traceId, CHAT_LATENCY_POINT.firstChunk),
      ),
    ).toHaveLength(1);
    expect(measure).toHaveBeenCalledWith(
      chatLatencyMeasureName(trace.traceId, 'firstChunkToFirstPaint'),
      chatLatencyMarkName(trace.traceId, CHAT_LATENCY_POINT.firstChunk),
      chatLatencyMarkName(trace.traceId, CHAT_LATENCY_POINT.firstPaint),
    );
  });

  it('removes partial marks when an incomplete trace is cancelled', () => {
    const clearMarks = vi.spyOn(performance, 'clearMarks');
    const clearMeasures = vi.spyOn(performance, 'clearMeasures');
    const trace = startChatLatencyTrace();

    trace.markFetchIssued();
    trace.cancel();
    trace.markFirstChunk();

    for (const point of Object.values(CHAT_LATENCY_POINT)) {
      expect(clearMarks).toHaveBeenCalledWith(chatLatencyMarkName(trace.traceId, point));
    }
    expect(clearMeasures).toHaveBeenCalledWith(
      chatLatencyMeasureName(trace.traceId, 'submitToFetch'),
    );
  });
});
