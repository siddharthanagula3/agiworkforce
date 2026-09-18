import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  TRACEPARENT_HEADER,
  getProviderTracer,
  installProviderTracer,
  traceHeaders,
  withProviderSpan,
  type ProviderCallDescriptor,
  type ProviderTracer,
} from '../tracing';

const TRACEPARENT = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

function recordingTracer(): ProviderTracer & { calls: ProviderCallDescriptor[] } {
  const calls: ProviderCallDescriptor[] = [];
  return {
    calls,
    async runInSpan(call, fn) {
      calls.push(call);
      return fn();
    },
    currentTraceparent: () => TRACEPARENT,
  };
}

describe('provider tracing hook', () => {
  afterEach(() => {
    installProviderTracer(null);
  });

  it('runs the call untouched on a surface with no tracer', async () => {
    expect(getProviderTracer()).toBeNull();
    await expect(
      withProviderSpan({ providerId: 'anthropic', operation: 'stream' }, async () => 'result'),
    ).resolves.toBe('result');
    expect(traceHeaders()).toEqual({});
  });

  it('hands the host tracer the provider, operation and model', async () => {
    const tracer = recordingTracer();
    installProviderTracer(tracer);

    await withProviderSpan(
      { providerId: 'openai', operation: 'stream', model: 'a-model' },
      async () => 'result',
    );

    expect(tracer.calls).toEqual([{ providerId: 'openai', operation: 'stream', model: 'a-model' }]);
    expect(traceHeaders()).toEqual({ [TRACEPARENT_HEADER]: TRACEPARENT });
  });

  it('lets the call reject through the span rather than swallowing it', async () => {
    installProviderTracer(recordingTracer());
    const failing = vi.fn(async () => {
      throw new Error('upstream down');
    });

    await expect(
      withProviderSpan({ providerId: 'anthropic', operation: 'stream' }, failing),
    ).rejects.toThrow('upstream down');
  });

  it('emits no header when the host is outside a trace', () => {
    installProviderTracer({ ...recordingTracer(), currentTraceparent: () => null });
    expect(traceHeaders()).toEqual({});
  });

  it('uninstalls cleanly, so a surface can opt back out', () => {
    installProviderTracer(recordingTracer());
    expect(getProviderTracer()).not.toBeNull();
    installProviderTracer(null);
    expect(getProviderTracer()).toBeNull();
  });
});
