import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cliAcquisitionHint } from '../integrations/localRuntimeClient';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');

function readRepoFile(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), 'utf8');
}

function rustU32Constant(relativePath: string, name: string): number {
  const source = readRepoFile(relativePath);
  const match = new RegExp(`pub const ${name}: u32 = (\\d+);`, 'u').exec(source);
  expect(
    match,
    `${name} is no longer declared as a \`pub const … : u32\` in ${relativePath}. This guard exists to catch that rename — re-point it before editing the extension's own constants.`,
  ).not.toBeNull();
  return Number(match?.[1]);
}

// Scoped to the [package] table rather than to EOF: `[dependencies.foo]`
// sub-tables also put `version = "…"` at line start, so an EOF slice would
// silently report a dependency's version if [package] ever lost its own.
export function cargoPackageVersion(source: string): string | undefined {
  const start = source.indexOf('[package]');
  if (start === -1) return undefined;
  const body = source.slice(start + '[package]'.length);
  const nextTable = /^\s*\[/mu.exec(body);
  const packageSection = nextTable === null ? body : body.slice(0, nextTable.index);
  return /^version = "([^"]+)"$/mu.exec(packageSection)?.[1];
}

function cliCrateVersion(relativePath: string): string {
  const version = cargoPackageVersion(readRepoFile(relativePath));
  expect(
    version,
    `no version in the [package] table of ${relativePath}. This guard reads the CLI's shipped version from there — re-point it before changing the extension's minimum.`,
  ).toBeDefined();
  return version ?? '';
}

function extensionConstant(name: string): number {
  const source = readRepoFile('apps/extension-vscode/src/integrations/localRuntimeClient.ts');
  const match = new RegExp(`const ${name} = (\\d+);`, 'u').exec(source);
  expect(match, `${name} is no longer a numeric constant in localRuntimeClient.ts`).not.toBeNull();
  return Number(match?.[1]);
}

function extensionMinimumCliVersion(): string {
  const source = readRepoFile('apps/extension-vscode/src/integrations/localRuntimeClient.ts');
  const match = /const MINIMUM_SUPPORTED_CLI_VERSION = \[(\d+), (\d+), (\d+)\] as const;/u.exec(
    source,
  );
  expect(match, 'MINIMUM_SUPPORTED_CLI_VERSION is no longer a three-part tuple').not.toBeNull();
  return match === null ? '' : `${match[1]}.${match[2]}.${match[3]}`;
}

