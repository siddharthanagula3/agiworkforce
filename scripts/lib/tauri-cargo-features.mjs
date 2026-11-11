import { parse as parseToml } from 'smol-toml';

const TAURI_CLI_MANAGED_FEATURES = ['macos-private-api', 'protocol-asset', 'isolation'];
const TAURI_BUILD_CLI_MANAGED_FEATURES = ['isolation'];

function usesIsolationPattern(tauriConfig) {
  return tauriConfig.app?.security?.pattern?.use === 'isolation';
}

function expectedTauriFeatures(tauriConfig) {
  const app = tauriConfig.app ?? {};
  const features = [];
  if (app.macOSPrivateApi === true || app['macos-private-api'] === true) {
    features.push('macos-private-api');
  }
  const assetProtocol = app.security?.assetProtocol ?? app.security?.['asset-protocol'];
  if (assetProtocol?.enable === true) features.push('protocol-asset');
  if (usesIsolationPattern(tauriConfig)) features.push('isolation');
  return features;
}

function declarations(manifest, table, name) {
  const direct = manifest[table]?.[name];
  if (direct !== undefined) return [{ where: `[${table}]`, dependency: direct }];
  return Object.entries(manifest.target ?? {}).flatMap(([target, tables]) => {
    const dependency = tables?.[table]?.[name];
    return dependency === undefined ? [] : [{ where: `[target.'${target}'.${table}]`, dependency }];
  });
}

function declaredFeatures(dependency) {
  if (typeof dependency === 'string') return [];
  return Array.isArray(dependency?.features) ? dependency.features : [];
}

export function tauriCargoFeatureMismatches(cargoTomlText, tauriConfig) {
  const manifest = parseToml(cargoTomlText);
  const checks = [
    {
      name: 'tauri-build',
      table: 'build-dependencies',
      managed: TAURI_BUILD_CLI_MANAGED_FEATURES,
      expected: usesIsolationPattern(tauriConfig) ? ['isolation'] : [],
    },
    {
      name: 'tauri',
      table: 'dependencies',
      managed: TAURI_CLI_MANAGED_FEATURES,
      expected: expectedTauriFeatures(tauriConfig),
    },
  ];

  const mismatches = [];
  for (const { name, table, managed, expected } of checks) {
    const found = declarations(manifest, table, name);
    if (found.length === 0) {
      mismatches.push(`${name} is not declared in [${table}]`);
      continue;
    }
    for (const { where, dependency } of found) {
      const current = declaredFeatures(dependency).filter((feature) => managed.includes(feature));
      const missing = expected.filter((feature) => !current.includes(feature));
      const extra = current.filter((feature) => !expected.includes(feature));
      if (missing.length > 0) {
        mismatches.push(
          `${name} in ${where} lacks the ${missing.join(', ')} ${missing.length === 1 ? 'feature' : 'features'}`,
        );
      }
      if (extra.length > 0) {
        mismatches.push(
          `${name} in ${where} enables ${extra.join(', ')}, which tauri.conf.json does not select`,
        );
      }
    }
  }
  return mismatches;
}
