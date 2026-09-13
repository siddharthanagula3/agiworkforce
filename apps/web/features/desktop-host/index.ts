export { isDesktopHost, useDesktopHost } from './lib/host';
export { conversationDeepLink, deepLinkDestination } from './lib/deep-links';
export { notifyJobComplete, type DesktopJobNotification } from './lib/notify';
export {
  DesktopHostUnavailable,
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
  listWorkspaceFiles,
  listWorkspaceRoots,
  openWorkspacePath,
  pickWorkspaceRoot,
  readHostClipboard,
  readLocalCommandPolicy,
  readWorkspaceFile,
  readWorkspaceFileBytes,
  revealWorkspacePath,
  revealWorkspaceRoot,
  revokeWorkspaceRoot,
  startLocalCommand,
  writeLocalCommandPolicy,
  type LocalCommandOutput,
  type LocalCommandRun,
} from './lib/runtime-client';
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
