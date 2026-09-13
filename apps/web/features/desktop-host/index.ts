export { isDesktopHost, useDesktopHost } from './lib/host';
export { conversationDeepLink, deepLinkDestination } from './lib/deep-links';
export { notifyJobComplete, type DesktopJobNotification } from './lib/notify';
export {
  DesktopHostUnavailable,
  listWorkspaceFiles,
  listWorkspaceRoots,
  pickWorkspaceRoot,
  readWorkspaceFile,
  readWorkspaceFileBytes,
  revealWorkspaceRoot,
  revokeWorkspaceRoot,
} from './lib/runtime-client';
export { useDesktopDeepLinks } from './hooks/use-desktop-deep-links';
export { useDesktopVoiceHotkey } from './hooks/use-desktop-voice-hotkey';
export { DesktopHostMount } from './components/DesktopHostMount';
export { LocalFoldersSection } from './components/LocalFoldersSection';
export {
  LocalFolderAttachDialog,
  type LocalFolderAttachDialogProps,
} from './components/LocalFolderAttachDialog';
