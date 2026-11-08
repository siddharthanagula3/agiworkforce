// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRoutingSlotModel } from '@agiworkforce/types';
import { MANAGED_CLOUD_DEFAULT_MODEL_SELECTION } from '@agiworkforce/cloud-contracts';
import catalog from '../_locales/en/messages.json';
import {
  buildSchedulesSection,
  type SchedulesSectionDependencies,
} from '../src/features/side-panel/schedulesSection';

const model = getRoutingSlotModel('general_fast');
const models = [
  { value: MANAGED_CLOUD_DEFAULT_MODEL_SELECTION, label: 'Auto' },
  { value: model, label: 'Chosen model' },
];
beforeEach(() => {
  document.body.replaceChildren();
  vi.stubGlobal('chrome', {
    i18n: {
      getMessage: (key: string) =>
        (catalog as Record<string, { message: string }>)[key]?.message ?? key,
    },
  });
});
function setup(
  listModels: SchedulesSectionDependencies['listModels'] = vi.fn(async () => ({
    status: 'success' as const,
    options: models,
  })),
) {
  const createSchedule = vi.fn(async () => ({
    status: 'error' as const,
    code: 'server_error' as const,
    message: 'Fixture stops after validation',
  }));
  const section = buildSchedulesSection({
    listModels,
    createSchedule,
    listSchedules: async () => ({ status: 'success', schedules: [] }),
    now: () => Date.parse('2026-01-01T00:00:00Z'),
  });
  document.body.appendChild(section.sectionEl);
  const root = section.sectionEl;
  const form = root.querySelector<HTMLFormElement>('form')!;
  const field = (label: string) => {
    const wrapper = Array.from(form.querySelectorAll('label')).find(
      (x) => x.querySelector('span')?.textContent === label,
    );
    const input = wrapper?.querySelector<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >('input,select,textarea');
    if (!input) throw new Error('Missing control: ' + label);
    return input;
  };
  const set = (label: string, value: string) => {
    const input = field(label);
    input.value = value;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  root.querySelector<HTMLButtonElement>('button[aria-controls="sp-schedule-form"]')!.click();
  return { section, root, form, field, set, createSchedule, listModels };
}
async function ready(h: ReturnType<typeof setup>) {
  await vi.waitFor(() => expect(h.field('Model').disabled).toBe(false));
  h.set('Name', 'Owned one-time task');
  h.set('Instructions', 'Return the test marker');
}
describe('native schedule creation controls', () => {
  it('creates a one-time task with the chosen model and timezone-aware instant', async () => {
    const h = setup();
    await ready(h);
    h.set('Repeat', 'once');
    h.set('Run at', '2026-07-15T09:30');
    h.set('Time zone', 'America/New_York');
    h.set('Model', model);
    h.form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await vi.waitFor(() =>
      expect(h.createSchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          recurrence: 'once',
          model,
          scheduledAt: '2026-07-15T13:30:00.000Z',
          maxExecutions: 1,
        }),
      ),
    );
    expect(h.field('Time').closest('label')?.hidden).toBe(true);
  });
  it.each(['2026-03-08T02:30', '2026-11-01T01:30', '2025-12-31T09:30'])(
    'rejects an invalid or past instant %s before sending',
    async (value) => {
      const h = setup();
      await ready(h);
      h.set('Repeat', 'once');
      h.set('Run at', value);
      h.set('Time zone', 'America/New_York');
      h.form.dispatchEvent(new Event('submit', { cancelable: true }));
      expect(h.createSchedule).not.toHaveBeenCalled();
      expect(h.form.querySelector('[role="alert"]')?.textContent).not.toBe('');
      h.set('Run at', '2026-07-15T09:30');
      expect(h.form.querySelector('[role="alert"]')?.textContent).toBe('');
    },
  );
  it('rejects a model value outside the loaded catalog', async () => {
    const h = setup();
    await ready(h);
    h.set('Model', 'unavailable-model');
    h.form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(h.createSchedule).not.toHaveBeenCalled();
    expect(h.form.querySelector('[role="alert"]')?.textContent).not.toBe('');
  });
  it('keeps creation disabled while models load and ignores a result after closing', async () => {
    let resolve!: (value: { status: 'success'; options: typeof models }) => void;
    const listModels = vi.fn<SchedulesSectionDependencies['listModels']>(
      () =>
        new Promise<{ status: 'success'; options: typeof models }>((done) => {
          resolve = done;
        }),
    );
    const h = setup(listModels);
    expect(h.form.querySelector<HTMLButtonElement>('[type="submit"]')?.disabled).toBe(true);
    Array.from(h.form.querySelectorAll('button'))
      .find((x) => x.textContent === 'Cancel')!
      .click();
    resolve({ status: 'success', options: models });
    await Promise.resolve();
    expect(listModels.mock.calls[0]?.[0]?.signal?.aborted).toBe(true);
    expect(h.form.hidden).toBe(true);
    expect(h.createSchedule).not.toHaveBeenCalled();
  });
  it('recovers the model picker through its Retry control', async () => {
    const listModels = vi
      .fn<SchedulesSectionDependencies['listModels']>()
      .mockResolvedValueOnce({
        status: 'error',
        code: 'server_error',
        message: 'Catalog unavailable',
      })
      .mockResolvedValueOnce({ status: 'success', options: models });
    const h = setup(listModels);
    await vi.waitFor(() =>
      expect(h.form.querySelector('[role="alert"]')?.textContent).toBe('Catalog unavailable'),
    );
    expect(h.field('Model').disabled).toBe(true);
    expect(h.form.querySelector<HTMLButtonElement>('[type="submit"]')?.disabled).toBe(true);
    Array.from(h.form.querySelectorAll('button'))
      .find((x) => x.textContent === 'Retry')!
      .click();
    await ready(h);
    expect(listModels).toHaveBeenCalledTimes(2);
  });
});
