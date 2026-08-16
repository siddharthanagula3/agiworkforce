const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = Array.from(new Set([monorepoRoot, ...(config.watchFolders ?? [])]));

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

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
