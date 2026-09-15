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

export {
  DEVELOPER_SESSION_COMMANDS,
  DEVELOPER_SESSION_ORIGIN_LABELS,
  DEVELOPER_SESSION_TRUST_LABELS,
  DEVELOPER_TURN_OUTCOMES,
  isDeveloperSessionCommand,
} from './developer-sessions';
export type {
  DeveloperApprovalAnswer,
  DeveloperHostModel,
  DeveloperModelOption,
  DeveloperModelUnreachable,
  DeveloperRuntimeModels,
  DeveloperRuntimeStatus,
  DeveloperRuntimeUnavailable,
  LocalDeveloperSession,
  DeveloperSessionCommand,
  DeveloperSessionEvent,
  DeveloperSessionGroup,
  DeveloperSessionList,
  DeveloperSessionTranscript,
  DeveloperTurnFailure,
  DeveloperTurnOutcome,
  DeveloperTurnRequest,
} from './developer-sessions';

export { BROWSER_PAIRING_COMMANDS } from './browser-bridge';
export type {
  BrowserPairRequestPrompt,
  BrowserPairingCommand,
  BrowserPairingState,
} from './browser-bridge';

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

export { APPLICATION_COMMANDS } from './apps';
export type { ApplicationCommand, ApplicationOpenResult } from './apps';

export { CLIPBOARD_COMMANDS, MAX_CLIPBOARD_TEXT_LENGTH, isEmptyClipboard } from './clipboard';
export type { ClipboardCommand, ClipboardImage, ClipboardSnapshot } from './clipboard';

export {
  ALWAYS_REFUSED_PROGRAMS,
  EMPTY_SHELL_POLICY,
  MAX_SHELL_COMMAND_LENGTH,
  MAX_SHELL_OUTPUT_BYTES,
  SHELL_COMMANDS,
  SHELL_CONTROL_CHARACTERS,
  SHELL_TIMEOUT_DEFAULT_MS,
  SHELL_TIMEOUT_MAX_MS,
  ShellCommandRefused,
  evaluateShellPolicy,
  findControlCharacter,
  normalizeShellPolicy,
  parseCommandLine,
} from './shell';
export type {
  ShellCommand,
  ShellPolicy,
  ShellPolicyDecision,
  ShellPolicyVerdict,
  ShellRunRequest,
  ShellRunResult,
} from './shell';

export {
  LOCAL_ATTACHMENT_REFUSAL,
  LOCAL_CHAT_TIMEOUT_DEFAULT_MS,
  LOCAL_CHAT_TIMEOUT_MAX_MS,
  LOCAL_INFERENCE_COMMANDS,
  LOCAL_MODEL_ID_PREFIX,
  LOCAL_MODEL_MIN_SIZE_BILLION,
  LOCAL_MODEL_SERVERS,
  LOCAL_MODEL_SERVER_LABELS,
  LocalInferenceRefused,
  assertLocalModelMeetsMinimum,
  assertLocalTurnCarriesNoAttachments,
  formatLocalModelSize,
  isLocalModelBelowMinimum,
  isLocalModelId,
  isLocalModelServerId,
  isLoopbackBaseUrl,
  localModelBelowMinimumReason,
  localModelId,
  normalizeLocalBaseUrl,
  normalizeLocalModelSettings,
  parseLocalModelId,
  partitionLocalModels,
} from './inference';
export type {
  LocalChatMessage,
  LocalChatRequest,
  LocalChatResult,
  LocalChatStopReason,
  LocalInferenceCommand,
  LocalModel,
  LocalModelPartition,
  LocalModelRef,
  LocalModelServerId,
  LocalModelServerStatus,
  LocalModelSettings,
  LocalModelSnapshot,
} from './inference';

export {
  DESKTOP_DEEP_LINK_SCHEME,
  DESKTOP_DEEP_LINK_TARGETS,
  HOST_COMMANDS,
  HOST_MENU_SHORTCUTS,
  HOST_SHORTCUT_CHOICES,
  HOST_SHORTCUT_KEYS,
  HOST_SHORTCUT_PREFERENCE_KEYS,
  HOST_SHORTCUT_STATUSES,
  NO_HOST_SHORTCUT,
  defaultHostShortcut,
  describeAccelerator,
  describeHostPlatform,
  desktopDeepLink,
  getHostBridge,
  isHostCommand,
  parseDesktopDeepLink,
} from './host-bridge';
export type {
  DesktopDeepLink,
  DesktopDeepLinkTarget,
  HostBridge,
  HostCommand,
  HostMenuShortcut,
  HostNotifyRequest,
  HostPreferences,
  HostPreferencesState,
  HostShortcutKey,
  HostShortcutStatus,
  HostUpdateAvailability,
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

export {
  DEVICE_HOST_HEADER,
  DEVICE_KEY_MODIFIERS,
  DEVICE_MOUSE_BUTTONS,
  DEVICE_NAMED_KEYS,
  DEVICE_STEP_DEFINITIONS,
  DEVICE_STEP_TOOLS,
  DEVICE_STEP_TTL_MINUTES,
  DeviceStepRefused,
  MAX_DEVICE_CLICK_COUNT,
  MAX_DEVICE_COORDINATE,
  MAX_DEVICE_HOST_HEADER_LENGTH,
  MAX_DEVICE_SCROLL_DELTA,
  MAX_DEVICE_STEP_RESULT_LENGTH,
  MAX_DEVICE_STEP_ROOTS,
  MAX_DEVICE_TYPE_LENGTH,
  MAX_DEVICE_WAIT_MS,
  describeDeviceStep,
  deviceStepCapability,
  deviceStepCommand,
  deviceStepScope,
  encodeDesktopHostDeclaration,
  isDeviceStepTool,
  offeredDeviceStepTools,
  parseDesktopHostDeclaration,
  planDeviceStep,
} from './device-steps';
export type {
  DesktopHostDeclaration,
  DeviceKeyModifier,
  DeviceMouseButton,
  DeviceNamedKey,
  DeviceStepDefinition,
  DeviceStepRegion,
  DeviceStepRequest,
  DeviceStepRoot,
  DeviceStepScope,
  DeviceStepTool,
} from './device-steps';
