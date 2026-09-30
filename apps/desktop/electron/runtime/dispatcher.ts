import os from 'node:os';
import { app, dialog, shell, type BrowserWindow } from 'electron';
import {
  BROWSER_SIGN_IN_START,
  DESKTOP_RUNTIME_EVENT_CHANNEL,
  DISPATCH_TASK_REPORT,
  DISPATCH_TASK_RUNNER_READY,
  LOCAL_INFERENCE_COMMANDS,
  LocalInferenceRefused,
  ShellCommandRefused,
  evaluateShellPolicy,
  assertLocalTurnCarriesNoAttachments,
  isBackgroundWorkKind,
  isDesktopCapability,
  isSystemPermissionKind,
  isWorkspaceRootKind,
  runtimeFailure,
  runtimeSuccess,
  type DesktopCapability,
  type DesktopPermissionsReview,
  type DesktopRuntimeErrorCode,
  type DesktopRuntimeResponse,
  type LocalChatMessage,
  type LocalChatStopReason,
  type LocalModelSettings,
  type LocalModelSnapshot,
  type PermissionScope,
  type PermissionScopeKind,
  type ShellPolicy,
  type WorkspaceRoot,
  type WorkspaceSnapshot,
} from '@agiworkforce/local-runtime-contract';
import {
  BROWSER_STEP_COMMAND,
  DEVICE_REGISTRY_PROFILE_COMMAND,
  type DeviceRegistryProfile,
  DEVICE_STEP_TOOLS,
  MAX_DEVICE_REVIEW_LENGTH,
  deviceStepCapability,
  deviceStepCommand,
  deviceStepScope,
  type DesktopHostDeclaration,
  type DeviceKeyModifier,
  type DeviceMouseButton,
  type DeviceStepRegion,
  type DeveloperAgentMode,
  normalizeDeveloperAgentMode,
} from '@agiworkforce/local-runtime-contract';
import {
  CLOUD_CODE_TURN_STEP_BOUNDS,
  isBrowserCommand,
  isCloudCodeTurnStepBound,
} from '@agiworkforce/types';
import {
  BrowserBridgeError,
  installHostForPairedExtension,
  listBrowserActivity,
  pairingState,
  recordBrowserActivity,
  removeHostAndPairing,
  sendBrowserCommand,
  settleBrowserActivity,
} from '../browser/bridgeServer';
import { BrowserStepRefused, runBrowserStep } from '../browser/browserSteps';
import {
  InvalidBrowserArguments,
  planBrowserCommand,
  type BrowserCommandPlan,
} from '../browser/commandGate';
import { openInEditor, openWithDefaultApplication, revealInFileManager } from './appsService';
import { WORKSPACE_PICKER_COPY, grantPickedRoot } from './workspacePicker';
import {
  ComputerUseRefused,
  captureRegion,
  captureScreen,
  clickPointer,
  computerUseAvailability,
  dragPointer,
  movePointer,
  pressKey,
  screenChangesSeen,
  scrollPointer,
  typeText,
  waitFor,
} from './computerUseService';
import {
  computerUseEnabled,
  computerUseStatus,
  enterScreenStep,
  finishComputerUse,
  refuseScreenStepEarly,
  setComputerUseEnabled,
  stopComputerUse,
  takeOverComputerUse,
} from './computerUseSession';
import { confirmHandBack, runScreenAction } from './computerUseSteps';
import { startBrowserSignIn } from '../browserSignIn';
import { showDevicePrompt } from './devicePrompts';
import { readBackgroundActivity, stopBackgroundWork } from './backgroundActivity';
import { openSystemPermission } from './systemPermissions';
import {
  computerUseLoopMessage,
  createComputerUseLoopDetector,
  stepSignature,
} from './computerUseLoop';
import { deviceIdentity } from './deviceIdentity';
import { RemoteControlRefused } from '@agiworkforce/utils/remote-control';
import {
  remoteControlAvailable,
  remoteControlState,
  reportDispatchTask,
  setDispatchTaskRunner,
  startRemoteControl,
  stopRemoteControl,
} from '../remote/remoteControlService';
import {
  cancelLocalChat,
  listLocalModels,
  listLocalServers,
  runLocalChat,
} from './localInferenceService';
import { readLocalModelSettings, writeLocalModelSettings } from './localModelSettingsStore';
import { recordDesktopEvent } from './desktopTelemetryService';
import type { DesktopTelemetryEvent } from './desktopTelemetry';
import { readClipboard } from './clipboardService';
import {
  cancelShellRun,
  readBackgroundCommand,
  runShellCommand,
  startBackgroundCommand,
  stopBackgroundCommand,
  type ShellApprovalRequest,
  type ShellInputApprovalRequest,
} from './shellService';
import { detectShellSandbox, type ShellSandbox } from './shellSandbox';
import { readShellPolicy, writeShellPolicy } from './shellPolicyStore';
import {
  TextEditRefused,
  createDirectory,
  editTextFile,
  globFiles,
  grepFiles,
  listDirectory,
  readBinaryFile,
  readTextFile,
  statPath,
  writeTextFile,
} from './filesystemService';
import {
  discardWorkingTreeChanges,
  listLocalBranches,
  pushLocalBranch,
  readWorkingTreeChanges,
  readWorkspaceGit,
  switchLocalBranch,
} from './gitService';
import {
  DeveloperRuntimeUnavailableError,
  addDeveloperMemory,
  answerDeveloperApproval,
  interruptDeveloperTurn,
  listDeveloperPlugins,
  listDeveloperSessions,
  listDeveloperSkills,
  readDeveloperModels,
  readDeveloperRuntimeStatus,
  readDeveloperSession,
  resumeDeveloperSession,
  setDeveloperPluginEnabled,
  setDeveloperSkillConsent,
  setDeveloperSkillEnabled,
  startDeveloperSession,
  startDeveloperTurn,
  stopDeveloperRuntime,
  syncDeveloperAccounts,
} from './developerSessionService';
import { reportShellIdentity } from '../shellIdentity';
import { readShellLayout, writeShellLayout } from '../shellWindowStore';
import { PathRefused } from './pathGuard';
import {
  consumeSingleUse,
  getPermissionState,
  requestPermission,
  reviewPermissions,
  revokePermission,
  revokeScope,
} from './permissionManager';
import {
  findContainingRoot,
  getRoot,
  listRoots,
  revokeRoot,
  setRootGit,
  touchRoot,
  WorkspaceGrantRefused,
} from './workspaceStore';

type Args = Record<string, unknown>;

