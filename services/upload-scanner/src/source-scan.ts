import { createHash } from 'node:crypto';

import { scanStream, type ClamdAddress, type ScanVerdict, type SignatureStatus } from './clamd.ts';
import type { log } from './log.ts';
import {
  SourceReadError,
  describeFetchError,
  openSource,
  type FetchFailureDetail,
  type FetchSource,
} from './source-fetch.ts';

export type Logger = typeof log;

export type SourceScanOutcome = 'clean' | 'infected' | 'incomplete';

export type SourceScanReason =
  | 'encrypted'
  | 'limits_exceeded'
  | 'active_pdf'
  | 'size_mismatch'
  | 'deadline'
  | 'source_unavailable'
  | 'source_changed'
  | 'scan_failed';

export interface SourceScanVerdict {
  jobId: string;
  outcome: SourceScanOutcome;
  reason?: SourceScanReason;
  sha256: string;
  bytes: number;
  etag: string;
  ms: number;
}

export interface SourceScanJob {
  jobId: string;
  sourceUrl: URL;
  byteCount: number;
  etag: string;
  mimeType: string;
  deadlineMs: number;
}

export interface ProbedHealth {
  scanning: boolean;
  signatures: SignatureStatus | null;
}

export type LiveScanEnd = 'answered' | 'closed' | 'deadline';

export interface LiveSourceScan {
  end: (how: LiveScanEnd) => void;
}

export interface ProbeAsked {
  live: boolean;
  deadlines: number;
}

export interface SourceScanLiveness {
  begin: () => LiveSourceScan;
  ask: () => ProbeAsked;
  observe: (raw: ProbedHealth, asked?: ProbeAsked) => ProbedHealth;
  onStale: (listener: () => void) => void;
}

export interface SourceScanDependencies {
  clamd: ClamdAddress;
  fetchSource: FetchSource;
  liveness: SourceScanLiveness;
  log: Logger;
  now: () => number;
}

const ENCRYPTED_SIGNATURE_PREFIX = 'Heuristics.Encrypted.';
const LIMITS_SIGNATURE_PREFIX = 'Heuristics.Limits.Exceeded';
const PDF_MIME_TYPE = 'application/pdf';
const PDF_ACTIVE_TOKENS = ['/JavaScript', '/JS', '/Launch', '/EmbeddedFile'];
const PDF_TOKEN_ALTERNATION = PDF_ACTIVE_TOKENS.map((token) => token.replace('/', '\\/')).join('|');
const PDF_STREAM_KEYWORD = 'stream';
const PDF_STREAM_END = 'endstream';
const PDF_STREAM_GAP_MAX = 32;
const PDF_TOKEN = `(?:${PDF_TOKEN_ALTERNATION})(?=[^A-Za-z0-9_])`;
const PDF_STREAM_OPENER = `>>[\\0\\t\\n\\f\\r ]{0,${PDF_STREAM_GAP_MAX}}${PDF_STREAM_KEYWORD}[\\r\\n]`;
const PDF_OUTSIDE_TAIL = Math.max(
  ...PDF_ACTIVE_TOKENS.map((token) => token.length),
  '>>'.length + PDF_STREAM_GAP_MAX + PDF_STREAM_KEYWORD.length,
);
const PDF_TOKEN_AT_END = new RegExp(`(?:${PDF_TOKEN_ALTERNATION})$`);
const PDF_INSIDE_TAIL = PDF_STREAM_END.length - 1;

type PdfLexState = 'normal' | 'comment' | 'string' | 'hex';
type PdfScanState = PdfLexState | 'stream';

const PDF_LEXER_EVENTS: Readonly<Record<PdfLexState, string>> = {
  normal: `${PDF_TOKEN}|${PDF_STREAM_OPENER}|%|\\(|<<|<(?=[^<])`,
  comment: `${PDF_TOKEN}|[\\r\\n]`,
  string: `${PDF_TOKEN}|\\\\[()\\\\]|[()]`,
  hex: `${PDF_TOKEN}|>`,
};

class SizeMismatch extends Error {}

export function scanDeadlineMs(
  byteCount: number,
  rate: { baseMs: number; minBytesPerSec: number },
): number {
  return rate.baseMs + Math.ceil((byteCount * 1000) / rate.minBytesPerSec);
}

export function signatureReason(signature: string): 'encrypted' | 'limits_exceeded' | undefined {
  if (signature.startsWith(ENCRYPTED_SIGNATURE_PREFIX)) return 'encrypted';
  if (signature.startsWith(LIMITS_SIGNATURE_PREFIX)) return 'limits_exceeded';
  return undefined;
}

export function createPdfActiveContentDetector(): {
  push: (chunk: Uint8Array) => void;
  finish: () => boolean;
} {
  const events: Record<PdfLexState, RegExp> = {
    normal: new RegExp(PDF_LEXER_EVENTS.normal, 'g'),
    comment: new RegExp(PDF_LEXER_EVENTS.comment, 'g'),
    string: new RegExp(PDF_LEXER_EVENTS.string, 'g'),
    hex: new RegExp(PDF_LEXER_EVENTS.hex, 'g'),
  };
  let state: PdfScanState = 'normal';
  let depth = 0;
  let tail = '';
  let found = false;
  return {
    push: (chunk) => {
      if (found) return;
      const text =
        tail + Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength).toString('latin1');
      let at = 0;
      for (;;) {
        if (state === 'stream') {
          const end = text.indexOf(PDF_STREAM_END, at);
          if (end === -1) {
            tail = text.slice(Math.max(at, text.length - PDF_INSIDE_TAIL));
            return;
          }
          state = 'normal';
          at = end + PDF_STREAM_END.length;
          continue;
        }
        const pattern = events[state];
        pattern.lastIndex = at;
        const match = pattern.exec(text);
        if (!match) {
          tail = text.slice(Math.max(at, text.length - PDF_OUTSIDE_TAIL));
          return;
        }
        at = pattern.lastIndex;
        const event = match[0];
        if (event.startsWith('/')) {
          found = true;
          return;
        }
        if (state === 'normal') {
          if (event === '%') state = 'comment';
          else if (event === '(') {
            state = 'string';
            depth = 1;
          } else if (event === '<') state = 'hex';
          else if (event.startsWith('>>')) state = 'stream';
        } else if (state === 'string') {
          if (event === '(') depth += 1;
          else if (event === ')') {
            depth -= 1;
            if (depth === 0) state = 'normal';
          }
        } else {
          state = 'normal';
        }
      }
    },
    finish: () => found || state === 'stream' || PDF_TOKEN_AT_END.test(tail),
  };
}

