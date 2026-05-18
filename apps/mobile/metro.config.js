const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Monorepo support: merge expo's default watchFolders with monorepo root.
// Expo's defaults already include all workspace package paths; adding the
// monorepo root ensures Metro also watches root-level node_modules and any
// non-workspace paths that live there.
config.watchFolders = Array.from(new Set([monorepoRoot, ...(config.watchFolders ?? [])]));

// Resolve modules from both the project and the monorepo root
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// nodeModulesPaths above handles dual-root resolution
// Do NOT set disableHierarchicalLookup — it breaks workspace package transitive deps

// Stub node: built-ins that the desktop/Tauri side of @agiworkforce/runtime
// transitively imports but mobile never executes. AsyncLocalStorage is only
// used by Tauri's per-command context isolation; the polyfill returns
// undefined on getStore() which matches mobile's "no context" reality.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'node:async_hooks') {
    return {
      filePath: path.resolve(projectRoot, 'lib/polyfills/async_hooks.cjs'),
      type: 'sourceFile',
    };
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });
