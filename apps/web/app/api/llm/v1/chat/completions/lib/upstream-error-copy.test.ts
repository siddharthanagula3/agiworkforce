import { AsyncLocalStorage } from 'node:async_hooks';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/services/provider-availability-service', () => ({
  markProviderDegraded: vi.fn(),
}));

import { modelRegistry } from '@agiworkforce/model-registry';
import { getProviderDisplayLabel } from '@agiworkforce/types';
import { degradationFor } from '@/lib/server/slo/degradation';
import {
  mapClassifiedUpstreamError,
  streamErrorFrame,
  toolFailureMessage,
  upstreamFailureCopy,
} from './upstream-error-copy';
import { logger } from '@/lib/logger';
import { markProviderDegraded } from '@/lib/services/provider-availability-service';
import {
  installTraceStorage,
  runWithTraceContext,
  setRequestId,
  type TraceContext,
} from '@/lib/observability/trace-context';

const PROVIDER = 'anthropic';

/**
 * The verbatim shape observed in the transcript on 2026-09-05: the provider
 * SDK formats its own `message` as the HTTP status followed by the raw JSON
 * error body, and the durable agent workflow emitted it unmapped, so the row
 * read `Failed: 400 {"type":"error"...`.
 */
const RAW_PROVIDER_BODY =
  '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the API. Please go to Plans & Billing to upgrade or purchase credits."}}';

const PAYLOAD_MARKERS = ['{', '}', '":', 'invalid_request_error'];

describe('mapping a thrown provider failure to copy', () => {
  it('never carries a serialized payload through, whatever the provider wrote', () => {
    const copy = upstreamFailureCopy(new Error(RAW_PROVIDER_BODY), PROVIDER);

    for (const marker of PAYLOAD_MARKERS) expect(copy.message).not.toContain(marker);
    expect(copy.message).not.toContain(RAW_PROVIDER_BODY);
  });

  it('names an unfunded platform account as our problem, not the reader’s request', () => {
    const copy = upstreamFailureCopy(new Error(RAW_PROVIDER_BODY), PROVIDER);

    expect(copy.code).toBe('provider_billing_exhausted');
    expect(copy.message).toContain('unavailable right now');
    expect(copy.message).toContain('on our side');
  });

  it('never repeats the provider’s own words about billing or credit', () => {
    const copy = upstreamFailureCopy(new Error(RAW_PROVIDER_BODY), PROVIDER);

    expect(copy.message.toLowerCase()).not.toContain('credit');
    expect(copy.message.toLowerCase()).not.toContain('billing');
    expect(copy.message.toLowerCase()).not.toContain(PROVIDER);
  });

  it('gives a failure that is not an upstream refusal taxonomy copy, not its internals', () => {
    const copy = upstreamFailureCopy(
      new TypeError('cannot read properties of undefined'),
      PROVIDER,
    );

    expect(copy.code).toBe('provider_error');
    expect(copy.message).not.toContain('undefined');
  });

  it('carries a 402 with no body through the same class', () => {
    const copy = upstreamFailureCopy(Object.assign(new Error(''), { status: 402 }), PROVIDER);

    expect(copy.code).toBe('provider_billing_exhausted');
  });

  /**
   * Classifying and describing the failure was never the gap. Recording it was:
   * on 2026-09-12 every Claude route answered with this body and the catalogue
   * went on offering Claude as selectable, so each turn rediscovered the same
   * empty wallet. The mark is what the catalogue reads.
   */
  it('takes an unfunded provider out of service instead of rediscovering it each turn', () => {
    vi.mocked(markProviderDegraded).mockClear();

    upstreamFailureCopy(new Error(RAW_PROVIDER_BODY), PROVIDER);

    expect(markProviderDegraded).toHaveBeenCalledWith(PROVIDER, 'billing_exhausted');
  });

  it('reports the 402 form the same way', () => {
    vi.mocked(markProviderDegraded).mockClear();

    upstreamFailureCopy(Object.assign(new Error(''), { status: 402 }), PROVIDER);

    expect(markProviderDegraded).toHaveBeenCalledWith(PROVIDER, 'billing_exhausted');
  });

  it('leaves a provider that merely refused our request in service', () => {
    vi.mocked(markProviderDegraded).mockClear();

    upstreamFailureCopy(new TypeError('cannot read properties of undefined'), PROVIDER);

    expect(markProviderDegraded).not.toHaveBeenCalled();
  });
});

