import { AsyncLocalStorage } from 'node:async_hooks';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  getRequestId,
  installTraceStorage,
  runWithTraceContext,
  setRequestId,
  traceLogFields,
  type TraceContext,
} from '@/lib/observability/trace-context';
import {
  REQUEST_ID_CARRIER_KEY,
  carriedTraceContext,
  runWithCarriedTrace,
  withTraceCarrier,
} from '@/lib/observability/trace-propagation';

import { beginOperation, operationLogFields, withOperationCarrier } from '../operation-identity';

const CONTEXT: TraceContext = {
  traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
  spanId: '00f067aa0ba902b7',
  sampled: true,
};

beforeAll(() => {
  const storage = new AsyncLocalStorage<TraceContext>();
  installTraceStorage({
    getStore: () => storage.getStore(),
    run: (store, fn) => storage.run(store, fn),
  });
});

describe('request id reaches every log line', () => {
  it('is absent until the request handler sets it', () => {
    runWithTraceContext({ ...CONTEXT }, () => {
      expect(traceLogFields()).not.toHaveProperty('request_id');
      setRequestId('req_support_1234');
      expect(traceLogFields()['request_id']).toBe('req_support_1234');
      expect(getRequestId()).toBe('req_support_1234');
    });
  });

  it('keeps the trace fields the logger already emitted', () => {
    runWithTraceContext({ ...CONTEXT, requestId: 'req_a' }, () => {
      expect(traceLogFields()).toEqual({
        trace_id: CONTEXT.traceId,
        span_id: CONTEXT.spanId,
        request_id: 'req_a',
      });
    });
  });
});

describe('a job or tool call inherits the trace and the request id', () => {
  it('carries both into the payload and back out', () => {
    const payload = runWithTraceContext({ ...CONTEXT, requestId: 'req_b' }, () =>
      withTraceCarrier({ jobId: 'j1' }),
    );
    expect(payload[REQUEST_ID_CARRIER_KEY]).toBe('req_b');

    const restored = carriedTraceContext(payload);
    expect(restored?.traceId).toBe(CONTEXT.traceId);
    expect(restored?.requestId).toBe('req_b');

    runWithCarriedTrace(payload, () => {
      expect(traceLogFields()['request_id']).toBe('req_b');
    });
  });

  it('carries the operation identity a retry has to keep', () => {
    const identity = beginOperation({ requestId: 'req_b', parentTaskId: 'task_1' });
    const payload = runWithTraceContext({ ...CONTEXT, requestId: 'req_b' }, () =>
      withOperationCarrier(withTraceCarrier({ jobId: 'j1' }), identity),
    );
    expect(payload[REQUEST_ID_CARRIER_KEY]).toBe(operationLogFields(identity).request_id);
  });

  it('adds nothing when there is no trace to carry', () => {
    const payload = withTraceCarrier({ jobId: 'j1' });
    expect(payload).toEqual({ jobId: 'j1' });
    expect(carriedTraceContext(payload)).toBeNull();
  });
});
