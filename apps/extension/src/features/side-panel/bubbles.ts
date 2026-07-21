/**
 * Side-panel message + tool-call + agent-activity render builders.
 *
 * Extracted verbatim from side_panel.ts (which runs chrome.* at import scope and
 * cannot be loaded in jsdom) so the message-rendering path is unit-testable.
 * Behaviour is unchanged. Only buildBubbleWithTools + buildToolCallEl are called
 * from side_panel.ts; the rest are internal to this cluster.
 */
import { type AgentActivityEntry, type AgentActivityState } from '@agiworkforce/client-runtime';
import {
  renderIcon,
  ChevronRight,
  Copy,
  Globe,
  Terminal,
  FilePen,
  FileText,
  Search,
  Folder,
  Plug,
  CircleCheck,
  CircleX,
  Clock,
  Loader2,
} from '../../assets/icons';
import { sanitizeHtml, renderMarkdown } from './markdown';
import { el, formatTime } from './dom';
import { shouldRenderTextBubble, type SidePanelChatMessage } from './chat-state';

type ChatMessage = SidePanelChatMessage;

function buildBubble(msg: ChatMessage): HTMLElement {
  const isUser = msg.role === 'user';
  const wrapper = el('div', { class: `sp-msg sp-msg-${msg.role}`, 'data-id': msg.id });

  const bubble = el('div', {
    class: `sp-bubble sp-bubble-${msg.role}${msg.error ? ' sp-bubble-error' : ''}${msg.streaming ? ' sp-cursor' : ''}`,
    id: `sp-bubble-${msg.id}`,
  });

  if (isUser) {
    bubble.textContent = msg.content;
  } else {
    bubble.innerHTML = sanitizeHtml(renderMarkdown(msg.content));
  }

  wrapper.appendChild(bubble);

  // Action row: timestamp + copy button (assistant only)
  const actionRow = el('div', { class: 'sp-bubble-actions' });
  const ts = el('span', { class: 'sp-timestamp' }, formatTime(msg.timestamp));
  actionRow.appendChild(ts);

  if (!isUser) {
    const copyBtn = el('button', {
      class: 'sp-copy-btn',
      title: 'Copy',
      'aria-label': 'Copy response',
    });
    copyBtn.appendChild(renderIcon(Copy, 11));
    copyBtn.addEventListener('click', () => {
      navigator.clipboard
        .writeText(msg.content)
        .then(() => {
          copyBtn.classList.add('copied');
          setTimeout(() => copyBtn.classList.remove('copied'), 1500);
        })
        .catch(() => {});
    });
    actionRow.appendChild(copyBtn);
  }

  wrapper.appendChild(actionRow);
  return wrapper;
}

/** Map tool name to its Lucide SVG string. */
function toolIcon(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('bash') || n.includes('shell') || n.includes('terminal') || n.includes('run'))
    return Terminal;
  if (n.includes('write') || n.includes('create')) return FilePen;
  if (n.includes('edit') || n.includes('patch') || n.includes('apply')) return FilePen;
  if (n.includes('read') || n.includes('view') || n.includes('file')) return FileText;
  if (n.includes('search') || n.includes('find')) return Search;
  if (n.includes('fetch') || n.includes('url') || n.includes('web')) return Globe;
  if (n.includes('list') || n.includes('ls') || n.includes('dir') || n.includes('folder'))
    return Folder;
  if (n.includes('mcp') || n.includes('plug') || n.includes('tool')) return Plug;
  if (n.includes('done') || n.includes('check') || n.includes('success')) return CircleCheck;
  if (n.includes('load') || n.includes('pending') || n.includes('running')) return Loader2;
  return Plug;
}

interface ToolCallBlock {
  name: string;
  summary: string;
  body: string;
  state: 'pending' | 'running' | 'success' | 'error';
}

/**
 * Parse tool-call fences from message content.
 * Format: [TOOL:name:state] summary\nbody\n[/TOOL]
 * Returns segments: plain text strings or ToolCallBlock objects.
 */
function parseToolCalls(content: string): Array<string | ToolCallBlock> {
  const segments: Array<string | ToolCallBlock> = [];
  // Regex: [TOOL:name:state] summary\nbody\n[/TOOL]
  const re = /\[TOOL:([^:\]]+):?(pending|running|success|error)?\]([\s\S]*?)\[\/TOOL\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) segments.push(content.slice(last, m.index));
    const name = m[1]!.trim();
    const state = (m[2] ?? 'success') as ToolCallBlock['state'];
    const inner = m[3] ?? '';
    const newline = inner.indexOf('\n');
    const summary = newline >= 0 ? inner.slice(0, newline).trim() : inner.trim();
    const body = newline >= 0 ? inner.slice(newline + 1).trim() : '';
    segments.push({ name, summary, body, state });
    last = m.index + m[0].length;
  }
  if (last < content.length) segments.push(content.slice(last));
  return segments;
}

