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
  DISPATCH_TASK_REPORT,
  DISPATCH_TASK_REPORT_STATUSES,
  DISPATCH_TASK_RUNNER_READY,
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
  DispatchTaskAssignment,
  DispatchTaskReport,
  DispatchTaskReportStatus,
} from './protocol';

export {
  DEVELOPER_FILE_CHANGE_LABELS,
  DEVELOPER_FILE_CHANGES,
  DEVELOPER_SESSION_COMMANDS,
  DEVELOPER_SESSION_EVENT_MESSAGE_KINDS,
  DEVELOPER_SESSION_ORIGIN_LABELS,
  DEVELOPER_SESSION_TRUST_LABELS,
  DEVELOPER_TURN_OUTCOMES,
  WORKING_TREE_CHANGE_STATES,
  isDeveloperSessionCommand,
  messageKindForDeveloperSessionEvent,
  parseWorkingTreeStatus,
} from './developer-sessions';
export type {
  DeveloperApprovalAnswer,
  DeveloperFileChange,
  DeveloperHostModel,
  DeveloperModelOption,
  DeveloperModelUnreachable,
  DeveloperRuntimeFeatures,
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
  LocalBranchPush,
  LocalBranches,
  WorkingTreeChange,
  WorkingTreeChangeState,
  WorkingTreeChanges,
} from './developer-sessions';

export {
  DEVELOPER_AGENT_MODES,
  DEVELOPER_AGENT_MODE_LABELS,
  DEVELOPER_SESSION_PROTOCOL_VERSION,
  LEGACY_DEVELOPER_SESSION_PROTOCOL_VERSION,
  MINIMUM_DEVELOPER_SESSION_PROTOCOL_VERSION,
  PROTOCOL_VERSION_UNSUPPORTED_ERROR_CODE,
  SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS,
  developerAgentModeApprovesWithoutAsking,
  developerSessionUpgradeTarget,
  isDeveloperAgentModeReadOnly,
  negotiateDeveloperSessionProtocol,
  normalizeDeveloperAgentMode,
} from './developer-session';
export type { DeveloperAgentMode, DeveloperSessionNegotiation } from './developer-session';

export { BROWSER_PAIRING_COMMANDS } from './browser-bridge';
export type {
  BrowserActivityEntry,
  BrowserActivityOutcome,
  BrowserPairRequestPrompt,
  BrowserPairingCommand,
  BrowserPairingState,
} from './browser-bridge';

export { WORKSPACE_COMMANDS, WORKSPACE_ROOT_KINDS, isWorkspaceRootKind } from './workspace';
export type {
  WorkspaceCommand,
  WorkspaceGitState,
  WorkspaceRoot,
  WorkspaceRootKind,
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
  FileTextEdit,
  FileTextWrite,
  FilesystemCommand,
} from './filesystem';

export { APPLICATION_COMMANDS } from './apps';
export type { ApplicationCommand, ApplicationOpenResult } from './apps';

export { CLIPBOARD_COMMANDS, MAX_CLIPBOARD_TEXT_LENGTH, isEmptyClipboard } from './clipboard';
export type { ClipboardCommand, ClipboardImage, ClipboardSnapshot } from './clipboard';

