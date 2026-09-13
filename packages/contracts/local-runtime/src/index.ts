/**
 * @agiworkforce/local-runtime-contract
 *
 * The typed surface between the desktop renderer and the privileged local
 * runtime. Pure types, constants and containment logic; no I/O, no Electron,
 * no Node built-ins at all. Both `apps/web` (running as the
 * desktop renderer) and the Electron main process import from here so the two
 * sides of the IPC boundary cannot drift.
 *
 * @packageDocumentation
 */

export {
  DESKTOP_CAPABILITIES,
  HIGH_RISK_CAPABILITIES,
  isDesktopCapability,
  isHighRiskCapability,
  permissionKey,
  permissionScopeKey,
} from './capabilities';
export type {
  DesktopCapability,
  PermissionDecision,
  PermissionGrantDuration,
  PermissionRequest,
  PermissionScope,
  PermissionScopeKind,
  PermissionState,
} from './capabilities';

export {
  DESKTOP_RUNTIME_CHANNEL,
  DESKTOP_RUNTIME_ERROR_CODES,
  DESKTOP_RUNTIME_EVENT_CHANNEL,
  DesktopRuntimeError,
  runtimeFailure,
  runtimeSuccess,
} from './protocol';
export type {
  DesktopRuntimeErrorCode,
  DesktopRuntimeErrorShape,
  DesktopRuntimeEvent,
  DesktopRuntimeRequest,
  DesktopRuntimeResponse,
} from './protocol';

export { WORKSPACE_COMMANDS } from './workspace';
export type {
  WorkspaceCommand,
  WorkspaceGitState,
  WorkspaceRoot,
  WorkspaceSnapshot,
} from './workspace';

export {
  ALWAYS_DENIED_BASENAMES,
  FILESYSTEM_COMMANDS,
  MAX_BINARY_READ_BYTES,
  MAX_GREP_MATCHES,
  MAX_LIST_ENTRIES,
  MAX_TEXT_READ_BYTES,
} from './filesystem';
export type {
  FileBinaryContent,
  FileEntry,
  FileSearchMatch,
  FileStat,
  FileTextContent,
  FilesystemCommand,
} from './filesystem';

export {
  DESKTOP_DEEP_LINK_SCHEME,
  DESKTOP_DEEP_LINK_TARGETS,
  desktopDeepLink,
  getHostBridge,
  parseDesktopDeepLink,
} from './host-bridge';
export type {
  DesktopDeepLink,
  DesktopDeepLinkTarget,
  HostBridge,
  HostNotifyRequest,
} from './host-bridge';

export {
  isAbsolutePath,
  isGrantableRoot,
  isPathInside,
  isUncPath,
  relativeWithinRoot,
  toComparableSegments,
} from './path-safety';
export type { ContainmentOptions, PathPlatform } from './path-safety';
