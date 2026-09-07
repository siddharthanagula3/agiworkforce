import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/services/provider-availability-service', () => ({
  markProviderDegraded: vi.fn(),
}));

import { upstreamFailureCopy } from './upstream-error-copy';
import { logger } from '@/lib/logger';

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
