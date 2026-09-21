#!/usr/bin/env node
// A kill switch nothing reads is a control that does nothing. Every switch in
// the vocabulary must be consulted where its capability runs: the platform
// capabilities through the capability handshake /api/me builds, every other
// switch at an admission point of its own. A switch that has no reader yet is
// listed below with the reader it is owed, and the list may only shrink.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { readVocabulary } from './check-feature-registry.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rootIndex = process.argv.indexOf('--root');

export const KILL_SWITCHES = 'apps/web/lib/feature-flags/kill-switches.ts';
export const ME_ROUTE = 'apps/web/app/api/me/route.ts';
export const HANDSHAKE = 'apps/web/lib/services/capability-handshake-service.ts';

export const READER_ROOTS = [
  'apps/web/app',
  'apps/web/lib',
  'apps/web/features',
  'apps/web/shared',
  'apps/desktop/src',
  'apps/desktop/src-tauri/src',
  'apps/desktop/electron',
  'apps/mobile/src',
  'apps/mobile/app',
  'apps/extension/src',
  'apps/extension-vscode/src',
  'apps/cli/src',
  'packages',
];

/** Switches with no reader today, each naming the reader it is owed. */
export const UNREAD = [
  {
    capability: 'dictation',
    owed:
      'apps/desktop/src-tauri: call RemoteSpeechGate::from_feature_flags with the /api/me flag map ' +
      'and hand the result to VoiceWake::apply_remote_gate when the session refreshes',
    reason:
      'The desktop defines the reader (features/speech/wake.rs) and tests it, but no production code ' +
      'calls from_feature_flags or apply_remote_gate, so flipping capability.dictation reaches /api/me ' +
      'and stops nothing.',
  },
  {
    capability: 'screen_share',
    owed:
      'the screen share admission point: readKillSwitchGate(subject).capabilityAllowed(' +
      "'screen_share') before a visual session with a screen source is started",
    reason:
      'The switch is declared, accepted by the flag config schema and published in disabled_features, ' +
      'but no server route and no client consults it, so an operator who flips it believes screen ' +
      'share stopped while it keeps running.',
  },
  {
    capability: 'desktop_update',
    owed:
      'the desktop update feed: refuse to offer an update while capabilityAllowed(' +
      "'desktop_update') is false for the requesting client version",
    reason:
      'The switch is declared and published in disabled_features, but neither the update feed on the ' +
      'web nor the desktop updater reads it, so a bad release cannot be held back through it.',
  },
];

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'build',
  'target',
  '__tests__',
  '__mocks__',
  'e2e',
]);
const SOURCE = /\.(?:[cm]?[jt]sx?|rs)$/;
const TEST = /\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)tests?\.rs$|_tests?\.rs$/;

function walk(directory, files = []) {
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name) || entry.name === 'tests') continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (SOURCE.test(entry.name) && !TEST.test(full)) files.push(full);
  }
  return files;
}

export function flagSuffix(capability) {
  return capability.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/** Rust source with its `#[cfg(test)]` modules removed. */
export function withoutRustTests(source) {
  const marker = source.search(/#\[cfg\(test\)\]\s*mod\s+\w+\s*\{/);
  return marker < 0 ? source : source.slice(0, marker);
}

function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Constants in the switch module bound to one capability, e.g. WORK_CAPABILITY. */
function constantsFor(killSwitchSource, capability) {
  const names = [];
  const pattern = new RegExp(
    `export const ([A-Z][A-Z0-9_]*)\\s*:\\s*KillSwitchCapability\\s*=\\s*'${escape(capability)}'`,
    'g',
  );
  for (const match of killSwitchSource.matchAll(pattern)) names.push(match[1]);
  return names;
}

/**
 * Whether one file consults the switch. A server file does it through the gate;
 * a client does it by reading the published key or the disabled_features entry.
 * A Rust reader only counts when the function holding it is called from
 * another file, so a reader nothing invokes is not a reader.
 */
export function readsSwitch({ file, source, capability, constants, rustCallers }) {
  const name = escape(capability);
  const key = escape(`capability.${flagSuffix(capability)}`);
  if (file.endsWith('.rs')) {
    const live = withoutRustTests(source);
    if (!new RegExp(`"${key}"`).test(live)) return false;
    return rustCallers(live, `capability.${flagSuffix(capability)}`);
  }
  const argument = [`'${name}'`, `"${name}"`, ...constants].join('|');
  return (
    new RegExp(`capabilityAllowed\\(\\s*(?:${argument})\\s*\\)`).test(source) ||
    new RegExp(`assertCapabilityAvailable\\([^,]+,\\s*(?:${argument})\\s*[,)]`).test(source) ||
    new RegExp(`['"\`]${key}['"\`]`).test(source) ||
    new RegExp(`capability\\s*===?\\s*(?:'${name}'|"${name}")`).test(source)
  );
}

/** The brace-balanced body of `fn name`, or '' when it has none. */
export function rustBody(source, name) {
  const start = source.search(new RegExp(`\\bfn\\s+${name}\\b`));
  if (start < 0) return '';
  const open = source.indexOf('{', start);
  const semicolon = source.indexOf(';', start);
  if (open < 0 || (semicolon >= 0 && semicolon < open)) return '';
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, index + 1);
    }
  }
  return source.slice(open);
}

