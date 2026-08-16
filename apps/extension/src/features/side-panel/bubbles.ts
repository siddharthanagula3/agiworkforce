import {
  type AgentActivityArtifactEntry,
  type AgentActivityEntry,
  type AgentActivityState,
  type AgentActivityToolEntry,
} from '@agiworkforce/client-runtime';
import { isAllowedMapSearchProviderUrl } from '@agiworkforce/cloud-contracts';
import {
  resolveInteractiveCardRenderer,
  type InteractiveCard,
  type InteractiveCardRegistry,
  type InteractiveCardRenderContext,
  type MapSearchCardBody,
} from '@agiworkforce/types';
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
import { FREE_TRIAL_GATEWAY } from '../cloud-bridge/freeTrialClient';

type ChatMessage = SidePanelChatMessage;
export type ManagedApprovalDecision = 'approved' | 'rejected';

export interface BubbleInteractionOptions {
  approvalDecisions?: Readonly<Record<string, ManagedApprovalDecision>>;
  approvalError?: string;
  onResolveApproval?: (toolCallId: string, decision: ManagedApprovalDecision) => void;
  onRetry?: (messageId: string) => void;
}

export function openInteractiveCardUrl(value: string): void {
  if (!isAllowedMapSearchProviderUrl(value)) return;
  window.open(new URL(value).toString(), '_blank', 'noopener,noreferrer');
}

function buildInteractiveCardFallback(card: InteractiveCard): HTMLElement {
  const section = el('section', {
    class: 'sp-interactive-card sp-interactive-card--fallback',
    'aria-label': card.fallback.headline,
    'data-card-kind': card.kind,
    'data-card-recognized': String(card.recognized),
  });
  section.appendChild(
    el('div', { class: 'sp-interactive-card__headline' }, card.fallback.headline),
  );
  section.appendChild(el('div', { class: 'sp-interactive-card__text' }, card.fallback.text));
  if (card.interaction?.awaitingResponse) {
    section.appendChild(
      el(
        'div',
        { class: 'sp-interactive-card__status', role: 'status' },
        'This card is read-only in Chrome.',
      ),
    );
  }
  return section;
}

function buildMapSearchCard(
  body: MapSearchCardBody,
  ctx: InteractiveCardRenderContext,
): HTMLElement {
  const section = el('section', {
    class: 'sp-interactive-card sp-interactive-card--map-search',
    'aria-label': body.title,
    'data-card-kind': 'map-search.v1',
  });
  const heading = el('div', { class: 'sp-interactive-card__heading' });
  heading.appendChild(renderIcon(Globe, 15));
  heading.appendChild(el('div', { class: 'sp-interactive-card__headline' }, body.title));
  section.appendChild(heading);
  section.appendChild(el('div', { class: 'sp-interactive-card__text' }, body.query));

  if (body.places?.length) {
    const places = el('ol', {
      class: 'sp-interactive-card__places',
      'aria-label': 'Resolved map places',
    });
    for (const place of body.places) {
      const item = el('li', {}, place.label);
      if (place.kind) item.appendChild(el('span', {}, place.kind));
      places.appendChild(item);
    }
    section.appendChild(places);
  }

  if (ctx.onOpenUrl) {
    const actions = el('div', { class: 'sp-interactive-card__actions' });
    for (const action of body.actions) {
      if (!isAllowedMapSearchProviderUrl(action.url, action.provider)) continue;
      const button = el(
        'button',
        {
          class: 'sp-interactive-card__action',
          type: 'button',
          'aria-label': action.label,
        },
        action.label,
      ) as HTMLButtonElement;
      button.appendChild(renderIcon(ChevronRight, 12));
      button.addEventListener('click', () => ctx.onOpenUrl?.(action.url));
      actions.appendChild(button);
    }
    if (actions.childElementCount > 0) section.appendChild(actions);
  }
  return section;
}

const CHROME_INTERACTIVE_CARD_REGISTRY: InteractiveCardRegistry<HTMLElement> = {
  'map-search.v1': ({ body, ctx }) => buildMapSearchCard(body, ctx),
};

