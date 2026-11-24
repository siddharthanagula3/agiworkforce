import * as vscode from 'vscode';
import type { ThreadSummary } from '@agiworkforce/types';
import { t } from '../../l10n';
import {
  type ConversationTreeProvider,
  type SessionListingFailure,
  type SessionSearchHit,
} from './conversationTreeProvider';
import { formatSessionAge } from '../surfaces/sessionRows';
import { isCloudThread } from './cloudSessions';

export const SHOW_ARCHIVED_SESSIONS_COMMAND = 'agi-workforce.showArchivedSessions';

const SEARCH_DEBOUNCE_MS = 250;
const MIN_SEARCH_LENGTH = 2;

interface SessionPickItem extends vscode.QuickPickItem {
  threadId?: string;
  archived?: true;
}

interface ArchivedPickItem extends vscode.QuickPickItem {
  thread: ThreadSummary;
}

function reportFailures(failures: readonly SessionListingFailure[]): void {
  for (const failure of failures) {
    void vscode.window.showWarningMessage(
      t('sessionSearch.folderFailed', { folder: failure.folderName, reason: failure.reason }),
    );
  }
}

function sessionItem(thread: ThreadSummary): SessionPickItem {
  const cloud = isCloudThread(thread);
  const updated = formatSessionAge(Date.parse(thread.updatedAt), Date.now());
  return {
    label: `$(${cloud ? 'cloud' : thread.pinned ? 'pinned' : 'comment'}) ${thread.title}`,
    description: cloud
      ? `${t('conversationTree.cloudLabel')} · ${updated}`
      : thread.pinned
        ? `${t('webview.sessionPinned')} · ${updated}`
        : updated,
    detail: [thread.model, thread.cwd].filter((part) => part !== undefined).join(' · '),
    threadId: thread.id,
  };
}

function searchItem(hit: SessionSearchHit): SessionPickItem {
  const [first] = hit.matches;
  return {
    label: `$(search) ${hit.thread.title}`,
    description: formatSessionAge(Date.parse(hit.thread.updatedAt), Date.now()),
    ...(first === undefined ? {} : { detail: first.snippet }),
    alwaysShow: true,
    threadId: hit.thread.id,
  };
}

export async function showSessionsHistory(provider: ConversationTreeProvider): Promise<void> {
  const { items: threads, failures } = await provider.listThreads();
  reportFailures(failures);
  const archivedEntry: SessionPickItem = {
    label: `$(archive) ${t('archived.title')}`,
    alwaysShow: true,
    archived: true,
  };
  const listed = threads.map(sessionItem);
  const pick = vscode.window.createQuickPick<SessionPickItem>();
  pick.title = t('sessionSearch.title');
  pick.placeholder = t('sessionSearch.placeholder');
  pick.matchOnDescription = true;
  pick.matchOnDetail = true;
  pick.items = [...listed, archivedEntry];
  let searchSeq = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  pick.onDidChangeValue((value) => {
    if (timer !== undefined) clearTimeout(timer);
    const query = value.trim();
    const seq = ++searchSeq;
    if (query.length < MIN_SEARCH_LENGTH) {
      pick.busy = false;
      pick.items = [...listed, archivedEntry];
      return;
    }
    timer = setTimeout(() => {
      pick.busy = true;
      void provider.searchThreads(query).then(({ items: hits, failures }) => {
        if (seq !== searchSeq) return;
        pick.busy = false;
        reportFailures(failures);
        const found = new Set(hits.map((hit) => hit.thread.id));
        pick.items = [
          ...hits.map(searchItem),
          ...listed.filter((item) => item.threadId === undefined || !found.has(item.threadId)),
          archivedEntry,
        ];
      });
    }, SEARCH_DEBOUNCE_MS);
  });

  const chosen = await new Promise<SessionPickItem | undefined>((resolve) => {
    pick.onDidAccept(() => {
      resolve(pick.selectedItems[0]);
      pick.hide();
    });
    pick.onDidHide(() => {
      resolve(undefined);
      pick.dispose();
    });
    pick.show();
  });
  if (timer !== undefined) clearTimeout(timer);
  if (chosen?.archived === true) {
    await vscode.commands.executeCommand(SHOW_ARCHIVED_SESSIONS_COMMAND);
    return;
  }
  if (chosen?.threadId !== undefined) {
    await vscode.commands.executeCommand('agi-workforce.openConversation', chosen.threadId);
  }
}

async function confirmPermanentDelete(thread: ThreadSummary): Promise<boolean> {
  const remove = t('archived.delete');
  const choice = await vscode.window.showWarningMessage(
    t('archived.deleteTitle', { title: thread.title }),
    { modal: true, detail: t('archived.deleteDetail') },
    remove,
  );
  return choice === remove;
}

