import 'server-only';

import { NextResponse } from 'next/server';

export const LOW_POWER_CRON_WINDOW_MINUTES = 15;

export function dbLowPowerEnabled(env: Record<string, string | undefined> = process.env): boolean {
  const raw = env['AGI_DB_LOW_POWER']?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on';
}

export function lowPowerCronSkip(
  nowMs: number = Date.now(),
  env: Record<string, string | undefined> = process.env,
): NextResponse | null {
  if (!dbLowPowerEnabled(env)) return null;
  if (new Date(nowMs).getUTCMinutes() < LOW_POWER_CRON_WINDOW_MINUTES) return null;
  return NextResponse.json({ skipped: 'db_low_power' });
}
