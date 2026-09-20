import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { isSentryConfigured } from '@/lib/sentry-shared';

import { OBSERVABILITY_ATTRIBUTE } from './attributes';
import { recordFailure } from './metrics';

const FIRST_SERVER_ERROR_STATUS = 500;

export interface ServerErrorContext {
  readonly requestId: string;
  readonly method?: string | undefined;
  readonly path?: string | undefined;
}

export interface WorkerFailureContext {
  readonly worker: string;
  readonly jobId: string;
}

export interface ModelFailureContext {
  readonly provider: string;
  readonly model: string;
  readonly errorCode: string;
}

function declaredStatus(error: unknown): number | null {
  if (error instanceof AppError) return error.statusCode;
  if (!error || typeof error !== 'object') return null;
  const candidate =
    (error as { statusCode?: unknown }).statusCode ?? (error as { status?: unknown }).status;
  return typeof candidate === 'number' && Number.isInteger(candidate) ? candidate : null;
}

export function isReportableServerError(error: unknown): boolean {
  if (error && typeof error === 'object' && 'issues' in error) return false;
  const status = declaredStatus(error);
  return status === null || status >= FIRST_SERVER_ERROR_STATUS;
}

const FINGERPRINT_FRAMES = 2;
const UNKNOWN_FRAME = 'unknown';
const POSITION = /:\d+:\d+\)?$/u;
const BUILD_ARTEFACT = /[.-][0-9a-f]{8,}(?=\.[a-z]+$)/iu;

function frameIdentity(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('at ')) return null;
  const withoutPosition = trimmed.slice(3).replace(POSITION, '');
  const site = withoutPosition.replace(/^.*\((.*)$/u, '$1');
  const normalized = site
    .replace(/^(?:file|webpack(?:-internal)?):\/\/+/u, '')
    .replace(/^.*?(?=(?:apps|packages|services|crates|node_modules)\/)/u, '')
    .replace(/\?.*$/u, '')
    .replace(BUILD_ARTEFACT, '');
  return normalized.length > 0 ? normalized : null;
}

/**
 * A stable identity for a recurring exception. The message carries ids and
 * values that differ per occurrence and the paths carry a build hash that
 * differs per release, so neither is part of it: the fingerprint is the error
 * name and the top frames with their positions and build artefacts removed.
 * The same fault at the same site therefore groups across deploys.
 */
export function errorFingerprint(error: unknown): string {
  const name = error instanceof Error && error.name ? error.name : typeof error;
  const stack = error instanceof Error && typeof error.stack === 'string' ? error.stack : '';
  const frames = stack
    .split('\n')
    .map(frameIdentity)
    .filter((frame): frame is string => frame !== null)
    .slice(0, FINGERPRINT_FRAMES);
  return [name, ...(frames.length > 0 ? frames : [UNKNOWN_FRAME])].join('|');
}

function sendToErrorMonitoring(error: unknown, tags: Record<string, string>): void {
  if (!isSentryConfigured()) return;
  const tagged = { ...tags, [OBSERVABILITY_ATTRIBUTE.errorFingerprint]: errorFingerprint(error) };
  void import('@sentry/nextjs')
    .then((sentry) => {
      sentry.captureException(error, { tags: tagged, level: 'error' });
    })
    .catch((captureError: unknown) => {
      logger.warn({ error: captureError }, 'Error could not be sent to error monitoring');
    });
}

export function captureServerError(error: unknown, context: ServerErrorContext): void {
  if (!isReportableServerError(error)) return;
  const tags: Record<string, string> = { request_id: context.requestId };
  if (context.method) tags['http.method'] = context.method;
  if (context.path) tags['http.route'] = context.path;
  sendToErrorMonitoring(error, tags);
}

export function captureWorkerFailure(error: unknown, context: WorkerFailureContext): void {
  recordFailure('worker', context.worker);
  sendToErrorMonitoring(error, {
    [OBSERVABILITY_ATTRIBUTE.failureKind]: 'worker',
    'worker.name': context.worker,
    'worker.job_id': context.jobId,
  });
}

export function captureModelFailure(error: unknown, context: ModelFailureContext): void {
  recordFailure('model', context.errorCode);
  sendToErrorMonitoring(error, {
    [OBSERVABILITY_ATTRIBUTE.failureKind]: 'model',
    [OBSERVABILITY_ATTRIBUTE.providerName]: context.provider,
    [OBSERVABILITY_ATTRIBUTE.requestModel]: context.model,
    [OBSERVABILITY_ATTRIBUTE.errorType]: context.errorCode,
  });
}
