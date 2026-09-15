import { openClerkSignIn } from '../cloud-bridge/clerkAuth';
import {
  chromeArtifactConversationUrl,
  listChromeArtifacts,
  readChromeArtifactSource,
  type ChromeArtifact,
} from '../cloud-bridge/artifactsClient';
import { t } from '../../i18n';
import { el } from './dom';

export const ARTIFACTS_DRAWER_CSS = `
  .sp-drawer-artifacts-help {
    font-size: 12px;
    color: var(--agi-ext-text-muted);
    line-height: 1.5;
    margin-bottom: 8px;
  }
  .sp-drawer-artifacts-list { list-style: none; display: flex; flex-direction: column; gap: 5px; }
  .sp-drawer-artifact {
    background: var(--agi-ext-surface);
    border: 1px solid var(--agi-ext-border);
    border-radius: 6px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .sp-drawer-artifact-title {
    font-size: 12px;
    color: var(--agi-ext-text);
    line-height: 1.4;
    overflow-wrap: anywhere;
  }
  .sp-drawer-artifact-meta { font-size: 12px; color: var(--agi-ext-text-muted); }
  .sp-drawer-artifact-actions { display: flex; gap: 6px; flex-wrap: wrap; }
  .sp-drawer-artifact-btn {
    background: none;
    border: 1px solid var(--agi-ext-border);
    border-radius: 5px;
    color: var(--agi-ext-text-muted);
    font-size: 12px;
    padding: 3px 8px;
    cursor: pointer;
    transition: color 0.12s, border-color 0.12s;
  }
  .sp-drawer-artifact-btn:hover {
    color: var(--agi-ext-accent);
    border-color: var(--agi-ext-accent);
  }
  .sp-drawer-artifact-btn:disabled { cursor: wait; opacity: 0.55; }
  .sp-drawer-artifacts-empty,
  .sp-drawer-artifacts-status {
    font-size: 12px;
    color: var(--agi-ext-text-muted);
    line-height: 1.5;
    padding: 4px 0;
  }
  .sp-drawer-artifacts-empty[hidden],
  .sp-drawer-artifacts-status[hidden] { display: none; }
  .sp-drawer-artifacts-status-action {
    margin-left: 6px;
    padding: 0;
    font: inherit;
    color: var(--agi-ext-accent);
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
};

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
  sectionEl.appendChild(el('div', { class: 'sp-drawer-section-title' }, t('spArtifactsTitle')));
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
        .readSource({ conversationId: artifact.conversationId, messageId: artifact.messageId })
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
