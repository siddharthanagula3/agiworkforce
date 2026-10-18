import {
  computeDerivedArtifactId,
  deriveArtifacts,
  detectArtifactType,
  extractArtifactTitle,
  extractCodeBlocks,
  extractTrailingUnclosedBlock,
  isExplicitlyRenderableArtifact,
  removeArtifactBlocks,
  type ArtifactInclusion,
} from '@agiworkforce/artifacts';
import type { SharedArtifactType } from '@agiworkforce/types';
import {
  buildSandboxedHtml,
  configureArtifactSandboxOrigin,
  isArtifactSandboxMessage,
  postRenderToArtifactSandbox,
  type ArtifactRenderPayload,
} from '@agiworkforce/unified-chat/artifact-sandbox';
import { spreadsheetSafeExport } from '@agiworkforce/unified-chat/tabular';
import {
  renderIcon,
  Code2,
  Copy,
  Download,
  ExternalLink,
  FileImage,
  FileText,
  Globe,
  Loader2,
  X,
} from '../../assets/icons';
import { t, tPlural } from '../../i18n';
import type { SidePanelChatMessage } from './chat-state';
import { el } from './dom';
import {
  answerFiles,
  fileMetaLabel,
  saveAnswerFile,
  saveBlob,
  type AnswerFile,
  type AnswerFileAccess,
} from './generatedFiles';

