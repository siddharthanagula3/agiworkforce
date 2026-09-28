import type { BrowserWindow } from 'electron';
import type { PermissionScope, PermissionState } from '@agiworkforce/local-runtime-contract';
import {
  ComputerUseRefused,
  applicationAt,
  applicationInFront,
  type ScreenApplication,
} from './computerUseService';
import { askUserDuringRun, confirmScreenStepStillWanted } from './computerUseSession';
import { getPermissionState, requestPermission } from './permissionManager';

type StepArgs = Record<string, unknown>;

const SHELL_APPS: ReadonlySet<string> = new Set([
  'com.apple.Terminal',
  'com.googlecode.iterm2',
  'dev.warp.Warp-Stable',
  'com.mitchellh.ghostty',
  'net.kovidgoyal.kitty',
  'org.alacritty',
  'com.github.wez.wezterm',
  'co.zeit.hyper',
  'com.microsoft.VSCode',
  'com.microsoft.VSCodeInsiders',
  'com.todesktop.230313mzl4w4u92',
  'com.exafunction.windsurf',
  'dev.zed.Zed',
  'com.apple.dt.Xcode',
  'com.sublimetext.4',
]);

const SHELL_APP_PREFIXES: readonly string[] = ['com.jetbrains.'];

const FILE_MANAGER = 'com.apple.finder';
const SYSTEM_SETTINGS = 'com.apple.systempreferences';

const OWN_WINDOW_REFUSED =
  "That spot is on AGI Cloud's own window, which AGI does not control. Take a new screenshot and work in the app you mean.";

const OWN_FRONT_REFUSED =
  'AGI Cloud is in front, so typing would land in its own window. Click the app you want to type in first.';

const KEYBOARD_STEPS: ReadonlySet<string> = new Set(['computer_type', 'computer_key']);

function isShellApp(bundleId: string): boolean {
  return (
    SHELL_APPS.has(bundleId) || SHELL_APP_PREFIXES.some((prefix) => bundleId.startsWith(prefix))
  );
}

function reachWarning(app: ScreenApplication): string | null {
  if (!app.bundleId) return null;
  if (isShellApp(app.bundleId)) {
    return `${app.name} runs commands, so controlling it is the same as letting AGI run any command on this computer.`;
  }
  if (app.bundleId === FILE_MANAGER) {
    return 'Finder can open, move and delete any file you can, so controlling it reaches every file on this computer.';
  }
  if (app.bundleId === SYSTEM_SETTINGS) {
    return 'System Settings changes how this computer is set up, including its privacy and security settings.';
  }
  return null;
}

function promptReason(app: ScreenApplication): string {
  const base = `While it uses your computer, AGI can click, type and scroll in ${app.name}. It asks again before it touches any other app.`;
  const warning = reachWarning(app);
  return warning ? `${base}\n\n${warning}` : base;
}

function refusal(app: ScreenApplication): string {
  return `The user has not allowed AGI to control ${app.name}, so this step did not run. Work in an app they have allowed, or ask them to allow ${app.name}.`;
}

function scopeFor(app: ScreenApplication): PermissionScope {
  return { kind: 'application', target: app.bundleId ?? app.name };
}

function coordinate(args: StepArgs, key: string): number {
  const value = args[key];
  return typeof value === 'number' ? value : Number.NaN;
}

async function targetsOf(
  command: string,
  args: StepArgs,
): Promise<Array<ScreenApplication | null>> {
  switch (command) {
    case 'computer_click':
    case 'computer_scroll':
      return [await applicationAt(coordinate(args, 'x'), coordinate(args, 'y'))];
    case 'computer_drag':
      return [
        await applicationAt(coordinate(args, 'x'), coordinate(args, 'y')),
        await applicationAt(coordinate(args, 'toX'), coordinate(args, 'toY')),
      ];
    case 'computer_type':
    case 'computer_key':
      return [await applicationInFront()];
    default:
      return [];
  }
}

async function answerFor(
  window: BrowserWindow | null,
  app: ScreenApplication,
  scope: PermissionScope,
): Promise<PermissionState> {
  const state = getPermissionState('application.control', scope);
  if (state !== 'prompt') return state;
  return askUserDuringRun(window, () =>
    requestPermission(window, 'application.control', scope, promptReason(app), {
      objectPhrase: `control ${app.name}`,
      targetLabel: app.name,
      offerNeverAllow: true,
    }),
  );
}

export async function gateApplications(
  window: BrowserWindow | null,
  command: string,
  args: StepArgs,
): Promise<void> {
  const asked = new Set<string>();
  for (const app of await targetsOf(command, args)) {
    if (!app) continue;
    if (app.pid === process.pid) {
      throw new ComputerUseRefused(
        'failed',
        KEYBOARD_STEPS.has(command) ? OWN_FRONT_REFUSED : OWN_WINDOW_REFUSED,
      );
    }
    const scope = scopeFor(app);
    const key = scope.target ?? app.name;
    if (asked.has(key)) continue;
    asked.add(key);
    const state = await answerFor(window, app, scope);
    await confirmScreenStepStillWanted(command);
    if (state !== 'granted') throw new ComputerUseRefused('permission', refusal(app));
  }
}
