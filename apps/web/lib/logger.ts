/**
 * Structured logging utility using Pino
 *
 * Every record carries `trace_id`/`span_id` when one is bound to the current
 * async chain (SCALE-VER-006). The `mixin` runs per log call, so this applies
 * to all pre-existing `logger.*` sites without touching them — that is the
 * whole point: correlation you have to opt into is correlation you lose at the
 * one call site that mattered during an incident. Outside a traced chain
 * (module init, scripts) the fields are simply absent.
 */

import pino from 'pino';
import { traceLogFields } from '@/lib/observability/trace-context';

const isDevelopment = process.env.NODE_ENV === 'development';

export const logger = pino({
  level: process.env['LOG_LEVEL'] || (isDevelopment ? 'debug' : 'info'),
  mixin: traceLogFields,
  ...(isDevelopment && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  }),
  base: {
    env: process.env.NODE_ENV,
  },
});
