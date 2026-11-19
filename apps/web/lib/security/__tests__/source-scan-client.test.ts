// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  createFakeScanner,
  PROTOCOL_2,
  SCANNER_ENV,
} from '@/lib/server/chat-file-intake/__tests__/fake-scanner';
import {
  judgeSourceScanVerdict,
  parseRetryAfterMs,
  readScannerCapability,
  readSourceScan,
  sourceScanEndpoint,
  submitSourceScan,
  type SourceScanRequest,
} from '../source-scan-client';

const JOB_ID = PROTOCOL_2.requests.submit['jobId'] as string;
const REQUEST = PROTOCOL_2.requests.submit as unknown as SourceScanRequest;

function submitWith(answer: string) {
  const scanner = createFakeScanner({ submit: () => ({ answer }) });
  return { scanner, result: submitSourceScan(REQUEST, scanner.options) };
}

function pollWith(answer: string) {
  const scanner = createFakeScanner({ poll: () => ({ answer }) });
  return { scanner, result: readSourceScan(JOB_ID, scanner.options) };
}

describe('source scan endpoint', () => {
  it('serves protocol 2 beside the legacy scan route of the configured scanner', () => {
    expect(sourceScanEndpoint('/v2/scans', { env: SCANNER_ENV })?.toString()).toBe(
      'https://scanner.test/v2/scans',
    );
    expect(
      sourceScanEndpoint('/v2/capability', {
        env: { UPLOAD_SCAN_WEBHOOK_URL: 'https://scanner.test/' },
      })?.toString(),
    ).toBe('https://scanner.test/v2/capability');
    expect(sourceScanEndpoint('/v2/scans', { env: {} })).toBeNull();
  });
});

describe('submitSourceScan', () => {
  it('posts the fixture request with the bearer token and reads the deadline', async () => {
    const { scanner, result } = submitWith('submitAccepted');
    await expect(result).resolves.toEqual({
      kind: 'accepted',
      scanId: JOB_ID,
      deadlineMs: 130000,
    });
    const [call] = scanner.submits();
    expect(call?.body).toEqual(PROTOCOL_2.requests.submit);
    expect(call?.authorization).toBe(`Bearer ${SCANNER_ENV.UPLOAD_SCAN_WEBHOOK_TOKEN}`);
  });

  it.each([
    ['submitQueueFull', 'queue_full', 60_000],
    ['submitSourceBudget', 'source_budget', 877_000],
  ])('reads %s as a deferral with its reason and Retry-After', async (answer, reason, ms) => {
    await expect(submitWith(answer).result).resolves.toEqual({
      kind: 'deferred',
      reason,
      retryAfterMs: ms,
    });
  });

  it.each([
    ['submitInvalid', 400, 'invalid_request'],
    ['submitSourceNotAllowed', 400, 'source_not_allowed'],
    ['submitTooLarge', 413, 'too_large'],
    ['unauthorized', 401, 'unauthorized'],
  ])('reads %s as a refusal', async (answer, status, reason) => {
    await expect(submitWith(answer).result).resolves.toEqual({ kind: 'refused', status, reason });
  });

  it('reads an unreachable scanner as unavailable', async () => {
    const scanner = createFakeScanner({ submit: () => 'unreachable' });
    await expect(submitSourceScan(REQUEST, scanner.options)).resolves.toMatchObject({
      kind: 'unavailable',
    });
  });
});

