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
    case 'discover_site_tools':
      return 'Discover tools supplied by this website.';
    case 'call_site_tool':
      return `Run website tool "${truncate(a['name'], 64)}" with arguments ${truncate(JSON.stringify(a['arguments'] ?? {}), 500)}.`;
    case 'click': {
      const action =
        a['button'] === 'right'
          ? 'Right-click'
          : a['button'] === 'middle'
            ? 'Middle-click'
            : a['clickCount'] === 2
              ? 'Double-click'
              : 'Click';
      const selector = a['selector'];
      if (typeof selector === 'string' && selector.length > 0) {
        return `${action} "${truncate(selector, 60)}" on this page.`;
      }
      if (a['x'] !== undefined && a['y'] !== undefined) {
        return `${action} the page at position (${String(a['x'])}, ${String(a['y'])}).`;
      }
      return typeof a['index'] === 'number'
        ? `${action} element [${String(a['index'])}] on this page.`
        : `${action} an element on this page.`;
    }

    case 'hover':
      return typeof a['index'] === 'number'
        ? `Move the pointer over element [${String(a['index'])}].`
        : typeof a['selector'] === 'string'
          ? `Move the pointer over "${truncate(a['selector'], 60)}".`
          : `Move the pointer to (${String(a['x'])}, ${String(a['y'])}).`;

    case 'press_key': {
      const modifiers = Array.isArray(a['modifiers']) ? a['modifiers'].map(String) : [];
      const chord = [...modifiers, truncate(a['key'], 30)].join(' + ');
      return typeof a['index'] === 'number'
        ? `Press ${chord} in element [${String(a['index'])}].`
        : `Press ${chord} in the focused control.`;
    }

    case 'drag': {
      const start =
        typeof a['startIndex'] === 'number'
          ? `element [${String(a['startIndex'])}]`
          : `(${String(a['startX'])}, ${String(a['startY'])})`;
      const end =
        typeof a['endIndex'] === 'number'
          ? `element [${String(a['endIndex'])}]`
          : `(${String(a['endX'])}, ${String(a['endY'])})`;
      return `Drag from ${start} to ${end}.`;
    }

    case 'swipe':
      return `Swipe from (${String(a['startX'])}, ${String(a['startY'])}) to (${String(a['endX'])}, ${String(a['endY'])}).`;

    case 'type': {
      const text = truncate(a['text'], 60);
      const target = a['selector'];
      const where =
        typeof target === 'string' && target.length > 0 ? ` into "${truncate(target, 40)}"` : '';
      return text.length > 0 ? `Type "${text}"${where}.` : `Type text${where}.`;
    }

    case 'resize_window':
      return `Resize the current task’s browser window to ${truncate(a['width'], 20)} × ${truncate(a['height'], 20)} pixels, including its frame.`;
    case 'list_tabs':
      return 'Read the tabs owned by this task.';
    case 'open_tab':
      return `Open "${truncate(a['url'], 100)}" in a new task tab and switch to it.`;
    case 'switch_tab':
      return `Switch to task tab ${truncate(a['tabId'], 20)}${typeof a['url'] === 'string' ? ` at "${truncate(a['url'], 100)}"` : ''}.`;
    case 'close_tab':
      return `Close task-created tab ${truncate(a['tabId'], 20)}${typeof a['url'] === 'string' ? ` at "${truncate(a['url'], 100)}"` : ''} and lose its unsaved changes${typeof a['returnToTabId'] === 'number' ? `; return to task tab ${String(a['returnToTabId'])}${typeof a['returnUrl'] === 'string' ? ` at "${truncate(a['returnUrl'], 100)}"` : ''}` : ''}.`;
    case 'go_back':
    case 'go_forward':
      return `Go ${toolName === 'go_back' ? 'back' : 'forward'} in this task tab${typeof a['url'] === 'string' ? ` to "${truncate(a['url'], 100)}"` : ''}.`;
    case 'reload':
      return 'Reload this task tab, which may discard unsaved changes or resend a form.';
    case 'navigate': {
      const host = hostOf(a['url']);
      return host
        ? `Open ${host} in this tab, leaving the current page.`
        : `Open ${truncate(a['url'], 70)} in this tab.`;
    }

    case 'scroll': {
      const to = a['toSelector'];
      if (typeof to === 'string' && to.length > 0) return `Scroll to "${truncate(to, 60)}".`;
      if (typeof a['index'] === 'number') return `Scroll within element [${String(a['index'])}].`;
      if (typeof a['dx'] === 'number' && a['dx'] !== 0) return 'Scroll this page horizontally.';
      return 'Scroll this page.';
    }

    case 'read_dom':
      return 'Read the contents of this page, including any text currently on screen.';

    case 'find':
      return `Search this page for "${truncate(a['description'], 60)}".`;

    case 'screenshot':
      return 'Take a screenshot of this page.';

    case 'download_file': {
      const host = hostOf(a['url']);
      const where = host ? ` from ${host}` : '';
      return `Download a file${where} to your computer. Chrome saves it to your downloads folder.`;
    }

    case 'upload_file':
      return typeof a['index'] === 'number'
        ? `Choose files for element [${String(a['index'])}]. AGI Cloud inspects approved files before sending their contents to this site.`
        : 'Choose files for this page. AGI Cloud inspects approved files before sending their contents to this site.';

    case 'select_option': {
      const mode = typeof a['label'] === 'string' ? 'option' : 'value';
      const choice = typeof a['label'] === 'string' ? a['label'] : a['value'];
      return `Choose ${mode} "${truncate(choice, 60)}" in dropdown [${String(a['index'])}].`;
    }

    case 'read_console':
      return 'Read the console messages and errors this page has produced.';

    case 'read_network':
      return 'Read the list of requests this page has made, their status and timing. No bodies or headers are read.';

    case 'ask_user_to_take_over':
      return `Hand you the page: ${truncate(a['reason'], 80) || 'AGI needs you to use it'}.`;

    default: {
      const name = truncate(toolName, 40) || 'an action';
      return `Run "${name}" on this page. This action is not one AGI can describe in detail, approve it only if you expect it.`;
    }
  }
}
