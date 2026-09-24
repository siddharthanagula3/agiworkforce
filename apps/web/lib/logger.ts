import pino, { type LoggerOptions } from 'pino';
import { traceLogFields } from '@/lib/observability/trace-context';
import { DEFAULT_OTEL_SERVICE_NAME, OTEL_SERVICE_NAME_ENV } from '@/lib/observability/otel-config';
import { deployEnvironment, deployRegion, releaseSha } from '@/lib/server/hosting';
import { redactLogRecord, redactSecrets } from '@/lib/redaction';

const isDevelopment = process.env.NODE_ENV === 'development';
const DEV_LOG_FORMAT_ENV = 'AGI_DEV_LOG_FORMAT';

export const PINO_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'] as const;

export type PinoLevel = (typeof PINO_LEVELS)[number];

const MINIMUM_DEPLOYED_LEVEL: PinoLevel = 'info';

function isPinoLevel(value: string): value is PinoLevel {
  return (PINO_LEVELS as readonly string[]).includes(value);
}

// A deployed runtime refuses trace and debug however LOG_LEVEL is set: those
// levels carry request bodies and prompts that redaction only masks by key.
export function resolveLogLevel(requested: string | undefined, development: boolean): PinoLevel {
  const normalised = requested?.trim().toLowerCase() ?? '';
  const level = isPinoLevel(normalised)
    ? normalised
    : development
      ? 'debug'
      : MINIMUM_DEPLOYED_LEVEL;
  if (development) return level;
  const floor = PINO_LEVELS.indexOf(MINIMUM_DEPLOYED_LEVEL);
  return PINO_LEVELS.indexOf(level) < floor ? MINIMUM_DEPLOYED_LEVEL : level;
}

export function shouldUsePrettyLogTransport(
  development: boolean,
  requested: string | undefined,
): boolean {
  return development && requested?.trim().toLowerCase() !== 'json';
}

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
  level: resolveLogLevel(process.env['LOG_LEVEL'], isDevelopment),
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
  ...(shouldUsePrettyLogTransport(isDevelopment, process.env[DEV_LOG_FORMAT_ENV]) && {
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
