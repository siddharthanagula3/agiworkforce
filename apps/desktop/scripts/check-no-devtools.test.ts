import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  debugAssertionRoutes,
  environmentRoutes,
  findDevtoolsActivation,
  findInspectorRoutes,
  parseCargoFeatureArgs,
  parseFeatureTable,
  readReleaseSources,
  resolveFeatureClosure,
  splitArgs,
  tauriConfigFeatures,
  tauriDependencyFeatures,
  // @ts-expect-error -- plain ESM guard script, checked by its own assertions
} from './check-no-devtools.mjs';

const manifestText = readFileSync(
  path.resolve(import.meta.dirname, '../src-tauri/Cargo.toml'),
  'utf8',
);

const WINDOWS_RELEASE_ARGS = [
  '--no-default-features',
  '--features',
  'shell,updater,billing,vad,remote-databases',
];

const RELEASE_BUILD = {
  requested: [],
  noDefaultFeatures: false,
  allFeatures: false,
  debug: false,
  profile: 'release',
  configs: [],
  cargoConfigs: [],
};

function routesWith(overrides: Record<string, unknown>) {
  return findInspectorRoutes({ ...readReleaseSources(), ...overrides });
}

describe('cargo feature table parsing', () => {
  it('reads the shipped manifest feature graph', () => {
    const table = parseFeatureTable(manifestText);
    expect(table.get('default')).toEqual(['shell', 'updater', 'billing', 'vad']);
    expect(table.get('devtools')).toEqual(['tauri/devtools']);
  });

  it('ignores assignments outside the features table', () => {
    const table = parseFeatureTable('[dependencies]\ndevtools = "1.0"\n[features]\nvad = []\n');
    expect(table.has('devtools')).toBe(false);
    expect(table.has('vad')).toBe(true);
  });

  it('reads a feature list spread over several lines', () => {
    const table = parseFeatureTable('[features]\nbig = [\n  "one",\n  "two",\n]\n');
    expect(table.get('big')).toEqual(['one', 'two']);
  });

  it('follows every hop of a feature chain', () => {
    const table = parseFeatureTable('[features]\na = ["b"]\nb = ["c"]\nc = []\n');
    expect([...resolveFeatureClosure(table, ['a'])].sort()).toEqual(['a', 'b', 'c']);
  });

  it('terminates on a cyclic feature graph', () => {
    const table = parseFeatureTable('[features]\na = ["b"]\nb = ["a"]\n');
    expect([...resolveFeatureClosure(table, ['a'])].sort()).toEqual(['a', 'b']);
  });
});

describe('bundler feature argument parsing', () => {
  it('reads the comma list and the default-features switch the release jobs pass', () => {
    expect(
      parseCargoFeatureArgs(['--no-default-features', '--features', 'shell,updater,billing,vad']),
    ).toEqual({
      ...RELEASE_BUILD,
      requested: ['shell', 'updater', 'billing', 'vad'],
      noDefaultFeatures: true,
    });
  });

  it('reads the inline and package-qualified forms clippy lanes use', () => {
    expect(parseCargoFeatureArgs(['--features=agiworkforce-desktop/devtools']).requested).toEqual([
      'devtools',
    ]);
  });

  it('treats an absent --features as the default feature set', () => {
    expect(parseCargoFeatureArgs([])).toEqual(RELEASE_BUILD);
  });

  it('reads the Tauri CLI flags before the cargo tail as well as the tail itself', () => {
    expect(
      parseCargoFeatureArgs(
        splitArgs(
          '--config "/tmp/release conf.json" -f one two --bundles nsis -- --no-default-features --features three',
        ),
      ),
    ).toEqual({
      ...RELEASE_BUILD,
      requested: ['one', 'two', 'three'],
      noDefaultFeatures: true,
      configs: ['/tmp/release conf.json'],
    });
  });

  it('reads --all-features, --debug and a clustered -d as the builds they select', () => {
    expect(parseCargoFeatureArgs(['--', '--all-features']).allFeatures).toBe(true);
    expect(parseCargoFeatureArgs(['--debug', '--bundles', 'nsis']).debug).toBe(true);
    expect(parseCargoFeatureArgs(['-vd']).debug).toBe(true);
    expect(parseCargoFeatureArgs(['--bundles', 'app,dmg']).debug).toBe(false);
  });

  it('separates Tauri config overlays from cargo config overrides and reads the profile', () => {
    expect(
      parseCargoFeatureArgs(
        splitArgs(
          '-c a.json --config=b.json -- --config profile.release.lto=true --profile=dev -d',
        ),
      ),
    ).toEqual({
      ...RELEASE_BUILD,
      profile: 'dev',
      configs: ['a.json', 'b.json'],
      cargoConfigs: ['profile.release.lto=true'],
    });
  });
});

