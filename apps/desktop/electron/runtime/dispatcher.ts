import { app, dialog, shell, type BrowserWindow } from 'electron';
import {
  DESKTOP_RUNTIME_EVENT_CHANNEL,
  LocalInferenceRefused,
  ShellCommandRefused,
  assertLocalTurnCarriesNoAttachments,
  runtimeFailure,
  runtimeSuccess,
  type DesktopCapability,
  type DesktopRuntimeErrorCode,
  type DesktopRuntimeResponse,
  type LocalChatMessage,
  type LocalModelSettings,
  type LocalModelSnapshot,
  type PermissionScope,
  type ShellPolicy,
  type ShellPolicyVerdict,
  type WorkspaceRoot,
  type WorkspaceSnapshot,
} from '@agiworkforce/local-runtime-contract';
import {
  DEVICE_STEP_TOOLS,
  deviceStepCapability,
  deviceStepScope,
  type DesktopHostDeclaration,
  type DeviceKeyModifier,
  type DeviceMouseButton,
  type DeviceStepRegion,
} from '@agiworkforce/local-runtime-contract';
import { isBrowserCommand } from '@agiworkforce/types';
import {
  BrowserBridgeError,
  installHostForPairedExtension,
  pairingState,
  removeHostAndPairing,
  sendBrowserCommand,
} from '../browser/bridgeServer';
import {
  InvalidBrowserArguments,
  planBrowserCommand,
  type BrowserCommandPlan,
} from '../browser/commandGate';
import { openWithDefaultApplication, revealInFileManager } from './appsService';
import {
  ComputerUseRefused,
  captureRegion,
  captureScreen,
  clickPointer,
  computerUseAvailability,
  dragPointer,
  movePointer,
  pressKey,
  scrollPointer,
  typeText,
  waitFor,
} from './computerUseService';
import { deviceIdentity } from './deviceIdentity';
import {
  cancelLocalChat,
  listLocalModels,
  listLocalServers,
  runLocalChat,
} from './localInferenceService';
import { readLocalModelSettings, writeLocalModelSettings } from './localModelSettingsStore';
import { readClipboard } from './clipboardService';
import { cancelShellRun, runShellCommand } from './shellService';
import { readShellPolicy, writeShellPolicy } from './shellPolicyStore';
import {
  createDirectory,
  globFiles,
  grepFiles,
  listDirectory,
  readBinaryFile,
  readTextFile,
  statPath,
  writeTextFile,
} from './filesystemService';
import { readWorkspaceGit } from './gitService';
import {
  DeveloperRuntimeUnavailableError,
  answerDeveloperApproval,
  interruptDeveloperTurn,
  listDeveloperSessions,
  readDeveloperModels,
  readDeveloperRuntimeStatus,
  readDeveloperSession,
  resumeDeveloperSession,
  startDeveloperSession,
  startDeveloperTurn,
  stopDeveloperRuntime,
  syncDeveloperAccounts,
} from './developerSessionService';
import { reportShellIdentity } from '../shellIdentity';
import { PathRefused } from './pathGuard';
import { consumeSingleUse, getPermissionState, requestPermission } from './permissionManager';
import {
  findContainingRoot,
  getRoot,
  grantRoot,
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

function requireRegionFields(region: Args): DeviceStepRegion {
  return {
    x: requireNumber(region, 'x'),
    y: requireNumber(region, 'y'),
    width: requireNumber(region, 'width'),
    height: requireNumber(region, 'height'),
  };
}

class InvalidArguments extends Error {}

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
  app_open_path: {
    capability: 'application.control',
    reason: 'Opening a file here hands it to whichever app your Mac opens that kind of file with.',
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
};

const COMPUTER_USE_REASON =
  'The agent moves the pointer, clicks and types on this Mac as if you were doing it, and reads the screen to decide where. It can reach anything already open, including apps and pages you are signed into.';

/** Capabilities scoped to the session rather than to one folder. */
const GLOBAL_CAPABILITY_BY_COMMAND: Record<
  string,
  { capability: DesktopCapability; reason: string }
> = {
  clipboard_read: {
    capability: 'clipboard.read',
    reason: 'Attaching the clipboard copies whatever it holds right now into this conversation.',
  },
  local_model_list: {
    capability: 'local.inference',
    reason:
      'Listing them reads which models you have pulled with Ollama or LM Studio. Nothing is sent anywhere.',
  },
  local_chat_start: {
    capability: 'local.inference',
    reason:
      'The conversation is answered by a model running on this Mac. Nothing in it reaches AGI Cloud or any provider.',
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

async function pickRoot(window: BrowserWindow | null): Promise<WorkspaceRoot> {
  const options = {
    title: 'Choose a project folder',
    properties: ['openDirectory' as const, 'createDirectory' as const],
    buttonLabel: 'Approve folder',
  };
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options);

  const selected = result.filePaths[0];
  if (result.canceled || !selected) {
    throw new Cancelled('No folder was chosen.');
  }
  return grantRoot(selected);
}

class Cancelled extends Error {}

function emitRuntimeEvent(window: BrowserWindow | null, event: unknown): void {
  if (!window || window.isDestroyed()) return;
  window.webContents.send(DESKTOP_RUNTIME_EVENT_CHANNEL, event);
}

/**
 * The second gate on a local command, quoting it verbatim so the text the user
 * approves is the text that is spawned.
 */
async function approveShellCommand(
  window: BrowserWindow | null,
  verdict: ShellPolicyVerdict,
  command: string,
  cwd: string,
): Promise<boolean> {
  const options = {
    type: 'warning' as const,
    buttons: ['Cancel', 'Run once'],
    defaultId: 0,
    cancelId: 0,
    title: 'Run a local command?',
    message: `Run ${verdict.program} in ${cwd}?`,
    detail: `${command}\n\nThis starts a real program with your account. Add ${verdict.program} to the allowed list in Settings if you want it to run without asking.`,
    noLink: true,
  };
  const result = window
    ? await dialog.showMessageBox(window, options)
    : await dialog.showMessageBox(options);
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
  const result = window
    ? await dialog.showMessageBox(window, options)
    : await dialog.showMessageBox(options);
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

  const value = await sendBrowserCommand(plan.command, plan.args);
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
  const screenUsable = computerUseAvailability().supported;
  const capabilities = [
    ...new Set(
      DEVICE_STEP_TOOLS.filter((tool) =>
        deviceStepScope(tool) === 'screen'
          ? screenUsable &&
            getPermissionState(deviceStepCapability(tool), { kind: 'global' }) !== 'denied'
          : roots.some(
              (root) =>
                getPermissionState(deviceStepCapability(tool), workspaceScope(root)) !== 'denied',
            ),
      ).map(deviceStepCapability),
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

async function execute(
  window: BrowserWindow | null,
  command: string,
  args: Args,
): Promise<unknown> {
  switch (command) {
    case 'workspace_pick_root':
      return pickRoot(window);
    case 'workspace_list_roots':
      return listRoots();
    case 'workspace_revoke_root': {
      const rootId = requireString(args, 'rootId');
      stopDeveloperRuntime(rootId);
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
    case 'file_create_directory':
      return createDirectory(resolveRoot(args), requireString(args, 'path'));
    case 'file_glob':
      return globFiles(
        resolveRoot(args),
        requireString(args, 'pattern'),
        optionalString(args, 'path', ''),
      );
    case 'file_grep':
      return grepFiles(
        resolveRoot(args),
        requireString(args, 'query'),
        optionalString(args, 'path', ''),
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
        approve: (verdict, command, cwd) => approveShellCommand(window, verdict, command, cwd),
        emit: (chunk) => emitRuntimeEvent(window, { kind: 'shell-output', ...chunk }),
      });
    }
    case 'shell_cancel':
      return cancelShellRun(requireString(args, 'runId'));
    case 'shell_policy_read':
      return readShellPolicy();
    case 'shell_policy_write':
      return writeShellPolicy(requirePolicy(args));
    case 'app_open_path':
      return openWithDefaultApplication(resolveRoot(args), requireString(args, 'path'));
    case 'app_reveal_path':
      return revealInFileManager(resolveRoot(args), requireString(args, 'path'));
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
      return runLocalChat(
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
    }
    case 'local_chat_cancel':
      return cancelLocalChat(requireString(args, 'runId'));
    case 'local_model_settings_read':
      return readLocalModelSettings();
    case 'local_model_settings_write':
      return writeLocalModelSettings(requireLocalSettings(args));
    case 'computer_screenshot':
      return captureScreen();
    case 'computer_zoom':
      return captureRegion(requireRegion(args));
    case 'computer_move':
      return movePointer(requireNumber(args, 'x'), requireNumber(args, 'y'));
    case 'computer_click':
      return clickPointer(
        requireNumber(args, 'x'),
        requireNumber(args, 'y'),
        requireMouseButton(args),
        optionalNumberOr(args, 'count', 1),
      );
    case 'computer_drag':
      return dragPointer(
        requireNumber(args, 'x'),
        requireNumber(args, 'y'),
        requireNumber(args, 'toX'),
        requireNumber(args, 'toY'),
      );
    case 'computer_scroll':
      return scrollPointer(
        requireNumber(args, 'x'),
        requireNumber(args, 'y'),
        optionalNumberOr(args, 'deltaX', 0),
        optionalNumberOr(args, 'deltaY', 0),
      );
    case 'computer_type':
      return typeText(requireString(args, 'text'));
    case 'computer_key':
      return pressKey(requireString(args, 'key'), requireModifiers(args));
    case 'computer_wait':
      return waitFor(optionalNumberOr(args, 'ms', 500));
    case 'device_host_declaration':
      return declareDeviceHost();
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
      return startDeveloperTurn({
        rootId: requireString(args, 'rootId'),
        threadId: requireString(args, 'threadId'),
        text: requireString(args, 'text'),
        ...(model === '' ? {} : { model }),
      });
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
  if (error instanceof InvalidBrowserArguments) {
    return runtimeFailure('invalid-arguments', error.message);
  }
  if (error instanceof BrowserBridgeError) return runtimeFailure('io-error', error.message);
  if (error instanceof UnknownWorkspace) return runtimeFailure('not-found', error.message);
  if (error instanceof DeveloperRuntimeUnavailableError) {
    return runtimeFailure('runtime-unavailable', `${error.message} ${error.hint}`);
  }
  if (error instanceof WorkspaceGrantRefused) {
    return runtimeFailure('permission-denied', error.message);
  }
  if (error instanceof Cancelled) return runtimeFailure('cancelled', error.message);
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
 * The single entry point from IPC into anything privileged. Order matters:
 * classify, resolve the workspace, check permission, then call the service.
 */
export async function dispatch(
  window: BrowserWindow | null,
  command: string,
  rawArgs: Record<string, unknown> | undefined,
): Promise<DesktopRuntimeResponse> {
  const args: Args = rawArgs ?? {};

  try {
    if (isBrowserCommand(command)) {
      return await runBrowserCommand(window, command, args);
    }

    const globalRequirement = GLOBAL_CAPABILITY_BY_COMMAND[command];
    if (globalRequirement) {
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
