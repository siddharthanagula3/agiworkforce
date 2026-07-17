import { describe, expect, it } from 'vitest';

import {
  computerActionToBrowserAction,
  runComputerAction,
  type ComputerActionBrowserMapping,
} from '../index';
import type { ComputerAction } from '@agiworkforce/types';

function action(overrides: Partial<ComputerAction>): ComputerAction {
  return {
    id: 'action-1',
    sessionId: 'session-1',
    kind: 'screenshot',
    riskLevel: 'low',
    requiresApproval: false,
    status: 'queued',
    createdAt: '2026-05-21T00:00:00.000Z',
    ...overrides,
  };
}

function expectMapped(mapping: ComputerActionBrowserMapping) {
  expect(mapping.ok).toBe(true);
  if (!mapping.ok) throw new Error(mapping.reason);
  return mapping.action;
}

describe('computerActionToBrowserAction', () => {
  it('maps open_url into navigate with profile and wait policy', () => {
    const mapped = expectMapped(
      computerActionToBrowserAction(
        action({
          kind: 'open_url',
          target: 'https://example.test',
          args: { profile: 'research', waitFor: 'networkidle' },
        }),
      ),
    );

    expect(mapped).toEqual({
      kind: 'navigate',
      url: 'https://example.test',
      profile: 'research',
      waitFor: 'networkidle',
    });
  });

  it('maps click to refs first and coordinates second', () => {
    const refClick = expectMapped(
      computerActionToBrowserAction(action({ kind: 'click', target: 'ref-7' })),
    );
    expect(refClick).toEqual({
      kind: 'click',
      ref: 'ref-7',
      profile: undefined,
      button: undefined,
    });

    const coordClick = expectMapped(
      computerActionToBrowserAction(action({ kind: 'click', args: { x: 10, y: 20 } })),
    );
    expect(coordClick).toEqual({ kind: 'clickCoords', x: 10, y: 20, profile: undefined });
  });

  it('maps type_text and press_key into browser input actions', () => {
    const type = expectMapped(
      computerActionToBrowserAction(
        action({ kind: 'type_text', target: 'email', args: { text: 'hello', submit: true } }),
      ),
    );
    expect(type).toEqual({
      kind: 'type',
      ref: 'email',
      text: 'hello',
      profile: undefined,
      submit: true,
    });

    const press = expectMapped(
      computerActionToBrowserAction(action({ kind: 'press_key', target: 'Enter' })),
    );
    expect(press).toEqual({ kind: 'press', key: 'Enter', profile: undefined });
  });

  it('fails closed for native-only canonical actions', () => {
    const mapped = computerActionToBrowserAction(action({ kind: 'drag' }));
    expect(mapped.ok).toBe(false);
    if (!mapped.ok) expect(mapped.reason).toMatch(/cannot run in browser-tool/i);
  });
});

describe('runComputerAction', () => {
  it('does not execute actions that still require approval', async () => {
    const result = await runComputerAction(
      action({
        kind: 'screenshot',
        requiresApproval: true,
        status: 'queued',
      }),
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]?.type).toBe('text');
    if (result.content[0]?.type === 'text') {
      expect(result.content[0].text).toMatch(/not runnable/i);
      expect(result.content[0].text).toMatch(/without approval/i);
    }
  });
});