export {
  ALWAYS_REFUSED_PROGRAMS,
  BACKGROUND_SHELL_COLUMNS,
  BACKGROUND_SHELL_FIRST_OUTPUT_MS,
  BACKGROUND_SHELL_READ_SETTLE_MS,
  BACKGROUND_SHELL_ROWS,
  EMPTY_SHELL_POLICY,
  MAX_SHELL_COMMAND_LENGTH,
  MAX_SHELL_INPUT_LENGTH,
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
  BackgroundShellOutput,
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
  CODE_HOME_DEEP_LINK_ID,
  DEFAULT_SESSION_COMPLETION_ALERTS,
  DESKTOP_DEEP_LINK_SCHEME,
  DESKTOP_DEEP_LINK_TARGETS,
  HOST_COMMANDS,
  HOST_MENU_SHORTCUTS,
  HOST_SHORTCUT_CHOICES,
  HOST_SHORTCUT_KEYS,
  HOST_SHORTCUT_PREFERENCE_KEYS,
  HOST_SHORTCUT_STATUSES,
  NO_HOST_SHORTCUT,
  SESSION_COMPLETION_ALERT_LABELS,
  SESSION_COMPLETION_ALERTS,
  defaultHostShortcut,
  describeAccelerator,
  describeHostPlatform,
  desktopDeepLink,
  getHostBridge,
  hostHasLocalMode,
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
  HostShell,
  HostShortcutKey,
  HostShortcutStatus,
  HostUpdateAvailability,
  SessionCompletionAlerts,
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
  BROWSER_STEP_COMMAND,
  DEVICE_HOST_HEADER,
  DEVICE_BROWSER_CONSOLE_LEVELS,
  DEVICE_KEY_MODIFIERS,
  DEVICE_MOUSE_BUTTONS,
  DEVICE_NAMED_KEYS,
  DEVICE_REVIEWED_STEP_TOOLS,
  DEVICE_STEP_DEFINITIONS,
  DEVICE_STEP_TOOLS,
  DEVICE_STEP_TTL_MINUTES,
  DeviceStepRefused,
  PHONE_STEP_COMMAND,
  MAX_DEVICE_CLICK_COUNT,
  MAX_DEVICE_COORDINATE,
  MAX_DEVICE_DISPLAY_ID,
  MAX_DEVICE_HOST_HEADER_LENGTH,
  MAX_DEVICE_REVIEW_LENGTH,
  MAX_DEVICE_SEARCH_LENGTH,
  MAX_DEVICE_SCROLL_DELTA,
  MAX_DEVICE_STEP_RESULT_LENGTH,
  MAX_DEVICE_STEP_ROOTS,
  MAX_DEVICE_TYPE_LENGTH,
  MAX_DEVICE_WAIT_MS,
  declarationForHost,
  describeDeviceDisplays,
  describeDeviceStep,
  deviceStepBrowserCommand,
  deviceStepCapability,
  deviceStepCommand,
  deviceStepScope,
  encodeDesktopHostDeclaration,
  isDeviceStepTool,
  isScreenDeviceStep,
  offeredDeviceStepTools,
  parseDesktopHostDeclaration,
  planDeviceStep,
} from './device-steps';
export type {
  DesktopHostDeclaration,
  DeviceBrowserConsoleLevel,
  DeviceHostKind,
  DeviceStepCapability,
  DeviceKeyModifier,
  DeviceMouseButton,
  DeviceNamedKey,
  DeviceScreenDisplay,
  DeviceStepDefinition,
  DeviceStepRegion,
  DeviceStepRequest,
  DeviceStepRoot,
  DeviceStepScope,
  DeviceStepTool,
} from './device-steps';

export {
  DEVICE_REGISTRY_PROFILE_COMMAND,
  IDLE_REMOTE_CONTROL_STATE,
  REMOTE_CONTROL_COMMANDS,
} from './remote-control';
export type {
  DeviceRegistryProfile,
  RemoteControlCommand,
  RemoteControlStartRequest,
  RemoteControlState,
  RemoteControlStatus,
} from './remote-control';

export {
  SYSTEM_PERMISSION_KINDS,
  SYSTEM_PERMISSION_LABELS,
  SYSTEM_PERMISSION_PURPOSES,
  isSystemPermissionKind,
} from './desktop-privacy';
export type {
  DesktopPermissionsReview,
  ReviewedPermission,
  SystemPermissionKind,
  SystemPermissionStatus,
} from './desktop-privacy';

export {
  COMPUTER_USE_PHASES,
  COMPUTER_USE_STOP_SHORTCUT,
  describeDeviceFrontWindow,
  deviceFrontWindowRefusal,
  readDeviceFrontWindow,
} from './computer-use';
export type {
  ComputerUsePauseCause,
  ComputerUsePhase,
  ComputerUseStatus,
  DeviceFrontWindow,
} from './computer-use';

export { BACKGROUND_WORK_KINDS, isBackgroundWorkKind } from './background-activity';
export type {
  BackgroundActivity,
  BackgroundCodingRuntime,
  BackgroundCommandRun,
  BackgroundWorkKind,
} from './background-activity';
export {
  BROWSER_SIGN_IN_START,
  DESKTOP_SIGN_IN_COMPLETE_PATH,
  DESKTOP_SIGN_IN_LINK_HOST,
  DESKTOP_SIGN_IN_PATH,
  desktopSignInLink,
  isDesktopSignInLink,
  readDesktopSignInChallenge,
  readDesktopSignInCode,
} from './desktop-sign-in';
