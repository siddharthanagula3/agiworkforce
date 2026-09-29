import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AGENT_EVENT_SCHEMA_VERSION,
  DEVELOPER_SESSION_PROTOCOL_VERSION,
  MINIMUM_SUPPORTED_RUNTIME_VERSION,
} from '@agiworkforce/types';
import { CLI_INSTALL_COMMAND } from '../integrations/cliInstaller';
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
    `${name} is no longer declared as a \`pub const … : u32\` in ${relativePath}. This guard exists to catch that rename, re-point it before editing the extension's own constants.`,
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
    `no version in the [package] table of ${relativePath}. This guard reads the CLI's shipped version from there, re-point it before changing the extension's minimum.`,
  ).toBeDefined();
  return version ?? '';
}

function rustU32SliceConstant(relativePath: string, name: string): number[] {
  const source = readRepoFile(relativePath);
  const match = new RegExp(`pub const ${name}: &\\[u32\\] = &\\[([^\\]]*)\\];`, 'u').exec(source);
  expect(
    match,
    `${name} is no longer declared as a \`pub const … : &[u32]\` in ${relativePath}. This guard exists to catch that rename, re-point it before editing the extension's own constants.`,
  ).not.toBeNull();
  return (match?.[1] ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
    .map(Number);
}

const EXTENSION_VERSION_CONSTANTS: Record<string, number> = {
  SUPPORTED_PROTOCOL_VERSION: DEVELOPER_SESSION_PROTOCOL_VERSION,
  AGENT_EVENT_SCHEMA_VERSION,
};

function extensionConstant(name: string): number {
  const value = EXTENSION_VERSION_CONSTANTS[name];
  expect(
    value,
    `${name} is not a shared developer-session version the extension reads`,
  ).toBeDefined();
  return value ?? Number.NaN;
}

function extensionMinimumCliVersion(): string {
  return MINIMUM_SUPPORTED_RUNTIME_VERSION;
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

  // The extension states one version and refuses any other answer. That is
  // only safe because the server echoes the requested version back when it is
  // in this list, and answers -32005 when it is not, so a version missing from
  // the list is not a downgrade, it is every install failing at the handshake.
  it('asks for a version the CLI still answers', () => {
    const requested = extensionConstant('SUPPORTED_PROTOCOL_VERSION');
    const answered = rustU32SliceConstant(
      'crates/agiworkforce-protocol/src/developer_session.rs',
      'SUPPORTED_DEVELOPER_SESSION_PROTOCOL_VERSIONS',
    );

    expect(
      answered,
      `the CLI answers protocol ${answered.join(', ')} and the extension requests ${requested}. The handshake would fail with -32005 on every install.`,
    ).toContain(requested);
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

// The CLI installs only through the signed install script. An error that
// names a route that does not exist teaches users to distrust every other
// message the extension shows them.
describe('missing-CLI copy names only the distribution that exists', () => {
  it('installs through the signed install script', () => {
    expect(CLI_INSTALL_COMMAND).toBe('curl -fsSL https://agiworkforce.com/install.sh | bash');
  });

  it('points at the install command instead of a package manager', () => {
    const hint = cliAcquisitionHint();

    expect(hint).toContain('AGI Workforce: Install AGI CLI');
    expect(hint).not.toMatch(/npm (install|i) -g/u);
    expect(hint).not.toContain('@agiworkforce/cli');
    expect(hint).not.toMatch(/brew install/u);
  });

  it('still tells the user how to use a CLI they already have', () => {
    const hint = cliAcquisitionHint();

    expect(hint).toContain('agiWorkforce.cliPath');
    expect(hint).toContain(extensionMinimumCliVersion());
  });

  it('ships no other install route anywhere in the extension source or readme', () => {
    for (const file of [
      'apps/extension-vscode/README.md',
      'apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts',
      'apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts',
      'apps/extension-vscode/src/features/settings/settingsWebviewContent.ts',
    ]) {
      const source = readRepoFile(file);
      expect(source, file).not.toMatch(/npm (install|i) -g @agiworkforce/u);
      expect(source, file).not.toMatch(/brew install .*agi/u);
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

  it('matches the version Cargo.lock records for the real crate', () => {
    const locked = /^name = "agiworkforce-cli"\nversion = "([^"]+)"$/mu.exec(
      readRepoFile('Cargo.lock'),
    )?.[1];
    expect(locked).toBeDefined();
    expect(cargoPackageVersion(readRepoFile('apps/cli/Cargo.toml'))).toBe(locked);
  });
});
