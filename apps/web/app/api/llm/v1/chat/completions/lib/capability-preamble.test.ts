import { describe, expect, it } from 'vitest';

import { SYSTEM_PROMPT_CACHE_BOUNDARY } from '@agiworkforce/provider-protocol';

import { createManagedOfficeFileToolDefinition } from '@/lib/services/managed-office-file-service';

import { buildCapabilityPreamble, extractToolNames } from './capability-preamble';

describe('capability preamble', () => {
  it('extracts function and provider-native tools without duplicates', () => {
    expect(
      extractToolNames([
        { type: 'function', function: { name: 'execute_code' } },
        { type: 'web_search_20250305', name: 'web_search' },
        { type: 'web_search' },
        { google_search: {} },
        { type: 'function', function: { name: 'execute_code' } },
        null,
      ]),
    ).toEqual(['execute_code', 'web_search']);
  });

  it.each([
    ['OpenAI Responses', { type: 'web_search' }],
    ['Google grounding', { google_search: {} }],
  ])('describes automatic search for %s hosted-tool requests', (_provider, tool) => {
    const preamble = buildCapabilityPreamble({ tools: [tool] });

    expect(preamble).toContain('- web_search, search the live web and cite what you find');
    expect(preamble).toContain('Web search is already enabled.');
    expect(preamble).not.toContain('No tools are available on this turn');
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

  it('describes create_office_file with exactly the formats its schema accepts', () => {
    const definition = createManagedOfficeFileToolDefinition();
    const formats = (
      definition.function.parameters.properties.format as { enum: readonly string[] }
    ).enum;

    const preamble = buildCapabilityPreamble({
      tools: [{ type: 'function', function: { name: 'create_office_file' } }],
    });
    const officeLine = (preamble ?? '')
      .split('\n')
      .find((line) => line.startsWith('- create_office_file'));

    expect(officeLine).toBeDefined();
    for (const format of formats) {
      expect(officeLine).toContain(`.${format}`);
    }
    for (const format of ['docx', 'xlsx', 'pptx']) {
      if (formats.includes(format)) continue;
      expect(officeLine).not.toContain(`.${format}`);
    }
  });

  it('discloses a "Run code" turn whose execution tool was dropped, even when other tools ran', () => {
    const preamble = buildCapabilityPreamble({
      tools: [{ type: 'function', function: { name: 'web_search' } }],
      codeExecutionUnavailable: true,
    });

    expect(preamble).toContain('"Run code"');
    expect(preamble).toContain('code execution is not available');
    expect(preamble).toContain('never report output');
  });

  it.each([
    ['Anthropic', { type: 'code_execution_20260120', name: 'code_execution' }, 'code_execution'],
    ['Google', { code_execution: {} }, 'code_execution'],
    ['OpenAI', { type: 'code_interpreter', container: { type: 'auto' } }, 'code_interpreter'],
  ])(
    'never tells the model it cannot run code when %s attached a hosted execution tool',
    (_provider, tool, expectedName) => {
      const preamble = buildCapabilityPreamble({ tools: [tool] });

      expect(extractToolNames([tool])).toEqual([expectedName]);
      expect(preamble).not.toContain('No tools are available on this turn');
      expect(preamble).toContain(`- ${expectedName}, run code in a hosted sandbox`);
      expect(preamble).toContain('Code execution is already enabled.');
    },
  );

  it('does not claim code execution on a turn that only got search', () => {
    const preamble = buildCapabilityPreamble({
      tools: [{ type: 'function', function: { name: 'web_search' } }],
    });

    expect(preamble).not.toContain('Code execution is already enabled.');
  });

  it('stays silent about code execution when the turn actually got the tool', () => {
    const preamble = buildCapabilityPreamble({
      tools: [{ type: 'function', function: { name: 'execute_code' } }],
      codeExecutionUnavailable: false,
    });

    expect(preamble).not.toContain('"Run code"');
  });

  describe('cache prefix stability', () => {
    it('puts the ever-changing timestamp after the cache boundary, not before it', () => {
      const preamble = buildCapabilityPreamble({
        now: new Date('2026-07-25T12:03:00.000Z'),
        tools: [{ type: 'function', function: { name: 'web_search' } }],
      });

      expect(preamble).toContain(SYSTEM_PROMPT_CACHE_BOUNDARY);
      const [before, after] = String(preamble).split(SYSTEM_PROMPT_CACHE_BOUNDARY);
      expect(before).not.toContain('The current UTC date and time is');
      expect(after).toContain('The current UTC date and time is');
    });

    it('rounds the timestamp down to the coarse granularity', () => {
      const preamble = buildCapabilityPreamble({
        now: new Date('2026-07-25T12:03:47.812Z'),
        tools: [],
      });

      expect(preamble).toContain('The current UTC date and time is 2026-07-25T12:03:00.000Z');
    });

    it('keeps the portion before the boundary byte-identical across two turns of one conversation', () => {
      const turnOne = buildCapabilityPreamble({
        now: new Date('2026-07-25T12:03:00.000Z'),
        tools: [{ type: 'function', function: { name: 'web_search' } }],
      });
      const turnTwo = buildCapabilityPreamble({
        now: new Date('2026-07-25T12:41:00.000Z'),
        tools: [{ type: 'function', function: { name: 'web_search' } }],
      });

      const stableOne = String(turnOne).split(SYSTEM_PROMPT_CACHE_BOUNDARY)[0];
      const stableTwo = String(turnTwo).split(SYSTEM_PROMPT_CACHE_BOUNDARY)[0];
      expect(stableOne).toBe(stableTwo);
      expect(turnOne).not.toBe(turnTwo);
    });
  });
});
