/**
 * A `type` call with no index lands on whatever holds focus. The model can put
 * focus on a password box with an ordinary click, so the gate has to read the
 * focused element before the keystrokes rather than trust the absence of a
 * target to mean there is nothing sensitive there.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrowserTarget } from '../src/features/computer-use/cdpDriver';
type ScanModule0 = typeof import('../src/features/computer-use/cdpDriver');

const focus = vi.hoisted(() => ({
  signature: null as string | null,
  fail: false,
  reads: 0,
  targetSignatures: new Map<string, string | null>(),
  targetReads: [] as BrowserTarget[],
}));

vi.mock('../src/features/computer-use/cdpDriver', async (importOriginal) => ({
  ...(await importOriginal<ScanModule0>()),
  getFocusedFieldSignature: vi.fn(() => {
    focus.reads += 1;
    if (focus.fail) return Promise.reject(new Error('the tab is gone'));
    return Promise.resolve(focus.signature);
  }),
  resolveIndexedElement: vi.fn(() => null),
  getTargetSignature: vi.fn((_tabId: number, target: BrowserTarget) => {
    focus.targetReads.push(target);
    if (focus.fail) return Promise.reject(new Error('the target changed'));
    return Promise.resolve(focus.targetSignatures.get(JSON.stringify(target)) ?? null);
  }),
}));

vi.stubGlobal('chrome', {
  tabs: { get: () => Promise.resolve({ id: 7, url: 'https://example.com/form' }) },
  runtime: { lastError: null },
});

const { resolveApprovalRequirement } = await import('../src/features/computer-use/agentLoop');

beforeEach(() => {
  focus.signature = null;
  focus.fail = false;
  focus.reads = 0;
  focus.targetSignatures.clear();
  focus.targetReads.length = 0;
});

describe('native keyboard and gesture approval targets', () => {
  it('reads the actual focused control before a keyboard action', async () => {
    focus.signature = 'button||||Publish post';
    await expect(resolveApprovalRequirement(7, 'press_key', { key: 'Enter' })).resolves.toEqual({
      alwaysAsk: true,
      reason: 'publish',
    });
    expect(focus.reads).toBe(1);
  });

  it('leaves an ordinary focused search field to the ask-before-acting preference', async () => {
    focus.signature = 'input||text|search|Search this site';
    await expect(resolveApprovalRequirement(7, 'press_key', { key: 'Enter' })).resolves.toEqual({
      alwaysAsk: false,
    });
    expect(focus.reads).toBe(1);
  });

  it('asks before a key when the focused target cannot be read', async () => {
    focus.fail = true;
    await expect(resolveApprovalRequirement(7, 'press_key', { key: 'Enter' })).resolves.toEqual({
      alwaysAsk: true,
      reason: 'unidentified_input',
    });
  });

  it('reevaluates focus when an ordinary field was replaced by a password field', async () => {
    focus.signature = 'input||text|search|Search this site';
    await expect(resolveApprovalRequirement(7, 'press_key', { key: 'a' })).resolves.toEqual({
      alwaysAsk: false,
    });
    focus.signature = 'input||password|password|Password';
    await expect(resolveApprovalRequirement(7, 'press_key', { key: 'a' })).resolves.toEqual({
      alwaysAsk: true,
      reason: 'sensitive_input',
    });
    expect(focus.reads).toBe(2);
  });

  it('uses the live indexed keyboard target rather than assuming the snapshot still describes it', async () => {
    const target = { index: 3 };
    focus.targetSignatures.set(JSON.stringify(target), 'input||password|password|Password');

    await expect(
      resolveApprovalRequirement(7, 'press_key', { key: 'a', index: target.index }),
    ).resolves.toEqual({ alwaysAsk: true, reason: 'sensitive_input' });
    expect(focus.targetReads).toEqual([target]);
    expect(focus.reads).toBe(0);
  });

  it('asks when the indexed keyboard target is stale or no longer in the live DOM', async () => {
    await expect(
      resolveApprovalRequirement(7, 'press_key', { key: 'a', index: 3 }),
    ).resolves.toEqual({
      alwaysAsk: true,
      reason: 'unidentified_input',
    });
    expect(focus.targetReads).toEqual([{ index: 3 }]);
    expect(focus.reads).toBe(0);
  });

  it.each(['drag', 'swipe'])('%s checks both live gesture endpoints', async (toolName) => {
    const source = { x: 10, y: 10 };
    const destination = { x: 100, y: 100 };
    focus.targetSignatures.set(JSON.stringify(source), 'div||||A calendar event');
    focus.targetSignatures.set(JSON.stringify(destination), 'input||password|password|Password');

    await expect(
      resolveApprovalRequirement(7, toolName, {
        startX: source.x,
        startY: source.y,
        endX: destination.x,
        endY: destination.y,
      }),
    ).resolves.toEqual({ alwaysAsk: true, reason: 'sensitive_input' });
    expect(focus.targetReads).toEqual([source, destination]);
  });

  it('leaves a drag between identified ordinary targets to the ask-before-acting preference', async () => {
    focus.targetSignatures.set(JSON.stringify({ index: 1 }), 'div||||A calendar event');
    focus.targetSignatures.set(JSON.stringify({ index: 2 }), 'div||||Thursday column');

    await expect(
      resolveApprovalRequirement(7, 'drag', { startIndex: 1, endIndex: 2 }),
    ).resolves.toEqual({ alwaysAsk: false });
    expect(focus.targetReads).toEqual([{ index: 1 }, { index: 2 }]);
  });

  it('asks if one drag endpoint became stale even while the other is known', async () => {
    focus.targetSignatures.set(JSON.stringify({ index: 1 }), 'div||||A calendar event');

    await expect(
      resolveApprovalRequirement(7, 'drag', { startIndex: 1, endIndex: 2 }),
    ).resolves.toEqual({ alwaysAsk: true, reason: 'unidentified_input' });
    expect(focus.targetReads).toEqual([{ index: 1 }, { index: 2 }]);
  });
});

describe('typing into whatever holds focus', () => {
  it('asks before typing into a focused password field', async () => {
    focus.signature = 'input||password|user_password|Password';

    await expect(resolveApprovalRequirement(7, 'type', { text: 'hunter2' })).resolves.toEqual({
      alwaysAsk: true,
      reason: 'sensitive_input',
    });
  });

  it('asks before typing into a focused one-time-code field', async () => {
    focus.signature = 'input||text|otp|One-time passcode';

    await expect(resolveApprovalRequirement(7, 'type', { text: '123456' })).resolves.toEqual({
      alwaysAsk: true,
      reason: 'sensitive_input',
    });
  });

  it('asks when the focused element cannot be identified at all', async () => {
    focus.signature = null;

    await expect(resolveApprovalRequirement(7, 'type', { text: 'hello' })).resolves.toEqual({
      alwaysAsk: true,
      reason: 'unidentified_input',
    });
  });

  it('asks when reading focus failed, rather than treating the failure as an all-clear', async () => {
    focus.fail = true;

    await expect(resolveApprovalRequirement(7, 'type', { text: 'hello' })).resolves.toEqual({
      alwaysAsk: true,
      reason: 'unidentified_input',
    });
  });

  it('lets an ordinary focused text field through without a prompt', async () => {
    focus.signature = 'input||text|search|Search this site';

    await expect(resolveApprovalRequirement(7, 'type', { text: 'shoes' })).resolves.toEqual({
      alwaysAsk: false,
    });
  });

  it('does not read focus for an action that does not type', async () => {
    await resolveApprovalRequirement(7, 'click', { x: 10, y: 20 });

    expect(focus.reads).toBe(0);
  });
});
