import assert from 'node:assert/strict';
import test from 'node:test';

import {
  analyzeHitlRequirements,
  analyzeWiring,
  extractHitlRequirements,
  extractRegisteredCommands,
  INVOKE_CALL_PATTERN,
} from './check-wiring.mjs';

test('extracts only commands inside the real generate_handler block', () => {
  const source = `
    // .invoke_handler(tauri::generate_handler![crate::commands::comment_mask])
    fn mention_only() { crate::commands::outside_reference(); }
    builder
      .invoke_handler(tauri::generate_handler![
        crate::commands::registered_command,
        // crate::commands::commented_out,
        crate::commands::nested::second_command,
      ])
      .run();
    fn after() { crate::commands::outside_after(); }
  `;

  assert.deepEqual(extractRegisteredCommands(source), ['registered_command', 'second_command']);
});

test('recognizes multiline generic frontend calls and imported invoke aliases', () => {
  const source = `
    command<{
      available: boolean;
      reason?: string;
    }>('check_capability');

    docInvoke<{
      stdout: string;
      stderr: string;
    }>('execute_code');
  `;
  const commandPattern = /\bcommand(?:<(?:[^<>]|<[^<>]*>)*>)?\s*\(\s*['"]([a-z_][a-z0-9_]*)['"]/g;
  assert.equal([...source.matchAll(commandPattern)][0][1], 'check_capability');
  assert.equal([...source.matchAll(INVOKE_CALL_PATTERN)][0][1], 'execute_code');
});

test('fails an unregistered frontend call and an unallowlisted orphan', () => {
  const result = analyzeWiring({
    registeredCommands: ['called_command', 'orphaned_command'],
    frontendCalls: new Set(['called_command', 'missing_command']),
    rustDefinitions: new Set(['called_command', 'orphaned_command']),
    allowlisted: new Set(),
  });

  assert.deepEqual(result.frontendWithoutRegistration, ['missing_command']);
  assert.deepEqual(result.registeredWithoutFrontend, ['orphaned_command']);
});

test('accepts a reviewed orphan allowlist entry and rejects it once stale', () => {
  const accepted = analyzeWiring({
    registeredCommands: ['native_only'],
    frontendCalls: new Set(),
    rustDefinitions: new Set(['native_only']),
    allowlisted: new Set(['native_only']),
  });
  assert.deepEqual(accepted.registeredWithoutFrontend, []);
  assert.deepEqual(accepted.staleAllowlist, []);

  const stale = analyzeWiring({
    registeredCommands: ['native_only'],
    frontendCalls: new Set(['native_only']),
    rustDefinitions: new Set(['native_only']),
    allowlisted: new Set(['native_only']),
  });
  assert.deepEqual(stale.staleAllowlist, ['native_only']);
});

test('preserves HITL handler enforcement and ignores commented-out approval calls', () => {
  const requirements = extractHitlRequirements(`
    required:
      - tool: file_write
        handler: handlers/file.rs
      - tool: terminal_exec
        handler: handlers/terminal.rs
      - tool: open_url
        handler: handlers/browser.rs
  `);
  const violations = analyzeHitlRequirements(
    requirements,
    new Map([
      ['handlers/file.rs', 'request_confirmation_simple().await;'],
      ['handlers/terminal.rs', '// request_confirmation_simple().await;'],
    ]),
  );

  assert.deepEqual(violations, [
    'terminal_exec -> handlers/terminal.rs has no request_confirmation_simple call',
    'open_url -> missing handler handlers/browser.rs',
  ]);
});
