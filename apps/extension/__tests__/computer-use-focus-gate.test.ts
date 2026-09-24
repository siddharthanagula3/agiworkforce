/**
 * A `type` call with no index lands on whatever holds focus. The model can put
 * focus on a password box with an ordinary click, so the gate has to read the
 * focused element before the keystrokes rather than trust the absence of a
 * target to mean there is nothing sensitive there.
 *
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const focus = vi.hoisted(() => ({
  signature: null as string | null,
  fail: false,
  reads: 0,
}));

vi.mock('../src/features/computer-use/cdpDriver', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/features/computer-use/cdpDriver')>()),
  getFocusedFieldSignature: vi.fn(() => {
    focus.reads += 1;
    if (focus.fail) return Promise.reject(new Error('the tab is gone'));
    return Promise.resolve(focus.signature);
  }),
  resolveIndexedElement: vi.fn(() => null),
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
