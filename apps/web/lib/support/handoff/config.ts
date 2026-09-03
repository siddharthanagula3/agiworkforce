import 'server-only';

function isTruthy(raw: string | undefined): boolean {
  if (!raw) return false;
  return ['1', 'true', 'on', 'yes'].includes(raw.trim().toLowerCase());
}

function readInt(key: string, fallback: number, min: number, max: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/u;

export function isValidEmail(value: string | null | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  return trimmed.length <= 254 && EMAIL_RE.test(trimmed);
}

function readEmail(key: string, fallback: string): string {
  const raw = process.env[key]?.trim();
  return isValidEmail(raw) ? raw : fallback;
}

export const DEFAULT_FALLBACK_EMAIL = 'support@agiworkforce.com';
export const DEFAULT_EXPECTED_REPLY = 'within one business day';

export interface HandoffConfig {
  liveHandoffEnabled: boolean;
  fallbackEmail: string;
  fromEmail: string;
  expectedReplyCopy: string;
  heartbeatTtlSeconds: number;
  waitTimeoutSeconds: number;
  idleTimeoutSeconds: number;
  pollIntervalMs: number;
  retentionDays: number;
  resendApiKey: string | null;
  emailConfigured: boolean;
}

export function getHandoffConfig(): HandoffConfig {
  const resendApiKey = process.env['RESEND_API_KEY']?.trim() || null;
  const fromEmail = readEmail('AGI_SUPPORT_FROM_EMAIL', DEFAULT_FALLBACK_EMAIL);
  const fallbackEmail = readEmail('AGI_SUPPORT_FALLBACK_EMAIL', DEFAULT_FALLBACK_EMAIL);

  return {
    liveHandoffEnabled: isTruthy(process.env['AGI_SUPPORT_LIVE_HANDOFF_ENABLED']),
    fallbackEmail,
    fromEmail,
    expectedReplyCopy:
      process.env['AGI_SUPPORT_EXPECTED_REPLY_COPY']?.trim() || DEFAULT_EXPECTED_REPLY,
    heartbeatTtlSeconds: readInt('AGI_SUPPORT_AGENT_HEARTBEAT_TTL_SECONDS', 90, 15, 3600),
    waitTimeoutSeconds: readInt('AGI_SUPPORT_HANDOFF_WAIT_TIMEOUT_SECONDS', 120, 15, 900),
    idleTimeoutSeconds: readInt('AGI_SUPPORT_HANDOFF_IDLE_TIMEOUT_SECONDS', 900, 60, 86_400),
    pollIntervalMs: readInt('AGI_SUPPORT_HANDOFF_POLL_INTERVAL_MS', 3000, 1000, 60_000),
    retentionDays: readInt('AGI_SUPPORT_HANDOFF_RETENTION_DAYS', 90, 1, 3650),
    resendApiKey,
    emailConfigured:
      Boolean(resendApiKey) && isValidEmail(fromEmail) && isValidEmail(fallbackEmail),
  };
}

export function heartbeatIntervalMs(config: HandoffConfig): number {
  return Math.max(5_000, Math.floor((config.heartbeatTtlSeconds * 1000) / 3));
}
