import 'server-only';
import pino from 'pino';
import { env } from '@/lib/env';

export const logger = pino({
  level: env.logLevel,
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['req.headers.authorization', '*.access_token', '*.refresh_token', '*.password'],
    remove: true,
  },
});
