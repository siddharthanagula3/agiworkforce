import pino, { type LoggerOptions } from 'pino';
import { traceLogFields } from '@/lib/observability/trace-context';
import { DEFAULT_OTEL_SERVICE_NAME, OTEL_SERVICE_NAME_ENV } from '@/lib/observability/otel-config';
import { deployEnvironment, deployRegion, releaseSha } from '@/lib/server/hosting';
import { redactLogRecord, redactSecrets } from '@/lib/redaction';

const isDevelopment = process.env.NODE_ENV === 'development';

function deploymentBase(): Record<string, string> {
  const region = deployRegion();
  const version = releaseSha();
  const deployedEnv = deployEnvironment();
  return {
    service: process.env[OTEL_SERVICE_NAME_ENV]?.trim() || DEFAULT_OTEL_SERVICE_NAME,
    ...(version ? { version } : {}),
    ...(region ? { region } : {}),
    ...(deployedEnv ? { deploy_env: deployedEnv } : {}),
  };
}

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
        args.map((arg) => (typeof arg === 'string' ? redactSecrets(arg) : arg)) as typeof args,
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
    ...deploymentBase(),
  },
};

export const logger = pino(loggerOptions);
