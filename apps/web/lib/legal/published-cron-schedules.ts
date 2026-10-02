import 'server-only';

import { crons } from '../../../../vercel.json';
import { SECURITY_LOG_RETENTION_CRON_PATH } from '@/lib/server/security-log-retention';

function cronSchedule(cronPath: string): string {
  const entry = crons.find(({ path }) => path === cronPath);
  if (!entry) throw new Error(`No published cron schedule for ${cronPath}`);
  return entry.schedule;
}

export function dailyCronTime(cronPath: string): string {
  const schedule = cronSchedule(cronPath);
  const daily = /^(\d{1,2}) (\d{1,2}) \* \* \*$/u.exec(schedule);
  if (!daily || Number(daily[1]) > 59 || Number(daily[2]) > 23) {
    throw new Error(`Expected a daily cron schedule for ${cronPath}: ${schedule}`);
  }
  return `${daily[2]!.padStart(2, '0')}:${daily[1]!.padStart(2, '0')} UTC`;
}

export function hourlyCronMinute(cronPath: string): string {
  const schedule = cronSchedule(cronPath);
  const hourly = /^(\d{1,2}) \* \* \* \*$/u.exec(schedule);
  if (!hourly || Number(hourly[1]) > 59) {
    throw new Error(`Expected an hourly cron schedule for ${cronPath}: ${schedule}`);
  }
  return String(Number(hourly[1]));
}

export const PUBLISHED_RETENTION_CRON_TIMES = {
  securityAuditLogs: dailyCronTime(SECURITY_LOG_RETENTION_CRON_PATH),
  deletedAccounts: dailyCronTime('/api/cron/purge-deleted-accounts'),
  deletedMedia: dailyCronTime('/api/cron/purge-deleted-media'),
  temporaryChats: dailyCronTime('/api/cron/purge-temporary-chats'),
  sandboxMinute: hourlyCronMinute('/api/cron/reclaim-sandboxes'),
} as const;