function requireString(args: Args, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new InvalidArguments(`"${key}" must be a non-empty string.`);
  }
  return value;
}

function optionalNumber(args: Args, key: string): number | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InvalidArguments(`"${key}" must be a number.`);
  }
  return value;
}

function requirePolicy(args: Args): ShellPolicy {
  const value = args['policy'];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InvalidArguments('"policy" must be an object with allow and deny lists.');
  }
  const candidate = value as Partial<ShellPolicy>;
  const list = (entries: unknown, name: string): string[] => {
    if (!Array.isArray(entries) || entries.some((entry) => typeof entry !== 'string')) {
      throw new InvalidArguments(`"policy.${name}" must be a list of program names.`);
    }
    return entries as string[];
  };
  return { allow: list(candidate.allow, 'allow'), deny: list(candidate.deny, 'deny') };
}

function optionalString(args: Args, key: string, fallback: string): string {
  const value = args[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string') {
    throw new InvalidArguments(`"${key}" must be a string.`);
  }
  return value;
}

const MAX_DISCARD_PATHS = 500;

function requirePathList(args: Args, key: string): string[] {
  const value = args[key];
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_DISCARD_PATHS ||
    value.some((entry) => typeof entry !== 'string' || entry.length === 0 || entry.includes('\0'))
  ) {
    throw new InvalidArguments(`"${key}" must list between 1 and ${MAX_DISCARD_PATHS} paths.`);
  }
  return value as string[];
}

function requireBoolean(args: Args, key: string): boolean {
  const value = args[key];
  if (typeof value !== 'boolean') throw new InvalidArguments(`"${key}" must be true or false.`);
  return value;
}

function rendererAgentMode(raw: string): DeveloperAgentMode | null {
  if (raw === '') return null;
  const mode = normalizeDeveloperAgentMode(raw);
  if (mode === null || mode === 'bypass') {
    throw new InvalidArguments('"agentMode" must be plan, ask or auto.');
  }
  return mode;
}

function requireNumber(args: Args, key: string): number {
  const value = args[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InvalidArguments(`"${key}" must be a number.`);
  }
  return Math.round(value);
}

function optionalNumberOr(args: Args, key: string, fallback: number): number {
  const value = args[key];
  if (value === undefined || value === null) return fallback;
  return requireNumber(args, key);
}

function requireMouseButton(args: Args): DeviceMouseButton {
  const value = args['button'];
  if (value === undefined || value === null) return 'left';
  if (value !== 'left' && value !== 'right') {
    throw new InvalidArguments('"button" must be left or right.');
  }
  return value;
}

function requireModifiers(args: Args): DeviceKeyModifier[] {
  const value = args['modifiers'];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new InvalidArguments('"modifiers" must be a list.');
  return value.map((entry) => {
    if (entry !== 'command' && entry !== 'control' && entry !== 'option' && entry !== 'shift') {
      throw new InvalidArguments('"modifiers" must be command, control, option or shift.');
    }
    return entry;
  });
}

function requireRegion(args: Args): DeviceStepRegion {
  const value = args['region'];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InvalidArguments('"region" must be an object with x, y, width and height.');
  }
  return requireRegionFields(value as Args);
}

const PERMISSION_SCOPE_KINDS: readonly PermissionScopeKind[] = [
  'workspace',
  'application',
  'site',
  'global',
];

function requireScope(args: Args): PermissionScope {
  const value = args['scope'];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InvalidArguments('"scope" must be an object with a kind.');
  }
  const kind = (value as Args)['kind'];
  const target = (value as Args)['target'];
  if (!PERMISSION_SCOPE_KINDS.includes(kind as PermissionScopeKind)) {
    throw new InvalidArguments('"scope.kind" must be workspace, application, site or global.');
  }
  if (target !== undefined && target !== null && typeof target !== 'string') {
    throw new InvalidArguments('"scope.target" must be a string.');
  }
  return typeof target === 'string' && target.length > 0
    ? { kind: kind as PermissionScopeKind, target }
    : { kind: kind as PermissionScopeKind };
}

function requireRegionFields(region: Args): DeviceStepRegion {
  return {
    x: requireNumber(region, 'x'),
    y: requireNumber(region, 'y'),
    width: requireNumber(region, 'width'),
    height: requireNumber(region, 'height'),
  };
}

class InvalidArguments extends Error {}

/**
 * Every step that drives the screen, taken from the contract rather than listed
 * here, so a step added later is gated the day it exists. One gate is what
 * makes "the user took the screen back" and "this is going in circles" true of
 * all of them rather than of the ones somebody remembered.
 */
export const SCREEN_STEP_COMMANDS: ReadonlySet<string> = new Set(
  DEVICE_STEP_TOOLS.filter((tool) => deviceStepScope(tool) === 'screen').map(deviceStepCommand),
);

const screenLoop = createComputerUseLoopDetector();
let screenChangesAtLastStep = 0;

export function resetScreenStepGate(): void {
  screenLoop.reset();
  screenChangesAtLastStep = screenChangesSeen();
}

async function guardScreenStep(
  window: BrowserWindow | null,
  command: string,
  args: Args,
): Promise<void> {
  await enterScreenStep(window, command);
  if (command === 'computer_screenshot' || command === 'computer_zoom') return;
  // A screenshot that showed the screen moving means the steps so far did
  // something, so the same step again is progress and not a loop.
  if (screenChangesSeen() !== screenChangesAtLastStep) resetScreenStepGate();
  const verdict = screenLoop.observe(stepSignature(command, args));
  if (verdict === 'ok') return;
  recordDesktopEvent({ domain: 'desktop_control', outcome: 'refused', cause: 'cancelled' });
  throw new ComputerUseRefused('paused', computerUseLoopMessage(verdict));
}

/** A local turn that timed out or errored is a failure; a cancelled one is not. */
export function localInferenceOutcome(stopReason: LocalChatStopReason): DesktopTelemetryEvent {
  switch (stopReason) {
    case 'error':
      return { domain: 'local_inference', outcome: 'failed', cause: 'unknown' };
    case 'timeout':
      return { domain: 'local_inference', outcome: 'failed', cause: 'timeout' };
    case 'cancelled':
      return { domain: 'local_inference', outcome: 'refused', cause: 'cancelled' };
    default:
      return { domain: 'local_inference', outcome: 'ok' };
  }
}

/**
 * Opening a window belongs to the process that owns them. It is injected so
 * the dispatcher does not import the shell's entry point, which imports it.
 */
