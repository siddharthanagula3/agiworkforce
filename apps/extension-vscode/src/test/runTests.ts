/**
 * runTests.ts — Entry point for `@vscode/test-electron` integration tests.
 *
 * Invoke via `pnpm test:integration` for the source bundle, or
 * `pnpm test:integration:package` to verify, extract, and launch the exact
 * packaged VSIX bytes. The packaged path can accept an explicit AGI CLI with
 * `--cli=/absolute/path/to/agi` (or `AGI_VSCODE_E2E_CLI`) for the real local
 * runtime restart probe. It installs the VSIX through VS Code's CLI into an
 * isolated extension registry, but never downloads or installs the AGI CLI.
 *
 * IMPORTANT: the `test:integration` script runs `node esbuild.js` AFTER the
 * tsc test compile so `out/extension.js` is the real shipped esbuild bundle.
 * The tsc-emitted per-file `out/extension.js` is NOT loadable in the extension
 * host — it `require()`s workspace packages (`@agiworkforce/types`, …) whose
 * entry points are ESM TypeScript source, so module load throws, VS Code marks
 * the extension "active" anyway, and zero commands register. Always test the
 * bundle that ships.
 *
 * The packaged path uses isolated user-data/extensions directories, a separate
 * development-only test-runner extension, and an empty PATH. AGI itself loads
 * from the normal installed-extension registry. This proves both the VSIX
 * installer path and that the configured absolute CLI, rather than an ambient
 * developer install, owns the runtime process when the probe is used.
 *
 * Prerequisites (one-time install):
 *   pnpm add -D mocha @types/mocha glob @types/glob
 *
 * The `@vscode/test-electron` dep is already declared in package.json:devDependencies.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  downloadAndUnzipVSCode,
  resolveCliArgsFromVSCodeExecutablePath,
  runTests,
} from '@vscode/test-electron';
import { resolveVsCodeExecutablePath } from './resolveVsCodeExecutable';
import {
  parseFirstDeltaHoldMs,
  startLocalModelFixture,
  type LocalModelFixture,
} from './localModelFixture';
import {
  findInstalledExtensionRoot,
  verifyInstalledExtension,
  verifyInstalledExtensionRegistry,
  verifyPublicExtensionList,
  writeExtensionHostTestRunner,
  type ExtensionIdentity,
} from './vsixInstallation';

interface PackagedTestArtifact {
  extensionPath: string;
  identity: ExtensionIdentity;
  sha256: string;
  vsixManifestPath: string;
  vsixPath: string;
}

const DEFAULT_VSCODE_E2E_VERSION = '1.131.0';

const CLEARED_PROVIDER_CREDENTIALS: NodeJS.ProcessEnv = {
  AGI_ACCESS_TOKEN: '',
  AGI_API_KEY: '',
  AGI_APP_SERVER_TOKEN: '',
  ANTHROPIC_API_KEY: '',
  DASHSCOPE_API_KEY: '',
  DEEPSEEK_API_KEY: '',
  GEMINI_API_KEY: '',
  GOOGLE_API_KEY: '',
  MINIMAX_API_KEY: '',
  MOONSHOT_API_KEY: '',
  NVIDIA_API_KEY: '',
  OLLAMA_API_KEY: '',
  OPENAI_API_KEY: '',
  OPENROUTER_API_KEY: '',
  PERPLEXITY_API_KEY: '',
  QWEN_API_KEY: '',
  XAI_API_KEY: '',
  ZHIPU_API_KEY: '',
};

function sanitizedParentEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (
      key.startsWith('AGIWORKFORCE_') ||
      key.startsWith('AGI_') ||
      /(?:^|_)(?:API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIALS?)(?:_|$)/iu.test(key)
    ) {
      delete environment[key];
    }
  }
  return environment;
}

function isolatedRuntimeEnvironment(
  isolatedHomeDir: string,
  agiHomeDir: string,
  emptyPathDir: string,
  fixture?: LocalModelFixture,
): NodeJS.ProcessEnv {
  return {
    ...sanitizedParentEnvironment(),
    ...CLEARED_PROVIDER_CREDENTIALS,
    AGIWORKFORCE_API_BASE: '',
    AGIWORKFORCE_HOME: agiHomeDir,
    AGIWORKFORCE_MAX_TOKENS: fixture === undefined ? '' : '256',
    AGIWORKFORCE_MODEL: fixture?.modelId ?? '',
    AGIWORKFORCE_NO_KEYRING: '1',
    AGIWORKFORCE_PROVIDER: fixture === undefined ? '' : 'lmstudio',
    AGI_AUTH_BASE: '',
    HOME: isolatedHomeDir,
    PATH: emptyPathDir,
    Path: emptyPathDir,
    USERPROFILE: isolatedHomeDir,
  };
}

function argumentValue(name: string): string | undefined {
  const inlinePrefix = `${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(inlinePrefix));
  if (inline !== undefined) return inline.slice(inlinePrefix.length);
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

function resolveRequestedVsix(extensionRoot: string): string | undefined {
  const explicit = argumentValue('--vsix') ?? process.env.AGI_VSCODE_E2E_VSIX;
  const packageFlag = process.argv.includes('--vsix-package');
  if (explicit !== undefined && packageFlag) {
    throw new Error('Use either --vsix/AGI_VSCODE_E2E_VSIX or --vsix-package, not both');
  }
  if (explicit !== undefined) return path.resolve(process.cwd(), explicit);
  if (!packageFlag) return undefined;
  const manifest = JSON.parse(
    fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8'),
  ) as {
    name: string;
    version: string;
  };
  return path.join(extensionRoot, `${manifest.name}-${manifest.version}.vsix`);
}

function runChecked(
  command: string,
  args: readonly string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
): string {
  const useShell = process.platform === 'win32' && /\.(?:cmd|bat)$/iu.test(command);
  const result = spawnSync(useShell ? `"${command}"` : command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    shell: useShell,
    windowsHide: true,
    ...(env === undefined ? {} : { env }),
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      result.stderr.trim() || result.stdout.trim() || `${command} exited with ${result.status}`,
    );
  }
  const stdout = result.stdout.trim();
  if (stdout !== '') console.debug(stdout);
  return stdout;
}

function verifyArtifactDigest(vsixPath: string, expectedSha256: string): void {
  const actualSha256 = createHash('sha256').update(fs.readFileSync(vsixPath)).digest('hex');
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `Private VSIX bytes changed during the run: expected ${expectedSha256}, got ${actualSha256}`,
    );
  }
}

function preparePackagedArtifact(
  extensionRoot: string,
  requestedVsix: string,
  artifactRoot: string,
): PackagedTestArtifact {
  if (!fs.existsSync(requestedVsix) || !fs.statSync(requestedVsix).isFile()) {
    throw new Error(`VSIX does not exist: ${requestedVsix}`);
  }
  const canonicalVsixPath = fs.realpathSync(requestedVsix);
  const vsixBytes = fs.readFileSync(canonicalVsixPath);
  const sha256 = createHash('sha256').update(vsixBytes).digest('hex');
  fs.mkdirSync(artifactRoot, { recursive: true, mode: 0o700 });
  const privateVsixPath = path.join(artifactRoot, path.basename(canonicalVsixPath));
  fs.writeFileSync(privateVsixPath, vsixBytes, { flag: 'wx', mode: 0o400 });
  const extractionRoot = path.join(artifactRoot, 'extracted');
  runChecked(
    process.execPath,
    [
      path.join(extensionRoot, 'scripts', 'verify-vsix.mjs'),
      privateVsixPath,
      '--extract',
      extractionRoot,
    ],
    extensionRoot,
  );

  const extensionPath = path.join(extractionRoot, 'extension');
  const manifestPath = path.join(extensionPath, 'package.json');
  if (!fs.statSync(manifestPath).isFile()) {
    throw new Error(`Extracted VSIX manifest is missing: ${manifestPath}`);
  }
  const rawManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown;
  if (typeof rawManifest !== 'object' || rawManifest === null || Array.isArray(rawManifest)) {
    throw new Error('Extracted VSIX package.json must contain an object');
  }
  const manifest = rawManifest as Record<string, unknown>;
  if (
    typeof manifest.name !== 'string' ||
    typeof manifest.publisher !== 'string' ||
    typeof manifest.version !== 'string'
  ) {
    throw new Error('Extracted VSIX package.json has no valid publisher/name/version identity');
  }
  const vsixManifestPath = path.join(extractionRoot, 'extension.vsixmanifest');
  if (!fs.statSync(vsixManifestPath).isFile()) {
    throw new Error(`Extracted VSIX package manifest is missing: ${vsixManifestPath}`);
  }
  return {
    extensionPath: fs.realpathSync(extensionPath),
    identity: {
      name: manifest.name,
      publisher: manifest.publisher,
      version: manifest.version,
    },
    sha256,
    vsixManifestPath: fs.realpathSync(vsixManifestPath),
    vsixPath: privateVsixPath,
  };
}

function resolveCliPath(packaged: boolean): string | undefined {
  const requestedCli = argumentValue('--cli') ?? process.env.AGI_VSCODE_E2E_CLI;
  if (requestedCli === undefined) return undefined;
  if (!packaged) throw new Error('--cli/AGI_VSCODE_E2E_CLI requires a packaged VSIX run');
  if (!path.isAbsolute(requestedCli)) {
    throw new Error(`AGI CLI path must be absolute: ${requestedCli}`);
  }
  const canonicalCliPath = fs.realpathSync(requestedCli);
  if (!fs.statSync(canonicalCliPath).isFile()) {
    throw new Error(`AGI CLI path is not a regular file: ${canonicalCliPath}`);
  }
  if (process.platform !== 'win32') fs.accessSync(canonicalCliPath, fs.constants.X_OK);
  return canonicalCliPath;
}

function resolveTestGrep(): string | undefined {
  const grep = argumentValue('--grep') ?? process.env.AGI_VSCODE_E2E_GREP;
  if (grep === undefined) return undefined;
  if (grep.length === 0 || grep.length > 256) {
    throw new Error('--grep/AGI_VSCODE_E2E_GREP must contain between 1 and 256 characters');
  }
  try {
    void new RegExp(grep, 'u');
  } catch (error) {
    throw new Error(
      `--grep/AGI_VSCODE_E2E_GREP must be a valid regular expression: ${String(error)}`,
    );
  }
  return grep;
}

async function main(): Promise<void> {
  const extensionRoot = path.resolve(__dirname, '../..');
  const requestedVsix = resolveRequestedVsix(extensionRoot);
  const packaged = requestedVsix !== undefined;
  const cliPath = resolveCliPath(packaged);
  const testGrep = resolveTestGrep();
  const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-vsc-'));
  const testRunnerDir = path.join(
    extensionRoot,
    '.vscode-test',
    'agi-vsix-test-runners',
    path.basename(runRoot),
  );
  let localModelFixture: LocalModelFixture | undefined;
  try {
    console.debug(`[vsix-e2e] runRoot=${runRoot}`);
    const artifact =
      requestedVsix === undefined
        ? undefined
        : preparePackagedArtifact(extensionRoot, requestedVsix, path.join(runRoot, 'vsix'));
    let extensionTestsPath = path.resolve(__dirname, './suite/index');
    const userDataDir = path.join(runRoot, 'user');
    const extensionsDir = path.join(runRoot, 'extensions');
    const workspaceDir = path.join(runRoot, 'workspace');
    const emptyPathDir = path.join(runRoot, 'empty-path');
    const isolatedHomeDir = path.join(runRoot, 'home');
    const agiHomeDir = path.join(runRoot, 'agi-home');
    for (const directory of [
      userDataDir,
      extensionsDir,
      workspaceDir,
      emptyPathDir,
      isolatedHomeDir,
      agiHomeDir,
    ]) {
      fs.mkdirSync(directory, { recursive: true });
    }
    fs.writeFileSync(path.join(workspaceDir, 'README.md'), '# Packaged VSIX verification\n');

    if (artifact !== undefined) {
      console.debug(
        `[vsix-e2e] ${path.basename(artifact.vsixPath)} sha256=${artifact.sha256}; extracted=${artifact.extensionPath}`,
      );
      if (cliPath === undefined) {
        console.debug(
          '[vsix-e2e] CLI runtime probe not requested; pass --cli=/absolute/path/to/agi to exercise initialize/restart.',
        );
      } else {
        const holdAfterFirstDeltaMs = parseFirstDeltaHoldMs(
          process.env.AGI_VSCODE_E2E_FIRST_DELTA_HOLD_MS,
        );
        localModelFixture = await startLocalModelFixture(holdAfterFirstDeltaMs);
        const fixtureControlPath = path.join(runRoot, 'local-model-fixture.json');
        fs.writeFileSync(
          fixtureControlPath,
          `${JSON.stringify(
            {
              baseUrl: localModelFixture.baseUrl,
              controlToken: localModelFixture.controlToken,
              holdAfterFirstDeltaMs: localModelFixture.holdAfterFirstDeltaMs,
              modelId: localModelFixture.modelId,
              releaseUrl: localModelFixture.releaseUrl,
              stateUrl: localModelFixture.stateUrl,
            },
            null,
            2,
          )}\n`,
          { flag: 'wx', mode: 0o600 },
        );
        console.debug(
          `[vsix-e2e] localFixture=${localModelFixture.baseUrl}; model=${localModelFixture.modelId}; holdAfterFirstDeltaMs=${localModelFixture.holdAfterFirstDeltaMs}; control=${fixtureControlPath}`,
        );
        // app-server correctly fails closed for unknown projects. `agi init`
        // is the CLI's documented explicit trust action, scoped here to the
        // disposable workspace and disposable AGIWORKFORCE_HOME.
        const isolatedEnvironment = isolatedRuntimeEnvironment(
          isolatedHomeDir,
          agiHomeDir,
          emptyPathDir,
          localModelFixture,
        );
        runChecked(cliPath, ['init'], workspaceDir, isolatedEnvironment);
        const configPath = path.join(agiHomeDir, 'config.toml');
        fs.writeFileSync(configPath, localModelFixture.configToml, { mode: 0o600 });
        if (process.platform !== 'win32') fs.chmodSync(configPath, 0o600);
      }
    }

    const packagedTestRunner =
      artifact === undefined
        ? undefined
        : writeExtensionHostTestRunner(testRunnerDir, path.resolve(__dirname));
    if (packagedTestRunner !== undefined) {
      extensionTestsPath = packagedTestRunner.extensionTestsPath;
    }
    const downloadedExecutablePath = await downloadAndUnzipVSCode({
      version: process.env.AGI_VSCODE_E2E_VERSION ?? DEFAULT_VSCODE_E2E_VERSION,
      extensionDevelopmentPath: packagedTestRunner?.extensionDevelopmentPath ?? extensionRoot,
    });
    const vscodeExecutablePath = resolveVsCodeExecutablePath(downloadedExecutablePath);
    let expectedExtensionRoot: string | undefined;
    let extensionDevelopmentPath = extensionRoot;
    if (artifact !== undefined && packagedTestRunner !== undefined) {
      const [vscodeCli, ...vscodeCliArgs] = resolveCliArgsFromVSCodeExecutablePath(
        vscodeExecutablePath,
        { reuseMachineInstall: true },
      );
      if (vscodeCli === undefined) throw new Error('Could not resolve the VS Code extension CLI');
      const expectedVsCodeVersion =
        process.env.AGI_VSCODE_E2E_VERSION ?? DEFAULT_VSCODE_E2E_VERSION;
      const versionOutput = runChecked(vscodeCli, [...vscodeCliArgs, '--version'], extensionRoot);
      const [actualVsCodeVersion] = versionOutput.split(/\r?\n/u);
      if (actualVsCodeVersion !== expectedVsCodeVersion) {
        throw new Error(
          `Expected VS Code ${expectedVsCodeVersion}, got ${actualVsCodeVersion ?? '<missing>'}`,
        );
      }
      verifyArtifactDigest(artifact.vsixPath, artifact.sha256);
      runChecked(
        vscodeCli,
        [
          ...vscodeCliArgs,
          `--user-data-dir=${userDataDir}`,
          `--extensions-dir=${extensionsDir}`,
          '--install-extension',
          artifact.vsixPath,
          '--force',
        ],
        extensionRoot,
      );
      verifyArtifactDigest(artifact.vsixPath, artifact.sha256);
      const publicExtensionList = runChecked(
        vscodeCli,
        [
          ...vscodeCliArgs,
          `--user-data-dir=${userDataDir}`,
          `--extensions-dir=${extensionsDir}`,
          '--list-extensions',
          '--show-versions',
        ],
        extensionRoot,
      );
      verifyPublicExtensionList(publicExtensionList, artifact.identity);
      expectedExtensionRoot = findInstalledExtensionRoot(extensionsDir, artifact.identity);
      verifyInstalledExtension(
        artifact.extensionPath,
        artifact.vsixManifestPath,
        expectedExtensionRoot,
      );
      verifyInstalledExtensionRegistry(extensionsDir, expectedExtensionRoot, artifact.identity);
      extensionDevelopmentPath = packagedTestRunner.extensionDevelopmentPath;
      console.debug(
        `[vsix-e2e] installed=${artifact.identity.publisher}.${artifact.identity.name}@${artifact.identity.version}; root=${expectedExtensionRoot}`,
      );
    }

    const extensionTestsEnv =
      artifact === undefined
        ? undefined
        : {
            ...isolatedRuntimeEnvironment(
              isolatedHomeDir,
              agiHomeDir,
              emptyPathDir,
              localModelFixture,
            ),
            AGI_VSCODE_E2E_PACKAGED: '1',
            AGI_VSCODE_E2E_INSTALLED: '1',
            AGI_VSCODE_E2E_EXPECTED_EXTENSION_ROOT: expectedExtensionRoot,
            AGI_VSCODE_E2E_VSIX_SHA256: artifact.sha256,
            AGI_VSCODE_E2E_EMPTY_PATH: emptyPathDir,
            AGI_VSCODE_E2E_CLI: cliPath,
            AGI_VSCODE_E2E_FIXTURE_CONTROL_TOKEN: localModelFixture?.controlToken,
            AGI_VSCODE_E2E_FIXTURE_HOLD_MS: localModelFixture?.holdAfterFirstDeltaMs.toString(),
            AGI_VSCODE_E2E_FIXTURE_MODEL: localModelFixture?.modelId,
            AGI_VSCODE_E2E_FIXTURE_RELEASE_URL: localModelFixture?.releaseUrl,
            AGI_VSCODE_E2E_FIXTURE_STATE_URL: localModelFixture?.stateUrl,
            AGI_VSCODE_E2E_GREP: testGrep,
          };
    await runTests({
      vscodeExecutablePath,
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        ...(artifact === undefined ? [] : [workspaceDir]),
        ...(artifact === undefined ? ['--disable-extensions'] : []),
        '--disable-workspace-trust',
        ...(artifact === undefined ? [] : ['--force-disable-user-env']),
        `--user-data-dir=${userDataDir}`,
        `--extensions-dir=${extensionsDir}`,
      ],
      ...(extensionTestsEnv === undefined ? {} : { extensionTestsEnv }),
    });
  } finally {
    try {
      await localModelFixture?.close();
    } finally {
      try {
        fs.rmSync(testRunnerDir, { recursive: true, force: true });
      } finally {
        fs.rmSync(runRoot, { recursive: true, force: true });
      }
    }
  }
}

void main().catch((err: unknown) => {
  console.error('Failed to run tests:', err);
  process.exitCode = 1;
});
