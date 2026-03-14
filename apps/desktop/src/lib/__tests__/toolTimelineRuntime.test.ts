import { describe, expect, it } from 'vitest';
import {
  buildRunningToolTimelineEntry,
  buildTerminalToolTimelineUpdate,
  resolveToolTimelineLabel,
} from '../toolTimelineRuntime';

describe('toolTimelineRuntime', () => {
  it('derives display labels from raw tool payloads', () => {
    const label = resolveToolTimelineLabel({
      rawName: 'mcp__b64_ZmlsZXN5c3RlbQ==__b64_cmVhZF90ZXh0X2ZpbGU=',
      argumentsText: JSON.stringify({ path: '/tmp/example.txt' }),
    });

    expect(label.displayName).toBe('Read file');
    expect(label.displayArgs).toBe('/tmp/example.txt');
  });

  it('reuses the existing timeline label when present', () => {
    const entry = buildRunningToolTimelineEntry({
      id: 'tool-1',
      rawName: 'browser_navigate',
      argumentsText: JSON.stringify({ url: 'https://example.com' }),
      existing: {
        displayName: 'Browser Navigate',
        displayArgs: 'https://example.com',
      },
    });

    expect(entry.displayName).toBe('Browser Navigate');
    expect(entry.displayArgs).toBe('https://example.com');
    expect(entry.status).toBe('running');
  });

  it('builds terminal error updates with duration', () => {
    expect(
      buildTerminalToolTimelineUpdate({
        success: false,
        error: 'Navigation failed',
        durationMs: 245,
      }),
    ).toEqual({
      status: 'error',
      error: 'Navigation failed',
      durationMs: 245,
    });
  });
});
