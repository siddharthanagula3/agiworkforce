/**
 * WEB-SEC-SCAN-2026-09-09-F8: the router must not re-derive the failure
 * taxonomy from text a requester can write into.
 *
 * `providerUpstreamError` rebuilds an `Error` from a provider error chunk by
 * concatenating a label, a status and the chunk's message. One of the messages
 * that reaches it is the refusal for an attachment a route cannot read, and
 * that message is built from the ATTACHMENT FILENAME. Every routing decision
 * downstream (retry, rotate, the copy the reader sees) comes out of
 * `classifyError`, so with nothing structured to read, the classifier matched
 * the filename and the requester picked the failure class.
 *
 * These tests pin the two consequences that matter: the category is stable
 * across hostile names, and failover eligibility does not move with it.
 */
import { describe, expect, it, vi } from 'vitest';

import type { StreamChunk, StreamChunkErrorClassification } from '@agiworkforce/types';
import { classifyError, toStreamErrorClassification } from '@agiworkforce/provider-runtime';
import { UnsupportedFileInputError } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/lib/model-tiers', () => ({ canAccessModel: vi.fn(() => true) }));
vi.mock('@/lib/services/provider-adapter-service', () => ({
  resolveProviderFromModel: vi.fn(() => 'openai'),
  listAvailableManagedProviderIds: () => new Set<string>(),
}));
vi.mock('./request-processor', () => ({
  resolveRequestEffort: vi.fn(() => undefined),
  buildThinkingConfig: vi.fn(() => undefined),
}));

import { toUpstreamError, toOpenAIUpstreamError } from './adapter-errors';
import { isFailoverEligibleError } from './managed-failover';

const ROUTE_CAPABILITY = 'this route carries text and images only';

/**
 * Each filename reads as a different failure class to a matcher that has only
 * the message: a transport fault, a safety stop, a timeout, a bad model. The
 * refusal the adapter actually raised is the same one every time.
 */
const HOSTILE_FILENAMES = [
  'timeout.pdf',
  'certificate.pdf',
  'content_filter.pdf',
  'model-invalid.pdf',
] as const;

function refusalChunk(
  filename: string,
  options: { carry: boolean } = { carry: true },
): Extract<StreamChunk, { type: 'error' }> {
  const refusal = new UnsupportedFileInputError(filename, 'application/pdf', ROUTE_CAPABILITY);
  const classification: StreamChunkErrorClassification = toStreamErrorClassification(
    classifyError(refusal),
  );
  return {
    type: 'error',
    message: refusal.message,
    retryable: false,
    ...(options.carry ? { classification } : {}),
  };
}

describe('toUpstreamError carries the adapter classification instead of re-deriving it', () => {
  it.each(HOSTILE_FILENAMES)('holds unsupported_input for an attachment named %s', (filename) => {
    const classified = classifyError(toUpstreamError(refusalChunk(filename)));

    expect(classified.category).toBe('unsupported_input');
    expect(classified.retryable).toBe(false);
    expect(classified.fallbackable).toBe(true);
  });

  it('gives the same answer for every provider label', () => {
    const anthropic = classifyError(toUpstreamError(refusalChunk('timeout.pdf')));
    const openai = classifyError(toOpenAIUpstreamError(refusalChunk('timeout.pdf')));

    expect(anthropic.category).toBe(openai.category);
    expect(anthropic.code).toBe(openai.code);
  });

  it('keeps the filename in the message, which is display text and not a routing input', () => {
    const error = toUpstreamError(refusalChunk('timeout.pdf'));

    expect(error.message).toContain('timeout.pdf');
    expect(classifyError(error).category).toBe('unsupported_input');
  });

  it('still honours a structured Retry-After the chunk carries', () => {
    const error = toUpstreamError({
      type: 'error',
      code: '429',
      message: 'slow down',
      retryable: true,
      retryAfterSeconds: 17,
    });

    const classified = classifyError(error);
    expect(classified.category).toBe('rate_limit');
    expect(classified.retryAfterSeconds).toBe(17);
  });

  it('falls back to the message for a chunk with no classification, as before', () => {
    // The adapters that emit a mid-stream provider error (OpenAI Responses
    // events, a Gemini prompt block) have no classifier result to attach, so
    // the text path has to keep working. This is also the measurement showing
    // the carried field is what stops the rename: without it, `timeout.pdf`
    // reads as a retryable transport failure.
    const classified = classifyError(
      toUpstreamError(refusalChunk('timeout.pdf', { carry: false })),
    );

    expect(classified.category).toBe('api_timeout');
    expect(classified.retryable).toBe(true);
  });
});

describe('the routing decision the filename was able to move', () => {
  it.each(HOSTILE_FILENAMES)(
    'keeps an attachment named %s eligible for the rotation that can actually answer it',
    (filename) => {
      expect(isFailoverEligibleError(toUpstreamError(refusalChunk(filename)))).toBe(true);
    },
  );

  it('would otherwise have been ended by a filename that reads as a safety stop', () => {
    // `safety` sits in NEVER_ROTATE_CATEGORIES, so naming the file
    // `content_filter.pdf` used to end the turn on the first route rather than
    // move it to one with a real file channel. The reader was then told the
    // provider's safety system stopped the response, about their own PDF.
    const derivedFromText = classifyError(
      toUpstreamError(refusalChunk('content_filter.pdf', { carry: false })),
    );

    expect(derivedFromText.category).toBe('safety');
    expect(isFailoverEligibleError(toUpstreamError(refusalChunk('content_filter.pdf')))).toBe(true);
  });
});