export function createSourceScanLiveness(): SourceScanLiveness {
  let live = 0;
  let deadlines = 0;
  let withheld = false;
  let lastGood: SignatureStatus | null = null;
  const staleListeners = new Set<() => void>();
  const ask = (): ProbeAsked => ({ live: live > 0, deadlines });
  return {
    begin: () => {
      live += 1;
      let ended = false;
      return {
        end: (how) => {
          if (ended) return;
          ended = true;
          live -= 1;
          if (how === 'deadline') {
            withheld = true;
            deadlines += 1;
          }
          if (live === 0 || how === 'deadline') {
            for (const listener of staleListeners) listener();
          }
        },
      };
    },
    ask,
    observe: (raw, asked = ask()) => {
      if (raw.signatures) lastGood = raw.signatures;
      if (raw.scanning && asked.deadlines === deadlines) withheld = false;
      if (withheld || (live === 0 && !asked.live)) return raw;
      return { scanning: true, signatures: raw.signatures ?? lastGood };
    },
    onStale: (listener) => {
      staleListeners.add(listener);
    },
  };
}

function isPdf(mimeType: string): boolean {
  return mimeType.split(';', 1)[0]?.trim().toLowerCase() === PDF_MIME_TYPE;
}

export async function runSourceScan(
  job: SourceScanJob,
  deps: SourceScanDependencies,
): Promise<SourceScanVerdict> {
  const started = deps.now();
  const host = job.sourceUrl.hostname;
  const hash = createHash('sha256');
  const pdf = isPdf(job.mimeType) ? createPdfActiveContentDetector() : null;
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(), job.deadlineMs);
  let bytes = 0;
  let etag = '';
  const scan: { live: LiveSourceScan | null; over: boolean } = { live: null, over: false };

  const finish = (
    outcome: SourceScanOutcome,
    reason?: SourceScanReason,
    detail: Record<string, unknown> = {},
  ): SourceScanVerdict => {
    const verdict: SourceScanVerdict = {
      jobId: job.jobId,
      outcome,
      ...(reason ? { reason } : {}),
      sha256: hash.digest('hex'),
      bytes,
      etag,
      ms: deps.now() - started,
    };
    deps.log(outcome === 'clean' ? 'info' : 'warn', 'source_scan_finished', {
      jobId: job.jobId,
      host,
      byteCount: job.byteCount,
      bytes,
      outcome,
      ...(reason ? { reason } : {}),
      ms: verdict.ms,
      ...detail,
    });
    return verdict;
  };
  const fetchFailed = (reason: SourceScanReason, detail: FetchFailureDetail) => {
    deps.log('warn', 'source_fetch_failed', { jobId: job.jobId, host, ...detail });
    return finish('incomplete', reason);
  };

  try {
    const opening = await openSource(deps.fetchSource, job.sourceUrl, job.etag, deadline.signal);
    if (opening.kind === 'failed') {
      if (deadline.signal.aborted) return finish('incomplete', 'deadline');
      return fetchFailed(opening.reason, {
        status: opening.status,
        errorClass: opening.errorClass,
        errorCode: opening.errorCode,
      });
    }
    etag = opening.etag;

    async function* inspected(chunks: AsyncGenerator<Uint8Array>): AsyncGenerator<Uint8Array> {
      for await (const chunk of chunks) {
        if (scan.over) return;
        scan.live ??= deps.liveness.begin();
        bytes += chunk.byteLength;
        if (bytes > job.byteCount) throw new SizeMismatch();
        hash.update(chunk);
        pdf?.push(chunk);
        yield chunk;
      }
      if (bytes !== job.byteCount) throw new SizeMismatch();
    }

    let verdict: ScanVerdict;
    try {
      verdict = await scanStream(deps.clamd, inspected(opening.chunks), deadline.signal, true);
    } catch (error) {
      if (deadline.signal.aborted) {
        scan.live?.end('deadline');
        return finish('incomplete', 'deadline');
      }
      scan.live?.end('closed');
      if (error instanceof SizeMismatch) return finish('infected', 'size_mismatch');
      if (error instanceof SourceReadError) return fetchFailed('source_unavailable', error.detail);
      return finish('incomplete', 'scan_failed', describeFetchError(error));
    }
    scan.live?.end('answered');

    if (verdict.kind === 'clean') {
      return pdf?.finish() ? finish('infected', 'active_pdf') : finish('clean');
    }
    if (verdict.kind === 'infected') {
      return finish('infected', signatureReason(verdict.signature), {
        signature: verdict.signature,
      });
    }
    return finish('incomplete', 'scan_failed', { clamdReply: verdict.reason });
  } finally {
    scan.over = true;
    clearTimeout(timer);
    deadline.abort();
  }
}