export function buildInteractiveCardEl(card: InteractiveCard): HTMLElement {
  const renderer = resolveInteractiveCardRenderer(CHROME_INTERACTIVE_CARD_REGISTRY, card);
  if (!renderer || !card.recognized) return buildInteractiveCardFallback(card);
  return renderer({
    card,
    body: card.body,
    ctx: { canRespond: false, onOpenUrl: openInteractiveCardUrl },
  });
}

function appendInteractiveCards(parent: HTMLElement, message: ChatMessage): void {
  if (message.role !== 'assistant' || !message.interactiveCards?.length) return;
  const cards = el('div', { class: 'sp-interactive-card-stack' });
  for (const card of message.interactiveCards) cards.appendChild(buildInteractiveCardEl(card));
  parent.appendChild(cards);
}

function buildErrorFooter(
  msg: ChatMessage,
  onRetry?: (messageId: string) => void,
): HTMLElement | null {
  if (!msg.error || !msg.errorText) return null;

  const footer = el('div', { class: 'sp-bubble-error-footer', role: 'alert' });
  footer.appendChild(el('div', { class: 'sp-bubble-error-text' }, msg.errorText));

  if (onRetry) {
    const retryBtn = el(
      'button',
      { class: 'sp-bubble-retry-btn', type: 'button' },
      'Retry',
    ) as HTMLButtonElement;
    retryBtn.addEventListener('click', () => {
      retryBtn.disabled = true;
      onRetry(msg.id);
    });
    footer.appendChild(retryBtn);
  }

  return footer;
}

export function resolveManagedArtifactUrl(uri: string): string | null {
  const trimmed = uri.trim();
  if (!trimmed) return null;
  try {
    const resolved = new URL(trimmed, `${FREE_TRIAL_GATEWAY}/`);
    if (resolved.protocol !== 'https:') return null;
    if (trimmed.startsWith('/') && resolved.origin !== FREE_TRIAL_GATEWAY) return null;
    return resolved.href;
  } catch {
    return null;
  }
}

