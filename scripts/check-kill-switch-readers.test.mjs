import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  HANDSHAKE,
  KILL_SWITCHES,
  ME_ROUTE,
  UNREAD,
  checkKillSwitchReaders,
  rustBody,
  withoutRustTests,
} from './check-kill-switch-readers.mjs';

const OWED = UNREAD.map((entry) => `  '${entry.capability}',`).join('\n');

function switches(extra) {
  return `
export const EXTRA_KILL_SWITCH_CAPABILITIES = [
  'work',
${OWED}
${extra}
] as const;
export const WORK_CAPABILITY: KillSwitchCapability = 'work';
`;
}

const WIRED_ME = 'closedCapabilities: platformCapabilitiesOf(gate.closedCapabilities),\n';
const WIRED_HANDSHAKE =
  'for (const capability of closedCapabilities) granted.delete(capability);\n';
const WORK_READER = "await assertCapabilityAvailable(subject, WORK_CAPABILITY, 'Work');\n";

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kill-switch-readers-'));
  const all = {
    [KILL_SWITCHES]: switches(''),
    [ME_ROUTE]: WIRED_ME,
    [HANDSHAKE]: WIRED_HANDSHAKE,
    'apps/web/lib/workflows/start.ts': WORK_READER,
    ...files,
  };
  for (const [relative, source] of Object.entries(all)) {
    if (source === null) continue;
    const full = path.join(root, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, source);
  }
  return root;
}

test('every switch read and every owed switch listed passes', () => {
  assert.deepEqual(checkKillSwitchReaders(fixture({})).failures, []);
});

test('a new switch nothing reads fails', () => {
  const root = fixture({ [KILL_SWITCHES]: switches("  'voice_clone',") });
  const { failures } = checkKillSwitchReaders(root);
  assert.equal(failures.length, 1);
  assert.match(failures[0], /voice_clone kill switch is declared .* nothing reads it/);
});

test('a switch read only by a test is not read', () => {
  const root = fixture({
    [KILL_SWITCHES]: switches("  'voice_clone',"),
    'apps/web/lib/voice/__tests__/clone.test.ts': "gate.capabilityAllowed('voice_clone');\n",
    'apps/web/lib/voice/clone.test.ts': "gate.capabilityAllowed('voice_clone');\n",
  });
  assert.equal(checkKillSwitchReaders(root).failures.length, 1);
});

test('a server gate call, a constant, or a client reading the published key each count', () => {
  for (const reader of [
    "if (!gate.capabilityAllowed('voice_clone')) return refuse();\n",
    'const hidden = flags["capability.voice_clone"] === false;\n',
    "const closed = disabled.some((entry) => entry.capability === 'voice_clone');\n",
  ]) {
    const root = fixture({
      [KILL_SWITCHES]: switches("  'voice_clone',"),
      'apps/web/app/api/voice/clone/route.ts': reader,
    });
    assert.deepEqual(checkKillSwitchReaders(root).failures, [], reader);
  }
});

test('removing the only reader of a read switch fails', () => {
  const root = fixture({ 'apps/web/lib/workflows/start.ts': 'export const nothing = 1;\n' });
  assert.match(
    checkKillSwitchReaders(root).failures.join('\n'),
    /work kill switch .* nothing reads it/,
  );
});

test('a Rust reader counts only when another file calls the function that holds it', () => {
  const gate = `
pub const SWITCH_KEY: &str = "capability.dictation";
pub fn from_flags(flags: &Flags) -> bool {
    flags.get(SWITCH_KEY) != Some(&false)
}
`;
  const uncalled = fixture({ 'apps/desktop/src-tauri/src/speech/gate.rs': gate });
  assert.deepEqual(checkKillSwitchReaders(uncalled).failures, []);

  const called = fixture({
    'apps/desktop/src-tauri/src/speech/gate.rs': gate,
    'apps/desktop/src-tauri/src/session.rs': 'let open = gate::from_flags(&flags);\n',
  });
  assert.match(
    checkKillSwitchReaders(called).failures.join('\n'),
    /dictation is read now .* remove its entry from UNREAD/,
  );
});

test('a Rust call inside a test module does not make the reader live', () => {
  const root = fixture({
    'apps/desktop/src-tauri/src/speech/gate.rs':
      'pub const K: &str = "capability.dictation";\npub fn from_flags() -> &str {\n    K\n}\n',
    'apps/desktop/src-tauri/src/session.rs':
      '#[cfg(test)]\nmod tests {\n    fn t() { super::gate::from_flags(); }\n}\n',
  });
  assert.deepEqual(checkKillSwitchReaders(root).failures, []);
});

test('the handshake losing either end of the platform path fails', () => {
  const unwiredMe = fixture({ [ME_ROUTE]: 'closedCapabilities: [],\n' });
  assert.match(checkKillSwitchReaders(unwiredMe).failures.join('\n'), /no platform kill switch/);
  const unwiredHandshake = fixture({ [HANDSHAKE]: 'return granted;\n' });
  assert.match(checkKillSwitchReaders(unwiredHandshake).failures.join('\n'), /settings layer/);
});

test('the Rust helpers read bodies and drop test modules', () => {
  assert.equal(rustBody('fn a() { if x { y } }\nfn b() {}', 'a'), '{ if x { y } }');
  assert.equal(rustBody('fn decl();', 'decl'), '');
  assert.equal(withoutRustTests('fn live() {}\n#[cfg(test)]\nmod tests {\n}\n'), 'fn live() {}\n');
});
