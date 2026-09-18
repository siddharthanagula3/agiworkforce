#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MOBILE_ROOT = join(HERE, '..', '..');
const REPO_ROOT = join(MOBILE_ROOT, '..', '..');
// ios/ is prebuild output and git-ignores itself; the extension's real sources
// are these, which the config plugin copies into the generated project.
const EXTENSION_DIR = join(MOBILE_ROOT, 'native', 'ios', 'AGIShareExtension');

// The store records these three, and a changed value orphans every install.
// EAS_SIGNING_RUNBOOK.md documents them; this guard is what enforces them.
export const CANONICAL_IDENTITY = Object.freeze({
  iosBundleIdentifier: 'com.agiworkforce.app',
  androidPackage: 'com.agiworkforce.app',
  appGroup: 'group.com.agiworkforce.app.share',
  scheme: 'agiworkforce',
  slug: 'agi-workforce',
  easProjectId: '38f0941c-88a7-468a-9750-fcd8b357ff4c',
});

const PRODUCTION_ENTITLEMENTS = Object.freeze([
  'com.apple.developer.siri',
  'com.apple.developer.natural-language.translation',
]);

const PRODUCTION_ASSOCIATED_DOMAINS = Object.freeze(['applinks:agiworkforce.com']);

// expo-dev-client stays a dependency: its native launcher is excluded from a
// Release build, and the profile below is what keeps that true.
const FORBIDDEN_PRODUCTION_PLUGINS = Object.freeze([
  'expo-dev-client',
  './native/android/withAGIDetox.cjs',
]);

const EXTENSION_FORBIDDEN_APIS = Object.freeze([
  ['URLSession', 'network access'],
  ['kSecClass', 'keychain access'],
  ['SecItemCopyMatching', 'keychain access'],
  ['Bearer ', 'a bearer token'],
  ['clerk', 'a session credential'],
  ['http://', 'a cleartext URL'],
]);

function pluginName(entry) {
  return Array.isArray(entry) ? entry[0] : entry;
}

export function assertStableIdentifiers(config) {
  const failures = [];
  const check = (label, actual, expected) => {
    if (actual !== expected) {
      failures.push(`${label} is ${JSON.stringify(actual)}, must stay ${JSON.stringify(expected)}`);
    }
  };

  check(
    'ios.bundleIdentifier',
    config.ios?.bundleIdentifier,
    CANONICAL_IDENTITY.iosBundleIdentifier,
  );
  check('android.package', config.android?.package, CANONICAL_IDENTITY.androidPackage);
  check('scheme', config.scheme, CANONICAL_IDENTITY.scheme);
  check('slug', config.slug, CANONICAL_IDENTITY.slug);
  check('extra.eas.projectId', config.extra?.eas?.projectId, CANONICAL_IDENTITY.easProjectId);

  const appGroups = config.ios?.entitlements?.['com.apple.security.application-groups'] ?? [];
  if (appGroups.length !== 1 || appGroups[0] !== CANONICAL_IDENTITY.appGroup) {
    failures.push(
      `ios application-groups is ${JSON.stringify(appGroups)}, must stay ["${CANONICAL_IDENTITY.appGroup}"]`,
    );
  }

  if (failures.length > 0) {
    throw new Error(`app identity changed:\n  - ${failures.join('\n  - ')}`);
  }
}