export const ARTIFACT_PANEL_CSS = `
  #sp-artifact-panel {
    display: flex;
    flex: 0 0 55%;
    flex-direction: column;
    min-height: 0;
    background: var(--agi-ext-bg);
    border-bottom: 1px solid var(--agi-ext-border-strong);
  }
  #sp-artifact-panel[hidden] { display: none; }
  .sp-bubble[hidden] { display: none; }
  .sp-artifact-panel__header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 8px 8px 12px;
    border-bottom: 1px solid var(--agi-ext-border);
  }
  .sp-artifact-panel__icon { display: inline-flex; flex-shrink: 0; color: var(--agi-ext-text-muted); }
  .sp-artifact-panel__heading { display: flex; flex: 1; flex-direction: column; min-width: 0; }
  .sp-artifact-panel__title {
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--agi-ext-text);
    font-size: var(--type-label-size);
    line-height: var(--type-label-height);
    font-weight: 600;
  }
  .sp-artifact-panel__meta,
  .sp-artifact-panel__status,
  .sp-artifact-panel__note {
    color: var(--agi-ext-text-muted);
    font-size: var(--type-caption-size);
    line-height: var(--type-caption-height);
  }
  .sp-artifact-panel__actions { display: inline-flex; flex-shrink: 0; gap: 2px; }
  .sp-artifact-action {
    display: inline-flex;
    width: var(--control-md);
    height: var(--control-md);
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: var(--corner-control);
    background: transparent;
    color: var(--agi-ext-text-muted);
    cursor: pointer;
  }
  .sp-artifact-action:hover:not(:disabled) { background: var(--agi-ext-hover); color: var(--agi-ext-text); }
  .sp-artifact-action:disabled { cursor: default; color: var(--agi-ext-text-placeholder); }
  .sp-artifact-action:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
  .sp-artifact-panel__status { margin: 0; padding: 4px 12px 0; }
  .sp-artifact-panel__status:empty { display: none; }
  .sp-artifact-panel__body { flex: 1; min-height: 0; overflow: auto; padding: 10px 12px; }
  .sp-artifact-panel__source {
    margin: 0;
    font-family: var(--type-code-family);
    font-size: var(--type-code-size);
    line-height: var(--type-code-height);
    color: var(--agi-ext-text);
    white-space: pre;
  }
  .sp-artifact-panel__body--frame { padding: 0; overflow: hidden; }
  .sp-artifact-panel__frame { display: block; width: 100%; height: 100%; border: 0; background: var(--agi-ext-surface); }
  .sp-artifact-panel__views { display: inline-flex; gap: 2px; padding: 6px 12px 0; }
  .sp-artifact-panel__views[hidden] { display: none; }
  .sp-artifact-view {
    min-height: var(--control-sm);
    padding: 0 10px;
    border: 1px solid transparent;
    border-radius: var(--corner-control);
    background: transparent;
    color: var(--agi-ext-text-muted);
    font-size: var(--type-label-size);
    cursor: pointer;
  }
  .sp-artifact-view[aria-pressed='true'] { border-color: var(--agi-ext-border-control); color: var(--agi-ext-text); }
  .sp-artifact-view:hover { background: var(--agi-ext-hover); color: var(--agi-ext-text); }
  .sp-artifact-view:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
  .sp-artifact-panel__image { display: block; max-width: 100%; height: auto; margin: 0 auto; }
  .sp-artifact-panel__note { margin: 0; padding: 0 12px 8px; }
  .sp-artifact-panel__note[hidden] { display: none; }
  .sp-artifact-cards { display: flex; flex-direction: column; gap: 6px; width: min(100%, 420px); }
  .sp-artifact-card {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 52px;
    padding: 6px 6px 6px 12px;
    border: 1px solid var(--agi-ext-border-strong);
    border-radius: var(--corner-panel);
    background: var(--agi-ext-surface);
  }
  .sp-artifact-card[data-in-panel='true'] { border-color: var(--agi-ext-text-muted); }
  .sp-artifact-card__icon {
    display: inline-flex;
    flex-shrink: 0;
    width: var(--control-md);
    height: var(--control-md);
    align-items: center;
    justify-content: center;
    border-radius: var(--corner-control);
    background: var(--agi-ext-hover);
    color: var(--agi-ext-text-muted);
  }
  .sp-artifact-card[data-streaming='true'] .sp-artifact-card__icon svg {
    animation: sp-spin var(--duration-spin) linear infinite;
  }
  .sp-artifact-card__copy { display: flex; flex: 1; flex-direction: column; gap: 1px; min-width: 0; }
  .sp-artifact-card__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--agi-ext-text);
    font-size: var(--type-label-size);
    line-height: var(--type-label-height);
    font-weight: 550;
  }
  .sp-artifact-card__meta {
    color: var(--agi-ext-text-muted);
    font-size: var(--type-caption-size);
    line-height: var(--type-caption-height);
  }
  .sp-artifact-card__toggle {
    flex-shrink: 0;
    min-height: var(--control-md);
    padding: 0 12px;
    border: 1px solid var(--agi-ext-border-control);
    border-radius: var(--corner-control);
    background: transparent;
    color: var(--agi-ext-text);
    font-size: var(--type-label-size);
    font-weight: 550;
    cursor: pointer;
  }
  .sp-artifact-card__toggle:hover { background: var(--agi-ext-hover); }
  .sp-artifact-card__toggle:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
  #sp-header { position: relative; }
  .sp-outputs { display: inline-flex; }
  .sp-outputs[hidden] { display: none; }
  .sp-outputs__trigger { gap: 4px; width: auto; padding: 0 6px; }
  .sp-outputs__trigger[aria-expanded='true'] { background: var(--agi-ext-hover); color: var(--agi-ext-text); }
  .sp-outputs__count { font-size: var(--type-caption-size); font-variant-numeric: tabular-nums; }
  .sp-outputs__popover {
    position: absolute;
    top: calc(100% + 6px);
    right: 12px;
    z-index: var(--z-popover);
    display: flex;
    width: min(320px, calc(100vw - 24px));
    max-height: min(60vh, 420px);
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--agi-ext-border-strong);
    border-radius: var(--corner-menu);
    background: var(--agi-ext-bg);
  }
  .sp-outputs__popover[hidden] { display: none; }
  .sp-outputs__heading {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin: 0;
    padding: 10px 12px 6px;
    color: var(--agi-ext-text);
    font-size: var(--type-label-size);
    line-height: var(--type-label-height);
    font-weight: 600;
  }
  .sp-outputs__heading-count { color: var(--agi-ext-text-muted); font-size: var(--type-caption-size); font-weight: 400; }
  .sp-outputs__list { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0 8px 8px; overflow-y: auto; list-style: none; }
  .sp-outputs__status { margin: 0; padding: 0 12px 8px; color: var(--agi-ext-text-muted); font-size: var(--type-caption-size); }
  .sp-outputs__status:empty { display: none; }
  .sp-output {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 4px 4px 8px;
    border: 1px solid var(--agi-ext-border);
    border-radius: var(--corner-panel);
    background: var(--agi-ext-surface);
  }
  .sp-output__icon { display: inline-flex; flex-shrink: 0; color: var(--agi-ext-text-muted); }
  .sp-output__open,
  .sp-output__label {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    min-height: var(--control-md);
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: var(--corner-control);
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: start;
  }
  .sp-output__open { cursor: pointer; }
  .sp-output__open:focus-visible { outline: 2px solid var(--agi-ext-focus); outline-offset: 2px; }
`;

const ARTIFACT_INCLUSION: ArtifactInclusion = 'explicit-renderable';

const ARTIFACT_FILE_EXTENSION: Partial<Record<SharedArtifactType, string>> = {
  html: 'html',
  react: 'jsx',
  svg: 'svg',
  mermaid: 'mmd',
};

const ARTIFACT_FORMAT_LABEL: Partial<Record<SharedArtifactType, string>> = {
  html: 'HTML',
  react: 'React',
  svg: 'SVG',
  mermaid: 'Mermaid',
};

const MAX_FILE_STEM_CHARS = 60;

const SANDBOX_DOCUMENT_TIMEOUT_MS = 15_000;
const SANDBOX_CONNECT_TIMEOUT_MS = 3_000;
const SANDBOX_RENDER_TIMEOUT_MS = 15_000;
const RUNTIME_REQUEST_ID = /^runtime-\d{1,12}$/;
const SANDBOX_RENDERED_TYPES: ReadonlySet<SharedArtifactType> = new Set([
  'html',
  'react',
  'mermaid',
]);

