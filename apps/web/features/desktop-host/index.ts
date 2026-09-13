export { isDesktopHost, useDesktopHost } from './lib/host';
export { conversationDeepLink, deepLinkDestination } from './lib/deep-links';
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
export { readSelectedLocalModel, useLocalModelSelection } from './lib/local-model-selection';
export { useLocalModels, type LocalModelsState } from './hooks/use-local-models';
export { useDesktopDeepLinks } from './hooks/use-desktop-deep-links';
export { useDesktopVoiceHotkey } from './hooks/use-desktop-voice-hotkey';
export { DesktopHostMount } from './components/DesktopHostMount';
export { BrowserPairingSection } from './components/BrowserPairingSection';
export { BrowserToolsDialog, type BrowserToolsDialogProps } from './components/BrowserToolsDialog';
export { LocalAccessSection } from './components/LocalAccessSection';
export { LocalCommandDialog, type LocalCommandDialogProps } from './components/LocalCommandDialog';
export {
  LocalFolderAttachDialog,
  type LocalFolderAttachDialogProps,
} from './components/LocalFolderAttachDialog';
