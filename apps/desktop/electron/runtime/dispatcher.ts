import { dialog, shell, type BrowserWindow } from 'electron';
import {
  runtimeFailure,
  runtimeSuccess,
  type DesktopCapability,
  type DesktopRuntimeErrorCode,
  type DesktopRuntimeResponse,
  type PermissionScope,
  type WorkspaceRoot,
  type WorkspaceSnapshot,
} from '@agiworkforce/local-runtime-contract';
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

function optionalString(args: Args, key: string, fallback: string): string {
  const value = args[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string') {
    throw new InvalidArguments(`"${key}" must be a string.`);
  }
  return value;
}

class InvalidArguments extends Error {}

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
 * Every command that touches the disk names the capability it needs and the
 * reason shown in the prompt. A command absent from this table reaches no
 * service: `dispatch` refuses anything it cannot classify.
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
    case 'workspace_revoke_root':
      return revokeRoot(requireString(args, 'rootId'));
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
  if (error instanceof UnknownWorkspace) return runtimeFailure('not-found', error.message);
  if (error instanceof WorkspaceGrantRefused) {
    return runtimeFailure('permission-denied', error.message);
  }
  if (error instanceof Cancelled) return runtimeFailure('cancelled', error.message);
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
 * The single entry point from IPC into anything privileged.
 *
 * Order matters: a command is classified before it runs, the workspace is
 * resolved before permission is checked, and permission is checked before the
 * service is called. Nothing reaches the disk on an unclassified command.
 */
export async function dispatch(
  window: BrowserWindow | null,
  command: string,
  rawArgs: Record<string, unknown> | undefined,
): Promise<DesktopRuntimeResponse> {
  const args: Args = rawArgs ?? {};

  try {
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