export function artifactRenderPayload(
  artifact: Pick<SidePanelArtifact, 'type' | 'content'>,
): ArtifactRenderPayload | null {
  switch (artifact.type) {
    case 'html':
      return {
        type: 'render',
        kind: 'html',
        html: buildSandboxedHtml(artifact.content),
        runScripts: true,
      };
    case 'react':
      return { type: 'render', kind: 'react', code: artifact.content };
    case 'mermaid':
      return { type: 'render', kind: 'mermaid', code: artifact.content };
    default:
      return null;
  }
}

export interface SidePanelArtifact {
  id: string;
  messageId: string;
  type: SharedArtifactType;
  title: string;
  content: string;
  language: string;
  streaming: boolean;
}

export interface MessageArtifactView {
  artifacts: readonly SidePanelArtifact[];
  creating: SidePanelArtifact | null;
}

const EMPTY_VIEW: MessageArtifactView = { artifacts: [], creating: null };

type ArtifactMessage = Pick<SidePanelChatMessage, 'id' | 'role' | 'content' | 'streaming'>;

export function messageArtifactView(
  msg: ArtifactMessage,
  conversationId: string,
): MessageArtifactView {
  if (msg.role !== 'assistant' || !msg.content.includes('```')) return EMPTY_VIEW;
  const blocks = extractCodeBlocks(msg.content);
  const artifacts = deriveArtifacts(msg.content, {
    conversationId,
    messageId: msg.id,
    include: ARTIFACT_INCLUSION,
    blocks,
  }).map((artifact): SidePanelArtifact => ({
    id: artifact.id,
    messageId: msg.id,
    type: artifact.type,
    title: artifact.title,
    content: artifact.content,
    language: artifact.language ?? artifact.type,
    streaming: false,
  }));
  let creating: SidePanelArtifact | null = null;
  if (msg.streaming) {
    const tail = extractTrailingUnclosedBlock(msg.content, blocks);
    if (tail && isExplicitlyRenderableArtifact(tail.language, tail.content)) {
      creating = {
        id: computeDerivedArtifactId(conversationId, msg.id, tail.ordinal),
        messageId: msg.id,
        type: detectArtifactType(tail.language, tail.content),
        title: extractArtifactTitle(tail.content) ?? t('spArtifactsUntitled'),
        content: tail.content,
        language: tail.language,
        streaming: true,
      };
    }
  }
  return artifacts.length === 0 && !creating ? EMPTY_VIEW : { artifacts, creating };
}

export function artifactProse(text: string, view: MessageArtifactView): string {
  let base = text;
  if (view.creating) {
    const tail = extractTrailingUnclosedBlock(text);
    if (tail) base = text.slice(0, tail.startIndex).trimEnd();
  }
  return view.artifacts.length > 0
    ? removeArtifactBlocks(base, view.artifacts, { include: ARTIFACT_INCLUSION })
    : base;
}

export function artifactFileName(artifact: Pick<SidePanelArtifact, 'title' | 'type' | 'language'>) {
  const extension =
    ARTIFACT_FILE_EXTENSION[artifact.type] ??
    (artifact.language && artifact.language !== 'text' ? artifact.language : 'txt');
  const stem =
    artifact.title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, MAX_FILE_STEM_CHARS)
      .replace(/-+$/g, '') || t('spArtifactFileStem');
  return `${stem}.${extension}`;
}

export function artifactDownload(artifact: SidePanelArtifact): { name: string; blob: Blob } {
  const name = artifactFileName(artifact);
  const extension = name.slice(name.lastIndexOf('.') + 1);
  const exported = spreadsheetSafeExport(artifact.content, extension);
  return { name, blob: new Blob([exported.body], { type: exported.mimeType }) };
}

function formatLabel(artifact: SidePanelArtifact): string {
  return ARTIFACT_FORMAT_LABEL[artifact.type] ?? artifact.language.toUpperCase();
}

function lineCount(content: string): number {
  return content.length === 0 ? 0 : content.split('\n').length;
}

function artifactIcon(artifact: SidePanelArtifact): string {
  if (artifact.streaming) return Loader2;
  if (artifact.type === 'svg') return FileImage;
  if (artifact.type === 'html') return Globe;
  return Code2;
}

function cardsSignature(view: MessageArtifactView): string {
  return [...view.artifacts, ...(view.creating ? [view.creating] : [])]
    .map((artifact) => `${artifact.id}:${artifact.streaming}:${artifact.title}`)
    .join('|');
}