describe('a provider refusal is diagnosable from the log', () => {
  const GEMINI_REJECTION =
    '400 {"error":{"code":400,"message":"Invalid value at \'tools[0].function_declarations[0].parameters.properties[0].value.default\' (TYPE_STRING), null","status":"INVALID_ARGUMENT"}}';

  it('writes the provider refusal at warn with the request id, and keeps it out of the copy', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

    const copy = upstreamFailureCopy(
      Object.assign(new Error(GEMINI_REJECTION), { status: 400 }),
      'google',
    );

    expect(warn).toHaveBeenCalledTimes(1);
    const [fields] = warn.mock.calls[0] as [Record<string, unknown>, string];
    expect(fields['provider']).toBe('google');
    expect(String(fields['providerMessage'])).toContain('function_declarations');
    expect(fields).toHaveProperty('requestId');
    expect(copy.message).not.toContain('function_declarations');
    warn.mockRestore();
  });

  it('says nothing for a failure that is not a refusal of what we sent', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);

    upstreamFailureCopy(new Error('socket hang up'), 'google');

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('a request that is already on Auto', () => {
  const AUTO = modelRegistry.policies.auto.defaultAlias;

  function overloaded(): Error {
    return Object.assign(new Error('{"type":"overloaded_error"}'), { status: 529 });
  }

  it('never tells the reader to choose Auto', () => {
    const copy = upstreamFailureCopy(overloaded(), PROVIDER, { requestedModel: AUTO });

    expect(copy.message).not.toMatch(/Auto to use another available model/);
    expect(copy.message).toContain('pick a specific model from the model picker');
    expect(copy.code).toBe('provider_overloaded');
  });

  it.each([
    ['rate limit', Object.assign(new Error('rate limit exceeded'), { status: 429 })],
    ['unreachable', new Error('fetch failed: ECONNRESET')],
    ['empty answer', Object.assign(new Error('server error'), { status: 500 })],
    ['unknown model', Object.assign(new Error('model not found: nope'), { status: 404 })],
  ])('names the one move left for %s', (_label, error) => {
    const copy = upstreamFailureCopy(error, PROVIDER, { requestedModel: AUTO });

    expect(copy.message).not.toMatch(/choose Auto|switch to Auto/);
    expect(copy.message).toContain('model picker');
  });

  it('keeps the Auto suggestion for a caller who pinned a model', () => {
    const copy = upstreamFailureCopy(overloaded(), PROVIDER, {
      requestedModel: 'some-pinned-model',
    });

    expect(copy.message).toContain('choose Auto to use another available model');
  });

  it('keeps the Auto suggestion for a caller that reports no selection', () => {
    expect(upstreamFailureCopy(overloaded(), PROVIDER).message).toContain('choose Auto');
  });
});

describe('a request on the free plan model', () => {
  const FREE_ROUTER = modelRegistry.policies.auto.slots.router_zero_cost.modelKey;

  it.each([
    ['rate limit', Object.assign(new Error('rate limit exceeded'), { status: 429 })],
    ['overload', Object.assign(new Error('{"type":"overloaded_error"}'), { status: 529 })],
    ['unreachable', new Error('fetch failed: ECONNRESET')],
    ['empty answer', Object.assign(new Error('server error'), { status: 500 })],
    ['unknown model', Object.assign(new Error('model not found: nope'), { status: 404 })],
  ])('never points at Auto or a picker the free plan lacks for %s', (_label, error) => {
    const copy = upstreamFailureCopy(error, PROVIDER, { requestedModel: FREE_ROUTER });

    expect(copy.message).not.toMatch(/Auto|model picker|another model/);
    expect(copy.message).toMatch(/Try again/);
  });

  it('keeps the code a client branches on', () => {
    const limited = Object.assign(new Error('rate limit exceeded'), { status: 429 });
    const free = upstreamFailureCopy(limited, PROVIDER, { requestedModel: FREE_ROUTER });
    const pinned = upstreamFailureCopy(limited, PROVIDER, { requestedModel: 'some-pinned-model' });

    expect(free.code).toBe(pinned.code);
    expect(free.message).not.toBe(pinned.message);
  });
});

describe('a spent free pool', () => {
  const spentDay = () =>
    Object.assign(new Error('Rate limit exceeded: free-models-per-day'), { status: 429 });

  it('does not take the provider out of service for the plans that pay for it', () => {
    vi.mocked(markProviderDegraded).mockClear();
    const copy = upstreamFailureCopy(spentDay(), PROVIDER, { requestedModel: 'some-pinned-model' });

    expect(copy.code).toBe('provider_quota_exhausted');
    expect(markProviderDegraded).not.toHaveBeenCalled();
  });

  it('says whose allowance it is, whoever asked', () => {
    const copy = upstreamFailureCopy(spentDay(), PROVIDER, { requestedModel: 'some-pinned-model' });

    expect(copy.message).toMatch(/everyone on the Free plan shares/);
    expect(copy.message).toMatch(/not a limit on your account/);
  });

  it('still marks the provider for a quota window that is the provider own', () => {
    vi.mocked(markProviderDegraded).mockClear();
    upstreamFailureCopy(
      Object.assign(new Error('Quota exceeded for this project'), { status: 429 }),
      PROVIDER,
      { requestedModel: 'some-pinned-model' },
    );

    expect(markProviderDegraded).toHaveBeenCalledTimes(1);
  });
});

describe('the chat degraded mode the status page publishes', () => {
  it('tells the reader what the policy says it will', () => {
    const policy = degradationFor('chat');
    expect(policy).toBeDefined();
    const overload = Object.assign(new Error('{"type":"overloaded_error"}'), { status: 529 });
    expect(upstreamFailureCopy(overload, PROVIDER).message).toContain(policy!.message);
  });
});

const TRACE: TraceContext = {
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

function rateLimited(retryAfterSeconds?: number): Error {
  return Object.assign(new Error('rate limit exceeded'), {
    status: 429,
    ...(retryAfterSeconds !== undefined
      ? { headers: { 'retry-after': String(retryAfterSeconds) } }
      : {}),
  });
}

function windowSpent(retryAfterSeconds?: number): Error {
  return Object.assign(new Error('quota exceeded for this window'), {
    status: 429,
    ...(retryAfterSeconds !== undefined
      ? { headers: { 'retry-after': String(retryAfterSeconds) } }
      : {}),
  });
}

const FREE_ROUTER_MODEL = modelRegistry.policies.auto.slots.router_zero_cost.modelKey;
const FREE_PLAN = { requestedModel: FREE_ROUTER_MODEL };

describe('the one model the free plan has', () => {
  it('does not describe a momentary limit and a spent shared allowance the same way', () => {
    const momentary = upstreamFailureCopy(rateLimited(), PROVIDER, FREE_PLAN);
    const spent = upstreamFailureCopy(windowSpent(), PROVIDER, FREE_PLAN);

    expect(momentary.message).not.toBe(spent.message);
    expect(momentary.code).not.toBe(spent.code);
  });

  it('says a spent allowance is shared by the plan, not a limit on the reader', () => {
    const spent = upstreamFailureCopy(windowSpent(), PROVIDER, FREE_PLAN);

    expect(spent.message).toMatch(/shares?/i);
    expect(spent.message).toMatch(/not a limit on your account/i);
  });

  it('never invents a reset the provider did not state', () => {
    const spent = upstreamFailureCopy(windowSpent(), PROVIDER, FREE_PLAN);

    expect(spent.message).not.toMatch(/\d/);
    expect(spent.message).not.toMatch(/hours|minutes|tomorrow|later today/i);
  });
});

describe('a wait the provider itself asked for', () => {
  it('reaches the caller as data, in seconds', () => {
    const shape = mapClassifiedUpstreamError(
      {
        category: 'rate_limit',
        code: 'rate_limit_429',
        retryable: true,
        fallbackable: true,
        retryAfterSeconds: 42,
        message: 'slow down',
      },
      PROVIDER,
    );

    expect(shape.retryAfterSeconds).toBe(42);
  });

  it('is the wait the reader is told about, rather than a vague moment', () => {
    const copy = upstreamFailureCopy(rateLimited(45), PROVIDER, FREE_PLAN);

    expect(copy.message).toContain('45 seconds');
  });

  it('reads in minutes once seconds stop being useful', () => {
    const copy = upstreamFailureCopy(rateLimited(600), PROVIDER);

    expect(copy.message).toContain('10 minutes');
  });

  it('states no wait at all when the response carried none', () => {
    const copy = upstreamFailureCopy(rateLimited(), PROVIDER);
    const shape = mapClassifiedUpstreamError(
      {
        category: 'rate_limit',
        code: 'rate_limit_429',
        retryable: true,
        fallbackable: true,
        message: 'slow down',
      },
      PROVIDER,
    );

    expect(copy.message).not.toMatch(/\d/);
    expect(shape.retryAfterSeconds).toBeUndefined();
  });

  it('refuses a figure no honest message could carry', () => {
    const shape = mapClassifiedUpstreamError(
      {
        category: 'rate_limit',
        code: 'rate_limit_429',
        retryable: true,
        fallbackable: true,
        retryAfterSeconds: 400_000,
        message: 'slow down',
      },
      PROVIDER,
    );

    expect(shape.retryAfterSeconds).toBeUndefined();
    expect(shape.message).not.toMatch(/\d/);
  });
});

describe('the id a reader can quote to support', () => {
  it('rides on the failure the same way it rides on the log line', () => {
    const shape = runWithTraceContext({ ...TRACE }, () => {
      setRequestId('req_abc123def456');
      return mapClassifiedUpstreamError(
        {
          category: 'server_overload',
          code: 'overloaded_529',
          retryable: true,
          fallbackable: true,
          message: 'overloaded',
        },
        PROVIDER,
      );
    });

    expect(shape.requestId).toBe('req_abc123def456');
    expect(shape.message).not.toContain('req_abc123def456');
  });

  it('is absent rather than invented when nothing recorded one', () => {
    const shape = mapClassifiedUpstreamError(
      {
        category: 'server_overload',
        code: 'overloaded_529',
        retryable: true,
        fallbackable: true,
        message: 'overloaded',
      },
      PROVIDER,
    );

    expect(shape.requestId).toBeUndefined();
  });

  it('travels on the mid-stream frame a client reads, with the wait beside it', () => {
    const shape = runWithTraceContext({ ...TRACE }, () => {
      setRequestId('req_abc123def456');
      return mapClassifiedUpstreamError(
        {
          category: 'rate_limit',
          code: 'rate_limit_429',
          retryable: true,
          fallbackable: true,
          retryAfterSeconds: 30,
          message: 'slow down',
        },
        PROVIDER,
      );
    });

    expect(streamErrorFrame(shape, true)).toEqual({
      message: shape.message,
      code: 'provider_rate_limited',
      retryable: true,
      retryAfterSeconds: 30,
      requestId: 'req_abc123def456',
    });
  });
});

describe('naming the provider a reader is waiting on', () => {
  it('uses the name the picker shows, never the internal key', () => {
    const copy = upstreamFailureCopy(windowSpent(), 'open_router');

    expect(copy.message).toContain(getProviderDisplayLabel('open_router'));
    expect(copy.message).not.toContain('open_router');
  });

  it('keeps a provider-side shortfall off the reader’s account', () => {
    const copy = upstreamFailureCopy(Object.assign(new Error(''), { status: 402 }), PROVIDER);

    // Our provider account ran short. Naming the reader's own is the implication to avoid.
    expect(copy.message).toMatch(/on our side, not with your request/i);
    expect(copy.message).not.toMatch(/your (credit|balance|account)/i);
  });
});

describe('an attachment refusal carries the reader’s own filename', () => {
  it('states the refusal on one line, whatever the file was called', () => {
    const crafted = `report\n\n    at Object.<anonymous> (/Users/someone/secret/path.ts:4:11)`;
    const copy = mapClassifiedUpstreamError(
      {
        category: 'unsupported_input',
        code: 'unsupported_input',
        retryable: false,
        fallbackable: true,
        message: `${crafted} is a application/zip file, which this model cannot read: documents. Choose a model that accepts documents, or attach the content as text.`,
      },
      PROVIDER,
    );

    expect(copy.message).not.toContain('\n');
    expect(copy.message).not.toContain('/Users/someone');
    expect(copy.message).toContain('which this model cannot read');
  });
});

describe('a tool that threw on its way to the transcript', () => {
  it('keeps the stack and the machine it ran on out of what the reader sees', () => {
    const thrown = new Error('ENOENT: no such file or directory, open /Users/someone/.env.local');
    thrown.stack = `${thrown.message}\n    at readFile (/Users/someone/app/node_modules/x/index.js:22:9)`;

    const text = toolFailureMessage('read_file', thrown);

    expect(text).not.toContain('/Users/someone');
    expect(text).not.toContain('at readFile');
    expect(text).toContain('read_file');
  });

  it('says something usable when the thrown value carried no words at all', () => {
    expect(toolFailureMessage('web_search', {})).toContain('web_search');
    expect(toolFailureMessage('web_search', {})).not.toContain('[object Object]');
  });
});

describe('a provider the catalogue must stop offering', () => {
  it.each([
    [
      'overloaded',
      Object.assign(new Error('{"type":"overloaded_error"}'), { status: 529 }),
      'server_overload',
    ],
    ['spent for the window', windowSpent(), 'quota_exhausted'],
  ])('is marked degraded when it is %s', (_label, error, category) => {
    vi.mocked(markProviderDegraded).mockClear();

    upstreamFailureCopy(error, PROVIDER);

    expect(markProviderDegraded).toHaveBeenCalledWith(PROVIDER, category);
  });
});