let windowOpener: ((route: string) => boolean) | null = null;

export function configureWindowOpening(open: (route: string) => boolean): void {
  windowOpener = open;
}

function requireLocalMessages(args: Args): LocalChatMessage[] {
  const value = args['messages'];
  if (!Array.isArray(value) || value.length === 0) {
    throw new InvalidArguments('"messages" must be a non-empty list of turns.');
  }
  assertLocalTurnCarriesNoAttachments(value);
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      throw new InvalidArguments('Every message must be an object.');
    }
    const candidate = entry as Partial<LocalChatMessage>;
    if (
      candidate.role !== 'system' &&
      candidate.role !== 'user' &&
      candidate.role !== 'assistant'
    ) {
      throw new InvalidArguments('Every message needs a system, user or assistant role.');
    }
    if (typeof candidate.content !== 'string') {
      throw new InvalidArguments('Every message needs string content.');
    }
    return { role: candidate.role, content: candidate.content };
  });
}

function requireLocalSettings(args: Args): Partial<LocalModelSettings> {
  const value = args['settings'];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InvalidArguments('"settings" must be an object of base URLs.');
  }
  const baseUrls = (value as Partial<LocalModelSettings>).baseUrls;
  if (baseUrls !== undefined && (typeof baseUrls !== 'object' || baseUrls === null)) {
    throw new InvalidArguments('"settings.baseUrls" must be an object.');
  }
  return { ...(baseUrls ? { baseUrls } : {}) } as Partial<LocalModelSettings>;
}

function resolveRoot(args: Args): WorkspaceRoot {
  const rootId = requireString(args, 'rootId');
  const root = getRoot(rootId);
  if (!root) {
    throw new UnknownWorkspace('That workspace is no longer approved. Choose the folder again.');
  }
  return root;
}

class UnknownWorkspace extends Error {}

function workspaceScope(root: WorkspaceRoot): PermissionScope {
  return { kind: 'workspace', target: root.path };
}

/**
 * Every command that touches the disk names the capability it needs. A command
 * absent from this table reaches no service: `dispatch` refuses what it cannot
 * classify.
 */
const CAPABILITY_BY_COMMAND: Record<string, { capability: DesktopCapability; reason: string }> = {
  file_list: { capability: 'filesystem.read', reason: 'The agent wants to browse this folder.' },
  file_stat: { capability: 'filesystem.read', reason: 'The agent wants to inspect a file here.' },
  file_read_text: {
    capability: 'filesystem.read',
    reason: 'The agent wants to read the contents of files in this folder.',
  },
  file_read_bytes: {
    capability: 'filesystem.read',
    reason: 'The agent wants to read a file in this folder so you can attach it.',
  },
  file_glob: { capability: 'filesystem.read', reason: 'The agent wants to search for files here.' },
  file_grep: {
    capability: 'filesystem.read',
    reason: 'The agent wants to search the text of files here.',
  },
  file_write_text: {
    capability: 'filesystem.write',
    reason: 'The agent wants to create or change files in this folder.',
  },
  file_edit_text: {
    capability: 'filesystem.write',
    reason: 'The agent wants to change part of a file in this folder.',
  },
  file_create_directory: {
    capability: 'filesystem.write',
    reason: 'The agent wants to create a folder here.',
  },
  workspace_snapshot: {
    capability: 'filesystem.read',
    reason: 'The agent wants to read this folder and its git state.',
  },
  workspace_reveal: {
    capability: 'filesystem.read',
    reason: 'The agent wants to show this folder in your file manager.',
  },
  shell_run: {
    capability: 'shell.execute',
    reason:
      'Commands you run here start real programs on this Mac, with your account, in this folder.',
  },
  shell_start: {
    capability: 'shell.execute',
    reason:
      'A command started here keeps running on this Mac, with your account, in this folder, until it ends or is stopped.',
  },
  shell_read: {
    capability: 'shell.execute',
    reason: 'The agent wants to read or type into a command it started in this folder.',
  },
  shell_stop: {
    capability: 'shell.execute',
    reason: 'The agent wants to stop a command it started in this folder.',
  },
  app_open_path: {
    capability: 'application.control',
    reason: 'Opening a file here hands it to whichever app your Mac opens that kind of file with.',
  },
  app_open_in_editor: {
    capability: 'application.control',
    reason:
      'Opening this folder in VS Code hands it to that editor, which can run its own tasks and extensions here.',
  },
  app_reveal_path: {
    capability: 'filesystem.read',
    reason: 'The agent wants to show a file from this folder in your file manager.',
  },
  developer_session_start: {
    capability: 'shell.execute',
    reason:
      'A coding session runs the AGI CLI agent in this folder. It can read and change files here and run programs with your account.',
  },
  developer_turn_start: {
    capability: 'shell.execute',
    reason:
      'A coding session runs the AGI CLI agent in this folder. It can read and change files here and run programs with your account.',
  },
  developer_session_changes: {
    capability: 'git.read',
    reason: 'Showing what a coding session changed reads the changed files in this folder.',
  },
  developer_session_discard: {
    capability: 'git.destructive',
    reason: 'Discarding a change puts files in this folder back to their last committed version.',
  },
  developer_branches_list: {
    capability: 'git.read',
    reason: "Listing branches reads this folder's git repository.",
  },
  developer_branch_switch: {
    capability: 'git.write',
    reason: 'Switching branches changes the files in this folder to that branch.',
  },
  developer_branch_push: {
    capability: 'git.write',
    reason: "Opening a pull request pushes this folder's current branch to its GitHub remote.",
  },
  developer_skills_list: {
    capability: 'filesystem.read',
    reason: 'Listing skills reads the skill files this folder and your account provide.',
  },
  developer_plugins_list: {
    capability: 'filesystem.read',
    reason: 'Listing plugins reads the plugin files this folder and your account provide.',
  },
  developer_skill_set_enabled: {
    capability: 'shell.execute',
    reason:
      'Turning a skill on lets coding sessions here follow its instructions and run its scripts.',
  },
  developer_skill_consent: {
    capability: 'shell.execute',
    reason:
      "Trusting this folder's skills lets coding sessions here follow them and run their scripts with your account.",
  },
  developer_plugin_set_enabled: {
    capability: 'shell.execute',
    reason: 'Turning a plugin on lets coding sessions here use its commands, skills and servers.',
  },
};

const COMPUTER_USE_REASON =
  'The agent moves the pointer, clicks and types on this Mac as if you were doing it, and reads the screen to decide where. It can reach anything already open, including apps and pages you are signed into.';

