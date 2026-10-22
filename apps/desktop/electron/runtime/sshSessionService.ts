import { type BrowserWindow } from 'electron';
import { type StartedDeveloperSession } from '@agiworkforce/local-runtime-contract';
import { PRODUCT_NAMES } from '@agiworkforce/types';
import {
  validateSshEnvironment,
  admitSshEnvironment,
  requireSshRoot,
  forgetSshEnvironment,
} from './sshEnvironments';
import { askNativeQuestion } from './nativeQuestions';
import { shownValue } from './dialogText';
import {
  listDeveloperSessions,
  startDeveloperSession,
  stopDeveloperRuntime,
} from './developerSessionService';

export async function connectSshSession(
  window: BrowserWindow | null,
  value: unknown,
): Promise<StartedDeveloperSession> {
  const input = validateSshEnvironment(value);
  if (!window || window.isDestroyed())
    throw new Error(`Open an ${PRODUCT_NAMES.desktop} window before connecting over SSH.`);
  const result = await askNativeQuestion(
    window,
    { group: 'ssh-environment', key: JSON.stringify(input), quietAfterCancel: true },
    {
      type: 'warning',
      title: 'Connect this SSH project?',
      message: `${shownValue(input.name, { head: 200, tail: 0 })} on ${shownValue(input.hostAlias, { head: 200, tail: 0 })}`,
      detail: `Project: ${shownValue(input.remotePath, { head: 800, tail: 0 })}\n\nThis uses your SSH configuration to resolve the host and account; trusted SSH config may run local Match commands. The connection requires an existing trusted host key and your SSH agent or configured identity files. It starts the remote AGI CLI, which must already be signed in to the same account. Local account credentials are not sent. Remote project configuration may run programs on that host. File tools and diffs run through the agent; the host file editor, PTY, jump hosts and password prompts are unsupported. Access lasts until disconnect or app exit.`,
      buttons: ['Cancel', 'Connect'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    },
  );
  if (result.response !== 1 || result.notAsked !== undefined || window.isDestroyed())
    throw new Error('The SSH environment was not allowed.');
  const root = await admitSshEnvironment(input);
  try {
    const sessions = await listDeveloperSessions((candidate) => candidate.id === root.id);
    const group = sessions.groups.find((entry) => entry.rootId === root.id);
    if (group?.unavailable) throw new Error(group.unavailable.message);
    const existing = group?.sessions[0];
    return existing
      ? { ...existing }
      : await startDeveloperSession(root.id, undefined, { title: input.name });
  } catch (error) {
    stopDeveloperRuntime(root.id);
    forgetSshEnvironment(root.id);
    throw error;
  }
}
export function disconnectSshSession(id: string): boolean {
  requireSshRoot(id);
  stopDeveloperRuntime(id);
  forgetSshEnvironment(id);
  return true;
}
