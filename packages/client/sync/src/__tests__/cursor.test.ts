import { describe, it, expect } from 'vitest';
import { bigintGreater, maxCursor, selectNextCursor } from '../cursor';

describe('bigintGreater', () => {
  it('compares by length first, then lexicographically', () => {
    expect(bigintGreater('10', '9')).toBe(true);
    expect(bigintGreater('9', '10')).toBe(false);
    expect(bigintGreater('99', '98')).toBe(true);
  });

  it('strips leading zeros before comparing', () => {
    expect(bigintGreater('007', '7')).toBe(false);
    expect(bigintGreater('0100', '099')).toBe(true);
  });

  it('treats equal values as not-greater', () => {
    expect(bigintGreater('42', '42')).toBe(false);
    expect(bigintGreater('0', '0')).toBe(false);
    expect(bigintGreater('000', '0')).toBe(false);
  });

  it('handles arbitrary precision beyond a 64-bit int', () => {
    expect(bigintGreater('18446744073709551615', '18446744073709551614')).toBe(true);
    expect(bigintGreater('1000000000000000000', '999999999999999999')).toBe(true);
  });
});

describe('maxCursor', () => {
  it('returns base when no versions are given', () => {
    expect(maxCursor('5')).toBe('5');
  });

  it('picks the max across multiple versions', () => {
    expect(maxCursor('1', '4', '2', '9', '3')).toBe('9');
  });

  it('ignores empty-string versions', () => {
    expect(maxCursor('5', '', '3')).toBe('5');
  });

  it('never returns a value smaller than base', () => {
    expect(maxCursor('9', '5')).toBe('9');
  });
});

describe('selectNextCursor', () => {
  it('advances to the response cursor when present', () => {
    expect(selectNextCursor('5', '9')).toBe('9');
  });

  it('keeps the current cursor on a null/undefined/empty response', () => {
    expect(selectNextCursor('5', null)).toBe('5');
    expect(selectNextCursor('5', undefined)).toBe('5');
    expect(selectNextCursor('5', '')).toBe('5');
  });

  it('never moves backwards', () => {
    expect(selectNextCursor('20', '10')).toBe('20');
  });

  it('trusts the server safe-frontier cursor rather than a per-row max', () => {
    // The server bounds the cursor to the slower-paginating table's frontier
    // even when a row inside the page carries a much higher server_version.
    // The client must persist the server's cursor, not recompute one.
    expect(selectNextCursor('0', '10')).toBe('10');
  });
});
