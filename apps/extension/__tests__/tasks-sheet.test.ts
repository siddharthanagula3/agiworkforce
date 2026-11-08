// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CloudAgentRun } from '@agiworkforce/cloud-contracts';
import catalog from '../_locales/en/messages.json';
import { buildTasksSheet } from '../src/features/side-panel/tasksSheet';

type Entry = { message: string; placeholders?: Record<string, { content: string }> };
const message = (key: string, substitutions: string[] = []): string => {
  const entry = (catalog as Record<string, Entry>)[key];
  if (!entry) return '';
  return entry.message.replace(/\$([A-Z_]+)\$/g, (_match, name: string) => {
    const index = Number((entry.placeholders?.[name.toLowerCase()]?.content ?? '$0').slice(1)) - 1;
    return substitutions[index] ?? '';
  });
};

beforeEach(() => {
  document.body.replaceChildren();
  vi.stubGlobal('chrome', { i18n: { getMessage: message } });
});

function run(overrides: Partial<CloudAgentRun>): CloudAgentRun {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    userId: 'user',
    requestId: 'request',
    conversationId: 'c0ffee00-0000-4000-8000-000000000000',
    conversationTitle: 'Weekly report',
    originSurface: 'chrome',
    workMode: 'agiwork',
    state: 'running',
    provider: 'openai',
    model: 'model',
    lastEventSequence: 4,
    cancellationRequestedAt: null,
    completedAt: null,
    createdAt: '2026-10-18T00:00:00.000Z',
    updatedAt: '2026-10-18T00:00:00.000Z',
    ...overrides,
  } as CloudAgentRun;
}

const button = (root: ParentNode, label: string) =>
  Array.from(root.querySelectorAll('button')).find((node) => node.textContent === label)!;

describe('tasks sheet', () => {
  it('aborts and rejects a delayed list after account reset', async () => {
    let resolve!: (value: { status: 'success'; runs: CloudAgentRun[] }) => void;
    let signal: AbortSignal | undefined;
    const sheet = buildTasksSheet({
      listRuns: (_limit, currentSignal) => {
        signal = currentSignal;
        return new Promise((done) => {
          resolve = done;
        });
      },
      cancelRun: vi.fn(),
      openWeb: vi.fn(),
      formatTime: () => 'now',
    });
    document.body.appendChild(sheet.element);
    sheet.open(document.body);
    sheet.reset();
    resolve({ status: 'success', runs: [run({})] });
    await Promise.resolve();
    expect(signal?.aborted).toBe(true);
    expect(sheet.element.hidden).toBe(true);
    expect(sheet.element.querySelectorAll('.sp-task-item')).toHaveLength(0);
    expect(sheet.element.querySelector('[role="status"]')?.textContent).toBe('');
  });

  it('clears rendered account rows on reset and reloads on reopen', async () => {
    const listRuns = vi
      .fn()
      .mockResolvedValueOnce({ status: 'success', runs: [run({})] })
      .mockResolvedValueOnce({ status: 'success', runs: [] });
    const sheet = buildTasksSheet({
      listRuns,
      cancelRun: vi.fn(),
      openWeb: vi.fn(),
      formatTime: () => 'now',
    });
    document.body.appendChild(sheet.element);
    sheet.open(document.body);
    await vi.waitFor(() => expect(sheet.element.textContent).toContain('Weekly report'));
    sheet.reset();
    expect(sheet.element.textContent).not.toContain('Weekly report');
    sheet.open(document.body);
    await vi.waitFor(() => expect(sheet.element.textContent).toContain(message('spTasksEmpty')));
    expect(listRuns).toHaveBeenCalledTimes(2);
  });

  it('ignores a retired cancellation when another task view is opened', async () => {
    let resolve!: (value: { status: 'success'; run: CloudAgentRun }) => void;
    const cancelRun = vi.fn(
      () =>
        new Promise<{ status: 'success'; run: CloudAgentRun }>((done) => {
          resolve = done;
        }),
    );
    const listRuns = vi
      .fn()
      .mockResolvedValueOnce({ status: 'success', runs: [run({})] })
      .mockResolvedValue({ status: 'success', runs: [] });
    const sheet = buildTasksSheet({
      listRuns,
      cancelRun,
      openWeb: vi.fn(),
      formatTime: () => 'now',
    });
    document.body.appendChild(sheet.element);
    sheet.open(document.body);
    await vi.waitFor(() => expect(button(sheet.element, message('spTasksStop'))).toBeDefined());
    button(sheet.element, message('spTasksStop')).click();
    button(sheet.element.querySelector('[role="alertdialog"]')!, message('spTasksStop')).click();
    sheet.close();
    sheet.open(document.body);
    await vi.waitFor(() => expect(listRuns).toHaveBeenCalledTimes(2));
    resolve({ status: 'success', run: run({ state: 'cancelled' }) });
    await Promise.resolve();
    await Promise.resolve();
    expect(listRuns).toHaveBeenCalledTimes(2);
    expect(sheet.element.querySelector('[role="status"]')?.textContent).toBe('');
  });

  it('lists runs from every app and opens their chat on the web', async () => {
    const openWeb = vi.fn();
    const sheet = buildTasksSheet({
      listRuns: async () => ({ status: 'success', runs: [run({ state: 'completed' })] }),
      cancelRun: vi.fn(),
      openWeb,
      formatTime: () => 'now',
    });
    document.body.appendChild(sheet.element);
    sheet.open(document.body);
    await vi.waitFor(() => expect(sheet.element.textContent).toContain('Weekly report'));
    expect(button(sheet.element, message('spTasksStop'))).toBeUndefined();
    button(sheet.element, message('spTasksOpen')).click();
    expect(openWeb).toHaveBeenCalledWith('/chat/c0ffee00-0000-4000-8000-000000000000');
  });

  it('asks before stopping a running task and stops only after confirming', async () => {
    const cancelRun = vi.fn(async () => ({
      status: 'success' as const,
      run: run({ state: 'cancelled' }),
    }));
    const sheet = buildTasksSheet({
      listRuns: async () => ({ status: 'success', runs: [run({})] }),
      cancelRun,
      openWeb: vi.fn(),
      formatTime: () => 'now',
    });
    document.body.appendChild(sheet.element);
    sheet.open(document.body);
    await vi.waitFor(() => expect(button(sheet.element, message('spTasksStop'))).toBeDefined());
    button(sheet.element, message('spTasksStop')).click();
    const confirm = sheet.element.querySelector('[role="alertdialog"]')!;
    expect(confirm.textContent).toContain(message('spTasksStopConfirm'));
    expect(cancelRun).not.toHaveBeenCalled();
    button(confirm, message('spTasksStop')).click();
    await vi.waitFor(() => expect(cancelRun).toHaveBeenCalledOnce());
    expect(cancelRun.mock.calls[0]![0]).toMatchObject({
      runId: '11111111-1111-4111-8111-111111111111',
      lastSequence: 4,
    });
  });
});
