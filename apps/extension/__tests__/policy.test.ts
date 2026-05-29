/**
 * Contract tests for `src/background/policy.ts` — the single source of truth
 * for message-router gates, bridge-URL validation, and shortcut-action
 * allowlisting (introduced in C-02/C-03/H-02 audit 2026-05-19).
 *
 * These tests import from production source rather than mirror — that
 * mirror pattern is exactly what made H-02 invisible. Any future regression
 * in the policy module must fail these tests.
 */

import { describe, expect, it } from 'vitest';
import {
  ALLOWED_BRIDGE_HOSTS,
  ALLOWED_SHORTCUT_ACTION_TYPES,
  DEFAULT_AGI_BRIDGE_URL,
  DISCOVERY_MESSAGE_TYPES,
  DOM_MUTATION_MESSAGE_TYPES,
  EXTENSION_PAGE_ONLY_MESSAGE_TYPES,
  MESSAGE_POLICY,
  ORIGIN_EXTENSION_PAGE,
  generateRecordId,
  getMessagePolicy,
  validateBridgeUrl,
  validateShortcutActions,
} from '../src/background/policy';

describe('policy — EXTENSION_PAGE_ONLY_MESSAGE_TYPES', () => {
  it('includes all task and shortcut creation/mutation types', () => {
    for (const t of [
      'CREATE_SCHEDULED_TASK',
      'UPDATE_SCHEDULED_TASK',
      'DELETE_SCHEDULED_TASK',
      'SAVE_SHORTCUT',
      'DELETE_SHORTCUT',
      'CANCEL_STREAM',
    ]) {
      expect(EXTENSION_PAGE_ONLY_MESSAGE_TYPES.has(t)).toBe(true);
    }
  });

  it('does NOT include REPLAY_SHORTCUT (web-allowlisted replay is allowed today)', () => {
    expect(EXTENSION_PAGE_ONLY_MESSAGE_TYPES.has('REPLAY_SHORTCUT')).toBe(false);
  });

  it('does NOT overlap with DOM_MUTATION_MESSAGE_TYPES', () => {
    for (const t of EXTENSION_PAGE_ONLY_MESSAGE_TYPES) {
      expect(DOM_MUTATION_MESSAGE_TYPES.has(t)).toBe(false);
    }
  });
});

describe('policy — DOM_MUTATION_MESSAGE_TYPES', () => {
  it('contains every type a content-script handler writes the DOM for', () => {
    for (const t of [
      'TYPE',
      'CLICK',
      'DOUBLE_CLICK',
      'RIGHT_CLICK',
      'SUBMIT_FORM',
      'FILL_FORM',
      'RUN_PAGE_ACTIONS',
      'AUTO_FILL_JOB_APPLICATION',
      'EXECUTE_SCRIPT',
    ]) {
      expect(DOM_MUTATION_MESSAGE_TYPES.has(t)).toBe(true);
    }
  });

  it('excludes recording types (read state, not mutations)', () => {
    for (const t of ['START_RECORDING', 'STOP_RECORDING', 'GET_RECORDED_ACTIONS']) {
      expect(DOM_MUTATION_MESSAGE_TYPES.has(t)).toBe(false);
    }
  });
});

describe('policy — DISCOVERY_MESSAGE_TYPES (H-1)', () => {
  it('is empty — no types bypass the allowlist gate', () => {
    expect(DISCOVERY_MESSAGE_TYPES.size).toBe(0);
  });
});

describe('policy — validateBridgeUrl', () => {
  it('accepts localhost variants', () => {
    expect(validateBridgeUrl('http://localhost:8787')).toBe('http://localhost:8787');
    expect(validateBridgeUrl('https://localhost')).toBe('https://localhost');
  });

  it('accepts 127.0.0.1', () => {
    expect(validateBridgeUrl('http://127.0.0.1:8787')).toBe('http://127.0.0.1:8787');
  });

  it('accepts the bracketed IPv6 loopback (H-03)', () => {
    expect(validateBridgeUrl('http://[::1]:8787')).toBe('http://[::1]:8787');
  });

  it('REJECTS 0.0.0.0 (H-02 / SEV-CHEXT-09)', () => {
    expect(validateBridgeUrl('http://0.0.0.0:8787')).toBeNull();
  });

  it('rejects remote hostnames', () => {
    expect(validateBridgeUrl('https://evil.com')).toBeNull();
    expect(validateBridgeUrl('http://localhost.evil.com')).toBeNull();
  });

  it('rejects non-http(s) schemes', () => {
    expect(validateBridgeUrl('file:///etc/passwd')).toBeNull();
    expect(validateBridgeUrl('javascript:alert(1)')).toBeNull();
    expect(validateBridgeUrl('data:text/html,<h1>x</h1>')).toBeNull();
  });

  it('normalizes ws/wss to http/https', () => {
    expect(validateBridgeUrl('ws://localhost:8787')).toBe('http://localhost:8787');
    expect(validateBridgeUrl('wss://[::1]')).toBe('https://[::1]');
  });

  it('strips trailing slash', () => {
    expect(validateBridgeUrl('http://localhost:8787/')).toBe('http://localhost:8787');
  });

  it('returns null on empty / malformed input', () => {
    expect(validateBridgeUrl('')).toBeNull();
    expect(validateBridgeUrl('not-a-url')).toBeNull();
  });
});

