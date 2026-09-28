import {
  type AgentActivityArtifactEntry,
  type AgentActivityEntry,
  type AgentActivityState,
  type AgentActivityToolEntry,
} from '@agiworkforce/client-runtime';
import {
  isAllowedMapSearchProviderUrl,
  TOOL_APPROVAL_GUIDANCE_MAX_LENGTH,
} from '@agiworkforce/cloud-contracts';
import {
  agentTaskStateLabel,
  explainAutoRouteReason,
  getModelMetadataById,
  interactiveCardRendersBeforeProse,
  resolveInteractiveCardRenderer,
  toolApprovalStakes,
  type AgentEventSource,
  type InteractiveCard,
  type InteractiveCardRegistry,
  type InteractiveCardRenderContext,
  type InteractiveCardResponsePayload,
  type MapSearchCardBody,
} from '@agiworkforce/types';
import {
  renderIcon,
  ChevronRight,
  Copy,
  Globe,
  Terminal,
  FilePen,
  FileImage,
  FileText,
  Search,
  Folder,
  Plug,
  CircleAlert,
  CircleCheck,
  CircleX,
  Clock,
  Code2,
  Loader2,
  Monitor,
  RotateCcw,
} from '../../assets/icons';
import { t, tPlural } from '../../i18n';
import { sanitizeHtml, renderMarkdown } from './markdown';
import { el, formatTime } from './dom';
import {
  answerSourceLists,
  shouldRenderTextBubble,
  type SidePanelChatMessage,
  type SidePanelSource,
} from './chat-state';
import { FREE_TRIAL_GATEWAY, type ManagedQuotaRecovery } from '../cloud-bridge/freeTrialClient';
import { answerFiles, buildAnswerFiles, type AnswerFileAccess } from './generatedFiles';
import { wirePopupMenu } from './menu';
import { buildSourcesFooter, decorateCitations, sourceHost } from './sources';
import { buildMapPreview } from './mapPreview';
import {
  buildClarifyCard,
  buildItineraryCard,
  buildProductComparisonCard,
} from './interactiveCards';
import { buildConnectorInputForm, type ConnectorInputBinding } from './connectorInputForm';
import { buildAgiWorkPlanReview, type AgiWorkPlanReviewBinding } from './agiWorkPlanReview';
import { buildImageViewerButton } from './mediaViewer';

type ChatMessage = SidePanelChatMessage;
export type ManagedApprovalDecision = 'approved' | 'rejected';

export interface QuotaRecoveryControl {
  label: (recovery: ManagedQuotaRecovery) => string;
  open: (recovery: ManagedQuotaRecovery) => void;
}

export interface RegenerateModelOption {
  value: string;
  label: string;
}

export interface BubbleInteractionOptions {
  approvalDecisions?: Readonly<Record<string, ManagedApprovalDecision>>;
  approvalError?: string;
  approvalGuidance?: Readonly<Record<string, string>>;
  onResolveApproval?: (toolCallId: string, decision: ManagedApprovalDecision) => void;
  onApproveForChat?: (toolCallId: string, toolName: string) => void;
  onApprovalGuidanceChange?: (toolCallId: string, guidance: string) => void;
  connectorInput?: ConnectorInputBinding;
  planReview?: AgiWorkPlanReviewBinding;
  onRetry?: (messageId: string) => void;
  onSwitchModel?: () => void;
  quotaRecovery?: QuotaRecoveryControl;
  onRegenerate?: (messageId: string, modelSelection?: string) => void;
  regenerateModels?: readonly RegenerateModelOption[];
  imagePreviews?: readonly string[];
  fileAccess?: AnswerFileAccess;
  onRespondToCard?: (cardId: string, payload: InteractiveCardResponsePayload) => void;
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
        t('spInteractiveCardReadOnly'),
      ),
    );
  }
  return section;
}

