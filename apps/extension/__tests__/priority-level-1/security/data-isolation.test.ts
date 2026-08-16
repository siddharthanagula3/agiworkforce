
import { describe, expect, test } from 'vitest';
import {
  DOM_MUTATION_MESSAGE_TYPES,
  EXTENSION_PAGE_ONLY_MESSAGE_TYPES,
  getMessagePolicy,
} from '../../../src/background/policy';

describe('L1 Security - Data Isolation (sender-class gating)', () => {
  test('SECURITY: high-privilege state mutations are extension-page-only', () => {
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
    const policy = getMessagePolicy('SOME_UNREGISTERED_TYPE');
    expect(policy.senderClass).toBe('allowlisted-tab');
    expect(policy.senderClass).not.toBe('discovery');
    for (const t of EXTENSION_PAGE_ONLY_MESSAGE_TYPES) {
      expect(DOM_MUTATION_MESSAGE_TYPES.has(t)).toBe(false);
    }
  });
});
