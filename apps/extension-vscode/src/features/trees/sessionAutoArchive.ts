import * as vscode from 'vscode';
import { whenInUse } from '../../core/startupWork';
import { Config } from '../../platform/config';
import { t } from '../../l10n';
import { readSessionGroups } from '../surfaces/sessionGroups';
import { UNREAD_SESSIONS_KEY } from '../surfaces/sessionRows';
import type { ConversationTreeProvider } from './conversationTreeProvider';
import { SHOW_ARCHIVED_SESSIONS_COMMAND } from './sessionPickers';

const DAY_MS = 24 * 60 * 60_000;
const SWEEP_INTERVAL_MS = 60 * 60_000;
const INITIAL_DELAY_MS = 2_000;

export function registerSessionAutoArchive(
  storage: vscode.Memento,
  provider: ConversationTreeProvider,
  isOpen: (id: string) => boolean,
): vscode.Disposable {
  let disposed = false;
  let inUse = false;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function enabledDays(): number {
    return vscode.workspace.isTrusted && !vscode.env.remoteName
      ? Config.archiveInactiveSessionsDays()
      : 0;
  }

  function schedule(delay: number): void {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (disposed || !inUse || enabledDays() === 0) return;
    timer = setTimeout(() => void sweep(), delay);
  }

  async function sweep(): Promise<void> {
    const days = enabledDays();
    if (disposed || days === 0 || running) return;
    running = true;
    const allowed = () => !disposed && enabledDays() === days;
    const protectedSession = (id: string) =>
      isOpen(id) ||
      storage.get<string[]>(UNREAD_SESSIONS_KEY, []).includes(id) ||
      readSessionGroups(storage).assignments.some(({ sessionId }) => sessionId === id);
    try {
      const archived = await provider.archiveInactiveSessions(
        new Date(Date.now() - days * DAY_MS),
        allowed,
        protectedSession,
      );
      if (archived > 0 && !disposed) {
        const open = t('archived.title');
        void vscode.window
          .showInformationMessage(
            archived === 1
              ? 'Archived 1 inactive session.'
              : `Archived ${archived} inactive sessions.`,
            open,
          )
          .then((choice) => {
            if (choice === open)
              void vscode.commands.executeCommand(SHOW_ARCHIVED_SESSIONS_COMMAND);
          });
      }
    } catch (error) {
      console.warn('Could not check for inactive AGI sessions.', error);
    } finally {
      running = false;
      schedule(enabledDays() === days ? SWEEP_INTERVAL_MS : INITIAL_DELAY_MS);
    }
  }

  whenInUse(() => {
    inUse = true;
    schedule(INITIAL_DELAY_MS);
  });
  const configuration = vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('agiWorkforce.archiveInactiveSessionsDays')) {
      schedule(INITIAL_DELAY_MS);
    }
  });
  return new vscode.Disposable(() => {
    disposed = true;
    if (timer !== undefined) clearTimeout(timer);
    configuration.dispose();
  });
}