export function assertProductionHardening(config, easJson) {
  const failures = [];

  const entitlementKeys = Object.keys(config.ios?.entitlements ?? {}).filter(
    (key) => key !== 'com.apple.security.application-groups',
  );
  const unexpected = entitlementKeys.filter((key) => !PRODUCTION_ENTITLEMENTS.includes(key));
  const missing = PRODUCTION_ENTITLEMENTS.filter((key) => !entitlementKeys.includes(key));
  if (unexpected.length > 0) failures.push(`unreviewed iOS entitlements: ${unexpected.join(', ')}`);
  if (missing.length > 0) failures.push(`missing iOS entitlements: ${missing.join(', ')}`);

  const domains = config.ios?.associatedDomains ?? [];
  if (
    domains.length !== PRODUCTION_ASSOCIATED_DOMAINS.length ||
    domains.some((domain, index) => domain !== PRODUCTION_ASSOCIATED_DOMAINS[index])
  ) {
    failures.push(
      `associatedDomains is ${JSON.stringify(domains)}, must be ${JSON.stringify(PRODUCTION_ASSOCIATED_DOMAINS)}`,
    );
  }

  const plugins = (config.plugins ?? []).map(pluginName);
  for (const forbidden of FORBIDDEN_PRODUCTION_PLUGINS) {
    if (plugins.includes(forbidden)) {
      failures.push(`plugin ${forbidden} must not ship in production`);
    }
  }

  const profile = easJson.build?.production ?? {};
  const submit = easJson.submit?.production ?? {};
  if (profile.developmentClient === true)
    failures.push('the production profile ships the dev menu');
  if (profile.environment !== 'production' || profile.channel !== 'production') {
    failures.push('the production profile is not on the production environment and channel');
  }
  if (profile.env?.APP_ENV !== 'production' || profile.env?.EXPO_PUBLIC_APP_ENV !== 'production') {
    failures.push('the production profile does not build with APP_ENV=production');
  }
  if (profile.ios?.buildConfiguration !== 'Release') {
    failures.push('the production iOS profile is not a Release build');
  }
  if (profile.ios?.simulator === true)
    failures.push('the production iOS profile targets a simulator');
  if (profile.ios?.credentialsSource !== 'remote') {
    failures.push('the production iOS archive is not signed with the managed EAS credentials');
  }
  if (profile.android?.buildType !== 'app-bundle') {
    failures.push('the production Android profile does not build an AAB');
  }
  if (submit.ios?.bundleIdentifier !== CANONICAL_IDENTITY.iosBundleIdentifier) {
    failures.push(
      `submit.production.ios.bundleIdentifier is ${JSON.stringify(submit.ios?.bundleIdentifier)}, must stay the canonical id`,
    );
  }

  if (failures.length > 0) {
    throw new Error(`production build is not hardened:\n  - ${failures.join('\n  - ')}`);
  }
}

export function assertShareExtensionAlignment({
  buildSettings,
  infoPlist,
  entitlements,
  source,
  hostVersion,
  hostBuildNumber,
}) {
  const failures = [];

  if (buildSettings.MARKETING_VERSION !== `"${hostVersion}"`) {
    failures.push(
      `extension MARKETING_VERSION is ${buildSettings.MARKETING_VERSION}, must be the host version "${hostVersion}"`,
    );
  }
  if (buildSettings.CURRENT_PROJECT_VERSION !== `"${hostBuildNumber}"`) {
    failures.push(
      `extension CURRENT_PROJECT_VERSION is ${buildSettings.CURRENT_PROJECT_VERSION}, must be the host build "${hostBuildNumber}"`,
    );
  }
  if (
    buildSettings.PRODUCT_BUNDLE_IDENTIFIER !==
    `"${CANONICAL_IDENTITY.iosBundleIdentifier}.share-extension"`
  ) {
    failures.push(
      `extension bundle id is ${buildSettings.PRODUCT_BUNDLE_IDENTIFIER}, must be the host id plus .share-extension`,
    );
  }
  if (!infoPlist.includes('<string>$(MARKETING_VERSION)</string>')) {
    failures.push('extension Info.plist pins a literal version instead of $(MARKETING_VERSION)');
  }
  if (!infoPlist.includes('<string>$(CURRENT_PROJECT_VERSION)</string>')) {
    failures.push(
      'extension Info.plist pins a literal build instead of $(CURRENT_PROJECT_VERSION)',
    );
  }

  const groups = entitlements.match(/<string>([^<]*)<\/string>/gu) ?? [];
  const declared = groups.map((value) => value.replace(/<\/?string>/gu, ''));
  if (declared.length !== 1 || declared[0] !== CANONICAL_IDENTITY.appGroup) {
    failures.push(
      `extension entitlements grant ${JSON.stringify(declared)}, must grant only the app group`,
    );
  }

  const lowered = source.toLowerCase();
  for (const [needle, what] of EXTENSION_FORBIDDEN_APIS) {
    if (lowered.includes(needle.toLowerCase())) {
      failures.push(
        `share extension reaches for ${what} (${needle}); it may only stage files in the app group`,
      );
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `share extension is not aligned with the host app:\n  - ${failures.join('\n  - ')}`,
    );
  }
}

function compareVersions(left, right) {
  const parse = (value) => {
    const parts = value.split('.').map(Number);
    if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part) || part < 0)) {
      throw new Error(`"${value}" is not an X.Y.Z version`);
    }
    return parts;
  };
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

