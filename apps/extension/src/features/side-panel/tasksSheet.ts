import { managedCloudAgentRunPath, type CloudAgentRun } from '@agiworkforce/cloud-contracts';
import { agentTaskStateLabel } from '@agiworkforce/types';
import { isLiveTaskState, runWorkState } from '@agiworkforce/unified-chat/task-display';
import { X, renderIcon } from '../../assets/icons';
import type {
  ChromeManagedRunCancellationResult,
  ChromeManagedRunListResult,
} from '../cloud-bridge/managedRunControl';
import type { ManagedCloudAgentRunReference } from '@agiworkforce/cloud-contracts';
import { t } from '../../i18n';
import { el } from './dom';
import { wireSheetKeyboard } from './sheet';

const TASKS_PAGE_SIZE = 20;

export interface TasksSheetDependencies {
  listRuns: (limit: number) => Promise<ChromeManagedRunListResult>;
  cancelRun: (run: ManagedCloudAgentRunReference) => Promise<ChromeManagedRunCancellationResult>;
  openWeb: (path: string) => void;
  formatTime: (iso: string) => string;
}

export interface TasksSheet {
  element: HTMLElement;
  open: (trigger: HTMLElement) => void;
  close: () => void;
}

function runTitle(run: CloudAgentRun): string {
  return run.conversationTitle?.trim() || run.conversationPreview?.trim() || t('spTasksUntitled');
}

export function buildTasksSheet(dependencies: TasksSheetDependencies): TasksSheet {
  const sheet = el('div', {
    id: 'sp-tasks',
    class: 'sp-sheet',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'sp-tasks-title',
  });
  sheet.hidden = true;
  const header = el('div', { class: 'sp-sheet-header' });
  header.appendChild(
    el('h2', { id: 'sp-tasks-title', class: 'sp-sheet-title' }, t('spTasksTitle')),
  );
  const close = el('button', { class: 'sp-sheet-close', type: 'button' });
  close.setAttribute('aria-label', t('spTasksClose'));
  close.appendChild(renderIcon(X, 14));
  header.appendChild(close);
  sheet.appendChild(header);
  sheet.appendChild(el('p', { class: 'sp-sheet-intro' }, t('spTasksIntro')));
  const status = el('div', { class: 'sp-memory-status', role: 'status', 'aria-live': 'polite' });
  sheet.appendChild(status);
  const list = el('ul', { class: 'sp-memory-list', 'aria-label': t('spTasksTitle') });
  sheet.appendChild(list);
  const all = el('button', { type: 'button', class: 'sp-memory-manage' }, t('spTasksAllOnWeb'));
  all.addEventListener('click', () => dependencies.openWeb('/tasks?from=chrome-extension'));
  sheet.appendChild(all);

  let returnFocus: HTMLElement | null = null;
  let generation = 0;

  function renderRun(run: CloudAgentRun): HTMLElement {
    const item = el('li', { class: 'sp-memory-item sp-task-item' });
    item.appendChild(el('p', { class: 'sp-memory-text' }, runTitle(run)));
    const state = runWorkState(run);
    item.appendChild(
      el(
        'span',
        { class: 'sp-memory-source' },
        `${agentTaskStateLabel(state)} · ${dependencies.formatTime(run.updatedAt)}`,
      ),
    );
    const actions = el('div', { class: 'sp-memory-actions' });
    if (run.conversationId) {
      const open = el('button', { type: 'button' }, t('spTasksOpen'));
      open.setAttribute('aria-label', t('spTasksOpenNamed', [runTitle(run)]));
      open.addEventListener('click', () =>
        dependencies.openWeb(`/chat/${encodeURIComponent(run.conversationId ?? '')}`),
      );
      actions.appendChild(open);
    }
    if (isLiveTaskState(state) && !run.cancellationRequestedAt) {
      const stop = el('button', { type: 'button', class: 'is-danger' }, t('spTasksStop'));
      stop.setAttribute('aria-label', t('spTasksStopNamed', [runTitle(run)]));
      stop.addEventListener('click', () => {
        const confirm = el('div', { class: 'sp-memory-confirm', role: 'alertdialog' });
        confirm.setAttribute('aria-label', t('spTasksStopConfirm'));
        confirm.appendChild(el('p', {}, t('spTasksStopConfirm')));
        const keep = el('button', { type: 'button' }, t('spTasksKeepRunning'));
        const confirmStop = el('button', { type: 'button', class: 'is-danger' }, t('spTasksStop'));
        confirm.append(keep, confirmStop);
        actions.hidden = true;
        item.appendChild(confirm);
        keep.focus();
        keep.addEventListener('click', () => {
          confirm.remove();
          actions.hidden = false;
          stop.focus();
        });
        confirmStop.addEventListener('click', () => {
          confirmStop.disabled = true;
          void dependencies
            .cancelRun({
              runId: run.id,
              runPath: managedCloudAgentRunPath(run.id),
              lastSequence: run.lastEventSequence,
            })
            .then((result) => {
              status.textContent =
                result.status === 'success' ? t('spTasksStopped') : result.message;
              return refresh();
            });
        });
      });
      actions.appendChild(stop);
    }
    item.appendChild(actions);
    return item;
  }

  async function refresh(): Promise<void> {
    const current = ++generation;
    const result = await dependencies.listRuns(TASKS_PAGE_SIZE);
    if (current !== generation) return;
    list.replaceChildren();
    if (result.status !== 'success') {
      status.textContent = result.message;
      return;
    }
    if (result.runs.length === 0) {
      list.appendChild(el('li', { class: 'sp-memory-empty' }, t('spTasksEmpty')));
      return;
    }
    for (const run of result.runs) list.appendChild(renderRun(run));
  }

  function closeSheet(): void {
    if (sheet.hidden) return;
    generation += 1;
    sheet.hidden = true;
    returnFocus?.focus();
    returnFocus = null;
  }
  close.addEventListener('click', closeSheet);
  wireSheetKeyboard(sheet, closeSheet);

  return {
    element: sheet,
    open(trigger) {
      returnFocus = trigger;
      sheet.hidden = false;
      status.textContent = '';
      list.replaceChildren(el('li', { class: 'sp-memory-empty' }, t('spTasksLoading')));
      close.focus();
      void refresh();
    },
    close: closeSheet,
  };
}
