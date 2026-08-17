import pino, { type LoggerOptions } from 'pino';
import { traceLogFields } from '@/lib/observability/trace-context';
import { maskSecretText, redactLogRecord } from '@/lib/observability/redact';

const isDevelopment = process.env.NODE_ENV === 'development';

export const loggerOptions: LoggerOptions = {
  level: process.env['LOG_LEVEL'] || (isDevelopment ? 'debug' : 'info'),
  mixin: traceLogFields,
  formatters: {
    log: redactLogRecord,
  },
  hooks: {
    logMethod(args, method) {
      method.apply(
        this,
        args.map((arg) => (typeof arg === 'string' ? maskSecretText(arg) : arg)) as typeof args,
      );
    },
  },
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
};

export const logger = pino(loggerOptions);