function revokeReviewedPermission(
  window: BrowserWindow | null,
  args: Args,
): DesktopPermissionsReview {
  const capability = requireString(args, 'capability');
  if (!isDesktopCapability(capability)) {
    throw new InvalidArguments(`"${capability}" is not a desktop permission.`);
  }
  const scope = requireScope(args);
  if (capability === 'computer.use' && scope.kind === 'global') stopComputerUse();
  else revokePermission(capability, scope);
  emitRuntimeEvent(window, { kind: 'permission-changed', capability, scope });
  return reviewPermissions();
}

/** Capabilities scoped to the session rather than to one folder. */
const GLOBAL_CAPABILITY_BY_COMMAND: Record<
  string,
  { capability: DesktopCapability; reason: string }
> = {
  clipboard_read: {
    capability: 'clipboard.read',
    reason: 'Attaching the clipboard copies whatever it holds right now into this conversation.',
  },
  computer_screenshot: { capability: 'computer.use', reason: COMPUTER_USE_REASON },
  computer_zoom: { capability: 'computer.use', reason: COMPUTER_USE_REASON },
  computer_move: { capability: 'computer.use', reason: COMPUTER_USE_REASON },
  computer_click: { capability: 'computer.use', reason: COMPUTER_USE_REASON },
  computer_drag: { capability: 'computer.use', reason: COMPUTER_USE_REASON },
  computer_scroll: { capability: 'computer.use', reason: COMPUTER_USE_REASON },
  computer_type: { capability: 'computer.use', reason: COMPUTER_USE_REASON },
  computer_key: { capability: 'computer.use', reason: COMPUTER_USE_REASON },
  computer_wait: { capability: 'computer.use', reason: COMPUTER_USE_REASON },
};

async function snapshotFor(root: WorkspaceRoot): Promise<WorkspaceSnapshot> {
  const git = await readWorkspaceGit(root);
  setRootGit(root.id, git?.root);
  touchRoot(root.id);
  return { root: getRoot(root.id) ?? root, git };
}

async function pickRoot(window: BrowserWindow | null, args: Args): Promise<WorkspaceRoot> {
  const kind = args['kind'] ?? 'folder';
  if (!isWorkspaceRootKind(kind)) {
    throw new InvalidArguments('"kind" must be "folder" or "repository".');
  }
  const copy = WORKSPACE_PICKER_COPY[kind];
  const options = {
    title: copy.title,
    properties:
      kind === 'repository'
        ? ['openDirectory' as const]
        : ['openDirectory' as const, 'createDirectory' as const],
    buttonLabel: copy.buttonLabel,
  };
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options);

  const selected = result.filePaths[0];
  if (result.canceled || !selected) {
    throw new Cancelled(copy.cancelled);
  }
  return grantPickedRoot(selected, kind);
}

class Cancelled extends Error {}

function emitRuntimeEvent(window: BrowserWindow | null, event: unknown): void {
  if (!window || window.isDestroyed()) return;
  window.webContents.send(DESKTOP_RUNTIME_EVENT_CHANNEL, event);
}

function serverReview(args: Record<string, unknown>): { review?: string } {
  const review = typeof args['review'] === 'string' ? args['review'].trim() : '';
  return review === '' ? {} : { review: review.slice(0, MAX_DEVICE_REVIEW_LENGTH) };
}

let detectedShellSandbox: Promise<ShellSandbox> | null = null;

function shellSandbox(): Promise<ShellSandbox> {
  detectedShellSandbox ??= detectShellSandbox();
  return detectedShellSandbox;
}

/**
 * The second gate on a local command, quoting it verbatim so the text the user
 * approves is the text that is spawned.
 */
async function approveShellCommand(
  window: BrowserWindow | null,
  { verdict, command, cwd, sandboxed }: ShellApprovalRequest,
): Promise<boolean> {
  const options = sandboxed
    ? {
        type: 'warning' as const,
        buttons: ['Cancel', 'Run once'],
        defaultId: 0,
        cancelId: 0,
        title: 'Run a local command?',
        message: `Run ${verdict.program} in ${cwd}?`,
        detail: `${command}\n\nThis starts a real program with your account, inside a sandbox that lets it change files only in this folder and blocks network access. Add ${verdict.program} to the allowed list in Settings if you want it to run without asking.`,
        noLink: true,
      }
    : {
        type: 'warning' as const,
        buttons: ['Cancel', 'Run without a sandbox'],
        defaultId: 0,
        cancelId: 0,
        title: 'Run without a sandbox?',
        message: `Run ${verdict.program} in ${cwd} with no sandbox?`,
        detail: `${command}\n\nThis computer has no sandbox for local commands, so ${verdict.program} would run with your full account. It can read, change or delete any file you can reach, including files outside this folder, and send data over the network. What it changes cannot be undone from here. You are asked every time, even for allowed programs.`,
        noLink: true,
      };
  const result = await showDevicePrompt(window, options);
  return result.response === 1;
}

const MAX_SHOWN_INPUT = 400;

async function approveShellInput(
  window: BrowserWindow | null,
  { program, input }: ShellInputApprovalRequest,
): Promise<boolean> {
  const line = input.split('\n')[0]?.trim() ?? '';
  if (line !== '' && evaluateShellPolicy(readShellPolicy(), line).decision === 'allow') return true;
  const shown = input.length > MAX_SHOWN_INPUT ? `${input.slice(0, MAX_SHOWN_INPUT)}…` : input;
  const result = await showDevicePrompt(window, {
    type: 'warning' as const,
    buttons: ['Cancel', 'Type it'],
    defaultId: 0,
    cancelId: 0,
    title: `Type into ${program}?`,
    message: `Let AGI type this into ${program}?`,
    detail: `${shown}\n\n${program} is running in a terminal on this Mac, and whatever it is waiting for receives this text as if you typed it.`,
    noLink: true,
  });
  return result.response === 1;
}

/**
 * The second gate on a browser command. The extension applies its own site
 * allowlist after this, so a yes here is necessary and not sufficient.
 */
async function approveBrowserCommand(
  window: BrowserWindow | null,
  plan: BrowserCommandPlan,
): Promise<boolean> {
  const options = {
    type: 'warning' as const,
    buttons: ['Cancel', 'Allow once'],
    defaultId: 0,
    cancelId: 0,
    title: 'Use the paired browser?',
    message: plan.summary,
    detail: plan.detail,
    noLink: true,
  };
  const result = await showDevicePrompt(window, options);
  return result.response === 1;
}