export function buildToolCallEl(block: ToolCallBlock): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = `tool-call tool-call--${block.state}`;

  const bar = document.createElement('div');
  bar.className = 'tool-call__bar';
  bar.setAttribute('role', 'button');
  bar.setAttribute('aria-expanded', 'false');
  bar.setAttribute('tabindex', '0');

  const iconEl = renderIcon(
    block.state === 'pending' || block.state === 'running' ? Loader2 : toolIcon(block.name),
    14,
    'tool-call__icon',
  );
  bar.appendChild(iconEl);

  const label = document.createElement('span');
  label.className = 'tool-call__label';
  label.textContent = block.name;
  bar.appendChild(label);

  if (block.summary) {
    const summary = document.createElement('span');
    summary.className = 'tool-call__summary';
    summary.textContent = block.summary;
    bar.appendChild(summary);
  }

  const chevron = renderIcon(ChevronRight, 12, 'tool-call__chevron');
  bar.appendChild(chevron);

  const body = document.createElement('div');
  body.className = 'tool-call__body';
  body.textContent = block.body;

  const toggle = (): void => {
    const open = wrapper.classList.toggle('tool-call--open');
    bar.setAttribute('aria-expanded', String(open));
  };
  bar.addEventListener('click', toggle);
  bar.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggle();
    }
  });

  wrapper.appendChild(bar);
  wrapper.appendChild(body);
  return wrapper;
}

