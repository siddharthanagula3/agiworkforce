import type { AgentEventToolCategory } from '@agiworkforce/types/protocol';

export type InlineToolKind =
  | 'auto'
  | 'bash'
  | 'read'
  | 'write'
  | 'edit'
  | 'web-search'
  | 'web-fetch'
  | 'fs-list'
  | 'image-gen'
  | 'browser'
  | 'mcp-custom'
  | 'skill'
  | 'thinking'
  | 'done'
  | 'unknown';

export function categoryToKind(category: AgentEventToolCategory): InlineToolKind {
  switch (category) {
    case 'web-search':
      return 'web-search';
    case 'web-fetch':
      return 'web-fetch';
    case 'shell':
    case 'code-execution':
      return 'bash';
    case 'filesystem':
      return 'fs-list';
    case 'computer-use':
      return 'browser';
    case 'connector':
    case 'mcp':
      return 'mcp-custom';
    case 'artifact':
      return 'write';
    case 'skill':
      return 'skill';
    case 'memory':
    case 'other':
      return 'unknown';
  }
}

export const SCREEN_STEP_ACTIONS: Readonly<
  Record<string, (input: Record<string, unknown>) => string>
> = {
  device_screenshot: (input) =>
    typeof input['display'] === 'number'
      ? `Looked at display ${String(input['display'])}`
      : 'Looked at the screen',
  device_zoom: () => 'Zoomed in on part of the screen',
  device_move: (input) => `Moved the pointer to ${point(input)}`,
  device_click: (input) => {
    const button = typeof input['button'] === 'string' ? String(input['button']) : 'left';
    const count = typeof input['count'] === 'number' ? input['count'] : 1;
    const verb = count >= 3 ? 'Triple-clicked' : count === 2 ? 'Double-clicked' : 'Clicked';
    return `${verb} ${button === 'left' ? '' : `${button} button `}at ${point(input)}`.replace(
      /\s+/g,
      ' ',
    );
  },
  device_drag: (input) =>
    `Dragged from ${point(input)} to ${String(input['toX'])}, ${String(input['toY'])}`,
  device_scroll: (input) => `Scrolled at ${point(input)}`,
  device_type: (input) =>
    typeof input['text'] === 'string'
      ? `Typed \u201c${truncateAction(input['text'])}\u201d`
      : 'Typed',
  device_key: (input) =>
    typeof input['key'] === 'string' ? `Pressed ${String(input['key'])}` : 'Pressed a key',
  device_wait: (input) =>
    typeof input['ms'] === 'number' ? `Waited ${String(input['ms'])}ms` : 'Waited',
  device_open_app: (input) =>
    typeof input['application'] === 'string'
      ? `Opened ${String(input['application'])}`
      : 'Opened an app',
};

const MAX_TYPED_ACTION_CHARS = 60;

function truncateAction(value: string): string {
  return value.length <= MAX_TYPED_ACTION_CHARS
    ? value
    : `${value.slice(0, MAX_TYPED_ACTION_CHARS)}\u2026`;
}

function point(input: Record<string, unknown>): string {
  return `${String(input['x'])}, ${String(input['y'])}`;
}
