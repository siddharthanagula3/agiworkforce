import 'server-only';

import { NextResponse } from 'next/server';

export const LOW_POWER_CRON_WINDOW_MINUTES = 15;

type EnvSource = Record<string, string | undefined>;

function lowPowerSetting(env?: EnvSource): string | undefined {
  return env ? env['AGI_DB_LOW_POWER'] : process.env['AGI_DB_LOW_POWER'];
}

export function dbLowPowerEnabled(env?: EnvSource): boolean {
  return lowPowerSetting(env)?.trim() === '1';
}

export function lowPowerCronSkip(nowMs: number = Date.now(), env?: EnvSource): NextResponse | null {
  if (!dbLowPowerEnabled(env)) return null;
  if (new Date(nowMs).getUTCMinutes() < LOW_POWER_CRON_WINDOW_MINUTES) return null;
  return NextResponse.json({ skipped: 'db_low_power' });
}
