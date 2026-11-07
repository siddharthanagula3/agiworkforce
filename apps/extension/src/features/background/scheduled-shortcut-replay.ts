import { evaluateSitePolicy, type SitePolicyInput } from '@agiworkforce/types';
import type {
  ExtensionMessage,
  ExtensionResponse,
  SavedShortcut,
  ScheduledTask,
} from '../../types';
import { validateShortcutActions } from '../../background/policy';
import { validateShortcutReplayTarget } from '../shortcuts/origin';
import { planShortcutReplay } from './shortcuts';
import { scheduledSourceAuthority } from './scheduled-task-source-authority';

export class ScheduledShortcutReplayDeferredError extends Error {}
export class ScheduledShortcutReplayCancelledError extends Error {}

export interface ScheduledShortcutReplayDependencies {
  isCurrent: () => boolean;
  loadShortcuts: () => Promise<SavedShortcut[]>;
  queryActiveTab: () => Promise<{ id?: number } | undefined>;
  getTab: (tabId: number) => Promise<{ url?: string }>;
  loadPolicy: () => Promise<SitePolicyInput | null>;
  liveGrantedOrigins: () => readonly string[];
  /** Must invoke the actual send synchronously, without asynchronous preparation. */
  forward: (tabId: number, message: ExtensionMessage) => Promise<ExtensionResponse>;
}

/** Local schedules replay one observed recording, never a replacement cloud prompt. */
export async function replayScheduledShortcut(
  task: Pick<ScheduledTask, 'id' | 'shortcutId' | 'createdByOrigin'>,
  dependencies: ScheduledShortcutReplayDependencies,
): Promise<ExtensionResponse> {
  const assertCurrent = (): void => {
    if (!dependencies.isCurrent()) throw new ScheduledShortcutReplayCancelledError();
  };
  const read = async <T>(operation: () => Promise<T>): Promise<T> => {
    assertCurrent();
    let value: T;
    try {
      value = await operation();
    } catch {
      assertCurrent();
      throw new ScheduledShortcutReplayDeferredError(
        'Scheduled replay authority could not be read.',
      );
    }
    assertCurrent();
    return value;
  };
  const taskOrigin = task.createdByOrigin;
  const shortcutId = task.shortcutId;
  const shortcuts = await read(dependencies.loadShortcuts);
  let shortcut: SavedShortcut | undefined;
  try {
    // Own this snapshot so later store replacement cannot change authorized actions/provenance.
    const candidate = shortcuts.find((entry) => entry.id === shortcutId);
    shortcut = candidate ? structuredClone(candidate) : undefined;
  } catch {
    throw new ScheduledShortcutReplayDeferredError('The scheduled recording is unreadable.');
  }
  if (!shortcut) return { success: false, error: 'Shortcut not found' } as ExtensionResponse;
  if (
    !Array.isArray(shortcut.actions) ||
    shortcut.actions.length === 0 ||
    planShortcutReplay(shortcut).kind !== 'actions' ||
    !validateShortcutActions(shortcut.actions)
  ) {
    return {
      success: false,
      error: 'The scheduled shortcut is no longer a valid recording.',
    } as ExtensionResponse;
  }

  const selected = await read(dependencies.queryActiveTab);
  const tabId = selected?.id;
  if (tabId === undefined) return { success: false, error: 'No active tab' } as ExtensionResponse;
  const tab = await read(() => dependencies.getTab(tabId));
  const targetUrl = tab.url;
  const target = validateShortcutReplayTarget(shortcut, targetUrl);
  if (!target.ok) return { success: false, error: target.error } as ExtensionResponse;

  const storedPolicy = await read(dependencies.loadPolicy);
  if (!storedPolicy || storedPolicy.admin === 'unavailable') {
    throw new ScheduledShortcutReplayDeferredError(
      'Scheduled replay policy is temporarily unavailable.',
    );
  }
  const policy = {
    ...storedPolicy,
    userAllowlist: [...storedPolicy.userAllowlist, ...dependencies.liveGrantedOrigins()],
  };
  const source = scheduledSourceAuthority([taskOrigin, shortcut.createdByOrigin], policy);
  if (source === 'unavailable') {
    throw new ScheduledShortcutReplayDeferredError('Scheduled replay provenance is unreadable.');
  }
  // The target is mandatory even when both creators have legacy/extension exemptions.
  if (source === 'denied' || !evaluateSitePolicy(policy, targetUrl!, 'automation').allowed) {
    return {
      success: false,
      error: 'The scheduled recording or target site is no longer approved.',
    } as ExtensionResponse;
  }
  const message = {
    type: 'RUN_PAGE_ACTIONS',
    tabId,
    taskId: `replay_${Date.now()}`,
    actions: shortcut.actions,
  } as ExtensionMessage;
  // forwardToContentScript calls tabs.sendMessage before its first await.
  // This is a tab/URL snapshot, not an atomic document-navigation binding.
  assertCurrent();
  const result = await dependencies.forward(tabId, message);
  assertCurrent();
  return result;
}
