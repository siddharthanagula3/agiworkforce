const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withDangerousMod,
  withInfoPlist,
} = require('@expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

const {
  ANDROID_RESOURCE_NAME,
  androidNetworkSecurityConfigXml,
  iosPinnedDomains,
  pinnedHostsFrom,
  provisionedPins,
  readPinTable,
  readRequiredHosts,
  readRollout,
} = require('./tlsPinConfig.cjs');

const PLUGIN_NAME = 'agi-tls-pinning-plugin';
const PLUGIN_VERSION = '1.0.0';
// Android allows one android:networkSecurityConfig. A second plugin that owns it
// replaces the pin-set with its own (cleartext-permitting) config, while
// extra.tlsPinning still tells secureFetch the build is pinned.
const CONFLICTING_ANDROID_NETWORK_PLUGINS = ['withAGIDetox'];

function conflictingNetworkPlugin(config) {
  const entries = Array.isArray(config.plugins) ? config.plugins : [];
  for (const entry of entries) {
    const reference = String(Array.isArray(entry) ? entry[0] : entry);
    if (CONFLICTING_ANDROID_NETWORK_PLUGINS.some((name) => reference.includes(name))) {
      return reference;
    }
  }
  return undefined;
}

function withTlsPinning(config, props) {
  const pins = provisionedPins(readPinTable(props?.source));
  const hosts = pinnedHostsFrom(pins);
  const rollout = readRollout(props?.source);

  // The release script that used to catch this (scripts/check-tls-pins.mjs)
  // greps for a PINNING_ENFORCED literal that stopped existing when enforcement
  // became derived, so this is the live guard: an enforced rollout over a table
  // that provisions nothing installs an app that refuses every pinned host, and
  // no over-the-air update can repair a binary that compiled no pin config.
  if (rollout === 'enforced' && hosts.length === 0) {
    throw new Error(
      `${PLUGIN_NAME}: lib/pinning.ts sets PINNING_ROLLOUT to 'enforced' but every pin in ` +
        `PINS_BY_HOST is still a placeholder, so this build would ship enforcement with nothing to ` +
        `enforce. Run node scripts/compute-spki-pins.mjs and paste real hashes for every ` +
        `REQUIRED_PINNED_HOSTS entry, or set PINNING_ROLLOUT back to 'report-only'.`,
    );
  }

  if (hosts.length === 0) return config;

  // A table that pins some required hosts and not others produces an app that
  // refuses the unpinned ones at runtime with no over-the-air remedy. Fail the
  // prebuild instead, while the change is still a text edit.
  const missing = readRequiredHosts(props?.source).filter((host) => !hosts.includes(host));
  if (missing.length > 0) {
    throw new Error(
      `${PLUGIN_NAME}: lib/pinning.ts provisions ${hosts.join(', ')} but still holds placeholders ` +
        `for ${missing.join(', ')}. Provision every REQUIRED_PINNED_HOSTS entry in one change ` +
        `(node scripts/compute-spki-pins.mjs), or drop the host from that list if it must not be pinned.`,
    );
  }

  // Provisioning the pins and turning pinning on are separate reviewed changes.
  // Until lib/pinning.ts says 'enforced', a table of real pins still emits
  // nothing: the paste must not change the built app, because a wrong hash here
  // hard-fails every connection on an installed binary with no remedy but a
  // store release.
  if (rollout !== 'enforced') return config;

  const conflict = conflictingNetworkPlugin(config);
  if (conflict) {
    throw new Error(
      `${PLUGIN_NAME}: "${conflict}" also owns android:networkSecurityConfig, so this build would ` +
        `report itself as pinned while Android trusts any accepted certificate. Build without that ` +
        `plugin (unset EXPO_ENABLE_DETOX) for any artifact that ships pins.`,
    );
  }

  let next = config;

  // secureFetch reads this back through expo-constants and refuses pinned hosts
  // when it is absent, so the runtime gate follows the config the build really
  // shipped rather than a claim the JS bundle makes about itself.
  next.extra = { ...(next.extra ?? {}), tlsPinning: { hosts, plugin: PLUGIN_NAME } };

  next = withInfoPlist(next, (cfg) => {
    cfg.modResults.NSAppTransportSecurity = {
      ...(cfg.modResults.NSAppTransportSecurity ?? {}),
      NSPinnedDomains: iosPinnedDomains(pins),
    };
    return cfg;
  });

  next = withAndroidManifest(next, (cfg) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    application.$['android:networkSecurityConfig'] = `@xml/${ANDROID_RESOURCE_NAME}`;
    return cfg;
  });

  next = withDangerousMod(next, [
    'android',
    (cfg) => {
      const xmlDir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml',
      );
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(
        path.join(xmlDir, `${ANDROID_RESOURCE_NAME}.xml`),
        androidNetworkSecurityConfigXml(pins),
        'utf8',
      );
      return cfg;
    },
  ]);

  return next;
}

module.exports = createRunOncePlugin(withTlsPinning, PLUGIN_NAME, PLUGIN_VERSION);
module.exports.PLUGIN_NAME = PLUGIN_NAME;
module.exports.withTlsPinning = withTlsPinning;