describe('devtools activation guard', () => {
  it('rejects the feature set the Windows installer was built with', () => {
    const { requested, noDefaultFeatures } = parseCargoFeatureArgs([
      '--no-default-features',
      '--features',
      'shell,updater,billing,devtools,vad,remote-databases',
    ]);
    expect(findDevtoolsActivation(manifestText, requested, { noDefaultFeatures })).toContain(
      'devtools',
    );
  });

  it('accepts the release feature set with devtools removed', () => {
    const { requested, noDefaultFeatures } = parseCargoFeatureArgs([
      '--no-default-features',
      '--features',
      'shell,updater,billing,vad',
    ]);
    expect(findDevtoolsActivation(manifestText, requested, { noDefaultFeatures })).toEqual([]);
  });

  it('keeps the manifest default feature set free of the inspector', () => {
    expect(findDevtoolsActivation(manifestText, [], { noDefaultFeatures: false })).toEqual([]);
  });

  it('catches devtools reached through an intermediate feature, which a grep cannot', () => {
    const chained = '[features]\ndefault = ["shell"]\nshell = ["hop"]\nhop = ["devtools"]\n';
    expect(findDevtoolsActivation(chained, [], { noDefaultFeatures: false })).toContain('devtools');
  });

  it('catches another feature that reaches the tauri devtools feature without the crate one', () => {
    const rerouted = manifestText.replace(
      /^remote-databases = \[/mu,
      'remote-databases = ["tauri/devtools", ',
    );
    const { requested, noDefaultFeatures } = parseCargoFeatureArgs(WINDOWS_RELEASE_ARGS);
    expect(findDevtoolsActivation(rerouted, requested, { noDefaultFeatures })).toEqual([
      'tauri/devtools',
    ]);
    const weak = '[features]\ndefault = ["hop"]\nhop = ["tauri?/devtools"]\n';
    expect(findDevtoolsActivation(weak, [], { noDefaultFeatures: false })).toEqual([
      'tauri/devtools',
    ]);
  });

  it('catches every feature when the build asks for all of them', () => {
    expect(
      findDevtoolsActivation(manifestText, [], { noDefaultFeatures: true, allFeatures: true }),
    ).toContain('devtools');
  });
});

describe('tauri dependency features', () => {
  it('reads the shipped dependency entry and ignores the dev-dependency one', () => {
    expect(tauriDependencyFeatures(manifestText)).toEqual([
      'tray-icon',
      'macos-private-api',
      'isolation',
    ]);
  });

  it.each([
    [
      'an inline entry',
      '[dependencies]\ntauri = { version = "2", features = ["tray-icon", "devtools"] }\n',
    ],
    [
      'an inline entry spread over several lines',
      '[dependencies]\ntauri = { version = "2", features = [\n  "tray-icon",\n  "devtools",\n] }\n',
    ],
    [
      'a platform-specific entry',
      '[target.\'cfg(windows)\'.dependencies]\ntauri = { version = "2", features = ["devtools"] }\n',
    ],
    ['the table form', '[dependencies.tauri]\nversion = "2"\nfeatures = ["devtools"]\n'],
    ['a dotted key', '[dependencies]\ntauri.version = "2"\ntauri.features = ["devtools"]\n'],
    [
      'the workspace entry a member inherits',
      '[workspace.dependencies]\ntauri = { version = "2", features = ["devtools"] }\n',
    ],
  ])('finds devtools in %s', (_form, manifest) => {
    expect(tauriDependencyFeatures(manifest)).toContain('devtools');
  });

  it('ignores dev and build dependencies, which never reach a release build', () => {
    expect(
      tauriDependencyFeatures(
        '[dev-dependencies]\ntauri = { version = "2", features = ["devtools"] }\n' +
          '[build-dependencies]\ntauri = { version = "2", features = ["devtools"] }\n',
      ),
    ).toEqual([]);
  });
});

describe('release build inspection', () => {
  it('passes the committed manifests and config for every release feature set', () => {
    expect(routesWith({ args: [] })).toEqual([]);
    expect(routesWith({ args: WINDOWS_RELEASE_ARGS })).toEqual([]);
    expect(
      routesWith({
        args: splitArgs(
          '--config "${{ steps.windows-signing.outputs.tauri_config }}" --bundles nsis -- ' +
            WINDOWS_RELEASE_ARGS.join(' '),
        ),
      }),
    ).toEqual([]);
  });

  it('rejects devtools added to the tauri dependency features, which sets no crate feature', () => {
    const manifest = manifestText.replace(
      'features = ["tray-icon", "macos-private-api", "isolation"]',
      'features = ["tray-icon", "macos-private-api", "isolation", "devtools"]',
    );
    expect(manifest).not.toBe(manifestText);
    expect(routesWith({ manifestText: manifest })).toEqual([
      'the tauri dependency features list devtools',
    ]);
  });

  it('rejects devtools asked for by the Tauri config, which the CLI hands to cargo', () => {
    const config = JSON.stringify({ build: { features: ['tauri/devtools'] } });
    expect(tauriConfigFeatures(config)).toEqual(['tauri/devtools']);
    expect(routesWith({ configTexts: [config] })).toEqual(['the tauri/devtools feature']);
  });

  it('rejects devtools passed through the Tauri CLI features flag', () => {
    expect(routesWith({ args: splitArgs('--features devtools --bundles nsis') })).toEqual([
      'the devtools feature',
      'the tauri/devtools feature',
    ]);
  });

  it('rejects a debug build, which carries the inspector without any feature', () => {
    expect(routesWith({ args: ['--debug'] })).toEqual([
      'a --debug build, which always carries the inspector',
    ]);
  });

  it('rejects devtools asked for by a --config overlay, inline or committed', () => {
    const inline = JSON.stringify({ build: { features: ['devtools'] } });
    expect(routesWith({ args: ['--config', inline] })).toEqual([
      'the devtools feature',
      'the tauri/devtools feature',
    ]);
    expect(routesWith({ args: ['--config', 'src-tauri/tauri.dev.conf.json'] })).toEqual([]);
    expect(routesWith({ args: ['--config', 'missing.conf.json'] })).toEqual([
      'the --config overlay missing.conf.json, which cannot be read as Tauri JSON',
    ]);
  });

  it('rejects a build with debug assertions on, which carries the inspector like a debug build', () => {
    expect(routesWith({ args: ['--', '--profile', 'dev'] })).toEqual(['the dev cargo profile']);
    expect(
      routesWith({ args: ['--', '--config', 'profile.release.debug-assertions=true'] }),
    ).toEqual(['profile.release.debug-assertions = true']);
    expect(routesWith({ args: ['--', '--config', 'ci.toml'] })).toEqual([
      'the cargo --config file ci.toml, which is not read',
    ]);
    const { workspaceManifestText } = readReleaseSources();
    expect(
      routesWith({
        workspaceManifestText: workspaceManifestText.replace(
          '[profile.release]\n',
          '[profile.release]\ndebug-assertions = true\n',
        ),
      }),
    ).toEqual(['profile.release.debug-assertions = true']);
  });

  it('reads debug assertions from cargo configuration and the build environment', () => {
    expect(
      debugAssertionRoutes(
        '[profile.release.package."*"]\ndebug-assertions = true # keep\n' +
          '[target.x86_64-pc-windows-msvc]\nrustflags = [\'-C\', "debug-assertions"]\n' +
          '[build]\nrustflags = ["-C", "debug-assertions=off"]\n',
      ),
    ).toEqual([
      'profile.release.package."*".debug-assertions = true',
      'debug assertions in target.x86_64-pc-windows-msvc.rustflags',
    ]);
    expect(
      routesWith({ cargoConfigTexts: ['[profile.release]\ndebug-assertions = true\n'] }),
    ).toEqual(['profile.release.debug-assertions = true']);
    expect(
      environmentRoutes({
        RUSTFLAGS: '-D warnings',
        CARGO_ENCODED_RUSTFLAGS: '-Cdebug-assertions=on',
        CARGO_PROFILE_RELEASE_DEBUG_ASSERTIONS: 'true',
      }),
    ).toEqual([
      'debug assertions in CARGO_ENCODED_RUSTFLAGS',
      'CARGO_PROFILE_RELEASE_DEBUG_ASSERTIONS in the environment',
    ]);
    expect(routesWith({ env: { CARGO_PROFILE_RELEASE_DEBUG_ASSERTIONS: 'false' } })).toEqual([]);
  });

  it('keeps a hash inside a quoted value from swallowing the manifest after it', () => {
    const manifest = manifestText.replace(
      '[dependencies]\n',
      '[dependencies]\nhashed = { git = "https://example.invalid/repo#frag" }\n',
    );
    expect(manifest).not.toBe(manifestText);
    expect(parseFeatureTable(manifest).get('devtools')).toEqual(['tauri/devtools']);
  });
});
