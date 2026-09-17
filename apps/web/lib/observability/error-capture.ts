import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { isSentryConfigured } from '@/lib/sentry-shared';

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

function sendToErrorMonitoring(error: unknown, tags: Record<string, string>): void {
  if (!isSentryConfigured()) return;
  void import('@sentry/nextjs')
    .then((sentry) => {
      sentry.captureException(error, { tags, level: 'error' });
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
    'agi.failure.kind': 'worker',
    'worker.name': context.worker,
    'worker.job_id': context.jobId,
  });
}
