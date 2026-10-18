import { openBrowserAddress } from '../windowPolicy';
import { hasSshEnvironment, listSshEnvironments, requireSshRoot } from './sshEnvironments';
import { connectSshSession, disconnectSshSession } from './sshSessionService';
import {
  createLocalRoutine,
  readLocalRoutines,
  setLocalRoutineEnabled,
  removeLocalRoutine,
} from './localRoutineService';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { app, dialog, shell, type BrowserWindow } from 'electron';
import {
  BROWSER_SIGN_IN_START,
  BROWSER_SIGN_IN_CANCEL,
  BROWSER_SIGN_IN_STATE,
  DESKTOP_RUNTIME_EVENT_CHANNEL,
  DEVELOPER_AGENT_MODES,
  DEVELOPER_REASONING_EFFORTS,
  DEVELOPER_TURN_LIMITS,
  DISPATCH_TASK_REPORT,
  DISPATCH_TASK_RUNNER_READY,
  LOCAL_INFERENCE_COMMANDS,
  ShellCommandRefused,
  approvedRootId,
  developerApprovalAllows,
  evaluateShellPolicy,
  isBackgroundWorkKind,
  isDesktopCapability,
  isSshEnvironmentId,
  isDeveloperApprovalDecision,
  isDeveloperSessionEnvironment,
  isDeveloperThreadRevertRestore,
  isDeveloperWorktreeStart,
  isPermissionScope,
  isSystemPermissionKind,
  isWorkspaceRootKind,
  normalizeShellPolicy,
  permissionScopeKey,
  runtimeFailure,
  runtimeSuccess,
  type DesktopCapability,
  type DesktopPermissionsReview,
  type DesktopRuntimeErrorCode,
  type DesktopRuntimeResponse,
  type DeveloperAgentMode,
  type DeveloperApprovalDecision,
  type DeveloperCheckpointSectionsRequest,
  type DeveloperMcpApprovalReview,
  type DeveloperMcpApprovalScope,
  type DeveloperReasoningEffort,
  type DeveloperSessionEvent,
  type DeveloperSessionGroup,
  type DeveloperSessionList,
  type DeveloperThreadRevertRequest,
  type PermissionScope,
  type ShellPolicy,
  type WorkspaceRoot,
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
import { browserSignInState, cancelBrowserSignIn, startBrowserSignIn } from '../browserSignIn';
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
import { recordDesktopEvent } from './desktopTelemetryService';
import { readClipboard } from './clipboardService';
import {
  cancelShellRun,
  readBackgroundCommand,
  runShellCommand,
  shellRunsIn,
  startBackgroundCommand,
  stopBackgroundCommand,
  type ShellApprovalAnswer,
  type ShellApprovalRequest,
  type ShellInputApprovalRequest,
} from './shellService';
import { AgentActivityTracker } from '../agentNotifications';
import { withdrawFolderPrompt } from '../quitGuard';
import { detectShellSandbox, type ShellSandbox } from './shellSandbox';
import { readShellPolicy, writeShellPolicy } from './shellPolicyStore';
import {
  TextEditRefused,
  WriteConflict,
  editTextFile,
  globFiles,
  grepFiles,
  listDirectory,
  readBinaryFile,
  readTextFile,
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
import { AGENT_CAPABILITY, agentAllowedIn } from './agentAccess';
import { showNativeMessage } from './nativeSurface';
import { askNativeQuestion, NOT_ASKED_MESSAGES, type QuestionSubject } from './nativeQuestions';
import {
  allowComputerRun,
  COMPUTER_RUN_IDLE_MS,
  computerRunAllowed,
  computerRunRefused,
  endComputerRun,
  noteComputerRunStep,
  refuseComputerRun,
} from './computerUseRuns';
import { NOT_THIS_APP, shownValue, visibleInDialog } from './dialogText';
import {
  approvalConfirmation,
  approvalNeedsMain,
  type PendingApprovalReview,
} from './approvalReview';
import {
  approvalWasDeclined,
  beginApprovalConfirmation,
  endApprovalConfirmation,
  noteApprovalDeclined,
  noteApprovalSessionEvent,
} from './approvalConfirmations';
import {
  mcpApprovalConfirmation,
  mcpApprovalNotRecorded,
  type McpApprovalAsked,
} from './mcpApprovalReview';
import {
  DeveloperAgentNotAllowedError,
  DeveloperMcpApprovalChanged,
  DeveloperMcpApprovalRefused,
  DeveloperRuntimeUnavailableError,
  DeveloperThreadHeldError,
  addDeveloperMemory,
  answerDeveloperApproval,
  archiveDeveloperThread,
  answerDeveloperUserInput,
  applyDeveloperWorktree,
  deleteDeveloperThread,
  deleteDeveloperWorktree,
  developerWorktreeKeep,
  forkDeveloperThread,
  compactDeveloperThread,
  grantDeveloperMcpApproval,
  interruptDeveloperTurn,
  interruptOwnedDeveloperTurn,
  listDeveloperCheckpoints,
  listDeveloperPlugins,
  listDeveloperSessions,
  listDeveloperSkills,
  pinDeveloperWorktree,
  readDeveloperCheckpointDiff,
  readDeveloperMcpApproval,
  readDeveloperModels,
  readDeveloperRuntimeStatus,
  readDeveloperSession,
  readPendingApproval,
  readWorktreeSetupScript,
  revertDeveloperCheckpoint,
  revertDeveloperThread,
  runDeveloperWorktreeSetup,
  setDeveloperPluginEnabled,
  setDeveloperSkillConsent,
  setDeveloperSkillEnabled,
  stageDeveloperCheckpoint,
  startDeveloperSession,
  startDeveloperTurn,
  steerDeveloperTurn,
  stopDeveloperRuntime,
  syncDeveloperAccounts,
  takeOverDeveloperThread,
} from './developerSessionService';
import { reportShellIdentity } from '../shellIdentity';
import { readShellLayout, writeShellLayout } from '../shellWindowStore';
import { PathRefused, type PathRefusalReason } from './pathGuard';
import { readRegularFile } from './regularFile';
import { showsTrustedPage } from '../permissionPolicy';
import {
  consumeSingleUse,
  describePermission,
  getPermissionState,
  permissionRevision,
  listPermissions,
  requestPermission,
  reviewPermissions,
  revokePermission,
} from './permissionManager';
import {
  getRoot,
  listRoots,
  revokeRoot,
  WorkspaceGrantRefused,
  worktreeRootIds,
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

const SHA256_HEX = /^[0-9a-f]{64}$/;

function optionalSha256(args: Args, key: string): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || !SHA256_HEX.test(value)) {
    throw new InvalidArguments(`"${key}" must be a lowercase hex SHA-256 digest.`);
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

function requireNumber(args: Args, key: string): number {
  const value = args[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InvalidArguments(`"${key}" must be a number.`);
  }
  return Math.round(value);
}

const IMAGE_DATA_URL_PREFIX = 'data:image/';
const IMAGE_DATA_URL_HEADER_BYTES = 256;
const MAX_IMAGE_DATA_URL_LENGTH =
  IMAGE_DATA_URL_HEADER_BYTES + 1 + Math.ceil(DEVELOPER_TURN_LIMITS.imageBytes / 3) * 4;

function optionalStringList(args: Args, key: string, limit?: number): string[] | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (
    !Array.isArray(value) ||
    (limit !== undefined && value.length > limit) ||
    value.some((entry) => typeof entry !== 'string' || entry.length === 0)
  ) {
    throw new InvalidArguments(
      limit === undefined
        ? `"${key}" must be a list of non-empty strings.`
        : `"${key}" must be at most ${limit} non-empty strings.`,
    );
  }
  return value as string[];
}

function optionalImages(args: Args): string[] | undefined {
  const images = optionalStringList(args, 'images', DEVELOPER_TURN_LIMITS.images);
  if (
    images?.some(
      (image) =>
        !image.startsWith(IMAGE_DATA_URL_PREFIX) || image.length > MAX_IMAGE_DATA_URL_LENGTH,
    )
  ) {
    throw new InvalidArguments('"images" must be image data URLs within the size limit.');
  }
  return images;
}

function optionalAgentMode(args: Args): DeveloperAgentMode | undefined {
  const value = args['agentMode'];
  if (value === undefined || value === null) return undefined;
  const mode = DEVELOPER_AGENT_MODES.find((candidate) => candidate === value);
  if (!mode) throw new InvalidArguments('"agentMode" is not a permission mode.');
  return mode;
}

function optionalReasoningEffort(args: Args): DeveloperReasoningEffort | undefined {
  const value = args['reasoningEffort'];
  if (value === undefined || value === null) return undefined;
  const effort = DEVELOPER_REASONING_EFFORTS.find((candidate) => candidate === value);
  if (!effort) throw new InvalidArguments('"reasoningEffort" is not a reasoning level.');
  return effort;
}

function optionalRevertRestore(args: Args): DeveloperThreadRevertRequest['restore'] {
  const value = args['restore'];
  if (value === undefined || value === null) return undefined;
  if (!isDeveloperThreadRevertRestore(value)) {
    throw new InvalidArguments('"restore" must be code, conversation or both.');
  }
  return value;
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

const userInputWindows = new Set<BrowserWindow>();
const watchedWindows = new WeakSet<BrowserWindow>();

/**
 * Remember which windows hold a page that can show the agent's questions. A
 * full navigation replaces the page, possibly with an older one, so it
 * forgets the window until the new page says so again.
 */
function noteClientCapabilities(window: BrowserWindow | null, args: Args): void {
  if (window === null) return;
  const declared = args['clientCapabilities'];
  if (!Array.isArray(declared) || !declared.includes('user_input')) return;
  userInputWindows.add(window);
  if (watchedWindows.has(window)) return;
  watchedWindows.add(window);
  window.webContents.on('did-navigate', () => userInputWindows.delete(window));
}

/** Whether any open window holds a page that can answer the agent's questions. */
export function windowAnswersUserInput(): boolean {
  for (const window of userInputWindows) {
    if (!window.isDestroyed()) return true;
    userInputWindows.delete(window);
  }
  return false;
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

const DEVELOPER_SESSION_REASON =
  'A coding session runs the AGI CLI agent in this folder. It can read and change files here and run programs with your account.';

/**
 * Every command that touches the disk names the capability it needs. A command
 * named by none of `CAPABILITY_BY_COMMAND`, `GLOBAL_CAPABILITY_BY_COMMAND` and
 * `UNGATED_COMMANDS` reaches no service: `dispatch` refuses what `commandGates`
 * cannot place in exactly one of them.
 */
interface CommandRequirement {
  capability: DesktopCapability;
  reason: string;
  /**
   * A grant already held for this capability satisfies the command without a
   * prompt, unless the user explicitly denied `capability` itself.
   */
  orGranted?: DesktopCapability;
}

const CAPABILITY_BY_COMMAND: Record<string, CommandRequirement> = {
  file_list: { capability: 'filesystem.read', reason: 'The agent wants to browse this folder.' },
  file_glob: { capability: 'filesystem.read', reason: 'The agent wants to search for files here.' },
  file_grep: {
    capability: 'filesystem.read',
    reason: 'The agent wants to search the text of files here.',
  },
  file_read_text: {
    capability: 'filesystem.read',
    reason: 'The agent wants to read the contents of files in this folder.',
  },
  file_read_bytes: {
    capability: 'filesystem.read',
    reason: 'The agent wants to read a file in this folder so you can attach it.',
  },
  file_write_text: {
    capability: 'filesystem.write',
    reason: 'The agent wants to create or change files in this folder.',
  },
  file_edit_text: {
    capability: 'filesystem.write',
    reason: 'The agent wants to change part of a file in this folder.',
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
  local_routine_create: {
    capability: 'shell.execute',
    reason:
      'A local routine starts the coding agent in this folder at the times you choose. Main asks for separate routine consent before saving it.',
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
  developer_turn_steer: {
    capability: 'shell.execute',
    reason:
      'A coding session runs the AGI CLI agent in this folder. It can read and change files here and run programs with your account.',
  },
  developer_session_read: {
    capability: 'shell.execute',
    reason:
      'Reopening a coding session starts the AGI CLI agent in this folder, which loads the hooks, commands and tool servers the folder configures. It can read and change files here and run programs with your account.',
  },
  developer_sessions_allow: {
    capability: 'shell.execute',
    reason:
      'Showing the coding sessions saved for this folder starts the AGI CLI agent in it, which loads the hooks, commands and tool servers the folder configures. It can read and change files here and run programs with your account.',
  },
  developer_worktree_delete: {
    capability: 'shell.execute',
    reason: DEVELOPER_SESSION_REASON,
  },
  developer_worktree_pin: {
    capability: 'shell.execute',
    reason: DEVELOPER_SESSION_REASON,
  },
  developer_worktree_keep: {
    capability: 'shell.execute',
    reason: DEVELOPER_SESSION_REASON,
  },
  developer_worktree_setup_run: {
    capability: 'shell.execute',
    reason:
      "A worktree's setup script is a program from this repository. It runs with your account in the worktree and can do anything you can.",
  },
  developer_checkpoint_list: {
    capability: 'shell.execute',
    reason: DEVELOPER_SESSION_REASON,
  },
  developer_checkpoint_diff: {
    capability: 'shell.execute',
    reason: DEVELOPER_SESSION_REASON,
  },
  developer_worktree_apply: {
    capability: 'git.write',
    reason:
      "Applying a worktree copies the session's changes into the files of this folder. Files you changed here since are left alone.",
  },
  developer_checkpoint_revert: {
    capability: 'git.write',
    reason:
      'Reverting puts files in this folder back to how they were before the agent changed them.',
  },
  developer_checkpoint_stage: {
    capability: 'git.write',
    reason: "Staging adds the agent's changes to this repository's next commit.",
  },
  developer_thread_revert: {
    capability: 'git.write',
    reason:
      'Rewinding puts the files in this folder back to how they were before that turn, removes the turn from the conversation, or both, as you choose.',
  },
  developer_thread_delete: {
    capability: 'git.write',
    orGranted: 'shell.execute',
    reason:
      'Deleting a coding session removes its conversation and checkpoints from this computer. Files in this folder stay as they are.',
  },
  developer_thread_compact: {
    capability: 'shell.execute',
    reason:
      "Summarizing a coding session asks the session's model to condense its conversation. From then on the agent reads the summary in place of those messages, and the summarized turns can no longer be rewound to. Files in this folder stay as they are.",
  },
  developer_thread_fork: {
    capability: 'filesystem.read',
    orGranted: 'shell.execute',
    reason:
      'Branching a coding session copies its conversation up to that turn into a new session for this folder. Files in this folder stay as they are.',
  },
  developer_thread_archive: {
    capability: 'filesystem.read',
    orGranted: 'shell.execute',
    reason:
      'Archiving a coding session takes it out of the list for this folder. Its conversation and checkpoints stay on this computer, and files in this folder stay as they are.',
  },
  developer_thread_takeover: {
    capability: 'shell.execute',
    reason: DEVELOPER_SESSION_REASON,
  },
  developer_mcp_approval_review: {
    capability: 'shell.execute',
    reason: DEVELOPER_SESSION_REASON,
  },
  developer_memory_add: {
    capability: 'shell.execute',
    reason:
      'Saving a memory asks the AGI CLI agent in this folder to write it where coding sessions read it, for this project or for your account.',
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

/**
 * Coding-session commands answered by this app's own git, not by the folder's
 * CLI, so they start no agent and ask for none first.
 */
const HOST_GIT_DEVELOPER_COMMANDS: ReadonlySet<string> = new Set([
  'developer_session_changes',
  'developer_session_discard',
  'developer_branches_list',
  'developer_branch_switch',
  'developer_branch_push',
]);

/**
 * Commands whose `preview` only reads. Asking for write permission to show
 * what a write would do would put the permission prompt before the question
 * it is meant to follow.
 */
const PREVIEWABLE_DEVELOPER_COMMANDS = new Set([
  'developer_worktree_apply',
  'developer_checkpoint_revert',
  'developer_checkpoint_stage',
  'developer_thread_revert',
]);

/**
 * Deleting a session's kept worktree archives destroys the only copy of work
 * the agent left uncommitted, so it needs the grant that lets the agent change
 * this folder, not the one that lets the page read its history.
 */
const DISCARD_WORKTREE_ARCHIVES_REQUIREMENT: CommandRequirement = {
  capability: 'git.write',
  orGranted: 'shell.execute',
  reason:
    "Deleting a session's kept worktree archives removes the only copy of work the agent left uncommitted in this folder's worktrees. It cannot be recovered.",
};

/**
 * For a read answered by a CLI that is already running, which starts nothing:
 * the grant to read the folder is enough, and so is the one to run the agent.
 */
const RUNNING_SESSION_READ_REQUIREMENT: CommandRequirement = {
  capability: 'filesystem.read',
  orGranted: 'shell.execute',
  reason:
    'Coding sessions saved for this folder hold what was asked, what the agent answered and which files it changed.',
};

/**
 * Every coding-session command but one is answered by the folder's CLI, which
 * starts only where the agent may run. Asking first for the command's own
 * grant, to read or to change git state, would collect a standing grant for a
 * command that is then refused, so the agent grant is asked for first and the
 * other only once it is held. The exception reads from a CLI already running.
 */
function needsAgentFirst(command: string, requirement: CommandRequirement): boolean {
  return (
    command.startsWith('developer_') &&
    !HOST_GIT_DEVELOPER_COMMANDS.has(command) &&
    requirement !== RUNNING_SESSION_READ_REQUIREMENT &&
    requirement.capability !== AGENT_CAPABILITY
  );
}

function commandRequirement(command: string, args: Args): CommandRequirement | undefined {
  if (PREVIEWABLE_DEVELOPER_COMMANDS.has(command) && args['preview'] === true) {
    return CAPABILITY_BY_COMMAND['developer_session_read'];
  }
  if (command === 'developer_thread_delete' && args['discardWorktreeArchives'] === true) {
    return DISCARD_WORKTREE_ARCHIVES_REQUIREMENT;
  }
  if (command === 'developer_worktree_keep' && args['keep'] === undefined) {
    return RUNNING_SESSION_READ_REQUIREMENT;
  }
  return CAPABILITY_BY_COMMAND[command];
}

/**
 * The approved folder a command is checked against. A worktree's sessions and
 * files are addressed by an id naming the folder and the worktree, and the
 * folder's grant covers them: the folder's CLI made the worktree, and the
 * store admits it only after checking the checkout against its marker. A file
 * or shell command on a worktree the store has not admitted is refused before
 * any prompt; developer commands admit it through the folder's CLI.
 */
function resolveGateRoot(command: string, args: Args): WorkspaceRoot {
  const rootId = requireString(args, 'rootId');
  const approvedId = approvedRootId(rootId);
  if (hasSshEnvironment(rootId)) return requireSshRoot(rootId);
  if (approvedId === rootId) return resolveRoot(args);
  const root = getRoot(approvedId);
  if (!root || (!command.startsWith('developer_') && !getRoot(rootId))) {
    throw new UnknownWorkspace('That workspace is no longer approved. Choose the folder again.');
  }
  return root;
}

const MAX_CHECKPOINT_SECTIONS = 500;

function requireCheckpointSections(args: Args): DeveloperCheckpointSectionsRequest {
  const sections = args['sections'];
  if (
    !Array.isArray(sections) ||
    sections.length === 0 ||
    sections.length > MAX_CHECKPOINT_SECTIONS
  ) {
    throw new InvalidArguments(
      `"sections" must list between 1 and ${MAX_CHECKPOINT_SECTIONS} files.`,
    );
  }
  return {
    rootId: requireString(args, 'rootId'),
    threadId: requireString(args, 'threadId'),
    turnId: requireString(args, 'turnId'),
    preview: args['preview'] === true,
    sections: sections.map((section: unknown) => {
      if (typeof section !== 'object' || section === null) {
        throw new InvalidArguments('Each section must name a file.');
      }
      const { path, hunks } = section as { path?: unknown; hunks?: unknown };
      if (typeof path !== 'string' || path === '') {
        throw new InvalidArguments('Each section must name a file.');
      }
      if (hunks === undefined) return { path };
      if (
        !Array.isArray(hunks) ||
        hunks.some((hunk) => typeof hunk !== 'number' || !Number.isInteger(hunk) || hunk < 0)
      ) {
        throw new InvalidArguments('"hunks" must be a list of hunk numbers.');
      }
      return { path, hunks: hunks as number[] };
    }),
  };
}

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
  computer_screenshot: { capability: 'computer.use', reason: COMPUTER_USE_REASON },
  computer_zoom: { capability: 'computer.use', reason: COMPUTER_USE_REASON },
  computer_move: { capability: 'computer.use', reason: COMPUTER_USE_REASON },
  computer_click: { capability: 'computer.use', reason: COMPUTER_USE_REASON },
  computer_drag: { capability: 'computer.use', reason: COMPUTER_USE_REASON },
  computer_scroll: { capability: 'computer.use', reason: COMPUTER_USE_REASON },
  computer_type: { capability: 'computer.use', reason: COMPUTER_USE_REASON },
  computer_key: { capability: 'computer.use', reason: COMPUTER_USE_REASON },
  computer_wait: { capability: 'computer.use', reason: COMPUTER_USE_REASON },
  remote_control_start: {
    capability: 'host.remote',
    reason:
      'Remote Control lets a phone you pair read and steer coding sessions on this computer and answer the agent’s approval requests. You are asked again to allow the phone itself before it connects.',
  },
};

/**
 * Stop a screen-control run now: the session stops, which kills the helper
 * and takes the grant back, and the task's own yes ends with it.
 *
 * Deliberately outside the capability table. Needing permission to stop
 * something already running is the one place a prompt must not appear.
 */
function stopScreenControl(): ReturnType<typeof stopComputerUse> {
  endComputerRun();
  return stopComputerUse();
}

/**
 * The CLI is what reads a folder's sessions, and it starts only where the
 * agent may run. Every approved folder is listed all the same: approving a
 * folder records no grant, and the one that runs the agent ends with the app,
 * so a folder left out for lacking it would vanish as soon as it was added
 * and again on every launch. One without the grant is listed with its
 * sessions withheld, which is what offers the user the way to allow it.
 */
async function listSessionsWithinGrants(): Promise<DeveloperSessionList> {
  const roots = listRoots();
  const listed = await listDeveloperSessions(
    (root) => hasSshEnvironment(root.id) || agentAllowedIn(root.id),
  );
  const withheld = await Promise.all(
    roots
      .filter((root) => !agentAllowedIn(root.id))
      .map(async (root): Promise<DeveloperSessionGroup> => {
        const { git, unavailableReason } = await readWorkspaceGit(root);
        return {
          rootId: root.id,
          name: root.name,
          path: root.path,
          branch: git?.branch ?? null,
          ...(unavailableReason ? { gitUnavailableReason: unavailableReason } : {}),
          sessions: [],
          sessionsWithheld: true,
        };
      }),
  );
  const position = new Map(roots.map((root, index) => [root.id, index]));
  const rank = (group: DeveloperSessionGroup): number =>
    position.get(approvedRootId(group.rootId)) ?? roots.length;
  return {
    groups: [...listed.groups, ...withheld].sort((left, right) => rank(left) - rank(right)),
  };
}

const agentActivity = new AgentActivityTracker();

/** Fed every session event, so a withdrawal knows which turns it would stop. */
export function noteDeveloperSessionEvent(rootId: string, event: DeveloperSessionEvent): void {
  agentActivity.apply(rootId, event);
  noteApprovalSessionEvent(rootId, event);
}

/**
 * Stops what a folder's grant was keeping alive: its commands, and its CLI
 * runtimes, which ends their turns. A grant taken back from something still
 * running would be taken back in name only, so this comes first; and because
 * it ends work in flight, it asks first, the way quitting does.
 */
async function stopWorkIn(
  window: BrowserWindow | null,
  root: WorkspaceRoot,
  keptMessage: string,
): Promise<void> {
  const asked = workIn(root);
  const prompt = withdrawFolderPrompt(root.name, {
    shellRuns: asked.runs.length,
    agentTurns: asked.turns,
  });
  if (prompt && !(await confirmInMain(window, { group: 'withdraw', key: root.id }, prompt))) {
    throw new Cancelled(keptMessage);
  }
  // Read again: a command or a worktree started while the question was on
  // screen is work in this folder too, and the list read before it is not it.
  const { rootIds, runs } = workIn(root);
  for (const runId of runs) cancelShellRun(runId);
  for (const rootId of rootIds) stopDeveloperRuntime(rootId);
}

function workIn(root: WorkspaceRoot): { rootIds: string[]; runs: string[]; turns: number } {
  const rootIds = [root.id, ...worktreeRootIds(root.id)];
  return {
    rootIds,
    runs: rootIds.flatMap(shellRunsIn),
    turns: agentActivity.snapshot().runningTurns.filter((turn) => rootIds.includes(turn.rootId))
      .length,
  };
}

/** Withdraws one recorded decision, so the next use asks again. */
async function revokeGrant(
  window: BrowserWindow | null,
  args: Args,
): Promise<DesktopPermissionsReview> {
  const capability = args['capability'];
  const scope = args['scope'];
  if (typeof capability !== 'string' || !isDesktopCapability(capability)) {
    throw new InvalidArguments('"capability" is not a permission this app records.');
  }
  if (!isPermissionScope(scope)) {
    throw new InvalidArguments('"scope" must say what the permission covers.');
  }
  const scopeKey = permissionScopeKey(scope);
  const inForce = listPermissions().find(
    (decision) =>
      decision.capability === capability && permissionScopeKey(decision.scope) === scopeKey,
  );
  if (inForce?.state === 'denied') await confirmClearRefusal(window, capability, scope);
  if (capability === AGENT_CAPABILITY && scope.kind === 'workspace') {
    for (const root of listRoots()) {
      if (root.path !== scope.target) continue;
      await stopWorkIn(window, root, 'The permission was kept and nothing was stopped.');
    }
  }
  if (capability === 'computer.use') stopScreenControl();
  if (capability === 'host.remote') stopRemoteControl();
  revokePermission(capability, scope);
  emitRuntimeEvent(window, { kind: 'permission-changed', capability, scope });
  return reviewPermissions();
}

/**
 * A refusal is the user's answer for as long as the app runs. Withdrawing a
 * grant only takes access away, so a page may ask for that; withdrawing a
 * refusal is what lets the prompt come back, so a page that could do it alone
 * could ask until it was allowed. It is confirmed here, in main.
 */
async function confirmClearRefusal(
  window: BrowserWindow | null,
  capability: DesktopCapability,
  scope: PermissionScope,
): Promise<void> {
  const subject = { group: 'clear-refusal', key: `${capability} ${permissionScopeKey(scope)}` };
  const cleared = await confirmInMain(window, subject, {
    type: 'question',
    buttons: ['Cancel', 'Clear Refusal'],
    defaultId: 0,
    cancelId: 0,
    title: 'Clear this refusal?',
    message: `Let AGI Cloud ask again to ${describePermission(capability, scope)}?`,
    detail:
      'You refused this earlier. Clearing the refusal allows nothing by itself: the next time it is needed you are asked again, and can refuse again.',
    noLink: true,
  });
  if (!cleared) throw new Cancelled('The refusal was kept.');
}

const UNPRINTABLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

/**
 * The allowed list is part of what `shell.execute` grants: a program on it
 * runs with no question. A page that holds no such grant in any folder has
 * nothing to change it for, so it does not get to ask.
 */
function localCommandsAllowedSomewhere(): boolean {
  return listPermissions().some(
    (decision) => decision.capability === 'shell.execute' && decision.state === 'granted',
  );
}

/**
 * An allowed program skips the per-command prompt, so adding one is a grant
 * and is asked here, in main, where the page cannot answer for the user.
 * Removing one only brings the prompt back.
 */
async function writeShellPolicyWithConsent(
  window: BrowserWindow | null,
  requested: ShellPolicy,
): Promise<ShellPolicy> {
  const next = normalizeShellPolicy(requested);
  const current = new Set(readShellPolicy().allow);
  const added = next.allow.filter((program) => !current.has(program));
  if (added.some((program) => UNPRINTABLE.test(program))) {
    throw new InvalidArguments('An allowed program name contains characters that cannot be shown.');
  }
  if (added.length > 0 && !localCommandsAllowedSomewhere()) {
    throw new InvalidArguments(
      'Allow local commands in a folder first. The allowed list only matters where commands may run, so nothing is added to it before then.',
    );
  }
  if (added.length > 0) {
    const options = {
      type: 'warning' as const,
      buttons: ['Cancel', 'Allow without asking'],
      defaultId: 0,
      cancelId: 0,
      title: 'Run programs without asking?',
      message:
        added.length === 1
          ? `Let ${added[0]} run without asking each time?`
          : `Let these ${added.length} programs run without asking each time?`,
      detail: `${added.join('\n')}\n\nCommands that start ${
        added.length === 1 ? 'this program' : 'these programs'
      } in an approved folder will run in the sandbox without a prompt. Where this computer has no sandbox you are still asked every time. You can take ${
        added.length === 1 ? 'it' : 'them'
      } off the allowed list in Settings.`,
      noLink: true,
    };
    const subject = {
      group: 'shell-policy',
      key: [...added].sort().join('\n'),
      quietAfterCancel: true,
    };
    if (!(await confirmInMain(window, subject, options))) {
      throw new Cancelled('The allowed programs were not changed.');
    }
  }
  return writeShellPolicy(next);
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

/**
 * A yes or no asked in main. `subject` says what it is about, which is what
 * keeps a page from stacking the same question or raising it again the
 * moment it is cancelled (`nativeQuestions.ts`).
 */
async function confirmInMain(
  window: BrowserWindow | null,
  subject: QuestionSubject,
  options: Electron.MessageBoxOptions,
): Promise<boolean> {
  const result = await askNativeQuestion(window, subject, options);
  if (result.notAsked !== undefined) throw new Cancelled(NOT_ASKED_MESSAGES[result.notAsked]);
  return result.response === 1;
}

/**
 * A page from before decisions sends only `approved`. It is read as the
 * narrowest answer that matches, never as a standing rule.
 */
function requireApprovalDecision(args: Args): DeveloperApprovalDecision {
  const decision = args['decision'];
  if (decision === undefined && typeof args['approved'] === 'boolean') {
    return args['approved'] ? 'approve_once' : 'deny';
  }
  if (!isDeveloperApprovalDecision(decision)) {
    throw new InvalidArguments('"decision" is not an approval decision.');
  }
  return decision;
}

/**
 * A command rule outlives the session and the folder, so it is granted here,
 * in main, quoting exactly the prefix the CLI proposed and will store. The page
 * may not name another one, and a command the CLI offers no rule for is
 * refused before any dialog promises a rule that would not be saved. A prefix
 * carrying characters that could hide or reorder what the dialog shows is
 * refused rather than shown.
 */
async function confirmAlwaysAllow(
  window: BrowserWindow | null,
  proposed: readonly string[] | null,
  requested: readonly string[] | undefined,
  approval: { rootId: string; requestId: string },
): Promise<readonly string[]> {
  if (!proposed) {
    throw new InvalidArguments('This command can only be approved once or for the session.');
  }
  if (
    requested &&
    (requested.length !== proposed.length ||
      requested.some((token, index) => token !== proposed[index]))
  ) {
    throw new InvalidArguments('That is not the command rule the agent proposed.');
  }
  const prefix = proposed;
  if (prefix.some((token) => UNPRINTABLE.test(token))) {
    throw new InvalidArguments('"commandPrefix" contains characters that cannot be shown.');
  }
  const quoted = prefix.join(' ');
  const subject = { group: `always-allow ${approval.rootId}`, key: approval.requestId };
  const allowed = await confirmInMain(window, subject, {
    type: 'warning',
    buttons: ['Cancel', 'Always allow'],
    defaultId: 0,
    cancelId: 0,
    title: 'Always allow this command?',
    message: `Always allow commands that start with "${quoted}"?`,
    detail: `From now on the agent runs any command that starts with\n\n${quoted}\n\nwithout asking, in every folder on this computer and in every coding session. The rule is saved in the AGI CLI on this computer and stays until you remove it there.`,
    noLink: true,
  });
  if (!allowed) throw new Cancelled('The command was not added to the always-allowed list.');
  return prefix;
}

const DECLINED_AT_THIS_COMPUTER =
  'You chose Cancel for this request at this computer, so it was not sent. Deny it and the agent can ask again.';

async function confirmApprovalInMain(
  window: BrowserWindow | null,
  root: WorkspaceRoot,
  review: PendingApprovalReview,
  decision: DeveloperApprovalDecision,
): Promise<void> {
  const subject = { group: `approval ${root.id}`, key: review.request.requestId };
  if (!(await confirmInMain(window, subject, approvalConfirmation(root, review, decision)))) {
    throw new Cancelled('The approval was not sent. The agent is still waiting for an answer.');
  }
}

const SETUP_SCRIPT_READ_LIMIT = 1024 * 1024;

/**
 * A worktree's setup script is a program the repository carries, run outside
 * any sandbox. The page asks for it and names a hash, but a page's word is not
 * the user's, so every run is confirmed here: the path comes from the folder's
 * CLI, the hash is taken from the file as it is now, and that hash is the one
 * handed on. The CLI hashes the file again as it starts and runs a private
 * copy of those bytes, so an edit after this dialog is refused, not run.
 */
async function confirmSetupScript(
  window: BrowserWindow | null,
  rootId: string,
  shownSha256: string,
): Promise<string> {
  const script = await readWorktreeSetupScript(rootId);
  if (!script) throw new InvalidArguments('This repository has no setup script to run.');
  if (UNPRINTABLE.test(script.path) || UNPRINTABLE.test(script.worktree)) {
    throw new InvalidArguments('The setup script path contains characters that cannot be shown.');
  }
  const bytes = await readRegularFile(script.path, SETUP_SCRIPT_READ_LIMIT + 1, {
    followLinks: true,
  });
  if (!bytes || bytes.length > SETUP_SCRIPT_READ_LIMIT) {
    throw new InvalidArguments('The setup script could not be read, so it was not run.');
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== shownSha256) {
    throw new InvalidArguments(
      'The setup script changed after it was shown to you. Review it again before running it.',
    );
  }
  const confirmed = await confirmInMain(
    window,
    { group: `setup-script ${rootId}`, key: sha256 },
    {
      type: 'warning',
      buttons: ['Cancel', 'Run Script'],
      defaultId: 0,
      cancelId: 0,
      title: "Run this repository's setup script?",
      message: `Run the setup script in ${script.worktree}?`,
      detail: `${script.path}\nSHA-256 ${sha256}\n\nThis is a program the repository carries. It runs with your account in the worktree, outside any sandbox: it can change or delete files anywhere you can, start other programs and reach the network, and nothing it does is undone for you. Run it only if you have read this exact file. If the file changes before it starts, it is not run.`,
      noLink: true,
    },
  );
  if (!confirmed) throw new Cancelled('The setup script was not run.');
  return sha256;
}

const MCP_APPROVAL_SCOPES: readonly DeveloperMcpApprovalScope[] = ['project', 'plugin'];

function requireMcpApprovalScope(args: Args): DeveloperMcpApprovalScope {
  const scope = MCP_APPROVAL_SCOPES.find((candidate) => candidate === args['scope']);
  if (!scope) throw new InvalidArguments('"scope" must be "project" or "plugin".');
  return scope;
}

const reviewingMcpServers = new Set<string>();

/**
 * Asks, in main, whether one project server may start in a folder, and
 * records a yes with the CLI. The page names only which server: the launch is
 * read from the CLI here, and the hash sent back is the one of the launch
 * this dialog showed. When the CLI refuses a yes because the entry was edited
 * meanwhile, it says what the entry is now, and that is asked about afresh.
 * Any other refusal ends the review with the CLI's reason, shown here as
 * well, because the last thing the person did was choose Allow in this app.
 */
async function reviewMcpServerApproval(
  window: BrowserWindow | null,
  root: WorkspaceRoot,
  name: string,
  scope: DeveloperMcpApprovalScope,
): Promise<DeveloperMcpApprovalReview> {
  const key = JSON.stringify([root.id, scope, name]);
  if (reviewingMcpServers.has(key)) {
    throw new InvalidArguments('That server is already being reviewed in another dialog.');
  }
  reviewingMcpServers.add(key);
  try {
    let asked: McpApprovalAsked;
    try {
      asked = await readDeveloperMcpApproval(root.id, name, scope);
    } catch (error) {
      if (!(error instanceof DeveloperMcpApprovalRefused)) throw error;
      return { outcome: 'refused', message: error.message };
    }
    let changed = false;
    for (;;) {
      const subject = { group: `mcp ${root.id}`, key: `${key} ${asked.fingerprint}` };
      if (!(await confirmInMain(window, subject, mcpApprovalConfirmation(root, asked, changed)))) {
        return { outcome: 'declined' };
      }
      try {
        await grantDeveloperMcpApproval(root.id, asked);
        return { outcome: 'approved' };
      } catch (error) {
        if (error instanceof DeveloperMcpApprovalChanged) {
          asked = error.current;
          changed = true;
          continue;
        }
        if (!(error instanceof DeveloperMcpApprovalRefused)) throw error;
        const notice = mcpApprovalNotRecorded(asked, error.message);
        await showNativeMessage(window, notice);
        return { outcome: 'refused', message: error.message };
      }
    }
  } finally {
    reviewingMcpServers.delete(key);
  }
}

const bypassConfirmedThreads = new Set<string>();

/**
 * The first Bypass permissions turn in a session is confirmed in main, once per
 * session for as long as the app runs, so a page cannot switch it on alone.
 */
async function confirmBypassTurn(
  window: BrowserWindow | null,
  root: WorkspaceRoot,
  threadId: string,
): Promise<void> {
  const key = JSON.stringify([root.id, threadId]);
  if (bypassConfirmedThreads.has(key)) return;
  const allowed = await confirmInMain(
    window,
    { group: `bypass ${root.id}`, key: threadId, quietAfterCancel: true },
    {
      type: 'warning',
      buttons: ['Cancel', 'Allow without asking'],
      defaultId: 0,
      cancelId: 0,
      title: 'Let the agent act without asking?',
      message: `Run this session in ${visibleInDialog(root.name)} with Bypass permissions?`,
      detail: `${visibleInDialog(root.path)}\n\nUntil you quit the app, turns in this session that use Bypass permissions run any command with your account, change or delete files in this folder and anywhere else your account can write, and reach the network, all without asking you first. Nothing the agent does is undone for you.`,
      noLink: true,
    },
  );
  if (!allowed) throw new Cancelled('The turn was not sent with Bypass permissions.');
  bypassConfirmedThreads.add(key);
}

const THREAD_TITLE_SHOWN = { head: 120, tail: 40 };

/**
 * The session as the person knows it: its title as the folder's CLI has it,
 * or, when that cannot be read, a plain statement that it could not.
 */
async function threadNamed(rootId: string, threadId: string): Promise<string> {
  try {
    const { session } = await readDeveloperSession(rootId, threadId);
    return session.title.trim() === ''
      ? 'an untitled session'
      : `"${shownValue(session.title, THREAD_TITLE_SHOWN)}"`;
  } catch {
    return 'a session whose title could not be read';
  }
}

/**
 * Deleting a session cannot be undone, and the page that asks is a website,
 * so the question is put here and names the session. With the kept worktree
 * archives going too, it says that uncommitted work goes with them.
 */
async function confirmThreadDelete(
  window: BrowserWindow | null,
  root: WorkspaceRoot,
  threadId: string,
  discardWorktreeArchives: boolean,
): Promise<void> {
  const named = await threadNamed(root.id, threadId);
  const subject = { group: `thread-delete ${root.id}`, key: threadId };
  const allowed = await confirmInMain(
    window,
    subject,
    discardWorktreeArchives
      ? {
          type: 'warning',
          buttons: ['Cancel', 'Delete archives'],
          defaultId: 0,
          cancelId: 0,
          title: 'Delete the kept worktree archives?',
          message: `Delete ${named} and the worktree archives it kept in ${visibleInDialog(root.name)}?`,
          detail: `${visibleInDialog(root.path)}\n\nThe archives hold work the agent left uncommitted in this session's worktrees. Once they are deleted that work cannot be recovered, from this app or from git. The session's conversation and checkpoints are removed too.`,
          noLink: true,
        }
      : {
          type: 'warning',
          buttons: ['Cancel', 'Delete session'],
          defaultId: 0,
          cancelId: 0,
          title: 'Delete this coding session?',
          message: `Delete ${named} in ${visibleInDialog(root.name)}?`,
          detail: `${visibleInDialog(root.path)}\n\nIts conversation and its checkpoints are removed from this computer and cannot be brought back, so its turns can no longer be rewound to. Files in this folder stay as they are.`,
          noLink: true,
        },
  );
  if (!allowed) {
    throw new Cancelled(
      discardWorktreeArchives
        ? 'The session and its worktree archives were kept.'
        : 'The session was kept.',
    );
  }
}

const COMPUTER_RUN_ID = /^[A-Za-z0-9_.:-]{1,128}$/u;

/**
 * The yes one screen-control run takes (`computerUseRuns.ts`). `justAsked`
 * is set when this very call raised the session prompt and the person
 * allowed it: that was a native yes to the same thing a moment ago, so the
 * first run after it is not asked about twice.
 */
async function confirmComputerRun(
  window: BrowserWindow | null,
  args: Args,
  justAsked: boolean,
): Promise<string> {
  const runId = args['runId'];
  if (typeof runId !== 'string' || !COMPUTER_RUN_ID.test(runId)) {
    throw new ComputerUseRefused(
      'permission',
      'A screen step runs only as part of a task you allowed, and this one named no task.',
    );
  }
  if (computerRunAllowed(runId, Date.now())) return runId;
  if (computerRunRefused(runId)) {
    throw new ComputerUseRefused(
      'permission',
      'You did not allow the agent to use the screen for this task. Do not try another screen step; tell the user what you wanted to do.',
    );
  }
  if (!justAsked) {
    const minutes = Math.round(COMPUTER_RUN_IDLE_MS / 60_000);
    const allowed = await confirmInMain(
      window,
      { group: 'computer-run', key: runId, quietAfterCancel: true },
      {
        type: 'warning',
        buttons: ['Cancel', 'Allow for this task'],
        defaultId: 0,
        cancelId: 0,
        title: 'Let the agent use your screen?',
        message: 'Let the agent control your screen for this task?',
        detail: `${COMPUTER_USE_REASON}\n\nThis covers the task the agent is working on now. It ends when the task is stopped, or after ${minutes} minutes without a step, and the next task asks again. Stop Agents takes the screen back at any time.`,
        noLink: true,
      },
    );
    if (!allowed) {
      refuseComputerRun(runId);
      throw new ComputerUseRefused(
        'permission',
        'You did not allow the agent to use the screen for this task. Do not try another screen step; tell the user what you wanted to do.',
      );
    }
  }
  allowComputerRun(runId, Date.now());
  return runId;
}

function emitRuntimeEvent(window: BrowserWindow | null, event: unknown): void {
  if (!window || window.isDestroyed() || !showsTrustedPage(window.webContents)) return;
  window.webContents.send(DESKTOP_RUNTIME_EVENT_CHANNEL, event);
}

let detectedShellSandbox: Promise<ShellSandbox> | null = null;

function shellSandbox(): Promise<ShellSandbox> {
  detectedShellSandbox ??= detectShellSandbox();
  return detectedShellSandbox;
}

const ALLOW_NETWORK_LABEL = 'Allow network access for this command';

const SHELL_COMMAND_SHOWN = { head: 1_500, tail: 700 };
const SHELL_PROGRAM_SHOWN = { head: 80, tail: 20 };

/**
 * The second gate on a local command, and where this computer has no sandbox
 * the only one. The command is a page's text, so what this app knows comes
 * first: that a program runs, where, under what, and what the network box
 * does. The command follows on one line this app labelled, with line breaks
 * and characters that hide or reorder text drawn as marks and both ends kept,
 * so a tail cannot fall out of sight or read as part of the sentence above.
 * What is spawned is the command as sent; what is shown is every character
 * of it, or a count of the ones in the middle that are not.
 */
export function shellApprovalDialog({
  verdict,
  command,
  cwd,
  sandboxed,
}: ShellApprovalRequest): Electron.MessageBoxOptions {
  const program = shownValue(verdict.program, SHELL_PROGRAM_SHOWN);
  const asked = [
    `Folder: ${visibleInDialog(cwd)}`,
    `The command a page asked for. ${NOT_THIS_APP}`,
    `Command: $ ${shownValue(command, SHELL_COMMAND_SHOWN)}`,
  ].join('\n\n');
  return sandboxed
    ? {
        type: 'warning',
        buttons: ['Cancel', 'Run once'],
        defaultId: 0,
        cancelId: 0,
        title: 'Run a local command?',
        message: `Run ${program} in this folder?`,
        detail: `This starts a real program with your account, inside a sandbox that lets it change files only in this folder. The sandbox also blocks the network unless you allow it below; with it allowed, the command can send anything it can read to a server elsewhere. Add ${program} to the allowed list in Settings if you want it to run without asking.\n\n${asked}`,
        checkboxLabel: ALLOW_NETWORK_LABEL,
        checkboxChecked: false,
        noLink: true,
      }
    : {
        type: 'warning',
        buttons: ['Cancel', 'Run without a sandbox'],
        defaultId: 0,
        cancelId: 0,
        title: 'Run without a sandbox?',
        message: `Run ${program} in this folder with no sandbox?`,
        detail: `This computer has no sandbox for local commands, so ${program} would run with your full account. It can read, change or delete any file you can reach, including files outside this folder, and send data over the network. What it changes cannot be undone from here. You are asked every time, even for allowed programs.\n\n${asked}`,
        noLink: true,
      };
}

function serverReview(args: Record<string, unknown>): { review?: string } {
  const review = typeof args['review'] === 'string' ? args['review'].trim() : '';
  return review === '' ? {} : { review: review.slice(0, MAX_DEVICE_REVIEW_LENGTH) };
}

const SHELL_INPUT_SHOWN = { head: 400, tail: 0 };

/**
 * Text typed into a command that is still running reaches whatever that
 * program is waiting for, so it is asked about unless its first line is a
 * command the allowed list already runs without asking.
 */
async function approveShellInput(
  window: BrowserWindow | null,
  { program, input }: ShellInputApprovalRequest,
): Promise<boolean> {
  const line = input.split('\n')[0]?.trim() ?? '';
  if (line !== '' && evaluateShellPolicy(readShellPolicy(), line).decision === 'allow') return true;
  const shownProgram = shownValue(program, SHELL_PROGRAM_SHOWN);
  return confirmInMain(
    window,
    { group: `shell-input ${program}`, key: input, quietAfterCancel: true },
    {
      type: 'warning',
      buttons: ['Cancel', 'Type it'],
      defaultId: 0,
      cancelId: 0,
      title: `Type into ${shownProgram}?`,
      message: `Let AGI type this into ${shownProgram}?`,
      detail: `${shownValue(input, SHELL_INPUT_SHOWN)}\n\n${shownProgram} is running in a terminal on this Mac, and whatever it is waiting for receives this text as if you typed it.`,
      noLink: true,
    },
  );
}

async function approveShellCommand(
  window: BrowserWindow | null,
  request: ShellApprovalRequest,
): Promise<ShellApprovalAnswer> {
  const subject = {
    group: `shell ${request.cwd}`,
    key: request.command,
    quietAfterCancel: true,
  };
  const result = await askNativeQuestion(window, subject, shellApprovalDialog(request));
  const approved = result.response === 1;
  return {
    approved,
    allowNetwork: approved && request.sandboxed && result.checkboxChecked === true,
  };
}

/**
 * The second gate on a browser command. The extension applies its own site
 * allowlist after this, so a yes here is necessary and not sufficient.
 */
async function approveBrowserCommand(
  window: BrowserWindow | null,
  plan: BrowserCommandPlan,
  owner?: string,
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
  const subject = {
    group: owner ? `browser ${owner}` : 'browser',
    key: `${plan.summary}\n${plan.detail}`,
    quietAfterCancel: true,
  };
  return confirmInMain(window, subject, options);
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
  signal?: AbortSignal,
): Promise<DesktopRuntimeResponse> {
  if (signal?.aborted)
    return runtimeFailure('cancelled', 'The requesting browser command was cancelled.');
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

  if (signal?.aborted)
    return runtimeFailure('cancelled', 'The requesting browser command was cancelled.');

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
  const reviewedRevision = permissionRevision(plan.capability, scope);
  // A local client already put the tool call through its own approval, so a
  // second dialog here would ask the same question with no new information.
  if (!caller && !(await approveBrowserCommand(window, plan))) {
    return runtimeFailure('cancelled', 'That browser action was not run.');
  }

  if (signal?.aborted)
    return runtimeFailure('cancelled', 'The requesting browser command was cancelled.');

  const activity = caller
    ? null
    : recordBrowserActivity(MANUAL_BROWSER_CLIENT, plan.command, plan.args);
  let value: unknown;
  try {
    if (
      plan.command === 'browser_open_tab' &&
      getPermissionState(plan.capability, scope) !== 'granted'
    )
      return runtimeFailure('cancelled', 'Browser access was withdrawn.');
    if (plan.command === 'browser_open_tab' && caller && !pairingState().connected) {
      if (!(await approveBrowserCommand(window, plan, caller.name)))
        return runtimeFailure('cancelled', 'The default browser was not opened.');
      if (
        signal?.aborted ||
        getPermissionState(plan.capability, scope) !== 'granted' ||
        permissionRevision(plan.capability, scope) !== reviewedRevision
      )
        return runtimeFailure('cancelled', 'Browser authority changed before opening.');
      await openBrowserAddress(plan.args['url'] as string);
      value = { destination: 'default-browser', sharedProfile: true, url: plan.args['url'] };
    } else {
      value = await sendBrowserCommand(plan.command, plan.args, undefined, signal);
    }
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
      const root = getRoot(rootId);
      if (root) await stopWorkIn(window, root, 'The folder was kept and nothing was stopped.');
      return revokeRoot(rootId);
    }
    case 'permission_review':
      return reviewPermissions();
    case 'permission_revoke':
      return revokeGrant(window, args);
    case 'workspace_reveal': {
      const failure = await shell.openPath(resolveRoot(args).path);
      if (failure !== '') throw new InvalidArguments(failure);
      return true;
    }
    case 'file_list':
      return listDirectory(resolveRoot(args), optionalString(args, 'path', ''));
    case 'file_read_text':
      return readTextFile(resolveRoot(args), requireString(args, 'path'));
    case 'file_read_bytes':
      return readBinaryFile(resolveRoot(args), requireString(args, 'path'));
    case 'file_write_text':
      return writeTextFile(
        resolveRoot(args),
        requireString(args, 'path'),
        optionalString(args, 'text', ''),
        optionalSha256(args, 'expectedSha256'),
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
        protectedPaths: [app.getPath('userData')],
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
        protectedPaths: [app.getPath('userData')],
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
      return writeShellPolicyWithConsent(window, requirePolicy(args));
    case 'window_layout_read':
      return readShellLayout();
    case 'window_layout_write':
      return writeShellLayout(args ?? {});
    case 'app_open_path':
      return openWithDefaultApplication(resolveRoot(args), requireString(args, 'path'));
    case 'app_reveal_path':
      return revealInFileManager(resolveRoot(args), requireString(args, 'path'));
    case 'app_open_in_editor':
      return openInEditor(resolveRoot(args));
    case 'clipboard_read':
      return readClipboard();
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
      return stopScreenControl();
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
      return startRemoteControl(window, args);
    case 'remote_control_stop':
      return stopRemoteControl();
    case DISPATCH_TASK_RUNNER_READY:
      return setDispatchTaskRunner(window, requireBoolean(args, 'ready'));
    case DISPATCH_TASK_REPORT:
      return reportDispatchTask(window, args);
    case BROWSER_SIGN_IN_START:
      return startBrowserSignIn();
    case BROWSER_SIGN_IN_CANCEL:
      return cancelBrowserSignIn();
    case BROWSER_SIGN_IN_STATE:
      return browserSignInState();
    case 'developer_ssh_connect':
      return connectSshSession(window, args);
    case 'developer_ssh_list':
      return listSshEnvironments();
    case 'developer_ssh_disconnect':
      return disconnectSshSession(requireString(args, 'rootId'));
    case 'local_routine_list':
      return readLocalRoutines();
    case 'local_routine_create':
      return createLocalRoutine(window, args);
    case 'local_routine_set_enabled':
      return setLocalRoutineEnabled(
        window,
        requireString(args, 'id'),
        requireBoolean(args, 'enabled'),
      );
    case 'local_routine_remove':
      return removeLocalRoutine(requireString(args, 'id'));
    case 'developer_runtime_status':
      return readDeveloperRuntimeStatus();
    case 'developer_model_list':
      return readDeveloperModels(requireString(args, 'rootId'), args['refresh'] === true);
    case 'developer_session_list':
      return listSessionsWithinGrants();
    case 'developer_sessions_allow':
      return true;
    case 'developer_session_read':
      noteClientCapabilities(window, args);
      return readDeveloperSession(requireString(args, 'rootId'), requireString(args, 'threadId'));
    case 'developer_session_start': {
      const model = optionalString(args, 'model', '');
      const environment = args['environment'] ?? 'local';
      if (environment === 'ssh' && !hasSshEnvironment(requireString(args, 'rootId'))) {
        throw new InvalidArguments(
          'Use Connect SSH and review its remote host before starting an SSH session.',
        );
      }
      if (!isDeveloperSessionEnvironment(environment)) {
        throw new InvalidArguments('"environment" must be "local" or "worktree".');
      }
      const worktreeStart = args['worktreeStart'] ?? 'head';
      if (!isDeveloperWorktreeStart(worktreeStart)) {
        throw new InvalidArguments('"worktreeStart" must be "head" or "working_tree".');
      }
      return startDeveloperSession(
        requireString(args, 'rootId'),
        model === '' ? undefined : model,
        environment === 'worktree'
          ? { environment, worktreeStart }
          : environment === 'ssh'
            ? { environment }
            : {},
      );
    }
    case 'developer_worktree_delete':
      return deleteDeveloperWorktree(requireString(args, 'rootId'));
    case 'developer_worktree_keep': {
      const keep = optionalNumber(args, 'keep');
      if (keep !== undefined && (!Number.isInteger(keep) || keep < 1)) {
        throw new InvalidArguments('"keep" must be a whole number of worktrees.');
      }
      return developerWorktreeKeep(requireString(args, 'rootId'), keep);
    }
    case 'developer_worktree_pin':
      return pinDeveloperWorktree(requireString(args, 'rootId'), args['pinned'] === true);
    case 'developer_worktree_apply':
      return applyDeveloperWorktree(requireString(args, 'rootId'), args['preview'] === true);
    case 'developer_worktree_setup_run': {
      const rootId = requireString(args, 'rootId');
      return runDeveloperWorktreeSetup(
        rootId,
        await confirmSetupScript(window, rootId, requireString(args, 'sha256')),
      );
    }
    case 'developer_checkpoint_list':
      return listDeveloperCheckpoints(
        requireString(args, 'rootId'),
        requireString(args, 'threadId'),
      );
    case 'developer_checkpoint_diff':
      return readDeveloperCheckpointDiff(
        requireString(args, 'rootId'),
        requireString(args, 'threadId'),
        requireString(args, 'turnId'),
      );
    case 'developer_checkpoint_revert':
      return revertDeveloperCheckpoint(requireCheckpointSections(args));
    case 'developer_checkpoint_stage':
      return stageDeveloperCheckpoint(requireCheckpointSections(args));
    case 'developer_thread_revert': {
      const restore = optionalRevertRestore(args);
      return revertDeveloperThread({
        rootId: requireString(args, 'rootId'),
        threadId: requireString(args, 'threadId'),
        turnId: requireString(args, 'turnId'),
        preview: args['preview'] === true,
        ...(restore ? { restore } : {}),
      });
    }
    case 'developer_thread_compact': {
      const fromTurnId = optionalString(args, 'fromTurnId', '');
      return compactDeveloperThread({
        rootId: requireString(args, 'rootId'),
        threadId: requireString(args, 'threadId'),
        ...(fromTurnId ? { fromTurnId } : {}),
      });
    }
    case 'developer_thread_fork':
      return forkDeveloperThread({
        rootId: requireString(args, 'rootId'),
        threadId: requireString(args, 'threadId'),
        throughTurnId: requireString(args, 'throughTurnId'),
      });
    case 'developer_thread_archive':
      return archiveDeveloperThread(requireString(args, 'rootId'), requireString(args, 'threadId'));
    case 'developer_thread_takeover':
      return takeOverDeveloperThread(
        requireString(args, 'rootId'),
        requireString(args, 'threadId'),
      );
    case 'developer_mcp_approval_review': {
      const rootId = requireString(args, 'rootId');
      if (approvedRootId(rootId) !== rootId) {
        throw new InvalidArguments(
          'A server is approved for a folder, which covers its worktrees. Review it from the folder.',
        );
      }
      const root = getRoot(rootId);
      if (!root) throw new UnknownWorkspace('That folder is no longer approved.');
      return reviewMcpServerApproval(
        window,
        root,
        requireString(args, 'name'),
        requireMcpApprovalScope(args),
      );
    }
    case 'developer_thread_delete': {
      const discardWorktreeArchives = args['discardWorktreeArchives'] === true;
      await confirmThreadDelete(
        window,
        resolveGateRoot(command, args),
        requireString(args, 'threadId'),
        discardWorktreeArchives,
      );
      return deleteDeveloperThread({
        rootId: requireString(args, 'rootId'),
        threadId: requireString(args, 'threadId'),
        discardWorktreeArchives,
      });
    }
    case 'developer_turn_start': {
      const model = optionalString(args, 'model', '');
      const images = optionalImages(args);
      const agentMode = optionalAgentMode(args);
      const reasoningEffort = optionalReasoningEffort(args);
      const contextFiles = optionalStringList(
        args,
        'contextFiles',
        DEVELOPER_TURN_LIMITS.contextFiles,
      );
      const maxTurns = optionalNumber(args, 'maxTurns');
      if (maxTurns !== undefined && !isCloudCodeTurnStepBound(maxTurns)) {
        throw new InvalidArguments(
          `"maxTurns" must be one of ${CLOUD_CODE_TURN_STEP_BOUNDS.join(', ')}.`,
        );
      }
      noteClientCapabilities(window, args);
      if (agentMode === 'bypass') {
        const rootId = requireString(args, 'rootId');
        await confirmBypassTurn(
          window,
          getRoot(rootId) ?? resolveGateRoot(command, args),
          requireString(args, 'threadId'),
        );
      }
      return startDeveloperTurn({
        rootId: requireString(args, 'rootId'),
        threadId: requireString(args, 'threadId'),
        text: images ? optionalString(args, 'text', '') : requireString(args, 'text'),
        ...(model === '' ? {} : { model }),
        ...(agentMode ? { agentMode } : {}),
        ...(maxTurns === undefined ? {} : { maxTurns }),
        ...(reasoningEffort ? { reasoningEffort } : {}),
        ...(contextFiles ? { contextFiles } : {}),
        ...(images ? { images } : {}),
      });
    }
    case 'developer_memory_add': {
      const scope = requireString(args, 'scope');
      if (scope !== 'project' && scope !== 'user') {
        throw new InvalidArguments('"scope" must be project or user.');
      }
      return addDeveloperMemory(requireString(args, 'rootId'), requireString(args, 'text'), scope);
    }
    case 'developer_turn_steer': {
      const images = optionalImages(args);
      return steerDeveloperTurn({
        rootId: requireString(args, 'rootId'),
        threadId: requireString(args, 'threadId'),
        turnId: requireString(args, 'turnId'),
        text: images ? optionalString(args, 'text', '') : requireString(args, 'text'),
        ...(images ? { images } : {}),
      });
    }
    case 'developer_turn_interrupt':
      if (hasSshEnvironment(requireString(args, 'rootId'))) {
        await interruptOwnedDeveloperTurn(
          requireString(args, 'rootId'),
          requireString(args, 'threadId'),
          requireString(args, 'turnId'),
        );
        return true;
      }
      return interruptDeveloperTurn(
        requireString(args, 'rootId'),
        requireString(args, 'threadId'),
        requireString(args, 'turnId'),
      );
    case 'developer_approval_answer': {
      const decision = requireApprovalDecision(args);
      const note = optionalString(args, 'note', '');
      const pending = {
        rootId: requireString(args, 'rootId'),
        threadId: requireString(args, 'threadId'),
        turnId: requireString(args, 'turnId'),
        requestId: requireString(args, 'requestId'),
      };
      if (!developerApprovalAllows(decision)) {
        return answerDeveloperApproval({ ...pending, decision, ...(note === '' ? {} : { note }) });
      }
      const review = await readPendingApproval(pending);
      if (!review) {
        throw new InvalidArguments('That approval is no longer waiting for an answer.');
      }
      const requested = optionalStringList(args, 'commandPrefix');
      let commandPrefix: readonly string[] | undefined;
      if (decision === 'always_allow_command' || approvalNeedsMain(review, decision)) {
        if (approvalWasDeclined(pending, 'page')) {
          throw new InvalidArguments(DECLINED_AT_THIS_COMPUTER);
        }
        if (!beginApprovalConfirmation(pending)) {
          throw new InvalidArguments('That approval is already waiting for your answer.');
        }
        try {
          if (decision === 'always_allow_command') {
            commandPrefix = await confirmAlwaysAllow(
              window,
              review.request.proposedCommandPrefix ?? null,
              requested,
              pending,
            );
          } else {
            await confirmApprovalInMain(
              window,
              getRoot(pending.rootId) ?? resolveGateRoot(command, args),
              review,
              decision,
            );
          }
        } catch (error) {
          if (error instanceof Cancelled) noteApprovalDeclined(pending, 'page');
          throw error;
        } finally {
          endApprovalConfirmation(pending);
        }
      }
      return answerDeveloperApproval({
        ...pending,
        decision,
        ...(commandPrefix ? { commandPrefix: [...commandPrefix] } : {}),
        ...(note === '' ? {} : { note }),
      });
    }
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
    case 'developer_user_input_answer': {
      const answer = args['answer'];
      if (answer !== null && typeof answer !== 'string') {
        throw new InvalidArguments('"answer" must be a string, or null to cancel.');
      }
      return answerDeveloperUserInput({
        rootId: requireString(args, 'rootId'),
        threadId: requireString(args, 'threadId'),
        turnId: requireString(args, 'turnId'),
        requestId: requireString(args, 'requestId'),
        answer,
      });
    }
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
    case 'browser_pairing_unpair':
      removeHostAndPairing();
      return pairingState();
    default:
      throw new UnknownCommand(command);
  }
}

class UnknownCommand extends Error {}

const REFUSAL_CODES: Record<PathRefusalReason, DesktopRuntimeErrorCode> = {
  traversal: 'outside-workspace',
  'outside-workspace': 'outside-workspace',
  'denied-file': 'permission-denied',
  'shared-file': 'permission-denied',
  'io-error': 'io-error',
};

function toFailure(error: unknown): DesktopRuntimeResponse<never> {
  if (error instanceof PathRefused) {
    return runtimeFailure(REFUSAL_CODES[error.reason], error.message);
  }
  if (error instanceof InvalidArguments) return runtimeFailure('invalid-arguments', error.message);
  if (error instanceof TextEditRefused) return runtimeFailure('invalid-arguments', error.message);
  if (error instanceof WriteConflict) return runtimeFailure('conflict', error.message);
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
  if (error instanceof DeveloperThreadHeldError) {
    return runtimeFailure('thread-held', error.message);
  }
  if (error instanceof DeveloperAgentNotAllowedError) {
    return runtimeFailure('permission-denied', error.message);
  }
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
 * Commands no capability gates, each for a reason of its own: it reads or
 * changes only this app's own settings and lists; it withdraws or stops
 * something; it asks its question in a native dialog inside the service; or
 * it answers a session whose folder grant was checked when the session was
 * read. A command is here because someone decided that, never by omission.
 */
const UNGATED_COMMANDS: ReadonlySet<string> = new Set([
  BROWSER_SIGN_IN_START,
  BROWSER_SIGN_IN_CANCEL,
  BROWSER_SIGN_IN_STATE,
  BROWSER_STEP_COMMAND,
  DISPATCH_TASK_REPORT,
  DISPATCH_TASK_RUNNER_READY,
  'developer_ssh_connect',
  'developer_ssh_list',
  'developer_ssh_disconnect',
  'local_routine_list',
  'local_routine_set_enabled',
  'local_routine_remove',
  'background_activity',
  'background_stop',
  'browser_activity',
  'browser_downloads_open',
  'browser_pairing_install_host',
  'browser_pairing_state',
  'browser_pairing_unpair',
  'computer_hand_back',
  'computer_stop',
  'computer_take_over',
  'computer_use_finish',
  'computer_use_set_enabled',
  'computer_use_status',
  'developer_account_report',
  'developer_approval_answer',
  'developer_model_list',
  'developer_runtime_status',
  'developer_session_list',
  'developer_turn_interrupt',
  'developer_user_input_answer',
  'device_host_declaration',
  DEVICE_REGISTRY_PROFILE_COMMAND,
  'permission_review',
  'permission_revoke',
  'remote_control_state',
  'remote_control_stop',
  'shell_cancel',
  'shell_policy_read',
  'shell_policy_write',
  'system_permission_open',
  'window_layout_read',
  'window_layout_write',
  'workspace_list_roots',
  'workspace_pick_root',
  'workspace_revoke_root',
]);

export type CommandGate = 'session' | 'folder' | 'none';

/**
 * Every table that names a command. Exactly one must: a command none names is
 * unknown, and one two name has no single answer to what it needs, so both
 * are refused before any service is reached.
 */
export function commandGates(command: string): CommandGate[] {
  const gates: CommandGate[] = [];
  if (Object.hasOwn(GLOBAL_CAPABILITY_BY_COMMAND, command)) gates.push('session');
  if (Object.hasOwn(CAPABILITY_BY_COMMAND, command)) gates.push('folder');
  if (UNGATED_COMMANDS.has(command)) gates.push('none');
  return gates;
}

const SSH_SESSION_COMMANDS = new Set([
  'developer_model_list',
  'developer_session_read',
  'developer_session_start',
  'developer_turn_start',
  'developer_turn_steer',
  'developer_turn_interrupt',
  'developer_approval_answer',
  'developer_user_input_answer',
  'developer_thread_archive',
  'developer_thread_takeover',
  'developer_thread_fork',
  'developer_thread_compact',
]);

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

    if (
      typeof args['rootId'] === 'string' &&
      isSshEnvironmentId(args['rootId']) &&
      command !== 'developer_ssh_disconnect'
    ) {
      requireSshRoot(args['rootId']);
      if (!SSH_SESSION_COMMANDS.has(command))
        return runtimeFailure(
          'unsupported-platform',
          'This SSH environment supports agent sessions and transcript diffs. Host file editing, PTY, worktree management and local device operations are unavailable.',
        );
      if (
        args['environment'] === 'worktree' ||
        (args['agentMode'] !== undefined && args['agentMode'] !== 'ask') ||
        (Array.isArray(args['contextFiles']) && args['contextFiles'].length) ||
        (Array.isArray(args['images']) && args['images'].length)
      )
        return runtimeFailure(
          'unsupported-platform',
          'SSH sessions use Ask mode and text input. Local files, images and worktree placement are not implicitly transferred.',
        );
      if (
        command === 'developer_approval_answer' &&
        !['approve_once', 'deny', 'deny_and_stop'].includes(String(args['decision']))
      )
        return runtimeFailure(
          'unsupported-platform',
          'This SSH environment supports individual approval decisions. Persistent grants must be reviewed in the remote CLI.',
        );
      return runtimeSuccess(
        await execute(
          window,
          command,
          command === 'developer_turn_start' ? { ...args, agentMode: 'ask' } : args,
        ),
      );
    }
    if (isBrowserCommand(command)) {
      return await runBrowserCommand(window, command, args);
    }

    const [gate, ...otherGates] = commandGates(command);
    if (gate === undefined || otherGates.length > 0) throw new UnknownCommand(command);

    if (gate === 'session') {
      const globalRequirement = GLOBAL_CAPABILITY_BY_COMMAND[command];
      if (!globalRequirement) throw new UnknownCommand(command);
      if (SCREEN_STEP_COMMANDS.has(command)) refuseScreenStepEarly();
      const scope: PermissionScope = { kind: 'global' };
      const asksNow = getPermissionState(globalRequirement.capability, scope) === 'prompt';
      const state = asksNow
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
      const computerRun = SCREEN_STEP_COMMANDS.has(command)
        ? await confirmComputerRun(window, args, asksNow)
        : null;
      const value = await execute(window, command, args);
      if (computerRun !== null) noteComputerRunStep(computerRun, Date.now());
      consumeSingleUse(globalRequirement.capability, scope);
      return runtimeSuccess(value);
    }

    if (gate === 'folder') {
      const requirement = commandRequirement(command, args);
      if (!requirement) throw new UnknownCommand(command);
      const root = resolveGateRoot(command, args);
      const scope = workspaceScope(root);
      if (needsAgentFirst(command, requirement)) {
        const agent =
          getPermissionState(AGENT_CAPABILITY, scope) === 'prompt'
            ? await requestPermission(window, AGENT_CAPABILITY, scope, DEVELOPER_SESSION_REASON)
            : getPermissionState(AGENT_CAPABILITY, scope);
        if (agent !== 'granted') {
          return runtimeFailure(
            'permission-denied',
            `Permission to ${AGENT_CAPABILITY.replace('.', ' ')} in ${root.name} was not granted.`,
            { capability: AGENT_CAPABILITY, scope },
          );
        }
      }
      const capability =
        requirement.orGranted !== undefined &&
        getPermissionState(requirement.capability, scope) === 'prompt' &&
        getPermissionState(requirement.orGranted, scope) === 'granted'
          ? requirement.orGranted
          : requirement.capability;
      const state =
        getPermissionState(capability, scope) === 'prompt'
          ? await requestPermission(window, capability, scope, requirement.reason)
          : getPermissionState(capability, scope);

      if (state !== 'granted') {
        return runtimeFailure(
          'permission-denied',
          `Permission to ${capability.replace('.', ' ')} in ${root.name} was not granted.`,
          { capability, scope },
        );
      }
      const value = await execute(window, command, args);
      consumeSingleUse(capability, scope);
      return runtimeSuccess(value);
    }

    return runtimeSuccess(await execute(window, command, args));
  } catch (error) {
    return toFailure(error);
  }
}