/** Another program on this machine asking for the browser, not the renderer. */
export interface BrowserCommandCaller {
  /** Scope key, so the user answers once per client rather than once per program. */
  name: string;
  /** Subject of the prompt's question, in words. */
  subject: string;
  /** The folder the client is working in, by name. */
  folder: string | null;
  /** That folder's full path, never shortened. */
  path: string | null;
}

/**
 * What the prompt says for a browser action another program asked for. The
 * client already approved the tool call, so the shell says so rather than
 * raising a second dialog per action.
 */
function browserPromptReason(caller: BrowserCommandCaller): string {
  const where = caller.folder ? ` running in ${caller.folder}` : '';
  const at = caller.path && caller.path !== caller.folder ? `\n\n${caller.path}` : '';
  return (
    `${caller.subject}${where} is asking.${at}\n\n` +
    'It already asked you before making this tool call, under its own permission rules, ' +
    'so AGI Desktop will not ask again for each action.\n\n' +
    'The paired Chrome extension still carries the action out under its own approved-sites list.'
  );
}

/** The object of the question: the browser, not the program that asked. */
const BROWSER_OBJECT_PHRASES: Readonly<Record<string, string>> = Object.freeze({
  'browser.site': 'use the paired browser',
  'browser.cdp': "read the paired browser's page internals",
});

const MANUAL_BROWSER_CLIENT = 'You';
const FAILED_BROWSER_ACTION = 'The browser did not answer.';

export async function runBrowserCommand(
  window: BrowserWindow | null,
  command: string,
  args: Args,
  caller?: BrowserCommandCaller,
): Promise<DesktopRuntimeResponse> {
  const plan = planBrowserCommand(command, args);
  // Each client is its own permission subject, so revoking one leaves the
  // renderer's grant standing.
  const scope: PermissionScope = caller
    ? { kind: 'application', target: caller.name }
    : { kind: 'global' };
  const reason = caller
    ? browserPromptReason(caller)
    : 'The paired Chrome extension carries out the action, under its own approved-sites list.';
  const state =
    getPermissionState(plan.capability, scope) === 'prompt'
      ? await requestPermission(
          window,
          plan.capability,
          scope,
          reason,
          caller
            ? {
                subject: caller.name,
                objectPhrase: BROWSER_OBJECT_PHRASES[plan.capability],
              }
            : {},
        )
      : getPermissionState(plan.capability, scope);

  if (state !== 'granted') {
    return runtimeFailure(
      'permission-denied',
      'Permission to use the paired browser was refused.',
      {
        capability: plan.capability,
        scope,
      },
    );
  }
  // A local client already put the tool call through its own approval, so a
  // second dialog here would ask the same question with no new information.
  if (!caller && !(await approveBrowserCommand(window, plan))) {
    return runtimeFailure('cancelled', 'That browser action was not run.');
  }

  const activity = caller
    ? null
    : recordBrowserActivity(MANUAL_BROWSER_CLIENT, plan.command, plan.args);
  let value: unknown;
  try {
    value = await sendBrowserCommand(plan.command, plan.args);
  } catch (error) {
    if (activity) {
      settleBrowserActivity(
        activity,
        error instanceof Error ? error.message : FAILED_BROWSER_ACTION,
      );
    }
    throw error;
  }
  if (activity) settleBrowserActivity(activity, null);
  consumeSingleUse(plan.capability, scope);
  return runtimeSuccess(value);
}

/**
 * What this machine tells a cloud turn it can be asked to do. Declared when the
 * user has not refused it, not when it is already granted: the ask is what
 * raises the prompt, and a refused capability is left out.
 */
function declareDeviceHost(): DesktopHostDeclaration {
  const roots = listRoots();
  const identity = deviceIdentity();
  const screenUsable = computerUseEnabled() && computerUseAvailability().supported;
  const capabilities = [
    ...new Set(
      DEVICE_STEP_TOOLS.flatMap((tool) => {
        const scope = deviceStepScope(tool);
        const capability = deviceStepCapability(tool);
        if (!isDesktopCapability(capability)) return [];
        if (scope === 'workspace') {
          return roots.some(
            (root) => getPermissionState(capability, workspaceScope(root)) !== 'denied',
          )
            ? [capability]
            : [];
        }
        const usable = scope === 'screen' ? screenUsable : pairingState().paired;
        return usable && getPermissionState(capability, { kind: 'global' }) !== 'denied'
          ? [capability]
          : [];
      }),
    ),
  ];
  return {
    deviceId: identity.deviceId,
    deviceName: identity.deviceName,
    platform: process.platform,
    appVersion: app.getVersion(),
    capabilities,
    roots: roots.map((root) => ({ id: root.id, name: root.name, path: root.path })),
  };
}

function describeDeviceForRegistry(): DeviceRegistryProfile {
  const identity = deviceIdentity();
  return {
    installId: identity.deviceId,
    name: identity.deviceName,
    platform: process.platform,
    osVersion: os.release(),
    architecture: process.arch,
    appVersion: app.getVersion(),
    capabilities: {
      browser: pairingState().paired,
      computerUse: computerUseEnabled() && computerUseAvailability().supported,
      localModels: false,
      localMcp: false,
      remoteControl: remoteControlAvailable(),
    },
  };
}

