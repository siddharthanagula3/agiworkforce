/**
 * browserTool.ts — verifies Anthropic Computer Use action mappings + the
 * shared `@agiworkforce/browser-tool` BrowserAction mappings produce the
 * expected `RunPageAction` plan.
 *
 * Covers all 16 canonical Computer Use actions per `computer_20251124`.
 * `zoom` is intentionally an `unsupported` step (not implementable from a
 * Chrome content-script context).
 *
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';

import {
  browserActionToPageActions,
  computerUseToPageActions,
  type ComputerUseAction,
} from '../src/browserTool';

describe('computerUseToPageActions — 16 Computer Use actions', () => {
  const cases: Array<{ name: string; action: ComputerUseAction; expectType: string }> = [
    { name: 'screenshot', action: { kind: 'screenshot' }, expectType: 'screenshot' },
    {
      name: 'left_click',
      action: { kind: 'left_click', coordinate: [10, 20] },
      expectType: 'click',
    },
    {
      name: 'right_click',
      action: { kind: 'right_click', coordinate: [10, 20] },
      expectType: 'right_click',
    },
    {
      name: 'middle_click',
      action: { kind: 'middle_click', coordinate: [10, 20] },
      expectType: 'click',
    },
    {
      name: 'double_click',
      action: { kind: 'double_click', coordinate: [10, 20] },
      expectType: 'double_click',
    },
    {
      name: 'triple_click',
      action: { kind: 'triple_click', coordinate: [10, 20] },
      expectType: 'triple_click',
    },
    {
      name: 'mouse_move',
      action: { kind: 'mouse_move', coordinate: [10, 20] },
      expectType: 'execute_script',
    },
    { name: 'key', action: { kind: 'key', text: 'Enter' }, expectType: 'execute_script' },
    { name: 'type', action: { kind: 'type', text: 'hello' }, expectType: 'type' },
    {
      name: 'scroll',
      action: { kind: 'scroll', scroll_direction: 'down', scroll_amount: 3 },
      expectType: 'scroll',
    },
    {
      name: 'hold_key',
      action: { kind: 'hold_key', text: 'Shift', duration: 100 },
      expectType: 'execute_script',
    },
    { name: 'wait', action: { kind: 'wait', duration: 250 }, expectType: 'wait' },
    {
      name: 'left_mouse_down',
      action: { kind: 'left_mouse_down', coordinate: [1, 2] },
      expectType: 'execute_script',
    },
    {
      name: 'left_mouse_up',
      action: { kind: 'left_mouse_up', coordinate: [1, 2] },
      expectType: 'execute_script',
    },
    {
      name: 'cursor_position',
      action: { kind: 'cursor_position' },
      expectType: 'execute_script',
    },
    { name: 'zoom', action: { kind: 'zoom', level: 1.5 }, expectType: 'unsupported' },
  ];

  for (const c of cases) {
    it(`maps ${c.name}`, () => {
      const steps = computerUseToPageActions(c.action);
      expect(steps.length).toBeGreaterThan(0);
      expect(steps[0]?.type).toBe(c.expectType);
      expect(steps[0]?.id).toMatch(/_\d+_/);
    });
  }
});

describe('browserActionToPageActions — shared @agiworkforce/browser-tool actions', () => {
  it('maps navigate', () => {
    const [step] = browserActionToPageActions({ kind: 'navigate', url: 'https://example.com' });
    expect(step?.type).toBe('navigate');
    expect(step?.value).toBe('https://example.com');
  });

  it('maps click with right button to right_click', () => {
    const [step] = browserActionToPageActions({ kind: 'click', ref: 'r1', button: 'right' });
    expect(step?.type).toBe('right_click');
    expect(step?.selector).toBe('r1');
  });

  it('maps type with submit by appending newline to value', () => {
    const [step] = browserActionToPageActions({
      kind: 'type',
      ref: 'r1',
      text: 'hi',
      submit: true,
    });
    expect(step?.type).toBe('type');
    expect(step?.value).toBe('hi\n');
  });
});
