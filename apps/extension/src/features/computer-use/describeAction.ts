
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
      const name = truncate(toolName, 40) || 'an action';
      return `Run "${name}" on this page. This action is not one AGI can describe in detail — approve it only if you expect it.`;
    }
  }
}