async function execute(
  window: BrowserWindow | null,
  command: string,
  args: Args,
): Promise<unknown> {
  if (SCREEN_STEP_COMMANDS.has(command)) await guardScreenStep(window, command, args);
  switch (command) {
    case 'workspace_pick_root':
      return pickRoot(window, args);
    case 'workspace_list_roots':
      return listRoots();
    case 'workspace_revoke_root': {
      const rootId = requireString(args, 'rootId');
      stopDeveloperRuntime(rootId);
      const root = getRoot(rootId);
      if (root) revokeScope(workspaceScope(root));
      return revokeRoot(rootId);
    }
    case 'workspace_snapshot':
      return snapshotFor(resolveRoot(args));
    case 'workspace_reveal': {
      const root = resolveRoot(args);
      shell.openPath(root.path);
      return true;
    }
    case 'file_list':
      return listDirectory(resolveRoot(args), optionalString(args, 'path', ''));
    case 'file_stat':
      return statPath(resolveRoot(args), requireString(args, 'path'));
    case 'file_read_text':
      return readTextFile(resolveRoot(args), requireString(args, 'path'));
    case 'file_read_bytes':
      return readBinaryFile(resolveRoot(args), requireString(args, 'path'));
    case 'file_write_text':
      return writeTextFile(
        resolveRoot(args),
        requireString(args, 'path'),
        optionalString(args, 'text', ''),
      );
    case 'file_edit_text': {
      const oldText = args['oldText'];
      const newText = args['newText'];
      if (typeof oldText !== 'string' || oldText.length === 0 || typeof newText !== 'string') {
        throw new InvalidArguments('"oldText" must be a non-empty string and "newText" a string.');
      }
      return editTextFile(
        resolveRoot(args),
        requireString(args, 'path'),
        oldText,
        newText,
        args['replaceAll'] === true,
      );
    }
    case 'file_create_directory':
      return createDirectory(resolveRoot(args), requireString(args, 'path'));
    case 'file_glob':
      return globFiles(
        resolveRoot(args),
        requireString(args, 'pattern'),
        optionalString(args, 'path', ''),
        { ignoreCase: args['ignoreCase'] === true },
      );
    case 'file_grep':
      return grepFiles(
        resolveRoot(args),
        requireString(args, 'query'),
        optionalString(args, 'path', ''),
        { ignoreCase: args['ignoreCase'] === true },
      );
    case 'shell_run': {
      const root = resolveRoot(args);
      const timeoutMs = optionalNumber(args, 'timeoutMs');
      return runShellCommand({
        runId: requireString(args, 'runId'),
        root,
        relativePath: optionalString(args, 'path', ''),
        command: requireString(args, 'command'),
        ...(timeoutMs === undefined ? {} : { timeoutMs }),
        policy: readShellPolicy(),
        sandbox: await shellSandbox(),
        network: 'deny',
        approve: (request) => approveShellCommand(window, request),
        emit: (chunk) => emitRuntimeEvent(window, { kind: 'shell-output', ...chunk }),
        ...serverReview(args),
      });
    }
    case 'shell_cancel':
      return cancelShellRun(requireString(args, 'runId'));
    case 'shell_start': {
      const root = resolveRoot(args);
      return startBackgroundCommand({
        runId: requireString(args, 'runId'),
        root,
        relativePath: optionalString(args, 'path', ''),
        command: requireString(args, 'command'),
        policy: readShellPolicy(),
        sandbox: await shellSandbox(),
        network: 'deny',
        approve: (request) => approveShellCommand(window, request),
        emit: (chunk) => emitRuntimeEvent(window, { kind: 'shell-output', ...chunk }),
        ...serverReview(args),
      });
    }
    case 'shell_read': {
      const root = resolveRoot(args);
      const typed = args['input'];
      return readBackgroundCommand(
        requireString(args, 'runId'),
        root.id,
        typeof typed === 'string' ? typed : undefined,
        (request) => approveShellInput(window, request),
      );
    }
    case 'shell_stop':
      return stopBackgroundCommand(requireString(args, 'runId'), resolveRoot(args).id);
    case 'shell_policy_read':
      return readShellPolicy();
    case 'shell_policy_write':
      return writeShellPolicy(requirePolicy(args));
    case 'window_layout_read':
      return readShellLayout();
    case 'window_layout_write':
      return writeShellLayout(args ?? {});
    case 'window_open': {
      if (windowOpener === null) {
        throw new InvalidArguments('This build cannot open a second window.');
      }
      const route = requireString(args, 'route');
      if (!windowOpener(route)) {
        throw new InvalidArguments('That page cannot be opened in a window of its own.');
      }
      return true;
    }
    case 'app_open_path':
      return openWithDefaultApplication(resolveRoot(args), requireString(args, 'path'));
    case 'app_reveal_path':
      return revealInFileManager(resolveRoot(args), requireString(args, 'path'));
    case 'app_open_in_editor':
      return openInEditor(resolveRoot(args));
    case 'clipboard_read':
      return readClipboard();
    case 'local_model_servers':
      return {
        granted: getPermissionState('local.inference', { kind: 'global' }) === 'granted',
        servers: await listLocalServers(),
      } satisfies LocalModelSnapshot;
    case 'local_model_list':
      return listLocalModels();
    case 'local_chat_start': {
      const timeoutMs = optionalNumber(args, 'timeoutMs');
      const temperature = optionalNumber(args, 'temperature');
      const maxOutputTokens = optionalNumber(args, 'maxOutputTokens');
      recordDesktopEvent({ domain: 'local_inference', outcome: 'started' });
      try {
        const result = await runLocalChat(
          {
            runId: requireString(args, 'runId'),
            modelId: requireString(args, 'modelId'),
            messages: requireLocalMessages(args),
            ...(timeoutMs === undefined ? {} : { timeoutMs }),
            ...(temperature === undefined ? {} : { temperature }),
            ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
          },
          (delta) => emitRuntimeEvent(window, { kind: 'local-chat-delta', ...delta }),
        );
        recordDesktopEvent(localInferenceOutcome(result.stopReason));
        return result;
      } catch (error) {
        recordDesktopEvent({ domain: 'local_inference', outcome: 'refused', cause: 'unsupported' });
        throw error;
      }
    }
    case 'local_chat_cancel':
      return cancelLocalChat(requireString(args, 'runId'));
    case 'local_model_settings_read':
      return readLocalModelSettings();
    case 'local_model_settings_write':
      return writeLocalModelSettings(requireLocalSettings(args));
    case 'computer_screenshot': {
      const display = optionalNumber(args, 'display');
      return captureScreen(display);
    }
    case 'computer_zoom':
      return captureRegion(requireRegion(args));
    case 'computer_move': {
      const [x, y] = [requireNumber(args, 'x'), requireNumber(args, 'y')];
      return runScreenAction(window, command, args, () => movePointer(x, y));
    }
    case 'computer_click': {
      const [x, y] = [requireNumber(args, 'x'), requireNumber(args, 'y')];
      const button = requireMouseButton(args);
      const count = optionalNumberOr(args, 'count', 1);
      return runScreenAction(window, command, args, () => clickPointer(x, y, button, count));
    }
    case 'computer_drag': {
      const [x, y] = [requireNumber(args, 'x'), requireNumber(args, 'y')];
      const [toX, toY] = [requireNumber(args, 'toX'), requireNumber(args, 'toY')];
      return runScreenAction(window, command, args, () => dragPointer(x, y, toX, toY));
    }
    case 'computer_scroll': {
      const [x, y] = [requireNumber(args, 'x'), requireNumber(args, 'y')];
      const deltaX = optionalNumberOr(args, 'deltaX', 0);
      const deltaY = optionalNumberOr(args, 'deltaY', 0);
      return runScreenAction(window, command, args, () => scrollPointer(x, y, deltaX, deltaY));
    }
    case 'computer_type': {
      const text = requireString(args, 'text');
      return runScreenAction(window, command, args, () => typeText(text));
    }
    case 'computer_key': {
      const key = requireString(args, 'key');
      const modifiers = requireModifiers(args);
      return runScreenAction(window, command, args, () => pressKey(key, modifiers));
    }
    case 'computer_wait':
      return waitFor(optionalNumberOr(args, 'ms', 500));
    case 'computer_stop':
      return stopComputerUse();
    case 'computer_take_over':
      return takeOverComputerUse();
    case 'computer_hand_back':
      return confirmHandBack(window);
    case 'computer_use_status':
      return computerUseStatus();
    case 'computer_use_set_enabled':
      return setComputerUseEnabled(requireBoolean(args, 'enabled'));
    case 'computer_use_finish':
      return finishComputerUse(window);
    case 'system_permission_open': {
      const permission = args['permission'];
      if (!isSystemPermissionKind(permission)) {
        throw new InvalidArguments(
          '"permission" must be screen-recording, accessibility or microphone.',
        );
      }
      return openSystemPermission(permission);
    }
    case 'permission_review':
      return reviewPermissions();
    case 'permission_revoke':
      return revokeReviewedPermission(window, args);
    case BROWSER_STEP_COMMAND:
      return runBrowserStep(window, args);
    case 'browser_activity':
      return listBrowserActivity();
    case 'browser_downloads_open': {
      const failure = await shell.openPath(app.getPath('downloads'));
      if (failure !== '') throw new InvalidArguments(failure);
      return true;
    }
    case 'background_activity':
      return readBackgroundActivity();
    case 'background_stop': {
      const kind = args['kind'];
      if (!isBackgroundWorkKind(kind)) {
        throw new InvalidArguments(
          '"kind" must be coding-runtime, command, computer-use or remote-control.',
        );
      }
      return stopBackgroundWork(kind, optionalString(args, 'id', '') || null);
    }
    case 'device_host_declaration':
      return declareDeviceHost();
    case DEVICE_REGISTRY_PROFILE_COMMAND:
      return describeDeviceForRegistry();
    case 'remote_control_state':
      return remoteControlState();
    case 'remote_control_start':
      return startRemoteControl(args);
    case 'remote_control_stop':
      return stopRemoteControl();
    case DISPATCH_TASK_RUNNER_READY:
      return setDispatchTaskRunner(window, requireBoolean(args, 'ready'));
    case DISPATCH_TASK_REPORT:
      return reportDispatchTask(window, args);
    case BROWSER_SIGN_IN_START:
      return startBrowserSignIn();
    case 'developer_runtime_status':
      return readDeveloperRuntimeStatus();
    case 'developer_model_list':
      return readDeveloperModels(requireString(args, 'rootId'), args['refresh'] === true);
    case 'developer_session_list':
      return listDeveloperSessions();
    case 'developer_session_read':
      return readDeveloperSession(requireString(args, 'rootId'), requireString(args, 'threadId'));
    case 'developer_session_resume':
      return resumeDeveloperSession(requireString(args, 'rootId'), requireString(args, 'threadId'));
    case 'developer_session_start': {
      const model = optionalString(args, 'model', '');
      return startDeveloperSession(requireString(args, 'rootId'), model === '' ? undefined : model);
    }
    case 'developer_turn_start': {
      const model = optionalString(args, 'model', '');
      const agentMode = rendererAgentMode(optionalString(args, 'agentMode', ''));
      const maxTurns = optionalNumber(args, 'maxTurns');
      if (maxTurns !== undefined && !isCloudCodeTurnStepBound(maxTurns)) {
        throw new InvalidArguments(
          `"maxTurns" must be one of ${CLOUD_CODE_TURN_STEP_BOUNDS.join(', ')}.`,
        );
      }
      return startDeveloperTurn({
        rootId: requireString(args, 'rootId'),
        threadId: requireString(args, 'threadId'),
        text: requireString(args, 'text'),
        ...(model === '' ? {} : { model }),
        ...(agentMode ? { agentMode } : {}),
        ...(maxTurns === undefined ? {} : { maxTurns }),
      });
    }
    case 'developer_memory_add': {
      const scope = requireString(args, 'scope');
      if (scope !== 'project' && scope !== 'user') {
        throw new InvalidArguments('"scope" must be project or user.');
      }
      return addDeveloperMemory(requireString(args, 'rootId'), requireString(args, 'text'), scope);
    }
    case 'developer_turn_interrupt':
      return interruptDeveloperTurn(
        requireString(args, 'rootId'),
        requireString(args, 'threadId'),
        requireString(args, 'turnId'),
      );
    case 'developer_approval_answer':
      return answerDeveloperApproval({
        rootId: requireString(args, 'rootId'),
        threadId: requireString(args, 'threadId'),
        turnId: requireString(args, 'turnId'),
        requestId: requireString(args, 'requestId'),
        approved: args['approved'] === true,
      });
    case 'developer_branches_list':
      return listLocalBranches(resolveRoot(args).path);
    case 'developer_branch_switch':
      return switchLocalBranch(resolveRoot(args).path, requireString(args, 'branch'));
    case 'developer_branch_push':
      return pushLocalBranch(resolveRoot(args).path);
    case 'developer_skills_list':
      return listDeveloperSkills(requireString(args, 'rootId'));
    case 'developer_skill_set_enabled':
      return setDeveloperSkillEnabled(
        requireString(args, 'rootId'),
        requireString(args, 'name'),
        requireBoolean(args, 'enabled'),
      );
    case 'developer_skill_consent':
      return setDeveloperSkillConsent(
        requireString(args, 'rootId'),
        requireBoolean(args, 'granted'),
      );
    case 'developer_plugins_list':
      return listDeveloperPlugins(requireString(args, 'rootId'));
    case 'developer_plugin_set_enabled':
      return setDeveloperPluginEnabled(
        requireString(args, 'rootId'),
        requireString(args, 'id'),
        requireBoolean(args, 'enabled'),
      );
    case 'developer_session_changes':
      return readWorkingTreeChanges(resolveRoot(args).path);
    case 'developer_session_discard':
      return discardWorkingTreeChanges(resolveRoot(args).path, requirePathList(args, 'paths'));
    case 'developer_account_report': {
      reportShellIdentity({
        signedIn: args['signedIn'] === true,
        email: optionalString(args, 'email', '') || null,
      });
      void syncDeveloperAccounts();
      return true;
    }

    case 'browser_pairing_state':
      return pairingState();
    case 'browser_pairing_install_host':
      return installHostForPairedExtension();
    case 'browser_pairing_uninstall_host':
    case 'browser_pairing_unpair':
      removeHostAndPairing();
      return pairingState();
    default:
      throw new UnknownCommand(command);
  }
}

