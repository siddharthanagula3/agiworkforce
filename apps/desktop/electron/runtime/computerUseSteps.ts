import { dialog, type BrowserWindow } from 'electron';
import {
  COMPUTER_USE_STOP_SHORTCUT,
  MAX_DEVICE_REVIEW_LENGTH,
  describeAccelerator,
  type ComputerUseStatus,
  type DeviceFrontWindow,
  type PermissionScope,
} from '@agiworkforce/local-runtime-contract';
import { TOOL_APPROVAL_ACTION_LABELS } from '@agiworkforce/types';
import { ComputerUseRefused, readFrontWindow } from './computerUseService';
import {
  askUserDuringRun,
  computerUsePhase,
  computerUseStatus,
  confirmScreenStepStillWanted,
  handBackComputerUse,
  withoutInputWatch,
} from './computerUseSession';
import { consumeSingleUse, getPermissionState, requestPermission } from './permissionManager';

type StepArgs = Record<string, unknown>;

const GLOBAL_SCOPE: PermissionScope = { kind: 'global' };

const CLIPBOARD_KEYS: ReadonlySet<string> = new Set(['c', 'x', 'v']);

const CLIPBOARD_KEY_REASON =
  'AGI wants to copy or paste with the keyboard while it uses your computer. Pasting puts whatever your clipboard holds into the app on screen, where AGI can read it, and copying replaces what your clipboard holds.';

const CLIPBOARD_REFUSED =
  'The user has not allowed clipboard access, so copying and pasting with the keyboard is off. Type the text instead, or ask the user to allow clipboard access.';

function keyStep(command: string, args: StepArgs): { key: string; modifiers: unknown[] } | null {
  if (command !== 'computer_key') return null;
  return {
    key: typeof args['key'] === 'string' ? args['key'].toLowerCase() : '',
    modifiers: Array.isArray(args['modifiers']) ? args['modifiers'] : [],
  };
}

function pressesStopKey(command: string, args: StepArgs): boolean {
  const step = keyStep(command, args);
  return (
    step !== null &&
    step.key === COMPUTER_USE_STOP_SHORTCUT.toLowerCase() &&
    step.modifiers.length === 0
  );
}

function pressesClipboardKeys(command: string, args: StepArgs): boolean {
  const step = keyStep(command, args);
  return step !== null && CLIPBOARD_KEYS.has(step.key) && step.modifiers.includes('command');
}

async function gateClipboardKeys(
  window: BrowserWindow | null,
  command: string,
  args: StepArgs,
): Promise<void> {
  if (!pressesClipboardKeys(command, args)) return;
  const state =
    getPermissionState('clipboard.read', GLOBAL_SCOPE) === 'prompt'
      ? await askUserDuringRun(window, () =>
          requestPermission(window, 'clipboard.read', GLOBAL_SCOPE, CLIPBOARD_KEY_REASON),
        )
      : getPermissionState('clipboard.read', GLOBAL_SCOPE);
  await confirmScreenStepStillWanted(command);
  if (state !== 'granted') throw new ComputerUseRefused('permission', CLIPBOARD_REFUSED);
  consumeSingleUse('clipboard.read', GLOBAL_SCOPE);
}

async function reviewReason(command: string, args: StepArgs): Promise<string | null> {
  const declared = typeof args['review'] === 'string' ? args['review'].trim() : '';
  if (declared !== '') return declared.slice(0, MAX_DEVICE_REVIEW_LENGTH);
  if (command !== 'computer_type') return null;
  const reading = await readFrontWindow().catch(() => null);
  if (!reading?.secureInput) return null;
  return `Type into a password field in ${reading.front?.app ?? 'the app in front'}`;
}

async function reviewScreenStep(
  window: BrowserWindow | null,
  command: string,
  args: StepArgs,
): Promise<void> {
  const reason = await reviewReason(command, args);
  if (reason === null) return;
  const options = {
    type: 'warning' as const,
    buttons: [TOOL_APPROVAL_ACTION_LABELS.deny, `${TOOL_APPROVAL_ACTION_LABELS.allow} once`],
    defaultId: 0,
    cancelId: 0,
    title: 'Check this step',
    message: `AGI wants to: ${reason}`,
    detail:
      'AGI is using your computer and stopped to check with you first. This step runs only if you allow it.',
    noLink: true,
  };
  const result = await askUserDuringRun(window, () =>
    window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options),
  );
  await confirmScreenStepStillWanted(command);
  if (result.response !== 1) {
    throw new ComputerUseRefused(
      'paused',
      `The user did not allow this step (${reason}), so it did not run. Ask them how they want to go on.`,
    );
  }
}

async function frontAfterStep(): Promise<DeviceFrontWindow | null> {
  try {
    return (await readFrontWindow()).front;
  } catch {
    return null;
  }
}

export async function runScreenAction(
  window: BrowserWindow | null,
  command: string,
  args: StepArgs,
  action: () => Promise<unknown>,
): Promise<{ front: DeviceFrontWindow | null }> {
  await reviewScreenStep(window, command, args);
  await gateClipboardKeys(window, command, args);
  try {
    await withoutInputWatch(action, { releaseStopShortcut: pressesStopKey(command, args) });
  } catch (error) {
    await confirmScreenStepStillWanted(command);
    throw error;
  }
  return { front: await frontAfterStep() };
}

export async function confirmHandBack(window: BrowserWindow | null): Promise<ComputerUseStatus> {
  if (computerUsePhase() !== 'paused') return computerUseStatus();
  const options = {
    type: 'question' as const,
    buttons: ['Keep control', 'Hand back'],
    defaultId: 1,
    cancelId: 0,
    title: 'Hand the screen back?',
    message: 'Let AGI carry on using your computer?',
    detail: `It takes a fresh look at the screen first, then carries on from where it paused. Press ${describeAccelerator(COMPUTER_USE_STOP_SHORTCUT, process.platform)} at any time to stop it.`,
    noLink: true,
  };
  const result = window
    ? await dialog.showMessageBox(window, options)
    : await dialog.showMessageBox(options);
  return result.response === 1 ? handBackComputerUse() : computerUseStatus();
}