function formatElapsed(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m${remainder ? ` ${remainder}s` : ''}`;
}

function activityEntryStatus(entry: AgentActivityEntry): string {
  if (entry.kind === 'tool' || entry.kind === 'progress') return entry.status;
  if (entry.kind === 'error') return 'failed';
  return 'completed';
}

function activityEntrySummary(entry: AgentActivityEntry): string {
  if (entry.kind === 'tool' || entry.kind === 'progress') return entry.summary;
  if (entry.kind === 'sources')
    return entry.query ? `Sources for ${entry.query}` : 'Reviewed sources';
  if (entry.kind === 'artifact') return `Created ${entry.name}`;
  if (entry.kind === 'context') return entry.summary;
  return entry.message;
}

function boundedJson(value: unknown): string {
  if (value === undefined) return '';
  try {
    const formatted = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    return formatted.length > 8_000 ? `${formatted.slice(0, 8_000)}\n…` : formatted;
  } catch {
    return String(value).slice(0, 8_000);
  }
}

function appendActivitySources(
  parent: HTMLElement,
  sources: Array<{ url: string; title?: string }>,
): void {
  if (sources.length === 0) return;
  const list = el('div', { class: 'sp-agent-step__sources' });
  for (const source of sources.slice(0, 20)) {
    let parsed: URL;
    try {
      parsed = new URL(source.url);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') continue;
    } catch {
      continue;
    }
    const link = el('a', {
      class: 'sp-agent-source',
      href: parsed.href,
      target: '_blank',
      rel: 'noopener noreferrer',
      title: source.title || parsed.hostname,
    });
    link.appendChild(renderIcon(Globe, 11));
    link.appendChild(document.createTextNode(source.title || parsed.hostname));
    list.appendChild(link);
  }
  if (list.childElementCount > 0) parent.appendChild(list);
}

function buildAgentActivityStep(entry: AgentActivityEntry): HTMLElement {
  const status = activityEntryStatus(entry);
  const detailParts: string[] = [];
  let sources: Array<{ url: string; title?: string }> = [];

  if (entry.kind === 'progress' && entry.detail) detailParts.push(entry.detail);
  if (entry.kind === 'tool') {
    if (entry.input !== undefined) detailParts.push(`Request\n${boundedJson(entry.input)}`);
    if (entry.output !== undefined) detailParts.push(`Result\n${boundedJson(entry.output)}`);
    if (entry.error) detailParts.push(entry.error);
    sources = entry.sources ?? [];
  } else if (entry.kind === 'sources') {
    sources = entry.sources;
  } else if (entry.kind === 'artifact') {
    detailParts.push(`${entry.mimeType}${entry.sizeBytes ? ` · ${entry.sizeBytes} bytes` : ''}`);
  } else if (entry.kind === 'context') {
    if (entry.beforeTokens !== undefined || entry.afterTokens !== undefined) {
      detailParts.push(`${entry.beforeTokens ?? '?'} → ${entry.afterTokens ?? '?'} tokens`);
    }
  } else if (entry.kind === 'error') {
    detailParts.push(entry.message);
  }

  const hasDetails = detailParts.length > 0 || sources.length > 0;
  const step = document.createElement(hasDetails ? 'details' : 'div');
  step.className = `sp-agent-step sp-agent-step--${status}`;
  const row = document.createElement(hasDetails ? 'summary' : 'div');
  if (!hasDetails) row.className = 'sp-agent-step__row';
  const icon =
    status === 'running' || status === 'pending'
      ? Loader2
      : status === 'failed' || status === 'cancelled'
        ? CircleX
        : entry.kind === 'tool'
          ? toolIcon(entry.name)
          : entry.kind === 'sources'
            ? Globe
            : entry.kind === 'artifact'
              ? FileText
              : Clock;
  row.appendChild(renderIcon(icon, 14, 'sp-agent-step__icon'));
  row.appendChild(el('span', { class: 'sp-agent-step__summary' }, activityEntrySummary(entry)));
  if (entry.kind === 'tool' && entry.elapsedMs !== undefined) {
    row.appendChild(
      el('span', { class: 'sp-agent-step__elapsed' }, formatElapsed(entry.elapsedMs)),
    );
  }
  if (hasDetails) row.appendChild(renderIcon(ChevronRight, 11));
  step.appendChild(row);

  if (hasDetails) {
    const detail = el('div', { class: 'sp-agent-step__detail' });
    if (detailParts.length > 0)
      detail.appendChild(document.createTextNode(detailParts.join('\n\n')));
    appendActivitySources(detail, sources);
    step.appendChild(detail);
  }
  return step;
}

function buildAgentActivityEl(activity: AgentActivityState): HTMLElement {
  const details = el('details', { class: 'sp-agent-activity' });
  const summary = document.createElement('summary');
  const terminal = ['completed', 'failed', 'cancelled'].includes(activity.status);
  const elapsed = Math.max(
    0,
    (activity.completedAtMs ?? activity.updatedAtMs) - activity.startedAtMs,
  );
  summary.appendChild(
    renderIcon(
      activity.status === 'failed' || activity.status === 'cancelled'
        ? CircleX
        : terminal
          ? CircleCheck
          : Loader2,
      14,
    ),
  );
  summary.appendChild(
    document.createTextNode(
      `${terminal ? 'Worked' : 'Working'} for ${formatElapsed(elapsed)}${
        activity.entries.length ? ` · ${activity.entries.length} steps` : ''
      }`,
    ),
  );
  summary.appendChild(renderIcon(ChevronRight, 12, 'sp-agent-activity__chevron'));
  details.appendChild(summary);

  const timeline = el('div', { class: 'sp-agent-activity__timeline' });
  for (const entry of activity.entries) timeline.appendChild(buildAgentActivityStep(entry));
  details.appendChild(timeline);
  return details;
}

export function buildBubbleWithTools(msg: ChatMessage): HTMLElement {
  const segments = parseToolCalls(msg.content);
  const hasTools = segments.some((s) => typeof s !== 'string');
  const hasAgentActivity = msg.role === 'assistant' && Boolean(msg.agentActivity);
  if (!hasTools && !hasAgentActivity) return buildBubble(msg);

  const wrapper = document.createElement('div');
  wrapper.className = `sp-msg sp-msg-${msg.role}`;
  wrapper.setAttribute('data-id', msg.id);

  const textParts: string[] = [];
  const toolBlocks: ToolCallBlock[] = [];

  for (const seg of segments) {
    if (typeof seg === 'string') {
      textParts.push(seg);
    } else {
      toolBlocks.push(seg);
    }
  }

  if (msg.agentActivity) wrapper.appendChild(buildAgentActivityEl(msg.agentActivity));

  if (shouldRenderTextBubble({ text: textParts.join(''), streaming: Boolean(msg.streaming) })) {
    const bubble = document.createElement('div');
    bubble.className = `sp-bubble sp-bubble-${msg.role}${msg.error ? ' sp-bubble-error' : ''}${msg.streaming ? ' sp-cursor' : ''}`;
    bubble.id = `sp-bubble-${msg.id}`;
    bubble.innerHTML = sanitizeHtml(renderMarkdown(textParts.join('')));
    wrapper.appendChild(bubble);
  }

  if (toolBlocks.length > 0) {
    if (toolBlocks.length === 1) {
      wrapper.appendChild(buildToolCallEl(toolBlocks[0]!));
    } else {
      const stack = document.createElement('div');
      stack.className = 'tool-call-stack';
      for (const block of toolBlocks) {
        stack.appendChild(buildToolCallEl(block));
      }
      wrapper.appendChild(stack);
    }
  }

  const actionRow = document.createElement('div');
  actionRow.className = 'sp-bubble-actions';
  const ts = document.createElement('span');
  ts.className = 'sp-timestamp';
  ts.textContent = formatTime(msg.timestamp);
  actionRow.appendChild(ts);

  if (msg.role === 'assistant') {
    const copyBtn = document.createElement('button');
    copyBtn.className = 'sp-copy-btn';
    copyBtn.title = 'Copy';
    copyBtn.setAttribute('aria-label', 'Copy response');
    copyBtn.appendChild(renderIcon(Copy, 11));
    copyBtn.addEventListener('click', () => {
      const text = textParts.join('').trim();
      navigator.clipboard
        .writeText(text || msg.content)
        .then(() => {
          copyBtn.classList.add('copied');
          setTimeout(() => copyBtn.classList.remove('copied'), 1500);
        })
        .catch(() => {});
    });
    actionRow.appendChild(copyBtn);
  }

  wrapper.appendChild(actionRow);
  return wrapper;
}
