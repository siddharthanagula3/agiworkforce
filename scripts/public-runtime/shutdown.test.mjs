import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { isControlledShutdown, observeProcessShutdown } from './shutdown.mjs';

const terminatedEvents = () => [
  { sequence: 0, kind: 'observer-start' },
  { sequence: 1, kind: 'snapshot-after-render' },
  { sequence: 2, kind: 'shutdown-signal', signal: 'SIGTERM' },
  { sequence: 3, kind: 'observer-exit', code: 143, signal: 'SIGTERM' },
];

test('shutdown observation records the received signal and native exit after final evidence', () => {
  const runtime = new EventEmitter();
  const events = [{ sequence: 0, kind: 'observer-start' }];
  const record = (kind, value) => events.push({ sequence: events.length, kind, ...value });
  let finalEvidenceWritten = false;
  observeProcessShutdown(runtime, record, () => {
    finalEvidenceWritten = true;
    assert.equal(events.at(-1).kind, 'shutdown-signal');
  });
  runtime.emit('SIGTERM');
  assert.equal(finalEvidenceWritten, false);
  assert.equal(
    events.some((event) => event.kind === 'observer-exit'),
    false,
  );
  runtime.emit('exit', 143);
  assert.equal(finalEvidenceWritten, true);
  assert.equal(isControlledShutdown(events, 143), true);
});

test('only matching native exits after the required boundary qualify as controlled shutdown', () => {
  assert.equal(isControlledShutdown(terminatedEvents(), 143, 1), true);
  assert.equal(
    isControlledShutdown(
      [
        { sequence: 0, kind: 'observer-start' },
        { sequence: 1, kind: 'observer-exit', code: 0 },
      ],
      0,
    ),
    true,
  );
  const reject = (mutate, exitCode = 143, afterSequence = 1) => {
    const events = terminatedEvents();
    mutate(events);
    assert.equal(isControlledShutdown(events, exitCode, afterSequence), false);
  };
  reject((events) => events.pop());
  reject((events) => events.splice(2, 1));
  reject((events) => (events[2].signal = 'SIGINT'));
  reject((events) => (events[3].signal = 'SIGINT'));
  reject((events) => (events[3].code = 1));
  reject(() => {}, 0);
  reject(() => {}, 143, 2);
  reject((events) => (events[0].kind = 'foreign-start'));
  reject((events) => (events[3].sequence = 10));
  reject((events) => events.push({ sequence: 4, kind: 'late-event' }));
  reject((events) => {
    events.splice(3, 0, { kind: 'shutdown-signal', signal: 'SIGTERM' });
    events.forEach((event, sequence) => (event.sequence = sequence));
  });
  reject((events) => {
    events.splice(3, 0, { kind: 'observer-exit', code: 143, signal: 'SIGTERM' });
    events.forEach((event, sequence) => (event.sequence = sequence));
  });
  for (const code of [1, 2, 128, 130, 137]) reject((events) => (events[3].code = code), code);
});
