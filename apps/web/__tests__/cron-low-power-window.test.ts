import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { LOW_POWER_CRON_WINDOW_MINUTES } from '@/lib/server/cron-low-power';

const REPO_ROOT = resolve(process.cwd(), '..', '..');

function scheduledCrons(): Array<{ path: string; schedule: string }> {
  const config = JSON.parse(readFileSync(join(REPO_ROOT, 'vercel.json'), 'utf8')) as {
    crons?: Array<{ path: string; schedule: string }>;
  };
  return config.crons ?? [];
}

function minutesOf(field: string): number[] {
  if (field === '*') return Array.from({ length: 60 }, (_, minute) => minute);
  const step = /^\*\/(\d+)$/.exec(field);
  if (step) {
    const every = Number(step[1]);
    return Array.from({ length: Math.ceil(60 / every) }, (_, index) => index * every);
  }
  return field.split(',').map(Number);
}

function routeSource(path: string): string {
  return readFileSync(join(process.cwd(), 'app', path, 'route.ts'), 'utf8');
}

describe('crons fit the database low-power window', () => {
  it('gives every cron a run inside the window, so low-power mode starves none of them', () => {
    const outside = scheduledCrons().filter(
      ({ schedule }) =>
        !minutesOf(schedule.split(' ')[0]!).some(
          (minute) => minute < LOW_POWER_CRON_WINDOW_MINUTES,
        ),
    );

    expect(outside).toEqual([]);
  });

  it('gates every cron that runs more than once an hour, so none keeps the database awake', () => {
    const ungated = scheduledCrons()
      .filter(({ schedule }) => {
        const [minute, hour] = schedule.split(' ');
        return hour === '*' && minutesOf(minute!).length > 1;
      })
      .filter(({ path }) => !routeSource(path).includes('lowPowerCronSkip()'))
      .map(({ path }) => path);

    expect(ungated).toEqual([]);
  });

  it('runs every other cron only inside the window, so it shares the hourly wake', () => {
    const late = scheduledCrons()
      .filter(({ schedule }) => minutesOf(schedule.split(' ')[0]!).length === 1)
      .filter(({ schedule }) => Number(schedule.split(' ')[0]) >= LOW_POWER_CRON_WINDOW_MINUTES)
      .map(({ path, schedule }) => `${path} ${schedule}`);

    expect(late).toEqual([]);
  });
});
