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

module.exports = withNativeWind(config, { input: './global.css' });
