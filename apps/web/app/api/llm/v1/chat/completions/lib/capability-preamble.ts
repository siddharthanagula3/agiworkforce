import 'server-only';

import { isValidIanaTimeZone } from '@agiworkforce/types';
import { SYSTEM_PROMPT_CACHE_BOUNDARY } from '@agiworkforce/provider-protocol';

import {
  CHAT_SYSTEM_PROMPT_ID,
  chatSystemPromptSection,
  chatSystemPromptSections,
  type ChatSystemPromptSections,
} from '@/lib/prompts/chat-system-prompt';
import { resolvePrompt, type ResolvePromptOptions } from '@/lib/prompts/prompt-registry';

const TIME_CONTEXT_GRANULARITY_MS = 60_000;

const TOOL_SECTION_PREFIX = 'tool.';

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
  /**
   * Where this turn's attachments sit in the managed sandbox. Only the managed
   * `execute_code` tool runs in that sandbox, so a provider's own hosted
   * interpreter must never be told these paths: its container has never seen
   * the files.
   */
  attachmentSandboxPaths?: readonly string[];
  /** Selects the prompt version; absent, the manifest pin serves. */
  promptSelection?: ResolvePromptOptions;
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

/**
 * The chat system prompt this turn serves, resolved through the manifest so the
 * version is stamped rather than implied by whatever the builder holds.
 */
export function resolveChatSystemPrompt(options: ResolvePromptOptions = {}): {
  version: number;
  stamp: string;
  sections: ChatSystemPromptSections;
} {
  const resolved = resolvePrompt(CHAT_SYSTEM_PROMPT_ID, options);
  return {
    version: resolved.version,
    stamp: resolved.stamp,
    sections: chatSystemPromptSections(resolved.version),
  };
}

export function capabilityPreambleStamp(options: ResolvePromptOptions = {}): string {
  return resolvePrompt(CHAT_SYSTEM_PROMPT_ID, options).stamp;
}

function describeTool(sections: ChatSystemPromptSections, name: string): string {
  const description = chatSystemPromptSection(sections, `${TOOL_SECTION_PREFIX}${name}`);
  return description ? `- ${name}, ${description}` : `- ${name}`;
}

export function buildCapabilityPreamble(input: CapabilityPreambleInput): string | null {
  const { sections } = resolveChatSystemPrompt(input.promptSelection ?? {});
  const section = (key: string, values?: Readonly<Record<string, string>>) =>
    chatSystemPromptSection(sections, key, values);

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
  const stagedAttachmentPaths =
    !input.codeExecutionUnavailable && toolNames.includes('execute_code')
      ? (input.attachmentSandboxPaths ?? [])
      : [];

  const timeContext =
    section('time_utc', { utc: currentUtcTimestamp }) +
    (browserLocalInstant
      ? section('time_local', {
          timeZone: input.timeZone ?? '',
          localInstant: browserLocalInstant,
        })
      : '') +
    section('time_rules');

  const blocks: string[] = [section('identity'), section('instruction_precedence')];

  if (toolNames.length > 0) {
    blocks.push(
      [section('tools_heading'), ...toolNames.map((name) => describeTool(sections, name))].join(
        '\n',
      ),
      section('tools_reality'),
    );

    if (hasSearch) blocks.push(section('search'));
    if (hasSearch || hasFetch) blocks.push(section('citations'));
    if (hasCodeExecution) blocks.push(section('code_execution'));

    if (stagedAttachmentPaths.length > 0) {
      blocks.push(
        [
          section('staged_attachments_heading'),
          stagedAttachmentPaths.map((path) => `- ${path}`).join('\n'),
          section('staged_attachments_rules'),
        ].join('\n'),
      );
    }

    if (hasFileCreation) blocks.push(section('file_creation'));
  } else {
    blocks.push(section('no_tools'));
  }

  if (input.codeExecutionUnavailable) blocks.push(section('code_execution_unavailable'));
  if (input.researchUnavailable) blocks.push(section('research_unavailable'));

  const body = blocks.filter((block) => block.length > 0).join('\n\n');
  return `${body}${SYSTEM_PROMPT_CACHE_BOUNDARY}${timeContext}`;
}