describe('readSourceScan', () => {
  it('polls the job path the scanner decodes', async () => {
    const { scanner, result } = pollWith('pollQueued');
    await expect(result).resolves.toEqual({ kind: 'queued', deadlineMs: 130000 });
    expect(scanner.polls()[0]?.jobId).toBe(JOB_ID);
  });

  it('reads scanning and unknown', async () => {
    await expect(pollWith('pollScanning').result).resolves.toEqual({
      kind: 'scanning',
      deadlineMs: 130000,
    });
    await expect(pollWith('pollUnknown').result).resolves.toEqual({ kind: 'unknown' });
  });

  it.each([
    ['pollDoneClean', { kind: 'clean' }],
    ['pollDoneInfected', { kind: 'rejected', refusalCode: 'malware' }],
    ['pollDoneEncrypted', { kind: 'rejected', refusalCode: 'encrypted' }],
    ['pollDoneLimitsExceeded', { kind: 'rejected', refusalCode: 'limits_exceeded' }],
    ['pollDoneActivePdf', { kind: 'rejected', refusalCode: 'active_pdf' }],
    ['pollDoneSizeMismatch', { kind: 'rejected', refusalCode: 'size_mismatch' }],
    ['pollDoneSourceChanged', { kind: 'rejected', refusalCode: 'changed_during_check' }],
    ['pollDoneDeadline', { kind: 'retry' }],
    ['pollDoneSourceUnavailable', { kind: 'retry' }],
    ['pollDoneScanFailed', { kind: 'retry' }],
  ])('parses %s and judges it', async (answer, judgement) => {
    const polled = await pollWith(answer).result;
    expect(polled.kind).toBe('done');
    if (polled.kind !== 'done') return;
    const fixture = PROTOCOL_2.answers[answer]!.body['verdict'] as Record<string, unknown>;
    expect(polled.verdict).toEqual({ reason: null, ...fixture });
    expect(judgeSourceScanVerdict(polled.verdict)).toEqual(judgement);
  });

  it('never judges a scan that failed safe, whatever its reason', () => {
    const base = {
      jobId: JOB_ID,
      outcome: 'incomplete' as const,
      sha256: '',
      bytes: 0,
      etag: '',
      ms: 0,
    };
    expect(judgeSourceScanVerdict({ ...base, reason: 'scan_failed' })).toEqual({ kind: 'retry' });
    expect(judgeSourceScanVerdict({ ...base, reason: 'something_new' })).toEqual({ kind: 'retry' });
    expect(judgeSourceScanVerdict({ ...base, reason: null })).toEqual({ kind: 'retry' });
  });

  it('refuses a clean verdict that names no bytes', () => {
    expect(
      judgeSourceScanVerdict({
        jobId: JOB_ID,
        outcome: 'clean',
        reason: null,
        sha256: '',
        bytes: 0,
        etag: '',
        ms: 1,
      }),
    ).toEqual({ kind: 'retry' });
  });

  it('reads a verdict for another job as unavailable', async () => {
    const scanner = createFakeScanner({
      poll: () => ({ answer: 'pollDoneClean', verdict: { jobId: 'other-job:1' } }),
    });
    await expect(readSourceScan(JOB_ID, scanner.options)).resolves.toMatchObject({
      kind: 'unavailable',
    });
  });

  it('reads a server error as unavailable', async () => {
    const scanner = createFakeScanner({ poll: () => 'unreachable' });
    await expect(readSourceScan(JOB_ID, scanner.options)).resolves.toMatchObject({
      kind: 'unavailable',
    });
  });
});

describe('readScannerCapability', () => {
  it('reads the capability answer', async () => {
    const scanner = createFakeScanner({ capability: () => ({ answer: 'capability' }) });
    await expect(readScannerCapability(scanner.options)).resolves.toEqual({
      protocol: 2,
      maxSourceScanBytes: 545259520,
      queueDepth: 1,
      running: 1,
    });
  });

  it('reads any failure as protocol 1', async () => {
    const down = createFakeScanner({ capability: () => 'unreachable' });
    await expect(readScannerCapability(down.options)).resolves.toBeNull();
    const refused = createFakeScanner({ capability: () => ({ answer: 'unauthorized' }) });
    await expect(readScannerCapability(refused.options)).resolves.toBeNull();
    await expect(readScannerCapability({ env: {} })).resolves.toBeNull();
  });
});

describe('parseRetryAfterMs', () => {
  it('reads seconds and dates, and never answers below a second', () => {
    expect(parseRetryAfterMs('877')).toBe(877_000);
    expect(parseRetryAfterMs('0')).toBe(1_000);
    expect(parseRetryAfterMs(new Date(10_000).toUTCString(), 0)).toBe(10_000);
    expect(parseRetryAfterMs(null)).toBe(30_000);
  });
});