function svgPreviewSource(content: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(content)}`;
}

export type ArtifactOutput =
  | { kind: 'artifact'; key: string; artifact: SidePanelArtifact }
  | { kind: 'file'; key: string; file: AnswerFile };

export function conversationOutputs(
  messages: readonly SidePanelChatMessage[],
  viewFor: (msg: SidePanelChatMessage) => MessageArtifactView,
): ArtifactOutput[] {
  const outputs: ArtifactOutput[] = [];
  for (const msg of messages) {
    if (msg.role !== 'assistant') continue;
    for (const artifact of viewFor(msg).artifacts) {
      outputs.push({ kind: 'artifact', key: artifact.id, artifact });
    }
    for (const file of answerFiles(msg.generatedFiles, msg.agentActivity)) {
      outputs.push({ kind: 'file', key: `${msg.id}:${file.key}`, file });
    }
  }
  return outputs;
}

export interface ArtifactOutputsDependencies {
  fileAccess: AnswerFileAccess;
  conversationId: () => string;
  webConversationUrl: () => string | null;
  openUrl: (url: string) => void;
  writeClipboard: (text: string) => Promise<void>;
  saveFile: (name: string, blob: Blob) => void;
  sandboxOrigin: string | null;
}

export interface ArtifactOutputsAPI {
  panelEl: HTMLElement;
  outputsEl: HTMLElement;
  viewFor(msg: SidePanelChatMessage): MessageArtifactView;
  buildCards(msg: SidePanelChatMessage): HTMLElement | null;
  updateCards(msg: SidePanelChatMessage, current: HTMLElement | null): HTMLElement | null;
  sync(messages: readonly SidePanelChatMessage[]): void;
  open(artifactId: string, trigger?: HTMLElement | null): void;
  close(): void;
  selectedId(): string | null;
}

interface CachedView {
  conversationId: string;
  content: string;
  streaming: boolean;
  view: MessageArtifactView;
}

export function createArtifactOutputs(
  dependencies: Partial<ArtifactOutputsDependencies> &
    Pick<ArtifactOutputsDependencies, 'fileAccess' | 'conversationId' | 'webConversationUrl'>,
): ArtifactOutputsAPI {
  const deps: ArtifactOutputsDependencies = {
    openUrl: (url) => {
      void chrome.tabs.create({ url });
    },
    writeClipboard: (text) => navigator.clipboard.writeText(text),
    saveFile: saveBlob,
    sandboxOrigin: null,
    ...dependencies,
  };
  configureArtifactSandboxOrigin(deps.sandboxOrigin);

  const views = new Map<string, CachedView>();
  const index = new Map<string, SidePanelArtifact>();
  const autoOpened = new Set<string>();
  const dismissed = new Set<string>();
  let messagesSnapshot: readonly SidePanelChatMessage[] = [];
  let selected: string | null = null;
  let renderedKey: string | null = null;
  let renderedOutputs: string | null = null;
  let returnFocus: HTMLElement | null = null;

  const panelEl = el('section', {
    id: 'sp-artifact-panel',
    'aria-label': t('spArtifactPanelLabel'),
    hidden: '',
  });
  const panelHeader = el('div', { class: 'sp-artifact-panel__header' });
  const panelIcon = el('span', { class: 'sp-artifact-panel__icon', 'aria-hidden': 'true' });
  const panelHeading = el('div', { class: 'sp-artifact-panel__heading' });
  const panelTitle = el('h2', { class: 'sp-artifact-panel__title' });
  const panelMeta = el('span', { class: 'sp-artifact-panel__meta' });
  panelHeading.append(panelTitle, panelMeta);
  const panelActions = el('div', { class: 'sp-artifact-panel__actions' });
  const copyBtn = iconButton(Copy);
  const downloadBtn = iconButton(Download);
  const webBtn = iconButton(ExternalLink);
  const closeBtn = iconButton(X);
  closeBtn.setAttribute('aria-label', t('spArtifactPanelClose'));
  closeBtn.title = t('spArtifactPanelClose');
  panelActions.append(copyBtn, downloadBtn, webBtn, closeBtn);
  panelHeader.append(panelIcon, panelHeading, panelActions);
  const panelStatus = el('p', {
    class: 'sp-artifact-panel__status',
    role: 'status',
    'aria-live': 'polite',
  });
  const panelViews = el('div', {
    class: 'sp-artifact-panel__views',
    role: 'group',
    'aria-label': t('spArtifactViewLabel'),
    hidden: '',
  });
  const previewViewBtn = el(
    'button',
    { class: 'sp-artifact-view', type: 'button', 'aria-pressed': 'true' },
    t('spArtifactShowPreview'),
  );
  const sourceViewBtn = el(
    'button',
    { class: 'sp-artifact-view', type: 'button', 'aria-pressed': 'false' },
    t('spArtifactShowSource'),
  );
  panelViews.append(previewViewBtn, sourceViewBtn);
  const panelBody = el('div', { class: 'sp-artifact-panel__body', tabindex: '0' });
  const panelNote = el('p', { class: 'sp-artifact-panel__note', hidden: '' });
  panelEl.append(panelHeader, panelViews, panelStatus, panelBody, panelNote);

  let showSource = false;
  let sandboxUnavailable = false;
  let frame: HTMLIFrameElement | null = null;
  let framePayload: ArtifactRenderPayload | null = null;
  let frameReady = false;
  let frameRendered = false;
  let frameEpoch = 0;
  let frameDeadline: ReturnType<typeof setTimeout> | null = null;

  const outputsEl = el('span', { class: 'sp-outputs', hidden: '' });
  const outputsTrigger = el('button', {
    class: 'sp-icon-btn sp-outputs__trigger',
    id: 'sp-outputs-btn',
    type: 'button',
    'aria-haspopup': 'dialog',
    'aria-expanded': 'false',
    'aria-controls': 'sp-outputs-popover',
  });
  outputsTrigger.title = t('spOutputsTitle');
  const outputsCount = el('span', { class: 'sp-outputs__count' });
  outputsTrigger.append(renderIcon(FileText, 16), outputsCount);
  const popover = el('div', {
    class: 'sp-outputs__popover',
    id: 'sp-outputs-popover',
    role: 'dialog',
    'aria-label': t('spOutputsTitle'),
    hidden: '',
  });
  const popoverHeading = el('h2', { class: 'sp-outputs__heading' });
  const popoverTitle = el('span', {}, t('spOutputsTitle'));
  const popoverCount = el('span', { class: 'sp-outputs__heading-count' });
  popoverHeading.append(popoverTitle, popoverCount);
  const outputsList = el('ul', { class: 'sp-outputs__list' });
  const outputsStatus = el('p', { class: 'sp-outputs__status', role: 'status' });
  popover.append(popoverHeading, outputsList, outputsStatus);
  outputsEl.append(outputsTrigger, popover);

  function iconButton(icon: string): HTMLButtonElement {
    const button = el('button', { class: 'sp-artifact-action', type: 'button' });
    button.appendChild(renderIcon(icon, 15));
    return button;
  }

  function viewFor(msg: SidePanelChatMessage): MessageArtifactView {
    const conversationId = deps.conversationId();
    const cached = views.get(msg.id);
    const streaming = Boolean(msg.streaming);
    if (
      cached &&
      cached.conversationId === conversationId &&
      cached.streaming === streaming &&
      cached.content === msg.content
    ) {
      return cached.view;
    }
    const view = messageArtifactView(msg, conversationId);
    views.set(msg.id, { conversationId, content: msg.content, streaming, view });
    return view;
  }

  function isShown(artifactId: string): boolean {
    return !panelEl.hidden && selected === artifactId;
  }

  function buildCard(artifact: SidePanelArtifact): HTMLElement {
    const card = el('div', {
      class: 'sp-artifact-card',
      role: 'listitem',
      'data-artifact-id': artifact.id,
      'data-streaming': String(artifact.streaming),
    });
    const icon = el('span', { class: 'sp-artifact-card__icon', 'aria-hidden': 'true' });
    icon.appendChild(renderIcon(artifactIcon(artifact), 16));
    card.appendChild(icon);
    const copy = el('span', { class: 'sp-artifact-card__copy' });
    const name = artifact.streaming ? t('spArtifactCreating', [artifact.title]) : artifact.title;
    copy.appendChild(el('span', { class: 'sp-artifact-card__name', title: name }, name));
    copy.appendChild(
      el(
        'span',
        { class: 'sp-artifact-card__meta' },
        artifact.streaming
          ? tPlural('spArtifactLines', lineCount(artifact.content))
          : t('spArtifactCardMeta', [formatLabel(artifact)]),
      ),
    );
    card.appendChild(copy);
    if (!artifact.streaming) {
      const download = iconButton(Download);
      download.setAttribute('aria-label', t('spAnswerFileDownload', [artifact.title]));
      download.title = t('spAnswerFileDownload', [artifact.title]);
      download.addEventListener('click', () => downloadArtifact(artifact, panelStatus));
      card.appendChild(download);
    }
    const toggle = el('button', { class: 'sp-artifact-card__toggle', type: 'button' });
    toggle.addEventListener('click', () => {
      if (isShown(artifact.id)) close();
      else open(artifact.id, toggle);
    });
    card.appendChild(toggle);
    applyCardState(card);
    return card;
  }

  function applyCardState(card: HTMLElement): void {
    const id = card.getAttribute('data-artifact-id') ?? '';
    const artifact = index.get(id);
    const toggle = card.querySelector<HTMLButtonElement>('.sp-artifact-card__toggle');
    const shown = isShown(id);
    card.setAttribute('data-in-panel', String(shown));
    if (!toggle) return;
    const title =
      artifact?.title ?? card.querySelector('.sp-artifact-card__name')?.textContent ?? '';
    toggle.textContent = shown ? t('spArtifactHide') : t('spArtifactOpen');
    toggle.setAttribute('aria-expanded', String(shown));
    toggle.setAttribute('aria-controls', 'sp-artifact-panel');
    toggle.setAttribute(
      'aria-label',
      shown ? t('spArtifactHideLabel', [title]) : t('spArtifactOpenLabel', [title]),
    );
  }

  function refreshCardStates(): void {
    document
      .querySelectorAll<HTMLElement>('.sp-artifact-card')
      .forEach((card) => applyCardState(card));
  }

  function buildCards(msg: SidePanelChatMessage): HTMLElement | null {
    const view = viewFor(msg);
    for (const artifact of view.artifacts) index.set(artifact.id, artifact);
    if (view.creating) index.set(view.creating.id, view.creating);
    if (view.artifacts.length === 0 && !view.creating) return null;
    const list = el('div', {
      class: 'sp-artifact-cards',
      id: `sp-artifact-cards-${msg.id}`,
      role: 'list',
      'aria-label': t('spArtifactCardsLabel'),
      'data-signature': cardsSignature(view),
    });
    for (const artifact of view.artifacts) list.appendChild(buildCard(artifact));
    if (view.creating) list.appendChild(buildCard(view.creating));
    return list;
  }

  function updateCards(msg: SidePanelChatMessage, current: HTMLElement | null): HTMLElement | null {
    const view = viewFor(msg);
    if (!current || current.getAttribute('data-signature') !== cardsSignature(view)) {
      return buildCards(msg);
    }
    if (view.creating) {
      const meta = current.querySelector<HTMLElement>(
        `.sp-artifact-card[data-streaming='true'] .sp-artifact-card__meta`,
      );
      if (meta) meta.textContent = tPlural('spArtifactLines', lineCount(view.creating.content));
    }
    return current;
  }

  function downloadArtifact(artifact: SidePanelArtifact, status: HTMLElement): void {
    try {
      const { name, blob } = artifactDownload(artifact);
      deps.saveFile(name, blob);
      status.textContent = t('spArtifactsDownloaded', [name]);
    } catch {
      status.textContent = t('spArtifactsDownloadFailed');
    }
  }

  function renderPanel(): void {
    const artifact = selected ? index.get(selected) : undefined;
    if (!artifact) return;
    const key = `${artifact.id}:${artifact.streaming}`;
    const lines = lineCount(artifact.content);
    panelMeta.textContent = artifact.streaming
      ? tPlural('spArtifactLines', lines)
      : t('spArtifactCardMeta', [formatLabel(artifact)]);
    if (key === renderedKey) {
      const source = panelBody.querySelector('code');
      if (source && source.textContent !== artifact.content) source.textContent = artifact.content;
      return;
    }
    renderedKey = key;
    panelStatus.textContent = '';
    panelIcon.replaceChildren(renderIcon(artifactIcon(artifact), 16));
    const title = artifact.streaming ? t('spArtifactCreating', [artifact.title]) : artifact.title;
    panelTitle.textContent = title;
    panelTitle.title = title;
    copyBtn.disabled = artifact.streaming;
    downloadBtn.disabled = artifact.streaming;
    copyBtn.setAttribute('aria-label', t('spArtifactCopyLabel', [artifact.title]));
    copyBtn.title = t('spArtifactCopyLabel', [artifact.title]);
    downloadBtn.setAttribute('aria-label', t('spAnswerFileDownload', [artifact.title]));
    downloadBtn.title = t('spAnswerFileDownload', [artifact.title]);
    const webUrl = deps.webConversationUrl();
    webBtn.hidden = webUrl === null;
    webBtn.setAttribute('aria-label', t('spArtifactOpenOnWebLabel', [artifact.title]));
    webBtn.title = t('spArtifactOpenOnWebLabel', [artifact.title]);
    teardownFrame();
    const previewsAsImage = artifact.type === 'svg' && !artifact.streaming;
    const runsInSandbox = canRunInSandbox(artifact);
    panelViews.hidden = !runsInSandbox;
    previewViewBtn.setAttribute('aria-pressed', String(!showSource));
    sourceViewBtn.setAttribute('aria-pressed', String(showSource));
    panelNote.hidden = previewsAsImage || (runsInSandbox && !showSource) || artifact.streaming;
    panelNote.textContent = sandboxUnavailable
      ? t('spArtifactPreviewUnavailable')
      : webUrl
        ? t('spArtifactSourceNoteWeb')
        : t('spArtifactSourceNote');
    if (runsInSandbox && !showSource) {
      mountFrame(artifact);
      return;
    }
    if (previewsAsImage) {
      panelBody.replaceChildren(
        el('img', {
          class: 'sp-artifact-panel__image',
          src: svgPreviewSource(artifact.content),
          alt: artifact.title,
        }),
      );
      return;
    }
    const code = el('code');
    code.textContent = artifact.content;
    panelBody.replaceChildren(el('pre', { class: 'sp-artifact-panel__source' }, code));
  }

  function canRunInSandbox(artifact: SidePanelArtifact): boolean {
    return (
      deps.sandboxOrigin !== null &&
      !sandboxUnavailable &&
      !artifact.streaming &&
      SANDBOX_RENDERED_TYPES.has(artifact.type)
    );
  }

  function clearFrameDeadline(): void {
    if (frameDeadline !== null) clearTimeout(frameDeadline);
    frameDeadline = null;
  }

  function teardownFrame(): void {
    clearFrameDeadline();
    frameEpoch += 1;
    frame = null;
    framePayload = null;
    frameReady = false;
    frameRendered = false;
    panelBody.classList.remove('sp-artifact-panel__body--frame');
  }

  function armFrameDeadline(epoch: number, milliseconds: number): void {
    clearFrameDeadline();
    frameDeadline = setTimeout(() => {
      if (epoch !== frameEpoch || frameRendered) return;
      sandboxUnavailable = true;
      renderedKey = null;
      renderPanel();
    }, milliseconds);
  }

  function postFramePayload(): void {
    if (!frame || !framePayload || !deps.sandboxOrigin) return;
    postRenderToArtifactSandbox(frame, framePayload, deps.sandboxOrigin);
  }

  function mountFrame(artifact: SidePanelArtifact): void {
    const payload = artifactRenderPayload(artifact);
    if (!payload || !deps.sandboxOrigin) return;
    const epoch = frameEpoch;
    const iframe = el('iframe', {
      class: 'sp-artifact-panel__frame',
      src: `${deps.sandboxOrigin}/`,
      title: artifact.title,
      sandbox: 'allow-scripts allow-same-origin',
      referrerpolicy: 'no-referrer',
    });
    iframe.addEventListener('load', () => {
      if (epoch !== frameEpoch) return;
      postFramePayload();
      if (!frameReady) armFrameDeadline(epoch, SANDBOX_CONNECT_TIMEOUT_MS);
    });
    frame = iframe;
    framePayload = payload;
    panelStatus.textContent = t('spArtifactPreviewStarting');
    panelBody.classList.add('sp-artifact-panel__body--frame');
    panelBody.replaceChildren(iframe);
    armFrameDeadline(epoch, SANDBOX_DOCUMENT_TIMEOUT_MS);
  }

  function onSandboxMessage(event: MessageEvent): void {
    const current = frame;
    if (!current || !deps.sandboxOrigin || !isArtifactSandboxMessage(event, current)) return;
    const data = event.data as { type?: unknown; id?: unknown } | null;
    if (!data || typeof data !== 'object') return;
    switch (data.type) {
      case 'sandbox-ready':
        frameReady = true;
        postFramePayload();
        armFrameDeadline(frameEpoch, SANDBOX_RENDER_TIMEOUT_MS);
        return;
      case 'render-complete':
        frameReady = true;
        frameRendered = true;
        clearFrameDeadline();
        panelStatus.textContent = '';
        return;
      case 'render-error':
        frameReady = true;
        frameRendered = true;
        clearFrameDeadline();
        panelStatus.textContent = t('spArtifactPreviewFailed');
        return;
      case 'runtime-request': {
        const id = typeof data.id === 'string' && RUNTIME_REQUEST_ID.test(data.id) ? data.id : null;
        if (!id) return;
        current.contentWindow?.postMessage(
          { type: 'runtime-response', id, ok: false, error: t('spArtifactRuntimeUnavailable') },
          deps.sandboxOrigin,
        );
        return;
      }
      default:
        return;
    }
  }

  window.addEventListener('message', onSandboxMessage);

  function selectView(source: boolean): void {
    if (showSource === source) return;
    showSource = source;
    renderedKey = null;
    renderPanel();
  }
  previewViewBtn.addEventListener('click', () => selectView(false));
  sourceViewBtn.addEventListener('click', () => selectView(true));

  function open(artifactId: string, trigger: HTMLElement | null = null): void {
    const artifact = index.get(artifactId);
    if (!artifact) return;
    selected = artifactId;
    dismissed.delete(artifact.messageId);
    if (trigger) returnFocus = trigger;
    panelEl.hidden = false;
    renderPanel();
    refreshCardStates();
  }

  function close(): void {
    if (panelEl.hidden && selected === null) return;
    const artifact = selected ? index.get(selected) : undefined;
    if (artifact) dismissed.add(artifact.messageId);
    const hadFocus = panelEl.contains(document.activeElement);
    selected = null;
    renderedKey = null;
    teardownFrame();
    panelEl.hidden = true;
    panelBody.replaceChildren();
    refreshCardStates();
    const focusTarget = returnFocus;
    returnFocus = null;
    if (focusTarget?.isConnected && hadFocus) focusTarget.focus();
  }

  function autoOpen(msg: SidePanelChatMessage, view: MessageArtifactView): void {
    if (!msg.streaming || dismissed.has(msg.id)) return;
    const target = view.creating ?? view.artifacts[view.artifacts.length - 1];
    if (!target) return;
    const followsThisReply =
      !panelEl.hidden && selected !== null && index.get(selected)?.messageId === msg.id;
    if (autoOpened.has(msg.id) && !followsThisReply) return;
    autoOpened.add(msg.id);
    if (selected === target.id && !panelEl.hidden) return;
    selected = target.id;
    panelEl.hidden = false;
    renderPanel();
    refreshCardStates();
  }

  function renderOutputs(): void {
    const outputs = conversationOutputs(messagesSnapshot, viewFor);
    outputsEl.hidden = outputs.length === 0;
    outputsCount.textContent = String(outputs.length);
    popoverCount.textContent = String(outputs.length);
    outputsTrigger.setAttribute('aria-label', t('spOutputsButtonLabel', [String(outputs.length)]));
    if (outputs.length === 0) closePopover(false);
    if (popover.hidden) {
      renderedOutputs = null;
      return;
    }
    const signature = outputs.map((output) => output.key).join('\n');
    if (signature === renderedOutputs) return;
    renderedOutputs = signature;
    const fragment = document.createDocumentFragment();
    for (const output of outputs) fragment.appendChild(buildOutputRow(output));
    outputsList.replaceChildren(fragment);
  }

  function buildOutputRow(output: ArtifactOutput): HTMLElement {
    const row = el('li', { class: 'sp-output' });
    const icon = el('span', { class: 'sp-output__icon', 'aria-hidden': 'true' });
    const name = output.kind === 'artifact' ? output.artifact.title : output.file.name;
    const meta =
      output.kind === 'artifact'
        ? t('spArtifactCardMeta', [formatLabel(output.artifact)])
        : fileMetaLabel(output.file);
    icon.appendChild(
      renderIcon(
        output.kind === 'artifact'
          ? artifactIcon(output.artifact)
          : output.file.mimeType.startsWith('image/')
            ? FileImage
            : FileText,
        16,
      ),
    );
    row.appendChild(icon);
    const label = (tag: 'button' | 'div'): HTMLElement => {
      const node =
        tag === 'button'
          ? el('button', { class: 'sp-output__open', type: 'button' })
          : el('div', { class: 'sp-output__label' });
      node.appendChild(el('span', { class: 'sp-artifact-card__name', title: name }, name));
      node.appendChild(el('span', { class: 'sp-artifact-card__meta' }, meta));
      return node;
    };
    const fileUrl = output.kind === 'file' ? deps.fileAccess.resolveUrl(output.file.uri) : null;
    if (output.kind === 'artifact' || fileUrl) {
      const openBtn = label('button');
      openBtn.setAttribute('aria-label', t('spAnswerFileOpen', [name]));
      openBtn.addEventListener('click', () => {
        closePopover(false);
        if (output.kind === 'artifact') open(output.artifact.id, outputsTrigger);
        else if (fileUrl) deps.fileAccess.openUrl(fileUrl);
      });
      row.appendChild(openBtn);
      const download = iconButton(Download);
      download.setAttribute('aria-label', t('spAnswerFileDownload', [name]));
      download.title = t('spAnswerFileDownload', [name]);
      download.addEventListener('click', () => {
        if (output.kind === 'artifact') {
          downloadArtifact(output.artifact, outputsStatus);
          return;
        }
        if (!fileUrl) return;
        download.disabled = true;
        outputsStatus.textContent = t('spAnswerFileDownloading', [name]);
        saveAnswerFile(fileUrl, name, deps.fileAccess)
          .then(() => {
            outputsStatus.textContent = '';
          })
          .catch(() => {
            outputsStatus.textContent = t('spAnswerFileDownloadFailed', [name]);
          })
          .finally(() => {
            download.disabled = false;
          });
      });
      row.appendChild(download);
    } else {
      row.appendChild(label('div'));
    }
    return row;
  }

  const onOutsidePointer = (event: Event): void => {
    const target = event.target as Node | null;
    if (target && outputsEl.contains(target)) return;
    closePopover(false);
  };

  function openPopover(): void {
    popover.hidden = false;
    outputsTrigger.setAttribute('aria-expanded', 'true');
    outputsStatus.textContent = '';
    renderOutputs();
    document.addEventListener('pointerdown', onOutsidePointer, true);
    popover.querySelector<HTMLElement>('button')?.focus();
  }

  function closePopover(returnFocusToTrigger: boolean): void {
    if (popover.hidden) return;
    popover.hidden = true;
    renderedOutputs = null;
    outputsTrigger.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutsidePointer, true);
    if (returnFocusToTrigger) outputsTrigger.focus();
  }

  outputsTrigger.addEventListener('click', (event) => {
    event.stopPropagation();
    if (popover.hidden) openPopover();
    else closePopover(false);
  });
  popover.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    closePopover(true);
  });
  popover.addEventListener('focusout', (event: FocusEvent) => {
    const next = event.relatedTarget as Node | null;
    if (next && !outputsEl.contains(next)) closePopover(false);
  });

  panelEl.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close();
  });
  closeBtn.addEventListener('click', close);
  copyBtn.addEventListener('click', () => {
    const artifact = selected ? index.get(selected) : undefined;
    if (!artifact || artifact.streaming) return;
    deps
      .writeClipboard(artifact.content)
      .then(() => {
        panelStatus.textContent = t('spArtifactCopied');
      })
      .catch(() => {
        panelStatus.textContent = t('spArtifactCopyFailed');
      });
  });
  downloadBtn.addEventListener('click', () => {
    const artifact = selected ? index.get(selected) : undefined;
    if (artifact && !artifact.streaming) downloadArtifact(artifact, panelStatus);
  });
  webBtn.addEventListener('click', () => {
    const url = deps.webConversationUrl();
    if (url) deps.openUrl(url);
  });

  function sync(messages: readonly SidePanelChatMessage[]): void {
    messagesSnapshot = messages;
    const liveIds = new Set<string>();
    index.clear();
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue;
      liveIds.add(msg.id);
      const view = viewFor(msg);
      for (const artifact of view.artifacts) index.set(artifact.id, artifact);
      if (view.creating) index.set(view.creating.id, view.creating);
    }
    for (const id of views.keys()) if (!liveIds.has(id)) views.delete(id);
    const last = messages[messages.length - 1];
    if (last && last.role === 'assistant') autoOpen(last, viewFor(last));
    if (selected !== null && !index.has(selected)) {
      close();
    } else if (selected !== null) {
      renderPanel();
    }
    refreshCardStates();
    renderOutputs();
  }

  return {
    panelEl,
    outputsEl,
    viewFor,
    buildCards,
    updateCards,
    sync,
    open,
    close,
    selectedId: () => selected,
  };
}
