import 'server-only';

import { isValidIanaTimeZone } from '@agiworkforce/types';
import { SYSTEM_PROMPT_CACHE_BOUNDARY } from '@agiworkforce/provider-protocol';

const TIME_CONTEXT_GRANULARITY_MS = 60_000;

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
  code_execution: 'run code in a hosted sandbox and read back its real output',
  code_interpreter: 'run code in a hosted sandbox and read back its real output',
};

const CODE_EXECUTION_TOOL_NAMES = ['execute_code', 'code_execution', 'code_interpreter'];

function providerNativeCodeExecutionName(record: Record<string, unknown>): string | null {
  const type = record['type'];
  if (typeof type === 'string') {
    if (type === 'code_interpreter' || type.startsWith('code_interpreter_')) {
      return 'code_interpreter';
    }
    if (type === 'code_execution' || type.startsWith('code_execution_')) return 'code_execution';
  }
  const googleTool = record['code_execution'];
  if (googleTool && typeof googleTool === 'object') return 'code_execution';
  return null;
}

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
      continue;
    }
    const nativeCodeExecution = providerNativeCodeExecutionName(record);
    if (nativeCodeExecution) {
      names.push(nativeCodeExecution);
    }
  }
  return [...new Set(names)];
}

export interface CapabilityPreambleInput {
  tools: unknown[] | undefined;
  timeZone?: string;
  now?: Date;
  /**
   * The user turned "Run code" on for this turn but no execution tool could be
   * attached for the routed model. Without this the turn runs identically to one
   * where the toggle was never touched, so the drop has to be disclosed.
   */
  codeExecutionUnavailable?: boolean;
  /**
   * The user turned Deep Research on, but the model this turn routed to cannot
   * do it, so the research loop never ran.
   *
   * Disclosed for the same reason `codeExecutionUnavailable` is: the toggle
   * stays lit in the UI, and without this the user receives an ordinary
   * single-turn answer that looks like a researched one. Silence here is the
   * difference between a degraded feature and a dishonest one.
   */
  researchUnavailable?: boolean;
}

function roundDownToGranularity(instant: Date, granularityMs: number): Date {
  return new Date(Math.floor(instant.getTime() / granularityMs) * granularityMs);
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
  const now = roundDownToGranularity(input.now ?? new Date(), TIME_CONTEXT_GRANULARITY_MS);
  const currentUtcTimestamp = now.toISOString();
  const browserLocalInstant = formatLocalInstant(now, input.timeZone);
  const toolNames = extractToolNames(input.tools);
  const hasSearch = toolNames.includes('web_search');
  const hasFetch = toolNames.includes('web_fetch') || toolNames.includes('url_fetch');
  const hasFileCreation = toolNames.some((name) =>
    ['execute_code', 'write_file', 'create_folder', 'create_office_file'].includes(name),
  );
  const hasCodeExecution =
    !input.codeExecutionUnavailable &&
    toolNames.some((name) => CODE_EXECUTION_TOOL_NAMES.includes(name));

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

  const sections: string[] = ['You are AGI Workforce, an AI assistant.'];

  if (toolNames.length > 0) {
    const described = toolNames.map((name) => {
      const description = TOOL_DESCRIPTIONS[name];
      return description ? `- ${name}, ${description}` : `- ${name}`;
    });

    sections.push(
      ['Tools available to you on this turn:', ...described].join('\n'),
      'These tools are real and available right now. If the user asks for something ' +
        'one of them covers, call it rather than describing what you would do. Never tell ' +
        'the user you lack web access, a sandbox, a file system, or the ability to run code ' +
        'when the corresponding tool is listed above. Do not claim a capability that is not ' +
        'listed, if you cannot do something, say so plainly and say why.',
    );

    if (hasSearch) {
      sections.push(
        'Web search is already enabled. For current, changing, niche, or uncertain facts, ' +
          'search before answering and cite the sources you used. The user does not need to ' +
          'ask you to enable search or select a search mode first.',
      );
    }

    if (hasSearch || hasFetch) {
      sections.push(
        'When a claim in your answer comes from a search result or a page you fetched, mark it ' +
          'with a bracketed number, e.g. [1], in the order those sources first appear, or write ' +
          'the claim as a markdown link straight to that source URL. The app turns either form ' +
          'into a clickable citation for the exact source. Reuse the same number for a source ' +
          'cited again. Do this for every source you used, including a single fetched page, not ' +
          'only when there are several. Do not end the answer with a Sources, References or ' +
          'bibliography section: the app lists every cited source under the answer.',
      );
    }

    if (hasCodeExecution) {
      sections.push(
        'Code execution is already enabled. When the user asks you to run, compute, test, or ' +
          'verify something, run it with that tool and report the output you actually got. ' +
          'Never tell the user you cannot execute code on this turn, and never present code ' +
          'you did not run as though you had run it.',
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

  if (input.codeExecutionUnavailable) {
    sections.push(
      'The user turned "Run code" on for this turn, but no code-execution tool could be ' +
        'attached for the model handling it, so you cannot actually run anything. Tell the ' +
        'user that plainly before you answer, and name the limit: code execution is not ' +
        'available for the model this turn was routed to. Write code if it helps, but ' +
        'present it as code you have not run, never report output, results, or timings as ' +
        'though you had executed it.',
    );
  }

  if (input.researchUnavailable) {
    sections.push(
      'The user turned "Deep Research" on for this turn, but the model handling it cannot ' +
        'run the research loop, so no multi-step search, source gathering, or citation pass ' +
        'happened. Tell the user that plainly before you answer, and name the limit: Deep ' +
        'Research is not available for the model this turn was routed to. Answer from your ' +
        'own knowledge if you can, and never present the result as researched, sourced, or ' +
        'cited when it was not.',
    );
  }

  return `${sections.join('\n\n')}${SYSTEM_PROMPT_CACHE_BOUNDARY}${timeContext}`;
}
