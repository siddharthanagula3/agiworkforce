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