function buildMapSearchCard(
  body: MapSearchCardBody,
  ctx: InteractiveCardRenderContext,
  access: AnswerFileAccess | undefined,
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
  const map = buildMapPreview(body, access);
  if (map) section.appendChild(map);

  if (body.places?.length) {
    const places = el('ol', {
      class: 'sp-interactive-card__places',
      'aria-label': t('spMapPlacesLabel'),
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

function interactiveCardRegistry(
  access: AnswerFileAccess | undefined,
): InteractiveCardRegistry<HTMLElement> {
  return {
    'clarify.v1': ({ card, body, ctx }) => buildClarifyCard(card, body, ctx),
    'itinerary.v1': ({ body }) => buildItineraryCard(body, access),
    'map-search.v1': ({ body, ctx }) => buildMapSearchCard(body, ctx, access),
    'product-comparison.v1': ({ body }) => buildProductComparisonCard(body),
  };
}

export function buildInteractiveCardEl(
  card: InteractiveCard,
  access?: AnswerFileAccess,
  onRespond?: (payload: InteractiveCardResponsePayload) => void,
): HTMLElement {
  const renderer = resolveInteractiveCardRenderer(interactiveCardRegistry(access), card);
  if (!renderer || !card.recognized) return buildInteractiveCardFallback(card);
  return renderer({
    card,
    body: card.body,
    ctx: {
      canRespond: onRespond !== undefined,
      ...(onRespond ? { onRespond } : {}),
      onOpenUrl: openInteractiveCardUrl,
    },
  });
}

function buildInteractiveCardStack(
  message: ChatMessage,
  options: BubbleInteractionOptions,
  leading: boolean,
): HTMLElement | null {
  if (message.role !== 'assistant') return null;
  const selected = (message.interactiveCards ?? []).filter(
    (card) => interactiveCardRendersBeforeProse(card.kind) === leading,
  );
  if (selected.length === 0) return null;
  const respond = options.onRespondToCard;
  const cards = el('div', { class: 'sp-interactive-card-stack' });
  for (const card of selected) {
    cards.appendChild(
      buildInteractiveCardEl(
        card,
        options.fileAccess,
        respond ? (payload) => respond(card.cardId, payload) : undefined,
      ),
    );
  }
  return cards;
}

function buildRetryButton(msg: ChatMessage, onRetry: (messageId: string) => void): HTMLElement {
  const retryBtn = el(
    'button',
    { class: 'sp-bubble-retry-btn', type: 'button' },
    t('spBubbleRetry'),
  ) as HTMLButtonElement;
  retryBtn.addEventListener('click', () => {
    retryBtn.disabled = true;
    onRetry(msg.id);
  });
  return retryBtn;
}

function buildErrorFooter(
  msg: ChatMessage,
  onRetry?: (messageId: string) => void,
  onSwitchModel?: () => void,
  quotaRecovery?: QuotaRecoveryControl,
): HTMLElement | null {
  if (!msg.error || !msg.errorText) return null;

  const footer = el('div', { class: 'sp-bubble-error-footer', role: 'alert' });
  footer.appendChild(el('div', { class: 'sp-bubble-error-text' }, msg.errorText));

  if (onRetry) footer.appendChild(buildRetryButton(msg, onRetry));
  if (msg.errorAction === 'switch-model' && onSwitchModel) {
    const switchBtn = el(
      'button',
      { class: 'sp-bubble-retry-btn', type: 'button' },
      t('spBubbleSwitchModel'),
    ) as HTMLButtonElement;
    switchBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      onSwitchModel();
    });
    footer.appendChild(switchBtn);
  }
  const recovery = msg.errorRecovery;
  if (recovery && quotaRecovery) {
    const recoveryBtn = el(
      'button',
      { class: 'sp-bubble-retry-btn', type: 'button' },
      quotaRecovery.label(recovery),
    ) as HTMLButtonElement;
    recoveryBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      quotaRecovery.open(recovery);
    });
    footer.appendChild(recoveryBtn);
  }

  return footer;
}