export async function showArchivedSessions(provider: ConversationTreeProvider): Promise<void> {
  const { items: threads, failures } = await provider.getArchivedThreads();
  reportFailures(failures);
  if (threads.length === 0) {
    if (failures.length === 0) await vscode.window.showInformationMessage(t('archived.none'));
    return;
  }
  const restoreButton: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon('history'),
    tooltip: t('archived.restore'),
  };
  const restoreAllButton: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon('history'),
    tooltip: t('archived.restoreAll'),
  };
  const deleteButton: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon('trash'),
    tooltip: t('archived.delete'),
  };
  const pick = vscode.window.createQuickPick<ArchivedPickItem>();
  const complete = failures.length === 0;
  pick.title = t('archived.title');
  pick.placeholder = t('archived.placeholder');
  pick.canSelectMany = true;
  pick.keepScrollPosition = true;
  pick.matchOnDescription = true;
  pick.matchOnDetail = true;
  pick.items = threads.map((thread) => ({
    label: thread.title,
    description: formatSessionAge(Date.parse(thread.updatedAt), Date.now()),
    ...(thread.cwd === undefined ? {} : { detail: thread.cwd }),
    buttons: [restoreButton, deleteButton],
    thread,
  }));
  pick.buttons = complete && pick.items.length > 1 ? [restoreAllButton] : [];
  let visible = true;

  const drop = (ids: ReadonlySet<string>): void => {
    if (!visible) return;
    const keepSelected = pick.selectedItems.filter((item) => !ids.has(item.thread.id));
    pick.items = pick.items.filter((item) => !ids.has(item.thread.id));
    pick.selectedItems = keepSelected;
    pick.buttons = complete && pick.items.length > 1 ? [restoreAllButton] : [];
    if (pick.items.length === 0) pick.hide();
  };

  const perform = async (action: () => Promise<void>): Promise<void> => {
    if (!visible || pick.busy) return;
    pick.busy = true;
    pick.enabled = false;
    try {
      await action();
    } catch (error) {
      await vscode.window.showErrorMessage(
        t('archived.actionFailed', {
          reason: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      if (visible) {
        pick.busy = false;
        pick.enabled = true;
      }
    }
  };

  const restore = async (thread: ThreadSummary, open: boolean): Promise<void> => {
    try {
      if (!(await provider.restoreThread(thread.id))) {
        await vscode.window.showWarningMessage(t('archived.notFound'));
        return;
      }
    } catch (error) {
      await vscode.window.showErrorMessage(
        t('archived.actionFailed', {
          reason: error instanceof Error ? error.message : String(error),
        }),
      );
      return;
    }
    const wasVisible = visible;
    drop(new Set([thread.id]));
    if (open) {
      if (wasVisible) {
        if (visible) pick.hide();
        await vscode.commands.executeCommand('agi-workforce.openConversation', thread.id);
      }
      return;
    }
    const openLabel = t('archived.open');
    const choice = await vscode.window.showInformationMessage(
      t('archived.restored', { title: thread.title }),
      openLabel,
    );
    if (choice === openLabel) {
      await vscode.commands.executeCommand('agi-workforce.openConversation', thread.id);
    }
  };

  const restoreMany = async (items: readonly ArchivedPickItem[]): Promise<void> => {
    const ids = new Set(items.map(({ thread }) => thread.id));
    const restored = new Set<string>();
    let firstFailure: string | undefined;
    for (const id of ids) {
      try {
        if (await provider.restoreThread(id)) restored.add(id);
        else firstFailure ??= t('archived.notFound');
      } catch (error) {
        firstFailure ??= error instanceof Error ? error.message : String(error);
      }
    }
    drop(restored);
    const summary = t('archived.bulkResult', { restored: restored.size, total: ids.size });
    if (restored.size !== ids.size) {
      await vscode.window.showWarningMessage(firstFailure ? `${summary} ${firstFailure}` : summary);
    } else {
      await vscode.window.showInformationMessage(summary);
    }
  };

  const remove = async (thread: ThreadSummary): Promise<void> => {
    if (!(await confirmPermanentDelete(thread))) return;
    try {
      if (!(await provider.deleteThread(thread.id))) {
        await vscode.window.showWarningMessage(t('archived.notFound'));
        return;
      }
    } catch (error) {
      await vscode.window.showErrorMessage(
        t('archived.actionFailed', {
          reason: error instanceof Error ? error.message : String(error),
        }),
      );
      return;
    }
    drop(new Set([thread.id]));
    await vscode.window.showInformationMessage(t('archived.deleted', { title: thread.title }));
  };

  pick.onDidTriggerItemButton(({ item, button }) => {
    if (button === restoreButton) void perform(() => restore(item.thread, false));
    else if (button === deleteButton) void perform(() => remove(item.thread));
  });
  pick.onDidTriggerButton((button) => {
    if (complete && button === restoreAllButton) {
      const listed = [...pick.items];
      void perform(() => restoreMany(listed));
    }
  });
  pick.onDidAccept(() => {
    const selected = [...pick.selectedItems];
    if (selected.length === 1) void perform(() => restore(selected[0]!.thread, true));
    else if (selected.length > 1) void perform(() => restoreMany(selected));
  });
  pick.onDidHide(() => {
    visible = false;
    pick.dispose();
  });
  pick.show();
}