describe('policy — DEFAULT_AGI_BRIDGE_URL', () => {
  it('is a localhost URL on the canonical port', () => {
    expect(DEFAULT_AGI_BRIDGE_URL).toBe('http://localhost:8787');
    expect(validateBridgeUrl(DEFAULT_AGI_BRIDGE_URL)).toBe(DEFAULT_AGI_BRIDGE_URL);
  });
});

describe('policy — validateShortcutActions', () => {
  it('accepts a simple click + type plan', () => {
    expect(
      validateShortcutActions([
        { id: 'a', type: 'click', selector: '#x' },
        { id: 'b', type: 'type', selector: '#y', value: 'hi' },
      ] as never),
    ).toBe(true);
  });

  it('accepts an empty plan', () => {
    expect(validateShortcutActions([])).toBe(true);
  });

  it('rejects an unknown action type', () => {
    expect(validateShortcutActions([{ id: 'a', type: 'evil_action' }] as never)).toBe(false);
  });

  it('rejects a plan containing one valid + one invalid action', () => {
    expect(
      validateShortcutActions([
        { id: 'a', type: 'click' },
        { id: 'b', type: 'rm -rf' },
      ] as never),
    ).toBe(false);
  });

  it('rejects a non-array', () => {
    expect(validateShortcutActions('click' as never)).toBe(false);
    expect(validateShortcutActions(null as never)).toBe(false);
    expect(validateShortcutActions(undefined as never)).toBe(false);
  });

  it('rejects an action missing a type field', () => {
    expect(validateShortcutActions([{ id: 'a' }] as never)).toBe(false);
  });

  it('is case-insensitive (accepts CLICK, Click)', () => {
    expect(validateShortcutActions([{ id: 'a', type: 'CLICK' }] as never)).toBe(true);
    expect(validateShortcutActions([{ id: 'a', type: 'Click' }] as never)).toBe(true);
  });

  it('covers every type the content-script executor handles', () => {
    for (const t of [
      'click',
      'type',
      'scroll',
      'hover',
      'focus',
      'navigate',
      'wait_for_selector',
      'select_option',
      'set_checked',
      'auto_fill_job_application',
      'submit_job_application',
      'key',
      'hold_key',
      'get_page_info',
      'get_forms',
      'analyze_selection',
    ]) {
      expect(ALLOWED_SHORTCUT_ACTION_TYPES.has(t)).toBe(true);
    }
  });
});

describe('policy — generateRecordId (M-04)', () => {
  it('returns a string with the given prefix', () => {
    expect(generateRecordId('task')).toMatch(/^task_\d+_[0-9a-f]{12}$/);
    expect(generateRecordId('sc')).toMatch(/^sc_\d+_[0-9a-f]{12}$/);
  });

  it('produces distinct IDs across rapid calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(generateRecordId('x'));
    }
    expect(ids.size).toBe(1000);
  });

  it('uses crypto-strong entropy (48-bit suffix, not Math.random)', () => {
    // Verify the suffix is 12 hex chars sourced from crypto.randomUUID.
    const id = generateRecordId('p');
    const suffix = id.split('_')[2];
    expect(suffix).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe('policy — ORIGIN_EXTENSION_PAGE sentinel', () => {
  it('is a non-URL string so it cannot collide with real origins', () => {
    expect(ORIGIN_EXTENSION_PAGE).toBe('__extension_page__');
    expect(() => new URL(ORIGIN_EXTENSION_PAGE)).toThrow();
  });
});

describe('policy — MESSAGE_POLICY matrix (Arch #1 audit 2026-05-19)', () => {
  it('every extension-page-only type has a policy entry with the right senderClass', () => {
    for (const t of EXTENSION_PAGE_ONLY_MESSAGE_TYPES) {
      expect(MESSAGE_POLICY[t]?.senderClass).toBe('extension-page-only');
    }
  });

  it('every DOM-mutation type has a policy entry with allowsCrossTab=false', () => {
    for (const t of DOM_MUTATION_MESSAGE_TYPES) {
      expect(MESSAGE_POLICY[t]?.allowsCrossTab).toBe(false);
    }
  });

  it('extension-page-only types are also cross-tab-allowed (state mutation, not DOM)', () => {
    for (const t of EXTENSION_PAGE_ONLY_MESSAGE_TYPES) {
      expect(MESSAGE_POLICY[t]?.allowsCrossTab).toBe(true);
    }
  });

  it('getMessagePolicy returns explicit entry for known types', () => {
    expect(getMessagePolicy('CLICK').allowsCrossTab).toBe(false);
    expect(getMessagePolicy('CREATE_SCHEDULED_TASK').senderClass).toBe('extension-page-only');
  });

  it('getMessagePolicy returns the fail-safe default for unknown types', () => {
    // Unknown types fall back to allowlisted-tab + cross-tab — safe for
    // read-only handlers; you MUST add an explicit entry for DOM-writing
    // or state-persisting types.
    const policy = getMessagePolicy('NEWLY_ADDED_FOO');
    expect(policy.senderClass).toBe('allowlisted-tab');
    expect(policy.allowsCrossTab).toBe(true);
  });

  it('no type is BOTH extension-page-only AND DOM-mutating', () => {
    for (const t of EXTENSION_PAGE_ONLY_MESSAGE_TYPES) {
      expect(DOM_MUTATION_MESSAGE_TYPES.has(t)).toBe(false);
    }
  });

  it('DISCOVERY_MESSAGE_TYPES is empty (H-1)', () => {
    expect(DISCOVERY_MESSAGE_TYPES.size).toBe(0);
  });
});
