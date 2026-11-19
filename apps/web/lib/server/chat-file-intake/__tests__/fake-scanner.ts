import { readFileSync } from 'node:fs';

import type { SourceScanClientOptions } from '@/lib/security/source-scan-client';

interface FixtureAnswer {
  httpStatus: number;
  retryAfter: string | null;
  body: Record<string, unknown>;
}

export interface Protocol2Fixture {
  protocol: 2;
  requests: {
    submit: Record<string, unknown>;
    submitHeaders: Record<string, string>;
    poll: { method: string; path: string };
    capability: { method: string; path: string };
  };
  answers: Record<string, FixtureAnswer>;
}

/** The scanner's own recorded answers (`P3`), so the web parses what the scanner sends. */
export const PROTOCOL_2: Protocol2Fixture = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../../services/upload-scanner/__tests__/fixtures/protocol-2.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as Protocol2Fixture;

export type FixtureAnswerName = keyof typeof PROTOCOL_2.answers & string;

export const SCANNER_ENV = Object.freeze({
  UPLOAD_SCAN_WEBHOOK_URL: 'https://scanner.test/scan',
  UPLOAD_SCAN_WEBHOOK_TOKEN: 'scanner-test-token',
});

export interface ScannerReply {
  answer: string;
  /** Fields laid over the verdict, so it names the job and bytes being polled. */
  verdict?: Record<string, unknown>;
  body?: Record<string, unknown>;
  retryAfter?: string | null;
}

export type ScannerScriptReply = ScannerReply | 'unreachable';

export interface ScannerCall {
  method: string;
  path: string;
  jobId: string | null;
  body: Record<string, unknown> | null;
  authorization: string | null;
}

export interface FakeScanner {
  options: SourceScanClientOptions;
  calls: ScannerCall[];
  submits(): ScannerCall[];
  polls(): ScannerCall[];
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function fixtureResponse(reply: ScannerReply, jobId: string | null): Response {
  const fixture = PROTOCOL_2.answers[reply.answer];
  if (!fixture) throw new Error(`The protocol 2 fixture has no answer named ${reply.answer}`);
  const body = { ...clone(fixture.body), ...(reply.body ?? {}) };
  if ('scanId' in body && jobId !== null) body['scanId'] = jobId;
  if (body['verdict'] && typeof body['verdict'] === 'object') {
    body['verdict'] = {
      ...(body['verdict'] as Record<string, unknown>),
      ...(jobId === null ? {} : { jobId }),
      ...(reply.verdict ?? {}),
    };
  }
  const retryAfter = reply.retryAfter === undefined ? fixture.retryAfter : reply.retryAfter;
  return new Response(JSON.stringify(body), {
    status: fixture.httpStatus,
    headers: {
      'content-type': 'application/json',
      ...(retryAfter === null ? {} : { 'retry-after': retryAfter }),
    },
  });
}

/**
 * A scanner on the other end of `fetch` that answers each submit and poll with
 * a shape from the fixture, chosen by the test's script.
 */
export function createFakeScanner(script: {
  submit?: (call: ScannerCall, index: number) => ScannerScriptReply;
  poll?: (call: ScannerCall, index: number) => ScannerScriptReply;
  capability?: () => ScannerScriptReply;
}): FakeScanner {
  const calls: ScannerCall[] = [];
  let submitIndex = 0;
  let pollIndex = 0;
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers);
    const body =
      typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    const pollPrefix = '/v2/scans/';
    const jobId = url.pathname.startsWith(pollPrefix)
      ? decodeURIComponent(url.pathname.slice(pollPrefix.length))
      : typeof body?.['jobId'] === 'string'
        ? (body['jobId'] as string)
        : null;
    const call: ScannerCall = {
      method,
      path: url.pathname,
      jobId,
      body,
      authorization: headers.get('authorization'),
    };
    calls.push(call);
    let reply: ScannerScriptReply | undefined;
    if (method === 'POST' && url.pathname === '/v2/scans') {
      reply = script.submit?.(call, submitIndex++);
    } else if (method === 'GET' && url.pathname.startsWith(pollPrefix)) {
      reply = script.poll?.(call, pollIndex++);
    } else if (method === 'GET' && url.pathname === '/v2/capability') {
      reply = script.capability?.();
    }
    if (reply === undefined) throw new Error(`The fake scanner has no answer for ${method} ${url}`);
    if (reply === 'unreachable') throw new TypeError('fetch failed');
    return fixtureResponse(reply, jobId);
  }) as typeof fetch;
  return {
    options: { fetch: fakeFetch, env: { ...SCANNER_ENV } },
    calls,
    submits: () => calls.filter((call) => call.method === 'POST'),
    polls: () =>
      calls.filter((call) => call.method === 'GET' && call.path.startsWith('/v2/scans/')),
  };
}
