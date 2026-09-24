export { isDesktopHost, isLocalModeHost, useDesktopHost, useLocalModeHost } from './lib/host';
export { PRODUCT_HOME_PATH, conversationDeepLink, deepLinkDestination } from './lib/deep-links';
export { notifyJobComplete, type DesktopJobNotification } from './lib/notify';
export {
  DesktopHostUnavailable,
  answerDeveloperApproval,
  cancelLocalChat,
  cancelLocalCommand,
  capturePairedBrowser,
  clickInPairedBrowser,
  downloadThroughPairedBrowser,
  installBrowserHost,
  interruptDeveloperTurn,
  listDeveloperModels,
  listDeveloperSessions,
  navigatePairedBrowser,
  onDeveloperSessionEvent,
  readDeveloperRuntimeStatus,
  reportDesktopAccount,
  readDeveloperSession,
  resumeDeveloperSession,
  startDeveloperSession,
  startDeveloperTurn,
  readBrowserPairing,
  readPairedBrowserConsole,
  readPairedBrowserNetwork,
  readPairedPage,
  screenshotAttachment,
  typeInPairedBrowser,
  unpairBrowser,
  clipboardAttachments,
  listLocalModels,
  listWorkspaceFiles,
  listWorkspaceRoots,
  openWorkspaceInEditor,
  openWorkspacePath,
  pickWorkspaceRoot,
  readHostClipboard,
  readLocalCommandPolicy,
  readLocalModelSettings,
  readLocalModelSnapshot,
  readWorkspaceFile,
  readWorkspaceFileBytes,
  readWorkspaceText,
  revealWorkspacePath,
  revealWorkspaceRoot,
  revokeWorkspaceRoot,
  startLocalChat,
  startLocalCommand,
  writeLocalCommandPolicy,
  writeLocalModelSettings,
  type LocalChatDelta,
  type LocalChatRun,
  type LocalCommandOutput,
  type LocalCommandRun,
} from './lib/runtime-client';
export {
  executeDeviceStep,
  readDeviceHostDeclaration,
  type DeviceStepOutcome,
} from './lib/device-steps';
export { readSelectedLocalModel, useLocalModelSelection } from './lib/local-model-selection';
export { useLocalModels, type LocalModelsState } from './hooks/use-local-models';
export { useDesktopDeepLinks } from './hooks/use-desktop-deep-links';
export { useDesktopExternalLinks } from './hooks/use-desktop-external-links';
export { useHomeHref } from './hooks/use-home-href';
export { useHostCommands } from './hooks/use-host-commands';
export { useHostShortcuts, type HostShortcutRow } from './hooks/use-host-shortcuts';
export { useWindowZoom } from './hooks/use-window-zoom';
export { useDesktopVoiceHotkey } from './hooks/use-desktop-voice-hotkey';
export { DesktopHostMount } from './components/DesktopHostMount';
export { BrowserPairingSection } from './components/BrowserPairingSection';
export { RemoteControlSection } from './components/RemoteControlSection';
export { BrowserToolsDialog, type BrowserToolsDialogProps } from './components/BrowserToolsDialog';
export { DesktopRouteMessage } from './components/DesktopRouteMessage';
export { DesktopRouteSurface } from './components/DesktopRouteSurface';
export { DesktopSettingsSection } from './components/DesktopSettingsSection';
export { DesktopTitleStrip } from './components/DesktopTitleStrip';
export { DesktopUpdateRow } from './components/DesktopUpdateRow';
export { DesktopUpdateNotice } from './components/DesktopUpdateNotice';
export { LocalAccessSection } from './components/LocalAccessSection';
export { LocalCommandDialog, type LocalCommandDialogProps } from './components/LocalCommandDialog';
export {
  LocalFolderAttachDialog,
  type LocalFolderAttachDialogProps,
} from './components/LocalFolderAttachDialog';
