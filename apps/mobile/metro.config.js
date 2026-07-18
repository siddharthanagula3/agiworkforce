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

const nativeWindConfig = withNativeWind(config, { input: './global.css' });
const nativeWindResolveRequest = nativeWindConfig.resolver.resolveRequest;
const nobleHashesRoot = path.dirname(require.resolve('@noble/hashes'));
const reactNativeWebrtcRoot = path.dirname(
  require.resolve('react-native-webrtc/package.json', { paths: [projectRoot] }),
);
const webRtcEventTargetShim = require.resolve('event-target-shim', {
  paths: [reactNativeWebrtcRoot],
});

const packageExportRemaps = new Map([
  // react-native-webrtc imports this legacy subpath, which is not exported by
  // event-target-shim v6. Resolve from WebRTC's own dependency scope so a
  // different workspace version cannot be selected from the monorepo root.
  ['event-target-shim/index', webRtcEventTargetShim],
  ['@noble/hashes/crypto', path.join(nobleHashesRoot, 'crypto.js')],
  ['@noble/hashes/crypto.js', path.join(nobleHashesRoot, 'crypto.js')],
]);

nativeWindConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  const remappedPath = packageExportRemaps.get(moduleName);
  if (remappedPath) {
    return { type: 'sourceFile', filePath: remappedPath };
  }

  return nativeWindResolveRequest(context, moduleName, platform);
};

module.exports = nativeWindConfig;
