import 'server-only';
import { z } from 'zod';

const LogLevelSchema = z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']);
const UrlSchema = z.string().url();

function readRequired(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function readOptionalUrl(name: string): string | undefined {
  const value = process.env[name];
  if (!value) return undefined;
  return UrlSchema.parse(value);
}

export const env = {
  get appUrl() {
    return UrlSchema.parse(readRequired('NEXT_PUBLIC_APP_URL'));
  },
  get supabaseUrl() {
    return UrlSchema.parse(readRequired('NEXT_PUBLIC_SUPABASE_URL'));
  },
  get supabaseAnonKey() {
    return z.string().min(20).parse(readRequired('NEXT_PUBLIC_SUPABASE_ANON_KEY'));
  },
  get supabaseServiceRoleKey() {
    const value = process.env.SUPABASE_SERVICE_ROLE_KEY;
    return value ? z.string().min(20).parse(value) : undefined;
  },
  get redisUrl() {
    return readOptionalUrl('REDIS_URL');
  },
  get sentryDsn() {
    return readOptionalUrl('SENTRY_DSN');
  },
  get allowedOrigins() {
    return (process.env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  },
  get logLevel() {
    return LogLevelSchema.catch('info').parse(process.env.LOG_LEVEL);
  },
};