class UnknownCommand extends Error {}

const REFUSAL_CODES: Record<string, DesktopRuntimeErrorCode> = {
  traversal: 'outside-workspace',
  'outside-workspace': 'outside-workspace',
  'denied-file': 'permission-denied',
  'io-error': 'io-error',
};

function toFailure(error: unknown): DesktopRuntimeResponse<never> {
  if (error instanceof PathRefused) {
    return runtimeFailure(REFUSAL_CODES[error.reason] ?? 'io-error', error.message);
  }
  if (error instanceof InvalidArguments) return runtimeFailure('invalid-arguments', error.message);
  if (error instanceof TextEditRefused) return runtimeFailure('invalid-arguments', error.message);
  if (error instanceof InvalidBrowserArguments) {
    return runtimeFailure('invalid-arguments', error.message);
  }
  if (error instanceof BrowserBridgeError) return runtimeFailure('io-error', error.message);
  if (error instanceof BrowserStepRefused) {
    return runtimeFailure(
      error.reason === 'cancelled' ? 'cancelled' : 'permission-denied',
      error.message,
    );
  }
  if (error instanceof UnknownWorkspace) return runtimeFailure('not-found', error.message);
  if (error instanceof DeveloperRuntimeUnavailableError) {
    return runtimeFailure('runtime-unavailable', `${error.message} ${error.hint}`);
  }
  if (error instanceof WorkspaceGrantRefused) {
    return runtimeFailure('permission-denied', error.message);
  }
  if (error instanceof Cancelled) return runtimeFailure('cancelled', error.message);
  if (error instanceof RemoteControlRefused) {
    return runtimeFailure('invalid-arguments', error.message);
  }
  if (error instanceof ComputerUseRefused) {
    const code =
      error.reason === 'permission'
        ? 'permission-denied'
        : error.reason === 'unsupported'
          ? 'unsupported-platform'
          : 'io-error';
    return runtimeFailure(code, error.message);
  }
  if (error instanceof LocalInferenceRefused) {
    return runtimeFailure(
      error.reason === 'unknown-model' ? 'not-found' : 'invalid-arguments',
      error.message,
    );
  }
  if (error instanceof ShellCommandRefused) {
    return runtimeFailure(
      error.reason === 'control-characters' || error.reason === 'unparseable'
        ? 'invalid-arguments'
        : 'permission-denied',
      error.message,
    );
  }
  if (error instanceof UnknownCommand) {
    return runtimeFailure(
      'unknown-command',
      `The desktop runtime has no command "${error.message}".`,
    );
  }

  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === 'ENOENT') return runtimeFailure('not-found', 'That path does not exist.');
  if (code === 'ENOTDIR') return runtimeFailure('not-a-directory', 'That path is not a directory.');
  if (code === 'EISDIR') return runtimeFailure('not-a-file', 'That path is a directory.');
  if (code === 'EACCES' || code === 'EPERM') {
    return runtimeFailure('io-error', 'The operating system refused access to that path.');
  }

  return runtimeFailure('io-error', 'The desktop runtime could not complete that request.');
}

