import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  MOBILE_SESSION_PATH,
  REPO_ROOT,
  WEB_SESSION_PATH,
  checkVoiceSessionParity,
  readDelegationTerminalEvents,
  readHandledEvents,
} from './check-voice-session-parity.mjs';

const roots = [];

function sessionSource({ events, terminal, pendingMute = true }) {
  return `
const DELEGATION_TERMINAL_EVENTS = new Set([
${terminal.map((entry) => `  '${entry}',`).join('\n')}
]);

export class LiveVoiceSession {
  setMuted(muted: boolean): void {
    if (!this.started) {
${pendingMute ? '      this.pendingMuted = muted;' : '      return;'}
      return;
    }
    this.sendMuteState(muted);
  }

  async close(): Promise<void> {
    this.closing = true;
    this.dispose();
  }

  dispose(): void {
    this.disposed = true;
  }

  private fail(): void {
    this.callbacks.onError('dropped');
    this.dispose();
  }

  private handleMessage(payload: string): void {
    switch (parsed.type) {
${events
  .map((event) =>
    event === 'session.closed'
      ? `      case 'session.closed': {\n        this.dispose();\n        return;\n      }`
      : event === 'session.started'
        ? `      case 'session.started': {\n        this.started = true;\n        const pendingMuted = this.pendingMuted;\n        if (pendingMuted !== null) this.sendMuteState(pendingMuted);\n        return;\n      }`
        : `      case '${event}':\n        return;`,
  )
  .join('\n')}
      default:
        return;
    }
  }
}
`;
}

const EVENTS = [
  'session.started',
  'session.input_transcript.delta',
  'session.output_transcript.delta',
  'session.usage.updated',
  'session.closed',
];
const TERMINAL = ['response.completed', 'response.failed'];

function makeRoot(webOverrides = {}, mobileOverrides = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'voice-parity-'));
  roots.push(root);
  for (const [relativePath, overrides] of [
    [WEB_SESSION_PATH, webOverrides],
    [MOBILE_SESSION_PATH, mobileOverrides],
  ]) {
    const absolute = path.join(root, relativePath);
    mkdirSync(path.dirname(absolute), { recursive: true });
    writeFileSync(absolute, sessionSource({ events: EVENTS, terminal: TERMINAL, ...overrides }));
  }
  return root;
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

test('two implementations that handle the same events pass', () => {
  assert.deepEqual(checkVoiceSessionParity(makeRoot()), []);
});

test('an event only one surface handles is reported', () => {
  const root = makeRoot({ events: [...EVENTS, 'session.delegation.created'] });
  const failures = checkVoiceSessionParity(root);
  assert.ok(
    failures.some((failure) => failure.includes('only web handles session.delegation.created')),
    failures.join('; '),
  );
});

test('a delegation ending only one surface knows is reported', () => {
  const root = makeRoot({}, { terminal: [...TERMINAL, 'response.cancelled'] });
  const failures = checkVoiceSessionParity(root);
  assert.ok(
    failures.some((failure) => failure.includes('only mobile handles response.cancelled')),
    failures.join('; '),
  );
});

test('a mute dropped before the session starts is reported', () => {
  const failures = checkVoiceSessionParity(makeRoot({ pendingMute: false }));
  assert.ok(
    failures.some((failure) => failure.startsWith('web: a mute chosen')),
    failures.join('; '),
  );
});

test('the checked-in implementations agree', () => {
  assert.deepEqual(checkVoiceSessionParity(REPO_ROOT), []);
});

test('the checked-in implementations name the same non-empty protocol', () => {
  const web = readFileSync(path.join(REPO_ROOT, WEB_SESSION_PATH), 'utf8');
  const mobile = readFileSync(path.join(REPO_ROOT, MOBILE_SESSION_PATH), 'utf8');
  const events = readHandledEvents(web);
  assert.ok(events.includes('session.started') && events.includes('session.closed'));
  assert.deepEqual(events, readHandledEvents(mobile));
  assert.deepEqual(readDelegationTerminalEvents(web), readDelegationTerminalEvents(mobile));
});
