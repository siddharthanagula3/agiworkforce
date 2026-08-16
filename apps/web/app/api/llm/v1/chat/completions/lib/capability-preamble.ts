import 'server-only';

import { isValidIanaTimeZone } from '@agiworkforce/types';

const TOOL_DESCRIPTIONS: Record<string, string> = {
  web_search: 'search the live web and cite what you find',
  search_maps: 'open a real map search card for places or nearby categories',
  web_fetch: 'fetch a specific URL and read its contents',
  url_fetch: 'fetch a specific URL and read its contents',
  execute_code:
    'run code in a sandboxed Linux environment with a real file system and a network connection',
  write_file: 'write a file into that sandbox',
  create_folder: 'create a folder in that sandbox',
  create_office_file: 'produce .docx and .pptx files',
  skill: 'load a skill: a packaged set of instructions for a specific kind of task',
};

export function extractToolNames(tools: unknown[] | undefined): string[] {
  if (!Array.isArray(tools)) return [];
  const names: string[] = [];
  for (const tool of tools) {
    if (!tool || typeof tool !== 'object') continue;
    const record = tool as Record<string, unknown>;

    const fn = record['function'];
    if (fn && typeof fn === 'object') {
      const name = (fn as Record<string, unknown>)['name'];
      if (typeof name === 'string' && name) {
        names.push(name);
        continue;
      }
    }

    const name = record['name'];
    if (typeof name === 'string' && name) {
      names.push(name);
      continue;
    }

    if (record['type'] === 'web_search' || record['type'] === 'web_search_2025_08_26') {
      names.push('web_search');
      continue;
    }
    if (record['google_search'] && typeof record['google_search'] === 'object') {
      names.push('web_search');
    }
  }
  return [...new Set(names)];
}

export interface CapabilityPreambleInput {
  tools: unknown[] | undefined;
  timeZone?: string;
  now?: Date;
}

function formatLocalInstant(now: Date, timeZone: string | undefined): string | null {
  if (!timeZone || !isValidIanaTimeZone(timeZone)) return null;

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  const year = read('year');
  const month = read('month');
  const day = read('day');
  const hour = read('hour');
  const minute = read('minute');
  const second = read('second');
  if (!year || !month || !day || !hour || !minute || !second) return null;
  return `${year}-${month}-${day} ${hour}:${minute}:${second} (${timeZone})`;
}

export function buildCapabilityPreamble(input: CapabilityPreambleInput): string | null {
  const now = input.now ?? new Date();
  const currentUtcTimestamp = now.toISOString();
  const browserLocalInstant = formatLocalInstant(now, input.timeZone);
  const toolNames = extractToolNames(input.tools);
  const hasSearch = toolNames.includes('web_search');
  const hasFileCreation = toolNames.some((name) =>
    ['execute_code', 'write_file', 'create_folder', 'create_office_file'].includes(name),
  );

  const timeContext =
    `The current UTC date and time is ${currentUtcTimestamp}. ` +
    (browserLocalInstant
      ? `The user's browser reports ${input.timeZone}; at this same instant its local ` +
        `date and time is ${browserLocalInstant}. Use that local calendar date for ` +
        '"today" unless the user specifies a different place or time zone. '
      : '') +
    `When the user asks for ` +
    '"today", a date, or a time in a named place or time zone, derive that place\'s ' +
    'local calendar date and time from this instant; never reuse the UTC calendar date ' +
    'as though it were local. Your training data has a cutoff, so treat anything ' +
    'time-sensitive as potentially stale and verify it before stating it as current.';

  const sections: string[] = ['You are AGI Workforce, an AI assistant.', timeContext];

  if (toolNames.length > 0) {
    const described = toolNames.map((name) => {
      const description = TOOL_DESCRIPTIONS[name];
      return description ? `- ${name} — ${description}` : `- ${name}`;
    });

    sections.push(
      ['Tools available to you on this turn:', ...described].join('\n'),
      'These tools are real and available right now. If the user asks for something ' +
        'one of them covers, call it rather than describing what you would do. Never tell ' +
        'the user you lack web access, a sandbox, a file system, or the ability to run code ' +
        'when the corresponding tool is listed above. Do not claim a capability that is not ' +
        'listed — if you cannot do something, say so plainly and say why.',
    );

    if (hasSearch) {
      sections.push(
        'Web search is already enabled. For current, changing, niche, or uncertain facts, ' +
          'search before answering and cite the sources you used. The user does not need to ' +
          'ask you to enable search or select a search mode first.',
      );
    }

    if (hasFileCreation) {
      sections.push(
        'When the user asks for a downloadable file or a finished deliverable, create the ' +
          'actual file with the available sandbox/file tools instead of pasting a mockup or ' +
          'only explaining how to make it. Files created or changed through these tools are ' +
          'collected after the turn and attached as downloads; supported visual and document ' +
          'formats also appear in the Artifacts panel. Briefly name the completed files in ' +
          'your final answer. Do not claim that you cannot attach files when these tools are listed.',
      );
    }
  } else {
    sections.push(
      'No tools are available on this turn: you cannot browse the web, run code, or read ' +
        'or write files. If the user asks for one of those, say so plainly rather than ' +
        'pretending to have done it, and answer from your own knowledge where you can.',
    );
  }

  return sections.join('\n\n');
}
