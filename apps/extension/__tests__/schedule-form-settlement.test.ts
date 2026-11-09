// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getRoutingSlotModel } from '@agiworkforce/types';
import {
  MANAGED_CLOUD_DEFAULT_MODEL_SELECTION,
  ManagedCloudScheduleTaskSchema,
} from '@agiworkforce/cloud-contracts';
import catalog from '../_locales/en/messages.json';
import {
  buildSchedulesSection,
  type SchedulesSectionDependencies,
} from '../src/features/side-panel/schedulesSection';

const models = [
  { value: MANAGED_CLOUD_DEFAULT_MODEL_SELECTION, label: 'Auto' },
  { value: getRoutingSlotModel('general_fast'), label: 'Chosen model' },
];

const task = ManagedCloudScheduleTaskSchema.parse({
  id: 'schedule-a',
  userId: 'user-1',
  name: 'Schedule A',
  description: null,
  scheduleType: 'cron',
  cronExpression: '0 9 * * *',
  executeAt: null,
  intervalMs: null,
  timezone: 'UTC',
  isEnabled: true,
  expiresAt: null,
  maxExecutions: null,
  executionCount: 0,
  actionType: 'agent',
  actionConfig: null,
  prompt: 'Return the marker',
  model: null,
  status: 'active',
  lastExecutedAt: null,
  nextExecutionAt: '2026-12-01T09:00:00.000Z',
  lastError: null,
  metadata: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

type CreateResult = Awaited<ReturnType<SchedulesSectionDependencies['createSchedule']>>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  document.body.replaceChildren();
  vi.stubGlobal('chrome', {
    i18n: {
      getMessage: (key: string) =>
        (catalog as Record<string, { message: string }>)[key]?.message ?? key,
    },
  });
});

function setup() {
  const createPending = deferred<CreateResult>();
  const savePending = deferred<CreateResult>();
  const createSchedule = vi.fn(() => createPending.promise);
  const updateScheduleDetails = vi.fn(() => savePending.promise);
  const section = buildSchedulesSection({
    listModels: async () => ({ status: 'success', options: models }),
    listSchedules: async () => ({ status: 'success', schedules: [task] }),
    createSchedule,
    updateScheduleDetails,
    now: () => Date.parse('2026-01-01T00:00:00Z'),
  });
  document.body.appendChild(section.sectionEl);
  const root = section.sectionEl;
  const form = root.querySelector<HTMLFormElement>('form')!;
  const field = (label: string) => {
    const wrapper = Array.from(form.querySelectorAll('label')).find(
      (x) => x.querySelector('span')?.textContent === label,
    );
    const input = wrapper?.querySelector<HTMLInputElement | HTMLTextAreaElement>('input,textarea');
    if (!input) throw new Error('Missing control: ' + label);
    return input;
  };
  const set = (label: string, value: string) => {
    const input = field(label);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const newButton = () =>
    root.querySelector<HTMLButtonElement>('button[aria-controls="sp-schedule-form"]')!;
  const cancel = () =>
    Array.from(form.querySelectorAll('button'))
      .find((x) => x.textContent === 'Cancel')!
      .click();
  const submit = () => form.dispatchEvent(new Event('submit', { cancelable: true }));
  const submitButton = () => form.querySelector<HTMLButtonElement>('[type="submit"]')!;
  const status = () => root.querySelector('.sp-schedules-status')?.textContent ?? '';
  const openNewDraft = async () => {
    newButton().click();
    await vi.waitFor(() => expect(submitButton().disabled).toBe(false));
  };
  const openEdit = async () => {
    section.setActive(true);
    await vi.waitFor(() => expect(root.querySelector('.sp-schedule-row')).not.toBeNull());
    Array.from(root.querySelectorAll<HTMLButtonElement>('.sp-schedule-actions button'))
      .find((x) => x.textContent === 'Edit')!
      .click();
  };
  return {
    section,
    form,
    field,
    set,
    cancel,
    submit,
    submitButton,
    status,
    openNewDraft,
    openEdit,
    createPending,
    savePending,
    createSchedule,
    updateScheduleDetails,
  };
}

async function typeDraftB(h: ReturnType<typeof setup>) {
  h.cancel();
  await h.openNewDraft();
  h.set('Name', 'Draft B');
  h.set('Instructions', 'Unsaved instructions for B');
}

function expectDraftBIntact(h: ReturnType<typeof setup>) {
  expect(h.form.hidden).toBe(false);
  expect(h.field('Name').value).toBe('Draft B');
  expect(h.field('Instructions').value).toBe('Unsaved instructions for B');
  expect(h.form.querySelector('[role="alert"]')?.textContent ?? '').toBe('');
}

describe('schedule form settlement ownership', () => {
  it('keeps a newer draft open when an earlier create succeeds', async () => {
    const h = setup();
    await h.openNewDraft();
    h.set('Name', 'Schedule A');
    h.set('Instructions', 'Return the marker');
    h.submit();
    expect(h.createSchedule).toHaveBeenCalledTimes(1);
    await typeDraftB(h);
    h.createPending.resolve({ status: 'success', schedule: task });
    await vi.waitFor(() => expect(h.status()).toMatch(/^Created /));
    expectDraftBIntact(h);
  });

  it('reports an earlier create failure outside the newer draft', async () => {
    const h = setup();
    await h.openNewDraft();
    h.set('Name', 'Schedule A');
    h.set('Instructions', 'Return the marker');
    h.submit();
    await typeDraftB(h);
    h.createPending.resolve({
      status: 'error',
      code: 'server_error',
      message: 'Create A failed',
    });
    await vi.waitFor(() => expect(h.status()).toBe('Create A failed'));
    expectDraftBIntact(h);
  });

  it('keeps a newer draft open when an earlier details save succeeds', async () => {
    const h = setup();
    await h.openEdit();
    h.set('Name', 'Schedule A renamed');
    h.submit();
    expect(h.updateScheduleDetails).toHaveBeenCalledWith(
      'schedule-a',
      expect.objectContaining({ name: 'Schedule A renamed' }),
    );
    await typeDraftB(h);
    h.savePending.resolve({
      status: 'success',
      schedule: { ...task, name: 'Schedule A renamed' },
    });
    await vi.waitFor(() => expect(h.status()).toMatch(/^Saved /));
    expectDraftBIntact(h);
  });

  it('still closes the form when the save settles before another draft opens', async () => {
    const h = setup();
    await h.openEdit();
    h.set('Name', 'Schedule A renamed');
    h.submit();
    h.savePending.resolve({
      status: 'success',
      schedule: { ...task, name: 'Schedule A renamed' },
    });
    await vi.waitFor(() => expect(h.form.hidden).toBe(true));
    expect(h.status()).toMatch(/^Saved /);
  });
});
