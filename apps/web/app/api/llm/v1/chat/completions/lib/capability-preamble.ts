import 'server-only';

/**
 * Base system preamble: identity, current date, and a truthful inventory of the
 * tools actually attached to THIS request.
 *
 * AUDIT-FIX SYS-1 / SYS-2 / SYS-3 / SYS-5 / SYS-6.
 *
 * Before this module the managed-cloud chat path assembled no base system
 * prompt at all. Every `role: 'system'` injection on the route was conditional
 * (research mode, AGI Work mode, skill catalog, project context, account
 * memory), so an ordinary chat turn reached the provider as a bare user message
 * with no identity, no capability statement, no tool inventory and no date.
 *
 * The consequences were all user-reported: the model answered as its underlying
 * vendor persona, had no trigger to reach for web search, dated itself by its
 * training data, and — most damagingly — denied having a sandbox or file system
 * while `execute_code` and `write_file` sat unmentioned in its tool array. Tools
 * were attached to the request and never described to the model, so it had to
 * infer its entire capability surface from raw JSON schemas.
 *
 * The inventory here is DERIVED from the resolved tool array rather than
 * hardcoded, so it cannot drift from what the request actually carries. A tool
 * that is gated off (by tier, by deployment flag, by provider support) simply
 * does not appear, and the model is told plainly that it has no tools rather
 * than being left to guess.
 */

/** Human-readable line for each platform tool we know about. */
const TOOL_DESCRIPTIONS: Record<string, string> = {
  web_search: 'search the live web and cite what you find',
  web_fetch: 'fetch a specific URL and read its contents',
  url_fetch: 'fetch a specific URL and read its contents',
  execute_code:
    'run code in a sandboxed Linux environment with a real file system and a network connection',
  write_file: 'write a file into that sandbox',
  create_folder: 'create a folder in that sandbox',
  create_office_file: 'produce .docx, .xlsx and .pptx files',
  skill: 'load a skill: a packaged set of instructions for a specific kind of task',
};

/**
 * Pull tool names out of a resolved tool array.
 *
 * Two shapes coexist on this route: OpenAI-style function tools
 * (`{ type: 'function', function: { name } }`) used by every platform-executed
 * tool, and provider-native server tools (`{ type: 'web_search_20250305',
 * name: 'web_search' }`) used by Anthropic. Unknown shapes are skipped rather
 * than guessed at — an omission understates our capabilities, which is the safe
 * direction to fail.
 */
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
    if (typeof name === 'string' && name) names.push(name);
  }
  return [...new Set(names)];
}

export interface CapabilityPreambleInput {
  /** The fully-resolved tool array for this request — after every gate. */
  tools: unknown[] | undefined;
  /** Injected for determinism in tests. */
  now?: Date;
}

/**
 * Build the preamble. Returns null when there is nothing worth saying, so the
 * caller never injects an empty system message.
 */
export function buildCapabilityPreamble(input: CapabilityPreambleInput): string | null {
  const now = input.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const toolNames = extractToolNames(input.tools);

  const sections: string[] = [
    'You are AGI Workforce, an AI assistant.',
    `Today's date is ${today}. Your training data has a cutoff, so treat anything ` +
      'time-sensitive as potentially stale and verify it before stating it as current.',
  ];

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
  } else {
    sections.push(
      'No tools are available on this turn: you cannot browse the web, run code, or read ' +
        'or write files. If the user asks for one of those, say so plainly rather than ' +
        'pretending to have done it, and answer from your own knowledge where you can.',
    );
  }

  return sections.join('\n\n');
}
