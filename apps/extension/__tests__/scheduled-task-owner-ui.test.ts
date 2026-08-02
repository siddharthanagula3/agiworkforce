import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ManagedCloudOwnerRequestFence } from '../src/features/side-panel/managed-owner-request-fence';
import type { ManagedCloudOwner } from '../src/features/cloud-bridge/managedCloudAuthority';

const OWNER_A = { accountId: 'account-a', authIncarnation: 'session-a' } as const;
const OWNER_B = { accountId: 'account-b', authIncarnation: 'session-b' } as const;

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe('scheduled-task side-panel owner fence', () => {
  it('discards a delayed account A list after the panel transitions to account B', async () => {
    const fence = new ManagedCloudOwnerRequestFence();
    let currentOwner: ManagedCloudOwner | null = OWNER_A;
    const delayedA = deferred<string[]>();
    const immediateB = deferred<string[]>();
    const rendered: string[][] = [];

    const renderWhenCurrent = async (
      snapshot: ReturnType<ManagedCloudOwnerRequestFence['begin']>,
      response: Promise<string[]>,
    ): Promise<void> => {
      const rows = await response;
      if (fence.isCurrent(snapshot, currentOwner)) rendered.push(rows);
    };

    const requestA = fence.begin(currentOwner);
    const pendingA = renderWhenCurrent(requestA, delayedA.promise);

    fence.invalidate();
    currentOwner = OWNER_B;
    const requestB = fence.begin(currentOwner);
    const pendingB = renderWhenCurrent(requestB, immediateB.promise);
    immediateB.resolve(['B task']);
    await pendingB;
    delayedA.resolve(['A private task']);
    await pendingA;

    expect(rendered).toEqual([['B task']]);
  });

  it('rejects an older response for the same owner and a replacement session', () => {
    const fence = new ManagedCloudOwnerRequestFence();
    const first = fence.begin(OWNER_A);
    const newer = fence.begin(OWNER_A);

    expect(fence.isCurrent(first, OWNER_A)).toBe(false);
    expect(fence.isCurrent(newer, OWNER_A)).toBe(true);
    expect(fence.isCurrent(newer, { ...OWNER_A, authIncarnation: 'session-a-replacement' })).toBe(
      false,
    );
  });

  it('discards a delayed account A create callback after transition to account B', () => {
    const fence = new ManagedCloudOwnerRequestFence();
    let currentOwner: ManagedCloudOwner | null = OWNER_A;
    const createA = fence.begin(currentOwner);

    fence.invalidate();
    currentOwner = OWNER_B;

    expect(fence.isCurrent(createA, currentOwner)).toBe(false);
  });
});

const here = dirname(fileURLToPath(import.meta.url));
const sidePanelSource = readFileSync(resolve(here, '../src/side_panel.ts'), 'utf8');

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('scheduled-task owner fence wiring', () => {
  it('invalidates pending list reads and clears rows/count before exposing a new owner', () => {
    const transition = sourceBetween(
      sidePanelSource,
      'async function transitionManagedCloudOwner',
      'function injectStyles',
    );
    expect(transition).toMatch(
      /scheduledTasksRequestFence\.invalidate\(\);[\s\S]*clearWorkflowsTaskRows\(\);[\s\S]*_ctx\.managedCloudOwner = nextOwner/,
    );

    const clearRows = sourceBetween(
      sidePanelSource,
      'function clearWorkflowsTaskRows',
      'function renderTaskRows',
    );
    expect(clearRows).toContain("countBadge.textContent = '0'");
    expect(clearRows).toContain("text: 'No scheduled tasks'");
  });

  it('checks the exact owner snapshot before both list and history continuations render', () => {
    const refresh = sourceBetween(
      sidePanelSource,
      'function refreshWorkflowsTasks',
      'function clearWorkflowsTaskRows',
    );
    expect(refresh).toContain(
      'const request = scheduledTasksRequestFence.begin(_ctx.managedCloudOwner)',
    );
    expect(
      refresh.match(/scheduledTasksRequestFence\.isCurrent\(request, _ctx\.managedCloudOwner\)/g),
    ).toHaveLength(2);
    expect(refresh).toContain('const owner = request.owner');
  });

  it('clears and closes the draft and fences pending creates before exposing a new owner', () => {
    const transition = sourceBetween(
      sidePanelSource,
      'async function transitionManagedCloudOwner',
      'function injectStyles',
    );
    expect(transition).toMatch(
      /scheduledTaskCreateRequestFence\.invalidate\(\);\s*resetScheduledTaskDraftForOwnerTransition\(\);[\s\S]*_ctx\.managedCloudOwner = nextOwner/,
    );

    const form = sourceBetween(
      sidePanelSource,
      'const resetNewTaskForm =',
      "const groupsSection = el('div'",
    );
    expect(form).toContain("newTaskForm.classList.remove('open')");
    expect(form).toContain("ntNameInput.value = ''");
    expect(form).toContain("ntPromptInput.value = ''");
    expect(form).toContain("ntSaveBtn.textContent = 'Create Task'");
    expect(form).toContain(
      'scheduledTaskCreateRequestFence.isCurrent(createRequest, _ctx.managedCloudOwner)',
    );
  });
});