function compareSemver(left: string, right: string): number {
  const parse = (value: string): number[] => value.split('.').map(Number);
  const [a, b] = [parse(left), parse(right)];
  for (let index = 0; index < 3; index++) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// The extension rejects any app-server that does not report exactly these
// numbers. The producing constants live in crates the extension does not own,
// so a bump there would otherwise only surface as a dead Marketplace install.
describe('developer-session contract with the shipped AGI CLI', () => {
  it('accepts exactly the protocol version the CLI advertises', () => {
    expect(extensionConstant('SUPPORTED_PROTOCOL_VERSION')).toBe(
      rustU32Constant(
        'crates/agiworkforce-protocol/src/developer_session.rs',
        'DEVELOPER_SESSION_PROTOCOL_VERSION',
      ),
    );
  });

  it('accepts exactly the agent-event schema version the CLI emits', () => {
    expect(extensionConstant('AGENT_EVENT_SCHEMA_VERSION')).toBe(
      rustU32Constant(
        'crates/agiworkforce-protocol/src/agent_events.rs',
        'AGENT_EVENT_SCHEMA_VERSION',
      ),
    );
  });

  it('does not demand a CLI version newer than the one the CLI crate builds', () => {
    const shipped = cliCrateVersion('apps/cli/Cargo.toml');
    const required = extensionMinimumCliVersion();

    expect(
      compareSemver(shipped, required),
      `apps/cli builds ${shipped} but the extension requires >= ${required}. Every install would be refused at the handshake.`,
    ).toBeGreaterThanOrEqual(0);
  });
});

// The npm package is scaffolded but unpublished. An error that prints an
// install command which 404s teaches users to distrust every other message the
// extension shows them, so the command stays behind CLI_IS_PUBLISHED.
describe('missing-CLI copy never promises a distribution that does not exist', () => {
  const npmPackageIsPublished = /const CLI_IS_PUBLISHED: boolean = (true|false);/u.exec(
    readRepoFile('apps/extension-vscode/src/integrations/localRuntimeClient.ts'),
  )?.[1];

  it('keeps the install command behind a single named flag', () => {
    expect(
      npmPackageIsPublished,
      'CLI_IS_PUBLISHED must stay a single boolean constant — it is the one-line switch that surfaces the install command once npm publishing lands.',
    ).toBeDefined();
  });

  it('prints no install command while that flag is false', () => {
    if (npmPackageIsPublished !== 'false') return;
    const hint = cliAcquisitionHint();

    expect(hint).not.toMatch(/npm (install|i) -g/u);
    expect(hint).not.toContain('@agiworkforce/cli');
    expect(hint).not.toMatch(/brew install/u);
    expect(hint).not.toMatch(/install\.sh/u);
    expect(hint).not.toMatch(/curl/u);
  });

  it('still tells the user the one thing that does work today', () => {
    const hint = cliAcquisitionHint();

    expect(hint).toContain('agiWorkforce.cliPath');
    expect(hint).toContain(extensionMinimumCliVersion());
  });

  it('ships no install command anywhere else in the extension source or readme', () => {
    if (npmPackageIsPublished !== 'false') return;
    for (const file of [
      'apps/extension-vscode/README.md',
      'apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts',
      'apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts',
      'apps/extension-vscode/src/features/settings/settingsWebviewContent.ts',
    ]) {
      const source = readRepoFile(file);
      expect(source, file).not.toMatch(/npm (install|i) -g @agiworkforce/u);
      expect(source, file).not.toMatch(/brew install .*agi/u);
      expect(source, file).not.toMatch(/install\.sh/u);
    }
  });
});

// cli-prod made `cpal`/`hound` optional in apps/cli/Cargo.toml, adding inline
// tables with their own `version = "…"`. These fixtures pin that the reader
// keeps returning the [package] version and cannot fall through to a
// dependency's if [package] ever loses its own.
describe('the Cargo version reader is scoped to the [package] table', () => {
  const withOptionalDeps = [
    '[package]',
    'publish = false',
    'name = "agiworkforce-cli"',
    'version = "1.7.1"',
    'edition = "2021"',
    '',
    '[dependencies]',
    'cpal = { version = "0.15", optional = true }',
    'hound = { version = "3.5", optional = true }',
    'ratatui = "0.30"',
  ].join('\n');

  it('ignores inline-table dependency versions', () => {
    expect(cargoPackageVersion(withOptionalDeps)).toBe('1.7.1');
  });

  it('ignores a line-start version inside a dependency sub-table', () => {
    const withSubTable = [
      '[package]',
      'name = "agiworkforce-cli"',
      'version = "1.7.1"',
      '',
      '[dependencies.serde]',
      'version = "1.0.200"',
    ].join('\n');

    expect(cargoPackageVersion(withSubTable)).toBe('1.7.1');
  });

  it('reports nothing rather than a dependency version when [package] has none', () => {
    const missingPackageVersion = [
      '[package]',
      'name = "agiworkforce-cli"',
      '',
      '[dependencies.serde]',
      'version = "1.0.200"',
    ].join('\n');

    expect(cargoPackageVersion(missingPackageVersion)).toBeUndefined();
  });

  it('matches what the real crate file reports today', () => {
    expect(cargoPackageVersion(readRepoFile('apps/cli/Cargo.toml'))).toBe('1.7.1');
  });
});
