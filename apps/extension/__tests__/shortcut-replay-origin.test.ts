import { describe, expect, it } from 'vitest';
import type { RunPageAction } from '../src/types';
import {
  normalizeShortcutStartUrl,
  validateShortcutReplayTarget,
} from '../src/features/shortcuts/origin';

const action: RunPageAction = { id: 'a1', type: 'CLICK', selector: '#go' };

describe('recorded shortcut origin binding', () => {
  it('stores only the origin, not private path/query/fragment state', () => {
    expect(
      normalizeShortcutStartUrl('https://app.example.test/workflow/42?token=secret#step'),
    ).toBe('https://app.example.test');
  });

  it('allows a different route on the exact recorded origin', () => {
    expect(
      validateShortcutReplayTarget(
        { actions: [action], startUrl: 'https://app.example.test/workflow/42' },
        'https://app.example.test/another-route',
      ),
    ).toEqual({ ok: true });
  });

  it.each([
    'https://other.example.test/workflow',
    'https://sub.app.example.test/workflow',
    'http://app.example.test/workflow',
    'https://app.example.test:8443/workflow',
    'chrome://settings',
    'file:///tmp/page.html',
    undefined,
    'not a url',
  ])('rejects a different or non-web active target: %s', (activeUrl) => {
    expect(
      validateShortcutReplayTarget(
        { actions: [action], startUrl: 'https://app.example.test/workflow' },
        activeUrl,
      ).ok,
    ).toBe(false);
  });

  it('fails closed for legacy or malformed action shortcut bindings', () => {
    expect(validateShortcutReplayTarget({ actions: [action] }, 'https://app.example.test').ok).toBe(
      false,
    );
    expect(
      validateShortcutReplayTarget(
        { actions: [action], startUrl: 'javascript:alert(1)' },
        'https://app.example.test',
      ).ok,
    ).toBe(false);
  });

  it('does not bind prompt-only shortcuts that perform no page actions', () => {
    expect(validateShortcutReplayTarget({ actions: [] }, 'chrome://settings')).toEqual({
      ok: true,
    });
  });
});
