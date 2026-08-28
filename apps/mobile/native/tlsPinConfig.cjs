const fs = require('node:fs');
const path = require('node:path');

const PLACEHOLDER_PREFIX = 'PLACEHOLDER_REPLACE_BEFORE_LAUNCH_';
const PIN_PREFIX = 'sha256/';
// Must stay identical to PIN_PATTERN in ../lib/pinning.ts: the runtime gate and
// the native config must agree on which pins count as provisioned, or a build
// ships one of the two halves of enforcement.
const PIN_PATTERN = /^sha256\/[A-Za-z0-9+/]{43}=$/;
const ANDROID_RESOURCE_NAME = 'network_security_config';
const PINNING_SOURCE = path.join(__dirname, '..', 'lib', 'pinning.ts');

function parsePinTable(source) {
  const decl = /export\s+const\s+PINS_BY_HOST[^=]*=\s*Object\.freeze\(\{/.exec(source);
  if (!decl) throw new Error('PINS_BY_HOST literal not found in apps/mobile/lib/pinning.ts');
  const rest = source.slice(decl.index + decl[0].length);
  const end = rest.indexOf('});');
  if (end < 0) throw new Error('unterminated PINS_BY_HOST literal in apps/mobile/lib/pinning.ts');
  const body = rest.slice(0, end);

  const table = {};
  const entry = /['"]([A-Za-z0-9.*-]+)['"]\s*:\s*\[([^\]]*)\]/g;
  let match = entry.exec(body);
  while (match !== null) {
    table[match[1].toLowerCase()] = Array.from(
      match[2].matchAll(/['"]([^'"]+)['"]/g),
      (pin) => pin[1],
    );
    match = entry.exec(body);
  }
  return table;
}

function parseRequiredHosts(source) {
  const decl = /export\s+const\s+REQUIRED_PINNED_HOSTS[^=]*=\s*\[/.exec(source);
  if (!decl) return [];
  const rest = source.slice(decl.index + decl[0].length);
  const end = rest.indexOf(']');
  if (end < 0) throw new Error('unterminated REQUIRED_PINNED_HOSTS literal in lib/pinning.ts');
  return Array.from(rest.slice(0, end).matchAll(/['"]([^'"]+)['"]/g), (host) =>
    host[1].toLowerCase(),
  );
}

/**
 * The rollout stage is read from the same file as the pins so the emitted native
 * config can never be further along than the reviewed decision in that file.
 * An absent literal reads as 'off': a source this cannot parse must not produce
 * pinning nobody asked for.
 */
function parseRollout(source) {
  const match = /export\s+const\s+PINNING_ROLLOUT[^=]*=\s*['"]([a-z-]+)['"]/.exec(source);
  return match ? match[1] : 'off';
}

function readPinTable(sourcePath = PINNING_SOURCE) {
  return parsePinTable(fs.readFileSync(sourcePath, 'utf8'));
}

function readRollout(sourcePath = PINNING_SOURCE) {
  return parseRollout(fs.readFileSync(sourcePath, 'utf8'));
}

function readRequiredHosts(sourcePath = PINNING_SOURCE) {
  return parseRequiredHosts(fs.readFileSync(sourcePath, 'utf8'));
}

function isPlaceholderPin(pin) {
  return pin.includes(PLACEHOLDER_PREFIX);
}

function isProvisionedPin(pin) {
  return !isPlaceholderPin(pin) && PIN_PATTERN.test(pin);
}

function digestOf(pin) {
  return pin.startsWith(PIN_PREFIX) ? pin.slice(PIN_PREFIX.length) : pin;
}

/**
 * A host is emitted only when EVERY pin it declares is a real SPKI hash.
 * Shipping a partially-provisioned or malformed pin-set is worse than shipping
 * none: the native layer hard-fails the connection when no configured pin
 * matches, so one typo bricks the installed app with no over-the-air remedy.
 */
function provisionedPins(table) {
  const provisioned = {};
  for (const host of Object.keys(table).sort()) {
    const pins = table[host];
    if (pins.length === 0 || !pins.every(isProvisionedPin)) continue;
    provisioned[host] = pins.map(digestOf);
  }
  return provisioned;
}

// NSPinnedCAIdentities matches intermediate and root certificates only — iOS
// never compares these hashes against the leaf — so PINS_BY_HOST holds CA keys
// and this file must not emit them as NSPinnedLeafIdentities.
//
// Coverage limit, iOS only: ATS governs NSURLSession, which is what RN's fetch
// uses. RN's iOS WebSocket builds its own CFStream TLS session and never
// consults NSPinnedDomains, so signaling.agiworkforce.com is pinned here for
// fetch traffic but NOT for the pairing socket (packages/platform/utils
// signaling.ts). Android's network_security_config below does cover it, because
// RN's Android WebSocket is OkHttp. Tracked in docs/work/founder-assistance.md.
function iosPinnedDomains(pins) {
  const domains = {};
  for (const [host, digests] of Object.entries(pins)) {
    domains[host] = {
      NSIncludesSubdomains: false,
      NSPinnedCAIdentities: digests.map((digest) => ({ 'SPKI-SHA256-BASE64': digest })),
    };
  }
  return domains;
}

/**
 * Everything here is scoped to a pinned host. There is deliberately no
 * app-wide <base-config>: one would apply to every endpoint the app can reach,
 * including cleartext LAN dispatch targets and user-supplied BYOK base URLs,
 * so provisioning pins for agiworkforce.com would silently break connections
 * this file has no opinion about. The per-host <trust-anchors> only restate the
 * platform default — apps targeting API 24+ already exclude user-added CAs and
 * this app overrides no targetSdkVersion — so on Android it is the <pin-set>
 * that defeats this finding's attacker. iOS has no equivalent default: apps
 * there trust roots a user or an MDM installed, and Apple exempts certificates
 * issued by such a CA from Certificate Transparency, so nothing short of the
 * real hashes in NSPinnedDomains refuses one.
 */
function androidNetworkSecurityConfigXml(pins) {
  const domainConfigs = Object.entries(pins).map(([host, digests]) =>
    [
      '  <domain-config cleartextTrafficPermitted="false">',
      `    <domain includeSubdomains="false">${host}</domain>`,
      '    <trust-anchors>',
      '      <certificates src="system" />',
      '    </trust-anchors>',
      '    <pin-set>',
      ...digests.map((digest) => `      <pin digest="SHA-256">${digest}</pin>`),
      '    </pin-set>',
      '  </domain-config>',
    ].join('\n'),
  );

  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<network-security-config>',
    ...domainConfigs,
    '</network-security-config>',
    '',
  ].join('\n');
}

function pinnedHostsFrom(pins) {
  return Object.keys(pins).sort();
}

module.exports = {
  ANDROID_RESOURCE_NAME,
  PINNING_SOURCE,
  PIN_PATTERN,
  PIN_PREFIX,
  PLACEHOLDER_PREFIX,
  androidNetworkSecurityConfigXml,
  digestOf,
  iosPinnedDomains,
  isPlaceholderPin,
  isProvisionedPin,
  parsePinTable,
  parseRequiredHosts,
  parseRollout,
  pinnedHostsFrom,
  provisionedPins,
  readPinTable,
  readRequiredHosts,
  readRollout,
};
