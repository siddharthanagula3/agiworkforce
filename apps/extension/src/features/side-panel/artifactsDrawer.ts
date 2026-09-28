import { spreadsheetSafeExport } from '@agiworkforce/unified-chat/tabular';
import { openClerkSignIn } from '../cloud-bridge/clerkAuth';
import {
  chromeArtifactConversationUrl,
  listChromeArtifacts,
  readChromeArtifactSource,
  type ChromeArtifact,
  type ChromeArtifactSource,
} from '../cloud-bridge/artifactsClient';
import { t } from '../../i18n';
import { el } from './dom';
import { buildHelpArticleLink } from './helpLinks';

export const ARTIFACTS_DRAWER_CSS = `
  .sp-drawer-artifacts-help {
    font-size: var(--type-caption-size);
    color: var(--agi-ext-text-muted);
    line-height: var(--type-caption-height);
    margin-bottom: 8px;
  }
  .sp-drawer-artifacts-list { list-style: none; display: flex; flex-direction: column; gap: 5px; }
  .sp-drawer-artifact {
    background: var(--agi-ext-surface);
    border: 1px solid var(--agi-ext-border);
    border-radius: var(--corner-control);
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .sp-drawer-artifact-title {
    font-size: var(--type-caption-size);
    color: var(--agi-ext-text);
    line-height: var(--type-caption-height);
    overflow-wrap: anywhere;
  }
  .sp-drawer-artifact-meta { font-size: var(--type-caption-size); color: var(--agi-ext-text-muted); }
  .sp-drawer-artifact-actions { display: flex; gap: 6px; flex-wrap: wrap; }
  .sp-drawer-artifact-btn {
    background: none;
    border: 1px solid var(--agi-ext-border);
    border-radius: var(--corner-control);
    color: var(--agi-ext-text-muted);
    font-size: var(--type-label-size);
    padding: 3px 8px;
    cursor: pointer;
    transition: color var(--duration-instant), border-color var(--duration-instant);
  }
  .sp-drawer-artifact-btn:hover {
    color: var(--agi-ext-accent-text);
    border-color: var(--agi-ext-accent);
  }
  .sp-drawer-artifact-btn:disabled { cursor: wait; opacity: 0.55; }
  .sp-drawer-artifacts-empty,
  .sp-drawer-artifacts-status {
    font-size: var(--type-caption-size);
    color: var(--agi-ext-text-muted);
    line-height: var(--type-caption-height);
    padding: 4px 0;
  }
  .sp-drawer-artifacts-empty[hidden],
  .sp-drawer-artifacts-status[hidden] { display: none; }
  .sp-drawer-artifacts-status-action {
    margin-left: 6px;
    padding: 0;
    font: inherit;
    color: var(--agi-ext-accent-text);
    background: none;
    border: none;
    text-decoration: underline;
    cursor: pointer;
  }
  .sp-drawer-artifacts-status-action:disabled { cursor: wait; opacity: 0.55; }
`;

export interface ArtifactsDrawerDependencies {
  listArtifacts: typeof listChromeArtifacts;
  readSource: typeof readChromeArtifactSource;
  signIn: typeof openClerkSignIn;
  openUrl: (url: string) => void;
  writeClipboard: (text: string) => Promise<void>;
  saveFile: (name: string, blob: Blob) => void;
}

export interface ArtifactsDrawerAPI {
  sectionEl: HTMLElement;
  refresh(): Promise<void>;
}

const DEFAULT_DEPENDENCIES: ArtifactsDrawerDependencies = {
  listArtifacts: listChromeArtifacts,
  readSource: readChromeArtifactSource,
  signIn: openClerkSignIn,
  openUrl: (url) => {
    void chrome.tabs.create({ url });
  },
  writeClipboard: (text) => navigator.clipboard.writeText(text),
  saveFile: (name, blob) => {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = el('a', { href: objectUrl, download: name });
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  },
};

function sourceDownload(source: ChromeArtifactSource): { name: string; blob: Blob } {
  const extension = source.language || 'txt';
  const exported = spreadsheetSafeExport(source.content, extension);
  return {
    name: `${source.title || 'artifact'}.${extension}`,
    blob: new Blob([exported.body], { type: exported.mimeType }),
  };
}

function describeArtifact(artifact: ChromeArtifact): string {
  const created = new Date(artifact.createdAt);
  const when = Number.isNaN(created.getTime()) ? '' : created.toLocaleDateString();
  return [artifact.language ?? artifact.type, when].filter(Boolean).join(' · ');
}

