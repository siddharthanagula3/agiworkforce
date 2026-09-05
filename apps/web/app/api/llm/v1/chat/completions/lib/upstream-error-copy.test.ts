import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/services/provider-availability-service', () => ({
  markProviderDegraded: vi.fn(),
}));

import { upstreamFailureCopy } from './upstream-error-copy';

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
