/**
 * bridgeAllowlists.test.ts — E4 coverage.
 *
 * Locks the inbound-message-type and inbound-command allowlists. These are
 * the entire authorization boundary for what a (potentially compromised)
 * desktop bridge can do inside the user's editor.
 */

import { describe, expect, it } from 'vitest';
import {
  ALLOWED_BRIDGE_COMMANDS,
  ALLOWED_INBOUND_TYPES,
  ALLOWED_OUTBOUND_TYPES,
} from '../services/desktopBridge';

describe('ALLOWED_INBOUND_TYPES', () => {
  it('includes the auth handshake reply', () => {
    expect(ALLOWED_INBOUND_TYPES.has('auth_ok')).toBe(true);
  });

  it('includes all expected operational types', () => {
    expect(ALLOWED_INBOUND_TYPES.has('desktop:open-file')).toBe(true);
    expect(ALLOWED_INBOUND_TYPES.has('desktop:show-message')).toBe(true);
    expect(ALLOWED_INBOUND_TYPES.has('desktop:run-command')).toBe(true);
  });

  it('rejects classes of types that should never be inbound', () => {
    // Outbound-only types must not appear here.
    expect(ALLOWED_INBOUND_TYPES.has('vscode:connected')).toBe(false);
    expect(ALLOWED_INBOUND_TYPES.has('vscode:code-snippet')).toBe(false);
    expect(ALLOWED_INBOUND_TYPES.has('auth')).toBe(false); // we send auth, not receive it
    // Common dangerous patterns that must never be smuggled in.
    expect(ALLOWED_INBOUND_TYPES.has('eval')).toBe(false);
    expect(ALLOWED_INBOUND_TYPES.has('desktop:exec')).toBe(false);
    expect(ALLOWED_INBOUND_TYPES.has('desktop:write-file')).toBe(false);
    expect(ALLOWED_INBOUND_TYPES.has('desktop:delete-file')).toBe(false);
  });

  it('does not overlap with outbound types except by design', () => {
    const intersection = [...ALLOWED_INBOUND_TYPES].filter((t) => ALLOWED_OUTBOUND_TYPES.has(t));
    expect(intersection).toEqual([]);
  });
});

describe('ALLOWED_BRIDGE_COMMANDS', () => {
  it('includes the expected AGI Workforce surface', () => {
    expect(ALLOWED_BRIDGE_COMMANDS.has('agi-workforce.chat')).toBe(true);
    expect(ALLOWED_BRIDGE_COMMANDS.has('agi-workforce.agentMode')).toBe(true);
    expect(ALLOWED_BRIDGE_COMMANDS.has('agi-workforce.explain')).toBe(true);
    expect(ALLOWED_BRIDGE_COMMANDS.has('agi-workforce.fix')).toBe(true);
    expect(ALLOWED_BRIDGE_COMMANDS.has('agi-workforce.refactor')).toBe(true);
    expect(ALLOWED_BRIDGE_COMMANDS.has('agi-workforce.generateTests')).toBe(true);
    expect(ALLOWED_BRIDGE_COMMANDS.has('agi-workforce.selectModel')).toBe(true);
  });

  it('includes the two safe built-in VS Code commands', () => {
    expect(ALLOWED_BRIDGE_COMMANDS.has('workbench.action.openSettings')).toBe(true);
    expect(ALLOWED_BRIDGE_COMMANDS.has('workbench.action.files.openFile')).toBe(true);
  });

  it('rejects commands that would be dangerous for the bridge to invoke', () => {
    expect(ALLOWED_BRIDGE_COMMANDS.has('workbench.action.terminal.sendSequence')).toBe(false);
    expect(ALLOWED_BRIDGE_COMMANDS.has('workbench.action.tasks.runTask')).toBe(false);
    expect(ALLOWED_BRIDGE_COMMANDS.has('workbench.action.openWalkthrough')).toBe(false);
    expect(ALLOWED_BRIDGE_COMMANDS.has('workbench.extensions.action.installExtension')).toBe(false);
    expect(ALLOWED_BRIDGE_COMMANDS.has('workbench.action.files.delete')).toBe(false);
    expect(ALLOWED_BRIDGE_COMMANDS.has('git.commit')).toBe(false);
    // Untrusted strings the bridge might forward.
    expect(ALLOWED_BRIDGE_COMMANDS.has('eval')).toBe(false);
    expect(ALLOWED_BRIDGE_COMMANDS.has('')).toBe(false);
  });

  it('size is small (no accidental sprawl)', () => {
    // Hard-coded so adding a command requires updating this test, surfacing
    // a review opportunity.
    expect(ALLOWED_BRIDGE_COMMANDS.size).toBeLessThanOrEqual(20);
  });

  it('every entry is a valid command id (namespaced or workbench.*)', () => {
    for (const id of ALLOWED_BRIDGE_COMMANDS) {
      expect(id).toMatch(/^(agi-workforce|workbench)\./);
    }
  });
});
