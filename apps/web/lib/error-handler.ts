import { NextResponse } from 'next/server';
import { AppError, createError } from './errors';
import { logger } from './logger';
import { redactAttributes } from './observability/redact';
import {
  formatTraceparent,
  newSpanId,
  newTraceId,
  parseTraceparent,
  runWithTraceContext,
  type TraceContext,
} from './observability/trace-context';

const GENERIC_MESSAGES: Record<number, string> = {
  400: 'Bad request',
  401: 'Authentication required',
  403: 'Access denied',
  404: 'Not found',
  408: 'Request timed out',
  409: 'Conflict',
  422: 'Validation failed',
  429: 'Too many requests',
  500: 'Internal server error',
  502: 'Upstream service error',
  503: 'Service temporarily unavailable',
};

const SAFE_TO_EXPOSE_CODES = new Set<string>([
  'CREDIT_REQUIRED',
  'SUBSCRIPTION_REQUIRED',
  'RATE_LIMITED',
  'VALIDATION_ERROR',
  'INVALID_MODEL',
  'CSRF_REQUIRED',
  'CONFLICT',
]);

function safeErrorMessage(error: AppError): string {
  if (SAFE_TO_EXPOSE_CODES.has(error.code)) {
    return error.message;
  }
  return GENERIC_MESSAGES[error.statusCode] ?? 'Request failed';
}

export function handleError(error: unknown, requestId?: string): NextResponse {
  if (error instanceof AppError) {
    logger.error(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
          statusCode: error.statusCode,
        },
        requestId,
      },
      'API error',
    );

    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: safeErrorMessage(error),
          ...(error.details && SAFE_TO_EXPOSE_CODES.has(error.code)
            ? { details: error.details }
            : {}),
        },
        requestId,
      },
      { status: error.statusCode },
    );
  }

  if (error && typeof error === 'object' && 'issues' in error) {
    const zodError = error as { issues: Array<{ path: (string | number)[]; message: string }> };
    const validationError = createError.validation(
      'Validation failed',
      zodError.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );

    logger.warn(
      {
        error: {
          code: validationError.code,
          message: validationError.message,
          details: validationError.details,
        },
        requestId,
      },
      'Validation error',
    );

    return NextResponse.json(
      {
        error: {
          code: validationError.code,
          message: validationError.message,
          details: validationError.details,
        },
        requestId,
      },
      { status: 400 },
    );
  }

  const internalError = createError.internal(
    'An unexpected error occurred',
    process.env.NODE_ENV === 'development' ? String(error) : undefined,
  );

  logger.error(
    {
      error: {
        code: internalError.code,
        message: internalError.message,
        originalError: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      requestId,
    },
    'Unexpected error',
  );

  return NextResponse.json(
    {
      error: {
        code: internalError.code,
        message: internalError.message,
      },
      requestId,
    },
    { status: 500 },
  );
}

type HeaderBearing = { headers?: { get?: (key: string) => string | null } };

function readHeader(source: unknown, name: string): string | null {
  const get = (source as HeaderBearing | undefined)?.headers?.get;
  if (typeof get !== 'function') return null;
  try {
    return get.call((source as HeaderBearing).headers, name);
  } catch {
    return null;
  }
}

export function withErrorHandler<T extends unknown[]>(
  handler: (...args: T) => Promise<NextResponse | Response>,
) {
  return async (...args: T): Promise<NextResponse | Response> => {
    const inbound = parseTraceparent(readHeader(args[0], 'traceparent'));
    const context: TraceContext = {
      traceId: inbound?.traceId ?? newTraceId(),
      spanId: newSpanId(),
      sampled: inbound?.sampled ?? true,
    };
    const inboundRequestId = readHeader(args[0], 'x-request-id');
    const requestId =
      inboundRequestId && /^[A-Za-z0-9._~-]{1,128}$/u.test(inboundRequestId)
        ? inboundRequestId
        : context.traceId;
    const method = (args[0] as { method?: string } | undefined)?.method;
    const url = (args[0] as { url?: string } | undefined)?.url;

    return runWithTraceContext(context, async () => {
      const startedAt = Date.now();
      let response: NextResponse | Response;
      let status: 'ok' | 'error' = 'ok';
      let thrown: unknown;
      try {
        response = await handler(...args);
      } catch (error) {
        thrown = error;
        status = 'error';
        response = handleError(error, requestId);
      }

      logger.info(
        {
          event: 'span',
          span_name: 'http.server',
          span_kind: 'server',
          span_domain: 'http',
          trace_id: context.traceId,
          span_id: context.spanId,
          parent_span_id: inbound?.spanId,
          duration_ms: Date.now() - startedAt,
          status,
          ...redactAttributes({
            'http.request.method': method,
            'url.path': url ? safeUrlPath(url) : undefined,
            'http.response.status_code': response.status,
            'error.type': thrown instanceof Error ? thrown.name : undefined,
          }),
        },
        'span http.server',
      );

      try {
        response.headers.set('x-request-id', requestId);
        response.headers.set('traceparent', formatTraceparent(context));
      } catch {
        // Immutable header guard — correlation still exists in the log stream.
      }
      return response;
    });
  };
}

function safeUrlPath(raw: string): string | undefined {
  try {
    return new URL(raw).pathname;
  } catch {
    return undefined;
  }
}