function buildInterruptedFooter(
  msg: ChatMessage,
  onRetry?: (messageId: string) => void,
): HTMLElement | null {
  if (!msg.interrupted) return null;

  const footer = el('div', { class: 'sp-bubble-interrupted-footer', role: 'status' });
  footer.appendChild(
    el('div', { class: 'sp-bubble-interrupted-text' }, agentTaskStateLabel('cancelled')),
  );
  if (onRetry) footer.appendChild(buildRetryButton(msg, onRetry));
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

function buildAuthorLabel(role: ChatMessage['role']): HTMLElement {
  return el(
    'h2',
    { class: 'sp-visually-hidden' },
    role === 'user' ? t('spAuthorUser') : t('spAuthorAssistant'),
  );
}

function bubbleClass(msg: ChatMessage): string {
  return `sp-bubble sp-bubble-${msg.role}${msg.error ? ' sp-bubble-error' : ''}${msg.streaming ? ' sp-cursor' : ''}`;
}

export function fillAnswerBubble(
  bubble: HTMLElement,
  text: string,
  markers: readonly SidePanelSource[],
): void {
  bubble.innerHTML = sanitizeHtml(renderMarkdown(text));
  decorateCitations(bubble, markers);
}

function buildUserContext(msg: ChatMessage, previews: readonly string[] = []): HTMLElement | null {
  const attachments = msg.attachments ?? [];
  const pages = msg.pages ?? [];
  if (attachments.length === 0 && pages.length === 0) return null;
  const group = el('div', {
    class: 'sp-msg-context',
    role: 'list',
    'aria-label': t('spMessageContextLabel'),
  });
  let imageIndex = 0;
  for (const attachment of attachments) {
    const item = el('span', {
      class: 'sp-msg-context__item',
      role: 'listitem',
      title: attachment.name,
    });
    const preview = attachment.kind === 'image' ? previews[imageIndex] : undefined;
    if (attachment.kind === 'image') imageIndex += 1;
    if (preview) {
      item.classList.add('sp-msg-context__item--thumb');
      item.appendChild(
        buildImageViewerButton(
          el('img', { class: 'sp-msg-context__thumb', src: preview, alt: attachment.name }),
          'sp-msg-context__open',
        ),
      );
    } else {
      item.appendChild(renderIcon(attachment.kind === 'image' ? FileImage : FileText, 14));
      item.appendChild(el('span', { class: 'sp-msg-context__label' }, attachment.name));
    }
    group.appendChild(item);
  }
  for (const page of pages) {
    const link = el('a', {
      class: 'sp-msg-context__item sp-msg-context__page',
      role: 'listitem',
      href: page.url,
      target: '_blank',
      rel: 'noopener noreferrer',
      title: page.url,
    });
    link.appendChild(renderIcon(Globe, 14));
    link.appendChild(
      el('span', { class: 'sp-msg-context__label' }, page.title || sourceHost(page.url)),
    );
    group.appendChild(link);
  }
  return group;
}

function formatElapsed(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m${remainder ? ` ${remainder}s` : ''}`;
}

function answerMetaLabel(msg: ChatMessage): string | null {
  if (msg.role !== 'assistant' || msg.streaming) return null;
  const parts: string[] = [];
  if (msg.model) parts.push(getModelMetadataById(msg.model)?.name ?? msg.model);
  if (msg.durationMs !== undefined) parts.push(formatElapsed(msg.durationMs));
  return parts.length > 0 ? parts.join(' · ') : null;
}

function buildRouteReceipt(msg: ChatMessage): HTMLElement | null {
  if (msg.role !== 'assistant' || msg.streaming || !msg.model || !msg.movedFromModel) return null;
  const label = getModelMetadataById(msg.model)?.name ?? msg.model;
  const why = explainAutoRouteReason(msg.autoRouteReason);
  return el(
    'p',
    { class: 'sp-answer-route' },
    why ? t('spAnswerMovedBecause', [label, why]) : t('spAnswerMoved', [label]),
  );
}

function buildCopyButton(label: string, text: () => string): HTMLElement {
  const copyBtn = el('button', {
    class: 'sp-copy-btn',
    type: 'button',
    title: label,
    'aria-label': label,
  });
  copyBtn.appendChild(renderIcon(Copy, 11));
  copyBtn.addEventListener('click', () => {
    navigator.clipboard
      .writeText(text())
      .then(() => {
        copyBtn.classList.add('copied');
        setTimeout(() => copyBtn.classList.remove('copied'), 1500);
      })
      .catch(() => {});
  });
  return copyBtn;
}

function buildRegenerateControl(
  msg: ChatMessage,
  onRegenerate: (messageId: string, modelSelection?: string) => void,
  models: readonly RegenerateModelOption[],
): HTMLElement {
  const control = el('span', { class: 'sp-regenerate' });
  const trigger = el('button', {
    class: 'sp-copy-btn sp-regenerate__trigger',
    type: 'button',
    title: t('spRegenerate'),
    'aria-label': t('spRegenerate'),
  });
  trigger.appendChild(renderIcon(RotateCcw, 11));
  if (models.length === 0) {
    trigger.addEventListener('click', () => onRegenerate(msg.id));
    control.appendChild(trigger);
    return control;
  }
  const menu = el('div', {
    class: 'sp-regenerate__menu',
    role: 'menu',
    'aria-label': t('spRegenerateMenuLabel'),
  });
  const handle = wirePopupMenu(trigger, menu);
  const addItem = (label: string, modelSelection?: string): void => {
    const item = el('button', { class: 'sp-regenerate__item', type: 'button', role: 'menuitem' });
    item.textContent = label;
    item.addEventListener('click', () => {
      handle.close();
      onRegenerate(msg.id, modelSelection);
    });
    menu.appendChild(item);
  };
  addItem(t('spRegenerateSame'));
  menu.appendChild(el('div', { class: 'sp-regenerate__heading' }, t('spRegenerateWithHeading')));
  for (const model of models) addItem(model.label, model.value);
  control.appendChild(trigger);
  control.appendChild(menu);
  return control;
}

function buildActionRow(
  msg: ChatMessage,
  options: BubbleInteractionOptions,
  copyText: () => string,
): HTMLElement {
  const actionRow = el('div', { class: 'sp-bubble-actions' });
  actionRow.appendChild(el('span', { class: 'sp-timestamp' }, formatTime(msg.timestamp)));
  const meta = answerMetaLabel(msg);
  if (meta) {
    const metaEl = el('span', { class: 'sp-answer-meta' }, meta);
    const why = msg.role === 'assistant' ? explainAutoRouteReason(msg.autoRouteReason) : null;
    if (why) metaEl.title = t('spAnswerAutoChose', [why]);
    actionRow.appendChild(metaEl);
  }
  if (msg.role === 'assistant' && msg.streaming) return actionRow;
  if (msg.content.trim()) {
    actionRow.appendChild(
      buildCopyButton(msg.role === 'user' ? t('spCopyMessage') : t('spCopyResponse'), copyText),
    );
  }
  if (options.onRegenerate && !msg.error && !msg.interrupted) {
    if (msg.role === 'user') {
      const resend = el('button', {
        class: 'sp-copy-btn sp-resend-btn',
        type: 'button',
        title: t('spResendMessage'),
        'aria-label': t('spResendMessage'),
      });
      resend.appendChild(renderIcon(RotateCcw, 11));
      const onRegenerate = options.onRegenerate;
      resend.addEventListener('click', () => onRegenerate(msg.id));
      actionRow.appendChild(resend);
    } else {
      actionRow.appendChild(
        buildRegenerateControl(msg, options.onRegenerate, options.regenerateModels ?? []),
      );
    }
  }
  return actionRow;
}

function buildTransientStatus(msg: ChatMessage): HTMLElement | null {
  if (!msg.stopping && !msg.reconnecting) return null;
  const status = el('div', { class: 'sp-bubble-transient-status', role: 'status' });
  status.appendChild(renderIcon(Loader2, 12, 'sp-bubble-transient-status__icon'));
  status.appendChild(document.createTextNode(msg.stopping ? t('spStopping') : t('spReconnecting')));
  return status;
}

function buildCodeExecution(msg: ChatMessage): HTMLElement | null {
  const execution = msg.codeExecution;
  if (!execution || (execution.status === 'running' && !msg.streaming)) return null;
  const running = execution.status === 'running';
  const returnCode = execution.returnCode ?? 0;
  const passed = execution.status === 'completed' && returnCode === 0;
  const detail = el('div', { class: 'sp-code-run__detail' });
  if (execution.stdout) {
    detail.appendChild(el('div', { class: 'sp-code-run__label' }, t('spCodeOutput')));
    detail.appendChild(el('pre', { class: 'sp-code-run__output' }, execution.stdout));
  }
  if (execution.stderr) {
    detail.appendChild(el('div', { class: 'sp-code-run__label' }, t('spCodeStderr')));
    detail.appendChild(
      el('pre', { class: 'sp-code-run__output sp-code-run__output--error' }, execution.stderr),
    );
  }
  if (execution.status === 'failed') {
    detail.appendChild(
      el(
        'div',
        { class: 'sp-code-run__error' },
        t('spCodeFailed', [execution.errorCode ?? 'unknown_error']),
      ),
    );
  } else if (returnCode !== 0) {
    detail.appendChild(
      el('div', { class: 'sp-code-run__error' }, t('spCodeExitCode', [String(returnCode)])),
    );
  }
  const hasDetail = detail.childElementCount > 0;
  const block = document.createElement(hasDetail ? 'details' : 'div');
  block.className = 'sp-code-run';
  if (block instanceof HTMLDetailsElement) block.open = true;
  const summary = document.createElement(hasDetail ? 'summary' : 'div');
  summary.className = 'sp-code-run__summary';
  summary.appendChild(renderIcon(Code2, 14));
  summary.appendChild(
    el(
      'span',
      { class: 'sp-code-run__title' },
      running ? t('spCodeRunning') : t('spCodeExecution'),
    ),
  );
  summary.appendChild(
    renderIcon(
      running ? Loader2 : passed ? CircleCheck : CircleX,
      13,
      `sp-code-run__status sp-code-run__status--${running ? 'running' : passed ? 'passed' : 'failed'}`,
    ),
  );
  block.appendChild(summary);
  if (hasDetail) block.appendChild(detail);
  return block;
}

function appendAnswerExtras(
  wrapper: HTMLElement,
  msg: ChatMessage,
  options: BubbleInteractionOptions,
  sources: readonly SidePanelSource[],
): void {
  if (msg.role !== 'assistant') return;
  const transient = buildTransientStatus(msg);
  if (transient) wrapper.appendChild(transient);
  const codeRun = buildCodeExecution(msg);
  if (codeRun) wrapper.appendChild(codeRun);
  const files = buildAnswerFiles(
    answerFiles(msg.generatedFiles, msg.agentActivity),
    options.fileAccess,
  );
  if (files) wrapper.appendChild(files);
  const cards = buildInteractiveCardStack(msg, options, false);
  if (cards) wrapper.appendChild(cards);
  if (!msg.streaming) {
    const footer = buildSourcesFooter(sources);
    if (footer) wrapper.appendChild(footer);
  }
}

function buildBubble(msg: ChatMessage, options: BubbleInteractionOptions = {}): HTMLElement {
  const isUser = msg.role === 'user';
  const wrapper = el(
    'div',
    { class: `sp-msg sp-msg-${msg.role}`, 'data-id': msg.id },
    buildAuthorLabel(msg.role),
  );
  const { markers, all } = answerSourceLists(msg);

  if (isUser) {
    const context = buildUserContext(msg, options.imagePreviews);
    if (context) wrapper.appendChild(context);
  }

  const bubble = el('div', { class: bubbleClass(msg), id: `sp-bubble-${msg.id}` });
  if (isUser) {
    bubble.textContent = msg.content;
  } else {
    fillAnswerBubble(bubble, msg.content, markers);
  }
  const leadingCards = buildInteractiveCardStack(msg, options, true);
  if (leadingCards) wrapper.appendChild(leadingCards);
  wrapper.appendChild(bubble);

  const errorFooter = buildErrorFooter(
    msg,
    options.onRetry,
    options.onSwitchModel,
    options.quotaRecovery,
  );
  if (errorFooter) bubble.appendChild(errorFooter);
  const interruptedFooter = buildInterruptedFooter(msg, options.onRetry);
  if (interruptedFooter) bubble.appendChild(interruptedFooter);

  appendAnswerExtras(wrapper, msg, options, all);
  const receipt = buildRouteReceipt(msg);
  if (receipt) wrapper.appendChild(receipt);
  wrapper.appendChild(buildActionRow(msg, options, () => msg.content));
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

function activityEntryStatus(entry: AgentActivityEntry): string {
  if (entry.kind === 'tool' || entry.kind === 'progress') return entry.status;
  if (entry.kind === 'error') return 'failed';
  return 'completed';
}

function activityEntrySummary(entry: AgentActivityEntry): string {
  if (entry.kind === 'tool' || entry.kind === 'progress') return entry.summary;
  if (entry.kind === 'sources')
    return entry.query ? t('spActivitySourcesFor', [entry.query]) : t('spActivitySourcesReviewed');
  if (entry.kind === 'artifact') return t('spActivityCreated', [entry.name]);
  if (entry.kind === 'context') return entry.summary;
  return entry.message;
}

function formattedJson(value: unknown): string {
  if (value === undefined) return '';
  try {
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function boundedJson(value: unknown): string {
  const formatted = formattedJson(value);
  return formatted.length > 8_000 ? `${formatted.slice(0, 8_000)}\n…` : formatted;
}

function appendActivitySources(parent: HTMLElement, sources: readonly AgentEventSource[]): void {
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
      el('div', { class: 'sp-agent-artifact-unavailable' }, t('spArtifactDownloadUnavailable')),
    );
    return;
  }
  const link = el('a', {
    class: 'sp-agent-artifact-link',
    href,
    target: '_blank',
    rel: 'noopener noreferrer',
    title: t('spArtifactOpenOrDownloadNamed', [entry.name]),
  });
  link.appendChild(renderIcon(FileText, 12));
  link.appendChild(document.createTextNode(t('spArtifactOpenOrDownload')));
  parent.appendChild(link);
}

function approvalArguments(input: unknown): Record<string, unknown> | undefined {
  let value = input;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function buildApprovalStakes(entry: AgentActivityToolEntry): HTMLElement | null {
  const stakes = toolApprovalStakes(entry.name, approvalArguments(entry.input));
  if (stakes.length === 0) return null;
  const list = el('dl', { class: 'sp-agent-approval__stakes' });
  for (const stake of stakes) {
    list.appendChild(el('dt', {}, stake.label));
    list.appendChild(el('dd', {}, stake.value));
  }
  return list;
}

function buildApprovalGuidance(
  entry: AgentActivityToolEntry,
  options: BubbleInteractionOptions,
): HTMLElement | null {
  const onChange = options.onApprovalGuidanceChange;
  if (!onChange) return null;
  const guidance = el('textarea', {
    class: 'sp-agent-approval__guidance',
    rows: '2',
    maxlength: String(TOOL_APPROVAL_GUIDANCE_MAX_LENGTH),
    placeholder: t('spApprovalGuidancePlaceholder'),
    'aria-label': t('spApprovalGuidanceNamed', [entry.name]),
  });
  guidance.value = options.approvalGuidance?.[entry.toolCallId] ?? '';
  guidance.addEventListener('input', () => onChange(entry.toolCallId, guidance.value));
  return guidance;
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
      entry.approval.riskLevel
        ? t('spApprovalRequiredWithRisk', [entry.approval.riskLevel])
        : t('spApprovalRequired'),
    ),
  );
  const stakes = buildApprovalStakes(entry);
  if (stakes) approval.appendChild(stakes);
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
        selected === 'approved' ? t('spApprovalRecordedApproved') : t('spApprovalRecordedDeclined'),
      ),
    );
  } else if (options.onResolveApproval) {
    const guidance = buildApprovalGuidance(entry, options);
    if (guidance) approval.appendChild(guidance);
    const actions = el('div', { class: 'sp-agent-approval__actions' });
    const approve = el(
      'button',
      {
        class: 'sp-agent-approval__button sp-agent-approval__button--approve',
        type: 'button',
        'aria-label': t('spApprovalApproveNamed', [entry.name]),
      },
      t('spApprovalApprove'),
    );
    approve.addEventListener('click', () =>
      options.onResolveApproval?.(entry.toolCallId, 'approved'),
    );
    actions.appendChild(approve);
    const onApproveForChat = options.onApproveForChat;
    if (onApproveForChat && entry.approval.riskLevel !== 'high') {
      const approveForChat = el(
        'button',
        {
          class: 'sp-agent-approval__button',
          type: 'button',
          'aria-label': t('spApprovalAllowForChatNamed', [entry.name]),
        },
        t('spApprovalAllowForChat'),
      );
      approveForChat.addEventListener('click', () =>
        onApproveForChat(entry.toolCallId, entry.name),
      );
      actions.appendChild(approveForChat);
    }
    const decline = el(
      'button',
      {
        class: 'sp-agent-approval__button',
        type: 'button',
        'aria-label': t('spApprovalDeclineNamed', [entry.name]),
      },
      t('spApprovalDecline'),
    );
    decline.addEventListener('click', () =>
      options.onResolveApproval?.(entry.toolCallId, 'rejected'),
    );
    actions.appendChild(decline);
    approval.appendChild(actions);
  } else {
    approval.appendChild(
      el('div', { class: 'sp-agent-artifact-unavailable' }, t('spApprovalUnavailable')),
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
  let sources: readonly AgentEventSource[] = [];

  if (entry.kind === 'progress' && entry.detail) detailParts.push(entry.detail);
  if (entry.kind === 'tool') {
    if (entry.deviceStep) {
      detailParts.push(t('spActivityStepWaitingForDevice', [entry.deviceStep.deviceName]));
    }
    if (entry.input !== undefined) {
      detailParts.push(`${t('spActivityRequestHeading')}\n${boundedJson(entry.input)}`);
    }
    if (entry.output !== undefined) {
      detailParts.push(`${t('spActivityResultHeading')}\n${formattedJson(entry.output)}`);
    }
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
    (entry.kind === 'tool' && Boolean(entry.approval || entry.inputRequest));
  const step = document.createElement(hasDetails ? 'details' : 'div');
  step.className = `sp-agent-step sp-agent-step--${status}`;
  if (
    step instanceof HTMLDetailsElement &&
    (status === 'awaiting-approval' || status === 'awaiting-device')
  ) {
    step.open = true;
  }
  const row = document.createElement(hasDetails ? 'summary' : 'div');
  if (!hasDetails) row.className = 'sp-agent-step__row';
  const icon =
    status === 'running' || status === 'pending'
      ? Loader2
      : status === 'failed' || status === 'cancelled'
        ? CircleX
        : status === 'awaiting-device'
          ? Monitor
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
    if (detail.hasChildNodes()) step.appendChild(detail);
    const inputForm =
      entry.kind === 'tool' ? buildConnectorInputForm(entry, options.connectorInput) : null;
    if (inputForm) step.appendChild(inputForm);
  }
  return step;
}

function activityStatusLabel(activity: AgentActivityState, elapsedLabel: string): string {
  const tools = activity.entries.filter(
    (entry): entry is AgentActivityToolEntry => entry.kind === 'tool',
  );
  if (tools.some((entry) => entry.inputRequest)) return t('spActivityNeedsInput', [elapsedLabel]);
  if (
    activity.status === 'awaiting-approval' ||
    tools.some((entry) => entry.status === 'awaiting-approval')
  ) {
    return t('spActivityNeedsApproval', [elapsedLabel]);
  }
  const deviceStep = tools.find((entry) => entry.deviceStep)?.deviceStep;
  if (activity.status === 'awaiting-device' || deviceStep) {
    return deviceStep
      ? t('spActivityWaitingForDevice', [deviceStep.deviceName, elapsedLabel])
      : t('spActivityWaitingForDesktop', [elapsedLabel]);
  }
  switch (activity.status) {
    case 'completed':
      return t('spActivityWorkedFor', [elapsedLabel]);
    case 'partial':
      return t('spActivityFinishedWithErrors', [elapsedLabel]);
    case 'failed':
      return t('spActivityFailedAfter', [elapsedLabel]);
    case 'cancelled':
      return t('spActivityCancelledAfter', [elapsedLabel]);
    case 'paused':
      return t('spActivityPausedAfter', [elapsedLabel]);
    default:
      return t('spActivityWorkingFor', [elapsedLabel]);
  }
}

function activityStatusIcon(activity: AgentActivityState, needsUser: boolean): string {
  if (activity.status === 'failed' || activity.status === 'cancelled') return CircleX;
  if (activity.status === 'partial') return CircleAlert;
  if (activity.status === 'completed') return CircleCheck;
  if (activity.status === 'awaiting-device') return Monitor;
  if (needsUser || activity.status === 'paused') return Clock;
  return Loader2;
}

function buildAgentActivityEl(
  activity: AgentActivityState,
  options: BubbleInteractionOptions,
): HTMLElement {
  const details = el('details', { class: 'sp-agent-activity', 'data-status': activity.status });
  const summary = document.createElement('summary');
  const elapsed = Math.max(
    0,
    (activity.completedAtMs ?? activity.updatedAtMs) - activity.startedAtMs,
  );
  const needsUser =
    activity.status === 'awaiting-approval' ||
    activity.entries.some(
      (entry) =>
        entry.kind === 'tool' &&
        (entry.status === 'awaiting-approval' || Boolean(entry.inputRequest)),
    );
  summary.appendChild(renderIcon(activityStatusIcon(activity, needsUser), 14));
  if (needsUser || activity.status === 'awaiting-device') details.open = true;
  const stepCount = activity.entries.length
    ? ` · ${tPlural('spActivitySteps', activity.entries.length)}`
    : '';
  summary.appendChild(
    document.createTextNode(`${activityStatusLabel(activity, formatElapsed(elapsed))}${stepCount}`),
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
  wrapper.appendChild(buildAuthorLabel(msg.role));

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
  const leadingCards = buildInteractiveCardStack(msg, options, true);
  if (leadingCards) wrapper.appendChild(leadingCards);
  const { markers, all } = answerSourceLists(msg);

  if (
    shouldRenderTextBubble({
      text: textParts.join(''),
      streaming: Boolean(msg.streaming),
      interrupted: Boolean(msg.interrupted),
    })
  ) {
    const bubble = el('div', { class: bubbleClass(msg), id: `sp-bubble-${msg.id}` });
    fillAnswerBubble(bubble, textParts.join(''), markers);
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

  if (options.planReview) wrapper.appendChild(buildAgiWorkPlanReview(msg.id, options.planReview));

  appendAnswerExtras(wrapper, msg, options, all);

  const toolsErrorFooter = buildErrorFooter(msg, options.onRetry, undefined, options.quotaRecovery);
  if (toolsErrorFooter) wrapper.appendChild(toolsErrorFooter);
  const toolsInterruptedFooter = buildInterruptedFooter(msg, options.onRetry);
  if (toolsInterruptedFooter) wrapper.appendChild(toolsInterruptedFooter);

  const toolsReceipt = buildRouteReceipt(msg);
  if (toolsReceipt) wrapper.appendChild(toolsReceipt);
  wrapper.appendChild(buildActionRow(msg, options, () => textParts.join('').trim() || msg.content));
  return wrapper;
}