export function assertMonotonicRelease(previous, next) {
  const failures = [];
  const order = compareVersions(previous.version, next.version);
  if (order > 0) {
    failures.push(`version went backwards: ${previous.version} -> ${next.version}`);
  }
  if (order === 0) {
    failures.push(
      `version ${next.version} was already released; a new release needs a new version`,
    );
  }
  if (Number(next.buildNumber) < Number(previous.buildNumber)) {
    failures.push(`iOS buildNumber went backwards: ${previous.buildNumber} -> ${next.buildNumber}`);
  }
  if (Number(next.versionCode) < Number(previous.versionCode)) {
    failures.push(
      `Android versionCode went backwards: ${previous.versionCode} -> ${next.versionCode}`,
    );
  }

  if (failures.length > 0) {
    throw new Error(`release numbering is not monotonic:\n  - ${failures.join('\n  - ')}`);
  }
}

export function readReleaseNumbers(configSource) {
  const read = (pattern, label) => {
    const match = configSource.match(pattern);
    if (!match) throw new Error(`could not read ${label} from the app config`);
    return match[1];
  };
  return {
    version: read(/\n\s*version:\s*'([^']+)'/u, 'expo.version'),
    buildNumber: read(/buildNumber:\s*'([^']+)'/u, 'ios.buildNumber'),
    versionCode: read(/versionCode:\s*(\d+)/u, 'android.versionCode'),
  };
}

function previousReleaseTag(currentVersion) {
  const tags = execFileSync('git', ['tag', '--list', 'v-mobile-*'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .map((tag) => tag.trim())
    .filter((tag) => /^v-mobile-\d+\.\d+\.\d+$/u.test(tag))
    .map((tag) => tag.slice('v-mobile-'.length))
    .filter((version) => compareVersions(version, currentVersion) < 0)
    .sort(compareVersions);
  const highest = tags.at(-1);
  return highest ? `v-mobile-${highest}` : null;
}

export async function verifyReleaseIntegrity({ log = console.log } = {}) {
  process.env.APP_ENV = 'production';
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ||= 'pk_live_release_integrity_check';

  const configModule = await import(pathToFileURL(join(MOBILE_ROOT, 'app.config.js')).href);
  const config = (configModule.default ?? configModule).expo;
  const easJson = JSON.parse(readFileSync(join(MOBILE_ROOT, 'eas.json'), 'utf8'));

  assertStableIdentifiers(config);
  log('[release-integrity] app identifiers unchanged');

  assertProductionHardening(config, easJson);
  log('[release-integrity] entitlements, plugins, signing and the dev menu checked');

  const plugin = await import(
    pathToFileURL(join(MOBILE_ROOT, 'native', 'ios', 'withAGIShareExtension.cjs')).href
  );
  const { getExtensionBuildSettings } = plugin.default ?? plugin;
  assertShareExtensionAlignment({
    buildSettings: getExtensionBuildSettings({
      bundleIdentifier: config.ios.bundleIdentifier,
      version: config.version,
      buildNumber: config.ios.buildNumber,
      developmentTeam: 'D2PR62RLT4',
    }),
    infoPlist: readFileSync(join(EXTENSION_DIR, 'AGIShareExtension-Info.plist'), 'utf8'),
    entitlements: readFileSync(join(EXTENSION_DIR, 'AGIShareExtension.entitlements'), 'utf8'),
    source: readFileSync(join(EXTENSION_DIR, 'ShareViewController.swift'), 'utf8'),
    hostVersion: config.version,
    hostBuildNumber: config.ios.buildNumber,
  });
  log('[release-integrity] share extension version, bundle id, entitlements and sources checked');

  const configSource = readFileSync(join(MOBILE_ROOT, 'app.config.js'), 'utf8');
  const next = readReleaseNumbers(configSource);
  const previousTag = previousReleaseTag(next.version);
  if (previousTag === null) {
    log('[release-integrity] no earlier mobile release tag, numbering check skipped');
  } else {
    const previousSource = execFileSync(
      'git',
      ['show', `${previousTag}:apps/mobile/app.config.js`],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    );
    assertMonotonicRelease(readReleaseNumbers(previousSource), next);
    log(`[release-integrity] numbering moves forward from ${previousTag}`);
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  verifyReleaseIntegrity().catch((error) => {
    console.error(`[release-integrity] ERROR: ${error.message}`);
    process.exit(1);
  });
}
