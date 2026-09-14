export { isDesktopHost, useDesktopHost } from './lib/host';
export { PRODUCT_HOME_PATH, conversationDeepLink, deepLinkDestination } from './lib/deep-links';
export { notifyJobComplete, type DesktopJobNotification } from './lib/notify';
export {
  DesktopHostUnavailable,
  cancelLocalChat,
  cancelLocalCommand,
  capturePairedBrowser,
  clickInPairedBrowser,
  downloadThroughPairedBrowser,
  installBrowserHost,
  navigatePairedBrowser,
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
  openWorkspacePath,
  pickWorkspaceRoot,
  readHostClipboard,
  readLocalCommandPolicy,
  readLocalModelSettings,
  readLocalModelSnapshot,
  readWorkspaceFile,
  readWorkspaceFileBytes,
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
export { useWindowZoom } from './hooks/use-window-zoom';
export { useDesktopVoiceHotkey } from './hooks/use-desktop-voice-hotkey';
export { DesktopHostMount } from './components/DesktopHostMount';
export { BrowserPairingSection } from './components/BrowserPairingSection';
export { BrowserToolsDialog, type BrowserToolsDialogProps } from './components/BrowserToolsDialog';
export { DesktopRouteMessage } from './components/DesktopRouteMessage';
export { DesktopRouteSurface } from './components/DesktopRouteSurface';
export { DesktopSettingsSection } from './components/DesktopSettingsSection';
export { DesktopTitleStrip } from './components/DesktopTitleStrip';
export { DesktopUpdateRow } from './components/DesktopUpdateRow';
export { LocalAccessSection } from './components/LocalAccessSection';
export { LocalCommandDialog, type LocalCommandDialogProps } from './components/LocalCommandDialog';
export {
  LocalFolderAttachDialog,
  type LocalFolderAttachDialogProps,
} from './components/LocalFolderAttachDialog';
