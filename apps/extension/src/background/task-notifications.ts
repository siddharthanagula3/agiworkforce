import { t } from '../i18n';

export type TaskNotificationKind = 'finished' | 'failed' | 'needs-input';

export interface TaskNotificationTarget<Owner> {
  conversationId: string;
  owner: Owner;
}

export interface TaskNotifierDependencies<Owner> {
  isEnabled(): Promise<boolean>;
  isUserLooking(): Promise<boolean>;
  show(title: string, message: string, conversationId?: string, owner?: Owner): void;
}

function copy(kind: TaskNotificationKind): { title: string; message: string } {
  switch (kind) {
    case 'finished':
      return { title: t('notifyTaskFinishedTitle'), message: t('notifyTaskFinishedBody') };
    case 'failed':
      return { title: t('notifyTaskFailedTitle'), message: t('notifyTaskFailedBody') };
    case 'needs-input':
      return { title: t('notifyTaskInputTitle'), message: t('notifyTaskInputBody') };
  }
}

export function createTaskNotifier<Owner>(dependencies: TaskNotifierDependencies<Owner>) {
  return async function notifyTaskActivity(
    kind: TaskNotificationKind,
    target?: TaskNotificationTarget<Owner>,
  ): Promise<boolean> {
    if (!(await dependencies.isEnabled())) return false;
    if (await dependencies.isUserLooking()) return false;
    const { title, message } = copy(kind);
    dependencies.show(title, message, target?.conversationId, target?.owner);
    return true;
  };
}

export async function isSidePanelInFocus(
  api: {
    windows: Pick<typeof chrome.windows, 'getLastFocused'>;
    runtime: Pick<typeof chrome.runtime, 'getContexts'>;
  } = chrome,
): Promise<boolean> {
  try {
    const [focused, panels] = await Promise.all([
      api.windows.getLastFocused(),
      api.runtime.getContexts({ contextTypes: ['SIDE_PANEL' as chrome.runtime.ContextType] }),
    ]);
    return focused.focused === true && panels.length > 0;
  } catch {
    return false;
  }
}