/**
 * AGI Cloud is the Electron shell, and D-2026-09-15-04 makes it Cloud-only, so
 * the shell refuses on-device inference rather than only hiding it: a hidden
 * control over a live backend still leaves the capability reachable by
 * anything that can reach the bridge.
 */
const LOCAL_INFERENCE_UNSUPPORTED =
  'AGI Cloud answers every conversation in the cloud. Models running on this Mac are not one of its runtimes.';

const localInferenceCommands = new Set<string>(LOCAL_INFERENCE_COMMANDS);

/**
 * The single entry point from IPC into anything privileged. Order matters:
 * refuse what this shell does not do, classify, resolve the workspace, check
 * permission, then call the service.
 */
export async function dispatch(
  window: BrowserWindow | null,
  command: string,
  rawArgs: Record<string, unknown> | undefined,
): Promise<DesktopRuntimeResponse> {
  const args: Args = rawArgs ?? {};

  try {
    if (localInferenceCommands.has(command)) {
      return runtimeFailure('unsupported-platform', LOCAL_INFERENCE_UNSUPPORTED);
    }

    if (isBrowserCommand(command)) {
      return await runBrowserCommand(window, command, args);
    }

    const globalRequirement = GLOBAL_CAPABILITY_BY_COMMAND[command];
    if (globalRequirement) {
      if (SCREEN_STEP_COMMANDS.has(command)) refuseScreenStepEarly();
      const scope: PermissionScope = { kind: 'global' };
      const state =
        getPermissionState(globalRequirement.capability, scope) === 'prompt'
          ? await requestPermission(
              window,
              globalRequirement.capability,
              scope,
              globalRequirement.reason,
            )
          : getPermissionState(globalRequirement.capability, scope);

      if (state !== 'granted') {
        return runtimeFailure(
          'permission-denied',
          `Permission to ${globalRequirement.capability.replace('.', ' ')} was not granted.`,
          { capability: globalRequirement.capability, scope },
        );
      }
      const value = await execute(window, command, args);
      consumeSingleUse(globalRequirement.capability, scope);
      return runtimeSuccess(value);
    }

    const requirement = CAPABILITY_BY_COMMAND[command];
    if (requirement) {
      const root = resolveRoot(args);
      const scope = workspaceScope(root);
      const state =
        getPermissionState(requirement.capability, scope) === 'prompt'
          ? await requestPermission(window, requirement.capability, scope, requirement.reason)
          : getPermissionState(requirement.capability, scope);

      if (state !== 'granted') {
        return runtimeFailure(
          'permission-denied',
          `Permission to ${requirement.capability.replace('.', ' ')} in ${root.name} was not granted.`,
          { capability: requirement.capability, scope },
        );
      }
      const value = await execute(window, command, args);
      consumeSingleUse(requirement.capability, scope);
      return runtimeSuccess(value);
    }

    return runtimeSuccess(await execute(window, command, args));
  } catch (error) {
    return toFailure(error);
  }
}

export function isWorkspacePathApproved(resolvedPath: string): boolean {
  return findContainingRoot(resolvedPath) !== undefined;
}
