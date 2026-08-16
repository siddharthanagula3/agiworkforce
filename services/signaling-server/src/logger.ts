/**
 * Structured logging with pino
 * @see https://getpino.io/
 *
 * Log levels:
 * - production: 'info'
 * - development: 'debug'
 * - test: 'silent'
 *
 * Features:
 * - JSON output in production for log aggregation
 * - Pretty printing in development
 * - Request correlation IDs
 * - Automatic timestamp and hostname
 */

import pino from 'pino';

const isProduction = process.env['NODE_ENV'] === 'production';
const isTest = process.env['NODE_ENV'] === 'test';

const logLevel = process.env['LOG_LEVEL'] ?? (isProduction ? 'info' : isTest ? 'silent' : 'debug');

export const logger = pino({
  name: 'signaling-server',
  level: logLevel,
  ...(isProduction
    ? {
        formatters: {
          level: (label) => ({ level: label }),
        },
        timestamp: pino.stdTimeFunctions.isoTime,
      }
    : {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        },
      }),
});

export function createChildLogger(correlationId: string) {
  return logger.child({ correlationId });
}

export function generateCorrelationId(): string {
  return Math.random().toString(36).substring(2, 10);
}

export type Logger = typeof logger;