function rustFunctionsCalledElsewhere(rustFiles) {
  return (file) => (live, key) => {
    const bound = [
      ...live.matchAll(
        new RegExp(`const\\s+([A-Z][A-Z0-9_]*)\\s*:\\s*&str\\s*=\\s*"${escape(key)}"`, 'g'),
      ),
    ].map((match) => match[1]);
    const mentions = new RegExp(
      [`"${escape(key)}"`, ...bound.map((name) => `\\b${name}\\b`)].join('|'),
    );
    const functions = [...live.matchAll(/\bpub(?:\([^)]*\))?\s+fn\s+([a-z_][a-z0-9_]*)/g)].map(
      (match) => match[1],
    );
    const keyed = functions.filter((fn) => mentions.test(rustBody(live, fn)));
    return rustFiles.some(
      (other) =>
        other.file !== file &&
        keyed.some((fn) =>
          new RegExp(`(?:::|\\.)${fn}\\s*\\(`).test(withoutRustTests(other.source)),
        ),
    );
  };
}

export function checkKillSwitchReaders(root) {
  const failures = [];
  const read = (relative) => {
    const full = path.join(root, relative);
    return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
  };

  const killSwitchSource = read(KILL_SWITCHES);
  const extras =
    killSwitchSource === null
      ? null
      : readVocabulary(killSwitchSource, 'EXTRA_KILL_SWITCH_CAPABILITIES');
  if (extras === null) {
    return {
      failures: [
        `${KILL_SWITCHES}: EXTRA_KILL_SWITCH_CAPABILITIES could not be read, so no switch can be checked.`,
      ],
      read: 0,
      extras: 0,
    };
  }

  const me = read(ME_ROUTE) ?? '';
  const handshake = read(HANDSHAKE) ?? '';
  if (!/closedCapabilities\s*:\s*platformCapabilitiesOf\(/.test(me)) {
    failures.push(
      `${ME_ROUTE}: the handshake is no longer built from the closed platform capabilities, so no ` +
        'platform kill switch reaches a client.',
    );
  }
  if (!/for\s*\(\s*const\s+\w+\s+of\s+closedCapabilities\s*\)\s*\w+\.delete\(/.test(handshake)) {
    failures.push(
      `${HANDSHAKE}: the settings layer no longer removes every closed capability from the grant, so ` +
        'a platform switch can be flipped without taking anything away.',
    );
  }

  const files = [];
  for (const scanRoot of READER_ROOTS) {
    for (const full of walk(path.join(root, scanRoot))) {
      const relative = path.relative(root, full).split(path.sep).join('/');
      if (relative === KILL_SWITCHES) continue;
      files.push({ file: relative, source: fs.readFileSync(full, 'utf8') });
    }
  }
  const rustFiles = files.filter((entry) => entry.file.endsWith('.rs'));
  const callersFor = rustFunctionsCalledElsewhere(rustFiles);

  let readCount = 0;
  for (const capability of extras) {
    const constants = constantsFor(killSwitchSource, capability);
    const readers = files.filter((entry) =>
      readsSwitch({
        ...entry,
        capability,
        constants,
        rustCallers: callersFor(entry.file),
      }),
    );
    const owed = UNREAD.find((entry) => entry.capability === capability);
    if (readers.length > 0) {
      readCount += 1;
      if (owed) {
        failures.push(
          `${capability} is read now (${readers.map((entry) => entry.file).join(', ')}); remove its ` +
            'entry from UNREAD so the next unread switch shows.',
        );
      }
      continue;
    }
    if (!owed) {
      failures.push(
        `The ${capability} kill switch is declared in ${KILL_SWITCHES} and nothing reads it: flipping it ` +
          'stops nothing. Consult it where the capability is admitted.',
      );
    }
  }

  for (const entry of UNREAD) {
    if (!extras.includes(entry.capability)) {
      failures.push(
        `UNREAD names ${entry.capability}, which is no longer a kill switch; remove it.`,
      );
    } else if (entry.reason.length < 80 || entry.owed.length < 40) {
      failures.push(`UNREAD entry ${entry.capability} must say what reader it is owed and why.`);
    }
  }

  return { failures, read: readCount, extras: extras.length };
}

function main() {
  const root = rootIndex >= 0 ? path.resolve(process.argv[rootIndex + 1]) : repoRoot;
  const { failures, read, extras } = checkKillSwitchReaders(root);
  if (failures.length > 0) {
    console.error('Kill switches that stop nothing:\n');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(
    `check-kill-switch-readers: platform switches reach clients through the handshake; ${read} of ` +
      `${extras} admission-point switches are read, ${UNREAD.length} owed a reader.`,
  );
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) main();