function buildBubble(msg: ChatMessage, options: BubbleInteractionOptions = {}): HTMLElement {
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

  const errorFooter = buildErrorFooter(msg, options.onRetry);
  if (errorFooter) bubble.appendChild(errorFooter);

  appendInteractiveCards(wrapper, msg);

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

function parseToolCalls(content: string): Array<string | ToolCallBlock> {
  const segments: Array<string | ToolCallBlock> = [];
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

function appendArtifactAction(parent: HTMLElement, entry: AgentActivityArtifactEntry): void {
  const href = resolveManagedArtifactUrl(entry.uri);
  if (!href) {
    parent.appendChild(
      el(
        'div',
        { class: 'sp-agent-artifact-unavailable' },
        'Download unavailable in Chrome for this artifact.',
      ),
    );
    return;
  }
  const link = el('a', {
    class: 'sp-agent-artifact-link',
    href,
    target: '_blank',
    rel: 'noopener noreferrer',
    title: `Open or download ${entry.name}`,
  });
  link.appendChild(renderIcon(FileText, 12));
  link.appendChild(document.createTextNode('Open or download'));
  parent.appendChild(link);
}

function appendApprovalActions(
  parent: HTMLElement,
  entry: AgentActivityToolEntry,
  options: BubbleInteractionOptions,
): void {
  if (!entry.approval || entry.approval.decision) return;
  const selected = options.approvalDecisions?.[entry.toolCallId];
  const approval = el('div', { class: 'sp-agent-approval' });
  approval.appendChild(
    el(
      'div',
      { class: 'sp-agent-approval__summary' },
      `${entry.approval.riskLevel ? `${entry.approval.riskLevel} risk · ` : ''}Your approval is required before this tool can run.`,
    ),
  );
  if (options.approvalError) {
    approval.appendChild(
      el('div', { class: 'sp-agent-approval__error', role: 'alert' }, options.approvalError),
    );
  }
  if (selected) {
    approval.appendChild(
      el(
        'div',
        { class: 'sp-agent-approval__recorded', role: 'status' },
        `${selected === 'approved' ? 'Approved' : 'Declined'} · decision recorded`,
      ),
    );
  } else if (options.onResolveApproval) {
    const actions = el('div', { class: 'sp-agent-approval__actions' });
    const approve = el(
      'button',
      {
        class: 'sp-agent-approval__button sp-agent-approval__button--approve',
        type: 'button',
        'aria-label': `Approve ${entry.name}`,
      },
      'Approve',
    );
    approve.addEventListener('click', () =>
      options.onResolveApproval?.(entry.toolCallId, 'approved'),
    );
    const decline = el(
      'button',
      {
        class: 'sp-agent-approval__button',
        type: 'button',
        'aria-label': `Decline ${entry.name}`,
      },
      'Decline',
    );
    decline.addEventListener('click', () =>
      options.onResolveApproval?.(entry.toolCallId, 'rejected'),
    );
    actions.appendChild(approve);
    actions.appendChild(decline);
    approval.appendChild(actions);
  } else {
    approval.appendChild(
      el(
        'div',
        { class: 'sp-agent-artifact-unavailable' },
        'This approval cannot be continued from the current Chrome session.',
      ),
    );
  }
  parent.appendChild(approval);
}

function buildAgentActivityStep(
  entry: AgentActivityEntry,
  options: BubbleInteractionOptions,
): HTMLElement {
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

  const hasDetails =
    detailParts.length > 0 ||
    sources.length > 0 ||
    entry.kind === 'artifact' ||
    (entry.kind === 'tool' && Boolean(entry.approval));
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
    if (entry.kind === 'artifact') appendArtifactAction(detail, entry);
    if (entry.kind === 'tool') appendApprovalActions(detail, entry, options);
    step.appendChild(detail);
  }
  return step;
}

function buildAgentActivityEl(
  activity: AgentActivityState,
  options: BubbleInteractionOptions,
): HTMLElement {
  const details = el('details', { class: 'sp-agent-activity' });
  const summary = document.createElement('summary');
  const elapsed = Math.max(
    0,
    (activity.completedAtMs ?? activity.updatedAtMs) - activity.startedAtMs,
  );
  const elapsedLabel = formatElapsed(elapsed);
  const statusLabel =
    activity.status === 'completed'
      ? `Worked for ${elapsedLabel}`
      : activity.status === 'failed'
        ? `Failed after ${elapsedLabel}`
        : activity.status === 'cancelled'
          ? `Cancelled after ${elapsedLabel}`
          : activity.status === 'paused'
            ? `Paused after ${elapsedLabel}`
            : activity.status === 'awaiting-approval'
              ? `Needs approval · ${elapsedLabel}`
              : `Working for ${elapsedLabel}`;
  summary.appendChild(
    renderIcon(
      activity.status === 'failed' || activity.status === 'cancelled'
        ? CircleX
        : activity.status === 'completed'
          ? CircleCheck
          : activity.status === 'paused' || activity.status === 'awaiting-approval'
            ? Clock
            : Loader2,
      14,
    ),
  );
  summary.appendChild(
    document.createTextNode(
      `${statusLabel}${activity.entries.length ? ` · ${activity.entries.length} steps` : ''}`,
    ),
  );
  summary.appendChild(renderIcon(ChevronRight, 12, 'sp-agent-activity__chevron'));
  details.appendChild(summary);

  const timeline = el('div', { class: 'sp-agent-activity__timeline' });
  for (const entry of activity.entries) {
    timeline.appendChild(buildAgentActivityStep(entry, options));
  }
  details.appendChild(timeline);
  return details;
}

export function buildBubbleWithTools(
  msg: ChatMessage,
  options: BubbleInteractionOptions = {},
): HTMLElement {
  const segments = parseToolCalls(msg.content);
  const hasTools = segments.some((s) => typeof s !== 'string');
  const hasAgentActivity = msg.role === 'assistant' && Boolean(msg.agentActivity);
  if (!hasTools && !hasAgentActivity) return buildBubble(msg, options);

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

  if (msg.agentActivity) wrapper.appendChild(buildAgentActivityEl(msg.agentActivity, options));

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

  appendInteractiveCards(wrapper, msg);

  const toolsErrorFooter = buildErrorFooter(msg, options.onRetry);
  if (toolsErrorFooter) wrapper.appendChild(toolsErrorFooter);

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
