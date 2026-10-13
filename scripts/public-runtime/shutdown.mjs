export function observeProcessShutdown(runtime, record, beforeExit) {
  let signal = null;
  runtime.on('SIGTERM', () => {
    signal = 'SIGTERM';
    record('shutdown-signal', { signal });
  });
  runtime.on('exit', (code) => {
    beforeExit();
    record('observer-exit', { code, signal });
  });
}

export function isControlledShutdown(events, exitCode, afterSequence = 0) {
  const exit = events.at(-1);
  const signals = events.filter((event) => event.kind === 'shutdown-signal');
  if (
    events.some((event, index) => event.sequence !== index) ||
    events[0]?.kind !== 'observer-start' ||
    events.filter((event) => event.kind === 'observer-start').length !== 1 ||
    events.filter((event) => event.kind === 'observer-exit').length !== 1 ||
    exit?.kind !== 'observer-exit' ||
    exit.code !== exitCode ||
    exit.sequence <= afterSequence
  )
    return false;
  if (exitCode === 0) return signals.length === 0 && exit.signal == null;
  return (
    exitCode === 143 &&
    exit.signal === 'SIGTERM' &&
    signals.length === 1 &&
    signals[0].signal === 'SIGTERM' &&
    signals[0].sequence > afterSequence &&
    signals[0].sequence < exit.sequence
  );
}
