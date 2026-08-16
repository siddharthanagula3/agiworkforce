export { Config, __CONFIG_DEFAULTS } from './config';
export { getExtensionVersion } from './version';
export {
  getActiveWorkspaceFolder,
  getActiveWorkspaceFolderSync,
  getWorkspaceFolderForUri,
  isPathInWorkspace,
  getAllWorkspaceFolders,
  shellQuoteForCurrentPlatform,
  getWorkspaceDisplayName,
} from './workspaceFolders';
export { extractCodeBlock, applyLlmEdit } from './applyEdit';
