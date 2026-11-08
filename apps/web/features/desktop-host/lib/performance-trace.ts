const TRACE_MARK = 'agi-desktop-trace-start';
const TRACE_MEASURE = 'agi-desktop-trace';

/** Starts a desktop performance trace, and stops it on the next call. */
export function toggleDesktopPerformanceTrace(): 'started' | 'stopped' {
  const running = performance
    .getEntriesByName(TRACE_MARK)
    .some((entry) => entry.entryType === 'mark');
  if (!running) {
    performance.mark(TRACE_MARK);
    return 'started';
  }
  performance.measure(TRACE_MEASURE, TRACE_MARK);
  performance.clearMarks(TRACE_MARK);
  return 'stopped';
}
