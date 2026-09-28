import { dialog, type BrowserWindow } from 'electron';
import {
  MAX_DEVICE_REVIEW_LENGTH,
  type PermissionScope,
} from '@agiworkforce/local-runtime-contract';
import {
  BROWSER_CDP_COMMANDS,
  TOOL_APPROVAL_ACTION_LABELS,
  isBrowserCommand,
} from '@agiworkforce/types';
import {
  consumeSingleUse,
  getPermissionState,
  requestPermission,
} from '../runtime/permissionManager';
import { recordBrowserActivity, sendBrowserCommand, settleBrowserActivity } from './bridgeServer';
import {
  InvalidBrowserArguments,
  planBrowserCommand,
  type BrowserCommandPlan,
} from './commandGate';

const GLOBAL_SCOPE: PermissionScope = { kind: 'global' };

export const ASSISTANT_BROWSER_CLIENT = 'AGI';

const BROWSER_STEP_REASON =
  'AGI wants to use your paired Chrome browser while it answers you: open pages, read them, click and type. Chrome carries out each action only on sites you approved in the extension, and AGI asks before it downloads a file.';

export class BrowserStepRefused extends Error {
  readonly reason: 'permission' | 'cancelled';

  constructor(reason: BrowserStepRefused['reason'], message: string) {
    super(message);
    this.name = 'BrowserStepRefused';
    this.reason = reason;
  }
}

function stepArguments(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function reviewFor(plan: BrowserCommandPlan, review: unknown): string | null {
  const declared = typeof review === 'string' ? review.trim() : '';
  if (declared !== '') return declared.slice(0, MAX_DEVICE_REVIEW_LENGTH);
  if (plan.command === 'browser_download') return `Download ${String(plan.args['url'])}`;
  return null;
}

async function allowedByUser(window: BrowserWindow | null, reason: string): Promise<boolean> {
  const options = {
    type: 'warning' as const,
    buttons: [TOOL_APPROVAL_ACTION_LABELS.deny, `${TOOL_APPROVAL_ACTION_LABELS.allow} once`],
    defaultId: 0,
    cancelId: 0,
    title: 'Check this step',
    message: `AGI wants to: ${reason}`,
    detail:
      'AGI is using your paired browser and stopped to check with you first. This step runs only if you allow it.',
    noLink: true,
  };
  const result = window
    ? await dialog.showMessageBox(window, options)
    : await dialog.showMessageBox(options);
  return result.response === 1;
}

export async function runBrowserStep(
  window: BrowserWindow | null,
  args: Record<string, unknown>,
): Promise<unknown> {
  const command = args['command'];
  if (!isBrowserCommand(command) || BROWSER_CDP_COMMANDS.includes(command)) {
    throw new InvalidBrowserArguments('That is not a browser step the assistant can take.');
  }
  const plan = planBrowserCommand(command, stepArguments(args['args']));
  const state =
    getPermissionState(plan.capability, GLOBAL_SCOPE) === 'prompt'
      ? await requestPermission(window, plan.capability, GLOBAL_SCOPE, BROWSER_STEP_REASON)
      : getPermissionState(plan.capability, GLOBAL_SCOPE);
  if (state !== 'granted') {
    throw new BrowserStepRefused(
      'permission',
      'The user has not allowed AGI to use the paired browser, so the step did not run.',
    );
  }
  const review = reviewFor(plan, args['review']);
  if (review !== null && !(await allowedByUser(window, review))) {
    throw new BrowserStepRefused(
      'cancelled',
      `The user did not allow this step (${review}), so it did not run. Ask them how they want to go on.`,
    );
  }
  const activity = recordBrowserActivity(ASSISTANT_BROWSER_CLIENT, plan.command, plan.args);
  try {
    const value = await sendBrowserCommand(plan.command, plan.args);
    settleBrowserActivity(activity, null);
    consumeSingleUse(plan.capability, GLOBAL_SCOPE);
    return value;
  } catch (error) {
    settleBrowserActivity(
      activity,
      error instanceof Error ? error.message : 'The browser did not answer.',
    );
    throw error;
  }
}
