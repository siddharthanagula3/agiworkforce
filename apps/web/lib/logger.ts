
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
