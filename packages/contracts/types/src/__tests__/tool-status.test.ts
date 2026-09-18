import { describe, it, expect } from 'vitest';
import {
  TOOL_STATUSES,
  TOOL_STATUS_PRESENTATION,
  isToolStatus,
  isTerminalToolStatus,
  normalizeToolStatus,
  type ToolStatus,
} from '../tool-status';

describe('tool status contract', () => {
  it('closes the status vocabulary at seven members', () => {
    expect([...TOOL_STATUSES]).toEqual([
      'pending',
      'awaiting-approval',
      'running',
      'succeeded',
      'partial',
      'canceled',
      'failed',
    ]);
  });

  it('gives every member a presentation entry with a distinct label', () => {
    const labels = TOOL_STATUSES.map((s) => TOOL_STATUS_PRESENTATION[s].label);
    expect(new Set(labels).size).toBe(TOOL_STATUSES.length);
    for (const status of TOOL_STATUSES) {
      expect(TOOL_STATUS_PRESENTATION[status].tone.length).toBeGreaterThan(0);
    }
  });

  it('marks exactly the four end states terminal', () => {
    const terminal = TOOL_STATUSES.filter(isTerminalToolStatus);
    expect(terminal).toEqual(['succeeded', 'partial', 'canceled', 'failed']);
  });

  it.each<[string, ToolStatus]>([
    ['queued', 'pending'],
    ['requires_approval', 'awaiting-approval'],
    ['awaiting approval', 'awaiting-approval'],
    ['searching', 'running'],
    ['executing', 'running'],
    ['in_progress', 'running'],
    ['completed', 'succeeded'],
    ['SUCCESS', 'succeeded'],
    ['incomplete', 'partial'],
    ['max_tokens', 'partial'],
    ['cancelled', 'canceled'],
    ['aborted', 'canceled'],
    ['error', 'failed'],
    ['timed_out', 'failed'],
  ])('normalizes the wire value %s onto %s', (wire, expected) => {
    expect(normalizeToolStatus(wire)).toBe(expected);
  });

  it('passes a value that is already a member through untouched', () => {
    for (const status of TOOL_STATUSES) {
      expect(normalizeToolStatus(status)).toBe(status);
    }
  });

  it('falls back rather than inventing a member for an unknown or non-string value', () => {
    expect(normalizeToolStatus('teleporting')).toBe('running');
    expect(normalizeToolStatus(undefined)).toBe('running');
    expect(normalizeToolStatus(null, 'pending')).toBe('pending');
    expect(normalizeToolStatus({ status: 'running' }, 'failed')).toBe('failed');
  });

  it('refuses a near-miss as a member', () => {
    expect(isToolStatus('completed')).toBe(false);
    expect(isToolStatus('awaiting_approval')).toBe(false);
    expect(isToolStatus('succeeded')).toBe(true);
  });
});
