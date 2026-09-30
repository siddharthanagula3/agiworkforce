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

export const LOG_REDACTED_PATHS = [
  'error',
  '*.error',
  'stack',
  '*.stack',
  'pairToken',
  '*.pairToken',
  'pairTokens',
  '*.pairTokens',
  'token',
  '*.token',
  'secret',
  '*.secret',
  'authorization',
  '*.authorization',
  'headers',
  '*.headers',
  'connectionString',
  '*.connectionString',
  'metadata',
  '*.metadata',
  'payload',
  '*.payload',
  'sdp',
  '*.sdp',
  'candidate',
  '*.candidate',
] as const;

export function buildLogger(destination?: pino.DestinationStream, level: string = logLevel) {
  return pino(
    {
      name: 'signaling-server',
      level,
      redact: { paths: [...LOG_REDACTED_PATHS], censor: '[REDACTED]' },
      ...(isProduction || destination
        ? {
            formatters: {
              level: (label: string) => ({ level: label }),
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
    },
    destination,
  );
}

export const logger = buildLogger();

export function logUnhandledRejection(error: unknown): void {
  logger.fatal({ error }, 'Unhandled promise rejection');
}

export function createChildLogger(correlationId: string) {
  return logger.child({ correlationId });
}

export function generateCorrelationId(): string {
  return Math.random().toString(36).substring(2, 10);
}

export type Logger = typeof logger;
