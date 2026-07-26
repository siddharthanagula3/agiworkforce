import { describe, expect, it } from 'vitest';

import { buildCapabilityPreamble, extractToolNames } from './capability-preamble';

describe('capability preamble', () => {
  it('extracts function and provider-native tools without duplicates', () => {
    expect(
      extractToolNames([
        { type: 'function', function: { name: 'execute_code' } },
        { type: 'web_search_20250305', name: 'web_search' },
        { type: 'function', function: { name: 'execute_code' } },
        null,
      ]),
    ).toEqual(['execute_code', 'web_search']);
  });

  it('tells the model that automatic search and downloadable deliverables are available', () => {
    const preamble = buildCapabilityPreamble({
      now: new Date('2026-07-25T12:00:00.000Z'),
      tools: [
        { type: 'function', function: { name: 'web_search' } },
        { type: 'function', function: { name: 'execute_code' } },
        { type: 'function', function: { name: 'write_file' } },
      ],
    });

    expect(preamble).toContain('The current UTC date and time is 2026-07-25T12:00:00.000Z');
    expect(preamble).toContain('Web search is already enabled.');
    expect(preamble).toContain('create the actual file');
    expect(preamble).toContain('attached as downloads');
    expect(preamble).toContain('Artifacts panel');
    expect(preamble).toContain('Do not claim that you cannot attach files');
  });

  it('does not present the UTC calendar date as the user’s local date', () => {
    const preamble = buildCapabilityPreamble({
      // Still July 25 in America/Chicago even though UTC has crossed midnight.
      now: new Date('2026-07-26T02:19:00.000Z'),
      timeZone: 'America/Chicago',
      tools: [{ type: 'function', function: { name: 'web_search' } }],
    });

    expect(preamble).toContain('2026-07-26T02:19:00.000Z');
    expect(preamble).toContain('2026-07-25 21:19:00 (America/Chicago)');
    expect(preamble).toContain('Use that local calendar date for "today"');
    expect(preamble).toContain("derive that place's local calendar date and time");
    expect(preamble).toContain('never reuse the UTC calendar date as though it were local');
    expect(preamble).not.toContain("Today's date is 2026-07-26");
  });

  it('ignores an invalid browser time zone', () => {
    const preamble = buildCapabilityPreamble({
      now: new Date('2026-07-26T02:19:00.000Z'),
      timeZone: 'America/Not_Real',
      tools: [],
    });

    expect(preamble).toContain('2026-07-26T02:19:00.000Z');
    expect(preamble).not.toContain('The user’s browser reports');
  });

  it('does not promise search, files, or a sandbox when the request has no tools', () => {
    const preamble = buildCapabilityPreamble({
      now: new Date('2026-07-25T12:00:00.000Z'),
      tools: [],
    });

    expect(preamble).toContain('No tools are available on this turn');
    expect(preamble).not.toContain('Web search is already enabled.');
    expect(preamble).not.toContain('attached as downloads');
  });

  it('does not promise file attachment for search-only turns', () => {
    const preamble = buildCapabilityPreamble({
      tools: [{ type: 'function', function: { name: 'web_search' } }],
    });

    expect(preamble).toContain('Web search is already enabled.');
    expect(preamble).not.toContain('attached as downloads');
  });
});
