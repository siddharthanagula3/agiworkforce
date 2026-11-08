// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ManagedCloudScheduleTaskSchema } from '@agiworkforce/cloud-contracts';
import catalog from '../_locales/en/messages.json';
import { buildSchedulesSection } from '../src/features/side-panel/schedulesSection';

beforeEach(() => {
  document.body.replaceChildren();
  vi.stubGlobal('chrome', {
    i18n: {
      getMessage: (key: string) =>
        (catalog as Record<string, { message: string }>)[key]?.message ?? key,
    },
  });
});

const base = {
  id: 'schedule-1',
  userId: 'user-1',
  name: 'Owned schedule',
  description: null,
  scheduleType: 'once',
  cronExpression: null,
  executeAt: '2026-12-01T09:00:00.000Z',
  intervalMs: null,
  timezone: 'UTC',
  isEnabled: false,
  expiresAt: null,
  maxExecutions: 1,
  executionCount: 1,
  actionType: 'agent',
  actionConfig: null,
  prompt: 'Return the marker',
  model: null,
  status: 'completed',
  lastExecutedAt: null,
  nextExecutionAt: null,
  lastError: null,
  metadata: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('native schedule lifecycle actions', () => {
  it.each([
    { status: 'completed', isEnabled: false, edit: false, toggle: false, run: false },
    { status: 'expired', isEnabled: false, edit: false, toggle: false, run: false },
    { status: 'paused', isEnabled: false, edit: true, toggle: true, run: false },
    { status: 'failed', isEnabled: false, edit: true, toggle: true, run: false },
    { status: 'active', isEnabled: true, edit: true, toggle: true, run: true },
  ])(
    'matches $status actions to the hosted lifecycle',
    async ({ status, isEnabled, edit, toggle, run }) => {
      const task = ManagedCloudScheduleTaskSchema.parse({ ...base, status, isEnabled });
      const setScheduleEnabled = vi.fn();
      const runScheduleNow = vi.fn();
      const section = buildSchedulesSection({
        listSchedules: async () => ({ status: 'success', schedules: [task] }),
        setScheduleEnabled,
        runScheduleNow,
      });
      document.body.appendChild(section.sectionEl);
      section.setActive(true);
      await vi.waitFor(() =>
        expect(section.sectionEl.querySelector('.sp-schedule-row')).not.toBeNull(),
      );
      const buttons = Array.from(
        section.sectionEl.querySelectorAll<HTMLButtonElement>('.sp-schedule-actions button'),
      );
      const action = (label: string) => buttons.find((x) => x.textContent === label)!;
      expect(action(isEnabled ? 'Pause' : 'Resume').disabled).toBe(!toggle);
      expect(action('Run now').disabled).toBe(!run);
      expect(action('Edit').disabled).toBe(!edit);
      expect(action('Runs').disabled).toBe(false);
      expect(action('Delete').disabled).toBe(false);
      if (!toggle) action('Resume').click();
      if (!run) action('Run now').click();
      expect(setScheduleEnabled).not.toHaveBeenCalled();
      expect(runScheduleNow).not.toHaveBeenCalled();
      section.setActive(false);
    },
  );
});
