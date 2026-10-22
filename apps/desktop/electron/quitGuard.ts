import type { RemoteControlState } from '@agiworkforce/local-runtime-contract';
import { PRODUCT_NAMES } from '@agiworkforce/types';

export interface LiveWork {
  shellRuns: number;
  agentTurns: number;
  remoteControl: Pick<RemoteControlState, 'status' | 'phoneName'>;
}

export interface GuardPrompt {
  type: 'warning';
  title: string;
  message: string;
  detail: string;
  buttons: string[];
  defaultId: 0;
  cancelId: 0;
  noLink: true;
}

export const GUARD_CONFIRM_INDEX = 1;

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function remoteControlLive(work: LiveWork): boolean {
  return work.remoteControl.status === 'connected' || work.remoteControl.status === 'waiting';
}

export function liveWorkLines(work: LiveWork): string[] {
  const lines: string[] = [];
  if (work.agentTurns > 0) {
    lines.push(
      `${plural(work.agentTurns, 'coding agent turn', 'coding agent turns')} still running`,
    );
  }
  if (work.shellRuns > 0) {
    lines.push(`${plural(work.shellRuns, 'local command', 'local commands')} still running`);
  }
  if (remoteControlLive(work)) {
    lines.push(
      work.remoteControl.status === 'connected'
        ? `Remote Control with ${work.remoteControl.phoneName ?? 'your phone'}`
        : 'Remote Control waiting for a phone to pair',
    );
  }
  return lines;
}

/**
 * The question asked before quitting with work in flight, or null when nothing
 * would stop. Cancel is the default and the escape answer, so a reflexive
 * Return keeps everything running.
 */
export function quitPrompt(work: LiveWork): GuardPrompt | null {
  const lines = liveWorkLines(work);
  if (lines.length === 0) return null;
  return {
    type: 'warning',
    title: `Quit ${PRODUCT_NAMES.desktop}?`,
    message: 'Quitting stops the work running on this computer.',
    detail: `${lines.map((line) => `• ${line}`).join('\n')}\n\nAn agent turn stops where it is and has to be asked again. Commands are ended without finishing. Your phone loses its connection until you start Remote Control again.`,
    buttons: ['Cancel', 'Quit and Stop All'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  };
}

/**
 * The question asked before the tray's Stop All. Only agent work stops here;
 * Remote Control and the app keep running.
 */
export function stopAgentsPrompt(work: LiveWork): GuardPrompt | null {
  const lines = liveWorkLines({
    ...work,
    shellRuns: 0,
    remoteControl: { status: 'idle', phoneName: null },
  });
  if (lines.length === 0) return null;
  return {
    type: 'warning',
    title: 'Stop all agents?',
    message: 'This stops every agent working on this computer.',
    detail: `${lines.map((line) => `• ${line}`).join('\n')}\n\nA stopped turn keeps what it already did but does not finish; ask again to continue. Screen control also returns to you, and stays yours until you choose Hand Back Screen Control in the File menu or the menu bar icon.`,
    buttons: ['Cancel', 'Stop All'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  };
}

/**
 * The question asked before a folder, or the permission to run the agent in
 * it, is withdrawn while something is still running there. Null when nothing
 * is, so withdrawing from an idle folder asks nothing.
 */
export function withdrawFolderPrompt(
  folder: string,
  work: Pick<LiveWork, 'shellRuns' | 'agentTurns'>,
): GuardPrompt | null {
  const lines = liveWorkLines({ ...work, remoteControl: { status: 'idle', phoneName: null } });
  if (lines.length === 0) return null;
  return {
    type: 'warning',
    title: 'Stop the work in this folder?',
    message: `Withdrawing this stops what is running in ${folder}.`,
    detail: `${lines.map((line) => `• ${line}`).join('\n')}\n\nAn agent turn stops where it is and has to be asked again. Commands are ended without finishing. Nothing they already changed is undone, and the next command or coding session in this folder asks for permission first.`,
    buttons: ['Cancel', 'Withdraw and Stop'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  };
}

export function revokeComputerUsePrompt(): GuardPrompt {
  return {
    type: 'warning',
    title: 'Stop computer use and revoke access?',
    message: 'Agents lose control of this screen until you allow it again.',
    detail: `Anything an agent is doing with the mouse or keyboard stops now. The next time an agent needs the screen, ${PRODUCT_NAMES.desktop} asks you first, as it did the first time.`,
    buttons: ['Cancel', 'Stop and Revoke'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  };
}
