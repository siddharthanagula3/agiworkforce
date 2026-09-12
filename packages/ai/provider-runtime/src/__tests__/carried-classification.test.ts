/**
 * The failure taxonomy must not be steerable by anyone who can put text into an
 * error message.
 *
 * An adapter classifies a failure while it still holds the thrown value. That
 * answer used to be flattened into an error `StreamChunk`'s prose and rebuilt
 * here by re-matching the prose, and one of the messages it had to match is
 * `UnsupportedFileInputError`, which concatenates the ATTACHMENT FILENAME the
 * requester chose. So a file named `timeout.pdf` turned a permanent refusal
 * into a retryable one, `certificate.pdf` made it look like a transport fault,
 * and `content_filter.pdf` made it look like a safety stop. Category decides
 * retry, failover and the copy the reader sees, so each of those is a real
 * routing change bought with a rename.
 *
 * These tests pin the property rather than the plumbing: given the same hostile
 * message, a carried classification must produce the same answer every time.
 */
import { describe, expect, it } from 'vitest';

import { UnsupportedFileInputError } from '@agiworkforce/types';

import { classifyError, toStreamErrorClassification } from '../errors';

const ROUTE_CAPABILITY = 'this route carries text and images only';

/**
 * Filenames whose text reads as a different failure class than the one the
 * adapter actually raised. Each was chosen because it hits a distinct branch of
 * the free-text matcher.
 */
const HOSTILE_FILENAMES = [
  'timeout.pdf',
  'certificate.pdf',
  'content_filter.pdf',
  'model-invalid.pdf',
  'prompt is too long.pdf',
] as const;

function unsupportedAttachmentError(filename: string): UnsupportedFileInputError {
  return new UnsupportedFileInputError(filename, 'application/pdf', ROUTE_CAPABILITY);
}

/**
 * What the boundary does in production: the adapter classifies, the
 * classification and the message ride an error chunk, and the consumer rebuilds
 * an `Error` from the chunk with a provider label glued on the front.
 */
function acrossTheChunkBoundary(
  filename: string,
  options: { carry: boolean } = { carry: true },
): Error {
  const source = unsupportedAttachmentError(filename);
  const classification = toStreamErrorClassification(classifyError(source));
  const chunk = {
    type: 'error' as const,
    message: source.message,
    ...(options.carry ? { classification } : {}),
  };
  const rebuilt = new Error(`OpenAI API error (unknown): ${chunk.message}`) as Error & {
    classification?: typeof classification;
  };
  if (chunk.classification) rebuilt.classification = chunk.classification;
  return rebuilt;
}

describe('a carried classification survives the stream-chunk boundary', () => {
  it.each(HOSTILE_FILENAMES)(
    'keeps an unsupported attachment named %s classified as unsupported_input',
    (filename) => {
      const classified = classifyError(acrossTheChunkBoundary(filename));

      expect(classified.category).toBe('unsupported_input');
      // The two flags a rename was able to move: retrying this route can never
      // help, and rotating to a route with a real file channel always can.
      expect(classified.retryable).toBe(false);
      expect(classified.fallbackable).toBe(true);
    },
  );

  it('classifies a hostile filename exactly as it classifies a boring one', () => {
    const hostile = classifyError(acrossTheChunkBoundary('timeout.pdf'));
    const boring = classifyError(acrossTheChunkBoundary('brief.pdf'));

    expect(hostile.category).toBe(boring.category);
    expect(hostile.code).toBe(boring.code);
    expect(hostile.retryable).toBe(boring.retryable);
    expect(hostile.fallbackable).toBe(boring.fallbackable);
  });

  it('still names the file in the message, which is display text and not a routing input', () => {
    expect(classifyError(acrossTheChunkBoundary('timeout.pdf')).message).toContain('timeout.pdf');
  });

  it('carries a rate limit whole, including the provider Retry-After', () => {
    const source = Object.assign(new Error('slow down'), { status: 429 });
    const classification = toStreamErrorClassification({
      ...classifyError(source),
      retryAfterSeconds: 42,
    });
    const rebuilt = Object.assign(new Error('OpenAI rate limit exceeded (429): slow down'), {
      classification,
    });

    const classified = classifyError(rebuilt);
    expect(classified.category).toBe('rate_limit');
    expect(classified.retryable).toBe(true);
    expect(classified.retryAfterSeconds).toBe(42);
    expect(classified.status).toBe(429);
  });
});

describe('the free-text path stays available for adapters that carry nothing', () => {
  it('is what the hostile filename was steering, so it is why the field exists', () => {
    // Not an endorsement of this answer: it is the measurement that shows the
    // carried classification above is doing the work. `timeout.pdf` reads as a
    // retryable transport failure to a matcher that has only the prose.
    const classified = classifyError(acrossTheChunkBoundary('timeout.pdf', { carry: false }));

    expect(classified.category).toBe('api_timeout');
    expect(classified.retryable).toBe(true);
  });

  it('classifies an ordinary upstream failure from its message as before', () => {
    const classified = classifyError(
      Object.assign(new Error('OpenAI API error (503): upstream busy'), { status: 503 }),
    );

    expect(classified.category).toBe('server_overload');
    expect(classified.retryable).toBe(true);
  });
});

describe('a malformed carried classification is refused rather than trusted', () => {
  it.each([
    [
      'an unknown category',
      { category: 'definitely_retry', code: 'x', retryable: true, fallbackable: true },
    ],
    [
      'a non-boolean retryable',
      { category: 'auth', code: 'x', retryable: 'yes', fallbackable: true },
    ],
    ['a missing code', { category: 'auth', retryable: false, fallbackable: false }],
    ['a non-object payload', 'rate_limit'],
  ])('ignores %s and falls back to the text matcher', (_label, classification) => {
    const rebuilt = Object.assign(new Error('OpenAI API error (503): upstream busy'), {
      status: 503,
      classification,
    });

    const classified = classifyError(rebuilt);

    expect(classified.category).toBe('server_overload');
  });
});
