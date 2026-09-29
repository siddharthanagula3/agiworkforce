import type { BrowserWindow } from 'electron';
import {
  MAX_DEVICE_REVIEW_LENGTH,
  type PermissionScope,
} from '@agiworkforce/local-runtime-contract';
import {
  BROWSER_CDP_COMMANDS,
  TOOL_APPROVAL_ACTION_LABELS,
  isBrowserCommand,
  type BrowserCommand,
} from '@agiworkforce/types';
import { webDomainAllowed, type WebDomainRules } from '@agiworkforce/cloud-contracts';
import {
  consumeSingleUse,
  getPermissionState,
  requestPermission,
} from '../runtime/permissionManager';
import { recordBrowserActivity, sendBrowserCommand, settleBrowserActivity } from './bridgeServer';
import { showDevicePrompt } from '../runtime/devicePrompts';
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
  readonly reason: 'permission' | 'cancelled' | 'site';

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
  if (BROWSER_CDP_COMMANDS.includes(plan.command)) return plan.summary.replace(/\?$/, '');
  return null;
}

function siteRulesFrom(value: unknown): WebDomainRules | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const list = (entry: unknown) =>
    Array.isArray(entry) ? entry.filter((item): item is string => typeof item === 'string') : [];
  const rules = { allow: list(record['allow']), deny: list(record['deny']) };
  return rules.allow.length > 0 || rules.deny.length > 0 ? rules : null;
}

/** Commands after which the tab may be on a page the step did not name. */
const LANDING_COMMANDS: ReadonlySet<BrowserCommand> = new Set([
  'browser_navigate',
  'browser_click',
  'browser_type',
  'browser_fill_form',
  'browser_download',
]);

async function activeTabAddress(): Promise<string | null> {
  const tabs = await sendBrowserCommand('browser_list_tabs', {});
  if (!Array.isArray(tabs)) return null;
  const active = tabs.find(
    (tab) => tab && typeof tab === 'object' && (tab as { active?: unknown }).active === true,
  ) as { url?: unknown } | undefined;
  return typeof active?.url === 'string' ? active.url : null;
}

/** The page the command's tab is on, as the extension reported it with the result. */
function reportedAddress(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as { tabUrl?: unknown; url?: unknown };
  if (typeof record.tabUrl === 'string') return record.tabUrl;
  return null;
}

/**
 * The workspace's website rules, applied again to every result: the extension
 * checks before and after acting, and this is the desktop's own check of the
 * address it reported. A result from a blocked page is withheld, a tab that
 * moved onto one goes back, and an address nobody could read is refused under
 * an allow list.
 */
async function refuseBlockedLanding(
  command: BrowserCommand,
  value: unknown,
  rules: WebDomainRules | null,
): Promise<void> {
  if (!rules || command === 'browser_list_tabs') return;
  const landed = reportedAddress(value) ?? (await activeTabAddress().catch(() => null));
  const allowed = landed === null ? rules.allow.length === 0 : webDomainAllowed(rules, landed);
  if (allowed) return;
  if (LANDING_COMMANDS.has(command)) {
    await sendBrowserCommand('browser_history', { direction: 'back' }).catch(() => undefined);
  }
  throw new BrowserStepRefused(
    'site',
    landed === null
      ? 'The address of the page could not be read, so under your workspace website rules nothing from it was used.'
      : `The page is on ${landed}, a site your workspace administrator does not allow, so nothing from it was read.`,
  );
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
  const result = await showDevicePrompt(window, options);
  return result.response === 1;
}

export async function runBrowserStep(
  window: BrowserWindow | null,
  args: Record<string, unknown>,
): Promise<unknown> {
  const command = args['command'];
  if (!isBrowserCommand(command)) {
    throw new InvalidBrowserArguments('That is not a browser step the assistant can take.');
  }
  const plan = planBrowserCommand(command, stepArguments(args['args']));
  const siteRules = siteRulesFrom(args['siteRules']);
  const target = plan.args['url'];
  if (siteRules && typeof target === 'string' && !webDomainAllowed(siteRules, target)) {
    throw new BrowserStepRefused(
      'site',
      `Your workspace administrator does not allow the assistant to open ${target}, so the step did not run.`,
    );
  }
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
  let value: unknown;
  try {
    value = await sendBrowserCommand(
      plan.command,
      plan.args,
      siteRules ? { allow: [...siteRules.allow], deny: [...siteRules.deny] } : undefined,
    );
    settleBrowserActivity(activity, null);
    consumeSingleUse(plan.capability, GLOBAL_SCOPE);
  } catch (error) {
    settleBrowserActivity(
      activity,
      error instanceof Error ? error.message : 'The browser did not answer.',
    );
    throw error;
  }
  await refuseBlockedLanding(plan.command, value, siteRules);
  return value;
}
