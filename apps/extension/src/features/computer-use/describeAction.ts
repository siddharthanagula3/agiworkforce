/**
 * describeAction.ts — plain-language descriptions of computer-use actions.
 *
 * The ask-before-acting gate previously described the pending action by
 * stringifying the tool call:
 *
 *     `${toolName}(${Object.entries(args).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')})`
 *
 * which produced approval prompts like `click(selector="#submit-order", index=3)`.
 * That is a developer's representation of a function call, shown to a user who is
 * being asked to authorise an agent to act on their browser. Someone who cannot
 * read a CSS selector cannot give informed consent, and "Allow" on a prompt you
 * do not understand is not a decision — it is a reflex.
 *
 * These strings are written as the SENTENCE THE USER IS AGREEING TO, in the
 * present tense, naming the concrete target where one exists. They are
 * deliberately conservative: when a tool or shape is unrecognised the description
 * says so plainly rather than inventing a friendly gloss over an unknown action.
 */

/** Trim a target string so a long selector or URL cannot blow out the card. */
function truncate(value: unknown, max: number): string {
  const text = typeof value === 'string' ? value : String(value ?? '');
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed;
}

function hostOf(url: unknown): string | null {
  if (typeof url !== 'string' || url.length === 0) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/**
 * A one-sentence description of what the agent is about to do.
 *
 * `toolName` is the tool the agent selected; `args` is its argument object.
 */
export function describeComputerUseAction(
  toolName: string,
  args: Record<string, unknown> | undefined,
): string {
  const a = args ?? {};

  switch (toolName) {
    case 'click': {
      const selector = a['selector'];
      if (typeof selector === 'string' && selector.length > 0) {
        return `Click "${truncate(selector, 60)}" on this page.`;
      }
      if (a['x'] !== undefined && a['y'] !== undefined) {
        return `Click the page at position (${String(a['x'])}, ${String(a['y'])}).`;
      }
      return 'Click an element on this page.';
    }

    case 'type': {
      const text = truncate(a['text'], 60);
      const target = a['selector'];
      const where =
        typeof target === 'string' && target.length > 0 ? ` into "${truncate(target, 40)}"` : '';
      // Quote the text: what gets typed is the whole point of the approval.
      return text.length > 0 ? `Type "${text}"${where}.` : `Type text${where}.`;
    }

    case 'navigate': {
      const host = hostOf(a['url']);
      return host
        ? `Open ${host} in this tab, leaving the current page.`
        : `Open ${truncate(a['url'], 70)} in this tab.`;
    }

    case 'scroll': {
      const to = a['toSelector'];
      if (typeof to === 'string' && to.length > 0) return `Scroll to "${truncate(to, 60)}".`;
      return 'Scroll this page.';
    }

    case 'read_dom':
      return 'Read the contents of this page, including any text currently on screen.';

    case 'find':
      return `Search this page for "${truncate(a['description'], 60)}".`;

    case 'screenshot':
      return 'Take a screenshot of this page.';

    default: {
      // Unknown tool: say that plainly. A generic reassurance here would be the
      // one place a wrong description is most costly.
      const name = truncate(toolName, 40) || 'an action';
      return `Run "${name}" on this page. This action is not one AGI can describe in detail — approve it only if you expect it.`;
    }
  }
}
