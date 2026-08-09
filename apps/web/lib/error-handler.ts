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

/**
 * WEB-10 (audit 2026-05-03): generic user-facing fallbacks per
 * status-code class. Several call sites construct AppError instances
 * by passing raw cloud database error messages (table names, constraint
 * violations, PGRST codes) which would otherwise propagate to the
 * client response body. We log the original message + details
 * server-side and return a safe summary to the caller.
 */
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

/** A small set of error codes that are safe to render verbatim - these
 *  are app-defined (not service-leak vectors) and the UI uses them to
 *  drive recovery flows (e.g. credit_required → upgrade prompt). */
const SAFE_TO_EXPOSE_CODES = new Set<string>([
  'CREDIT_REQUIRED',
  'SUBSCRIPTION_REQUIRED',
  'RATE_LIMITED',
  'VALIDATION_ERROR',
  'INVALID_MODEL',
  'CSRF_REQUIRED',
  // Conflicts are raised via createError.conflict() with app-defined,
  // user-facing messages ("already at the file cap", "slug already taken",
  // "already a member") that the UI needs to explain what to do next — same
  // rationale as VALIDATION_ERROR, never a SQL/service-leak vector.
  'CONFLICT',
]);

function safeErrorMessage(error: AppError): string {
  if (SAFE_TO_EXPOSE_CODES.has(error.code)) {
    return error.message;
  }
  return GENERIC_MESSAGES[error.statusCode] ?? 'Request failed';
}

/**
 * Error handler middleware for API routes
 */
export function handleError(error: unknown, requestId?: string): NextResponse {
  // Log the error
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
          // WEB-10: only forward `details` when the code is safe to
          // expose - Neon / SQL details are otherwise dropped.
          ...(error.details && SAFE_TO_EXPOSE_CODES.has(error.code)
            ? { details: error.details }
            : {}),
        },
        requestId,
      },
      { status: error.statusCode },
    );
  }

  // Handle Zod validation errors
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

  // Handle unknown errors
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

/** Read a header off the first handler argument without assuming it is a Request. */
function readHeader(source: unknown, name: string): string | null {
  const get = (source as HeaderBearing | undefined)?.headers?.get;
  if (typeof get !== 'function') return null;
  try {
    return get.call((source as HeaderBearing).headers, name);
  } catch {
    return null;
  }
}

/**
 * Wrapper for API route handlers with error handling and request tracing.
 *
 * This is the ingress for SCALE-VER-006 correlation: it establishes the trace
 * context for the request, so every `logger.*` line and every `withSpan` call
 * anywhere below the handler shares one `trace_id` (see
 * `lib/observability/trace-context.ts`). An inbound W3C `traceparent` is joined
 * when it is well-formed; anything else starts a fresh trace.
 *
 * The resolved `traceparent` and `x-request-id` are echoed on the response so a
 * user reporting a failure carries the id that finds their logs. Header writes
 * are best-effort: a `Response` with an immutable header guard (redirects,
 * `Response.error()`) keeps its headers and still gets its span.
 */
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
    // An inbound x-request-id is honoured so a caller's own id survives, but it
    // is echoed on the response and written into log fields, so only a bounded
    // token-safe value is accepted — anything else falls back to the trace id.
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
            // Path only — the query string routinely carries search terms and ids.
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

/** Path component of `raw`, or `undefined` when it does not parse. */
function safeUrlPath(raw: string): string | undefined {
  try {
    return new URL(raw).pathname;
  } catch {
    return undefined;
  }
}
