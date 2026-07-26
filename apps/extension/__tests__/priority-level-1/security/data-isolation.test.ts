/**
 * L1 Security — Data Isolation (message-router sender-class policy).
 *
 * The extension's BOLA/IDOR equivalent is the message-router policy: a content
 * script on an allowlisted site must not be able to invoke state-mutating or
 * cross-tab privileged actions reserved for the trusted extension UI. The
 * single source of truth is MESSAGE_POLICY / getMessagePolicy in
 * src/background/policy.ts. These tests import it directly (no mirror).
 */

import { describe, expect, test } from 'vitest';
import {
  DOM_MUTATION_MESSAGE_TYPES,
  EXTENSION_PAGE_ONLY_MESSAGE_TYPES,
  getMessagePolicy,
} from '../../../src/background/policy';

describe('L1 Security - Data Isolation (sender-class gating)', () => {
  test('SECURITY: high-privilege state mutations are extension-page-only', () => {
    // Scheduled-task / shortcut creation outlives the originating tab, so a
    // content script must never originate them (C-02/C-03). Starting the
    // computer-use loop attaches the debugger and is UI-trusted only.
    for (const type of [
      'CREATE_SCHEDULED_TASK',
      'UPDATE_SCHEDULED_TASK',
      'DELETE_SCHEDULED_TASK',
      'SAVE_SHORTCUT',
      'DELETE_SHORTCUT',
      'AGI_START_COMPUTER_USE',
      'RESOLVE_CHAT_APPROVAL',
    ]) {
      expect(getMessagePolicy(type).senderClass).toBe('extension-page-only');
      expect(EXTENSION_PAGE_ONLY_MESSAGE_TYPES.has(type)).toBe(true);
    }
  });

  test('SECURITY: DOM-mutation types are pinned to the sender tab (no cross-tab)', () => {
    for (const type of ['TYPE', 'CLICK', 'SUBMIT_FORM', 'EXECUTE_SCRIPT', 'RUN_PAGE_ACTIONS']) {
      const policy = getMessagePolicy(type);
      expect(policy.allowsCrossTab).toBe(false);
      expect(DOM_MUTATION_MESSAGE_TYPES.has(type)).toBe(true);
    }
  });

  test('SECURITY: unknown message types fall back to fail-safe default policy', () => {
    // Unknown types get allowlisted-tab + cross-tab OK — safe for read-only
    // handlers, and crucially NOT extension-page-only-bypass nor discovery.
    const policy = getMessagePolicy('SOME_UNREGISTERED_TYPE');
    expect(policy.senderClass).toBe('allowlisted-tab');
    expect(policy.senderClass).not.toBe('discovery');
    // Sets do not overlap: a type cannot be both extension-page-only and a
    // same-tab DOM mutation, which would create an ambiguous gate.
    for (const t of EXTENSION_PAGE_ONLY_MESSAGE_TYPES) {
      expect(DOM_MUTATION_MESSAGE_TYPES.has(t)).toBe(false);
    }
  });
});