export function buildArtifactsDrawerSection(
  dependencies: Partial<ArtifactsDrawerDependencies> = {},
): ArtifactsDrawerAPI {
  const deps: ArtifactsDrawerDependencies = { ...DEFAULT_DEPENDENCIES, ...dependencies };

  const sectionEl = el('div', { class: 'sp-drawer-section', id: 'sp-drawer-artifacts-section' });
  sectionEl.appendChild(el('h3', { class: 'sp-drawer-section-title' }, t('spArtifactsTitle')));
  sectionEl.appendChild(buildHelpArticleLink('artifacts', t('spHelpLinkArtifacts')));
  sectionEl.appendChild(el('p', { class: 'sp-drawer-artifacts-help' }, t('spArtifactsHelp')));

  const listEl = el('ul', {
    class: 'sp-drawer-artifacts-list',
    id: 'sp-drawer-artifacts-list',
    'aria-label': t('spArtifactsTitle'),
  });
  const emptyEl = el(
    'div',
    { class: 'sp-drawer-artifacts-empty', hidden: '' },
    t('spArtifactsEmpty'),
  );
  const statusEl = el('div', {
    class: 'sp-drawer-artifacts-status',
    role: 'status',
    'aria-live': 'polite',
    hidden: '',
  });
  sectionEl.appendChild(listEl);
  sectionEl.appendChild(emptyEl);
  sectionEl.appendChild(statusEl);

  let artifacts: ChromeArtifact[] = [];
  let listed = false;
  let inFlight: AbortController | null = null;

  function setStatus(message: string): void {
    statusEl.replaceChildren(document.createTextNode(message));
    statusEl.hidden = message.length === 0;
  }

  function setActionableStatus(
    message: string,
    label: string,
    busyLabel: string,
    run: () => Promise<void>,
  ): void {
    setStatus(message);
    const action = el(
      'button',
      { type: 'button', class: 'sp-drawer-artifacts-status-action' },
      label,
    );
    action.addEventListener('click', () => {
      action.disabled = true;
      action.textContent = busyLabel;
      void run().finally(() => {
        action.disabled = false;
        action.textContent = label;
      });
    });
    statusEl.appendChild(action);
  }

  function reportFailure(result: { code: string; message: string }): void {
    if (result.code === 'auth_required') {
      setActionableStatus(result.message, t('spArtifactsSignIn'), t('spArtifactsSigningIn'), () =>
        deps.signIn().catch((error: unknown) => {
          setStatus(error instanceof Error ? error.message : result.message);
        }),
      );
      return;
    }
    setActionableStatus(result.message, t('spArtifactsRetry'), t('spArtifactsLoading'), () =>
      refresh(),
    );
  }

  function buildRow(artifact: ChromeArtifact): HTMLElement {
    const item = el('li', { class: 'sp-drawer-artifact' });
    item.appendChild(
      el('div', { class: 'sp-drawer-artifact-title' }, artifact.title ?? t('spArtifactsUntitled')),
    );
    item.appendChild(el('div', { class: 'sp-drawer-artifact-meta' }, describeArtifact(artifact)));

    const actions = el('div', { class: 'sp-drawer-artifact-actions' });
    const openBtn = el(
      'button',
      { type: 'button', class: 'sp-drawer-artifact-btn' },
      t('spArtifactsOpen'),
    );
    openBtn.addEventListener('click', () => {
      deps.openUrl(chromeArtifactConversationUrl(artifact.conversationId));
    });
    actions.appendChild(openBtn);

    const copyBtn = el(
      'button',
      { type: 'button', class: 'sp-drawer-artifact-btn' },
      t('spArtifactsCopy'),
    );
    copyBtn.addEventListener('click', () => {
      copyBtn.disabled = true;
      copyBtn.textContent = t('spArtifactsCopying');
      void deps
        .readSource({
          artifactId: artifact.id,
          conversationId: artifact.conversationId,
          messageId: artifact.messageId,
        })
        .then(async (result) => {
          if (result.status === 'error') {
            reportFailure(result);
            return;
          }
          await deps.writeClipboard(result.content);
          setStatus(t('spArtifactsCopied'));
        })
        .catch(() => setStatus(t('spArtifactsCopyFailed')))
        .finally(() => {
          copyBtn.disabled = false;
          copyBtn.textContent = t('spArtifactsCopy');
        });
    });
    actions.appendChild(copyBtn);

    const downloadBtn = el(
      'button',
      { type: 'button', class: 'sp-drawer-artifact-btn' },
      t('spArtifactsDownload'),
    );
    downloadBtn.addEventListener('click', () => {
      downloadBtn.disabled = true;
      void deps
        .readSource({
          artifactId: artifact.id,
          conversationId: artifact.conversationId,
          messageId: artifact.messageId,
        })
        .then((result) => {
          if (result.status === 'error') {
            reportFailure(result);
            return;
          }
          const { name, blob } = sourceDownload(result);
          deps.saveFile(name, blob);
          setStatus(t('spArtifactsDownloaded', [name]));
        })
        .catch(() => setStatus(t('spArtifactsDownloadFailed')))
        .finally(() => {
          downloadBtn.disabled = false;
        });
    });
    actions.appendChild(downloadBtn);
    item.appendChild(actions);
    return item;
  }

  function render(): void {
    const fragment = document.createDocumentFragment();
    for (const artifact of artifacts) fragment.appendChild(buildRow(artifact));
    listEl.replaceChildren(fragment);
    emptyEl.hidden = !listed || artifacts.length > 0 || !statusEl.hidden;
  }

  async function refresh(): Promise<void> {
    inFlight?.abort();
    const controller = new AbortController();
    inFlight = controller;
    setStatus(t('spArtifactsLoading'));
    const result = await deps.listArtifacts({ signal: controller.signal });
    if (controller.signal.aborted) return;
    if (result.status === 'error') {
      if (result.code === 'cancelled') return;
      // Signed out means there is nothing to list. Any other failure means this
      // device could not ask, so what it already read stays on screen.
      if (result.code === 'auth_required') {
        artifacts = [];
        listed = true;
      }
      reportFailure(result);
      render();
      return;
    }
    artifacts = result.artifacts;
    listed = true;
    setStatus('');
    render();
  }

  render();

  return { sectionEl, refresh };
}
