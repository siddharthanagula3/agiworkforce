/**
 * platform/ — VS Code API wrappers: config, version, workspace helpers, edit utilities.
 *
 * Phase 6 reorg: moved from utils/config.ts, utils/version.ts,
 * utils/workspaceFolders.ts, utils/applyEdit.ts.
 */
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
