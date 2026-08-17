import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  E2E_STUB_MODEL_ID,
  E2E_STUB_MODEL_VENDOR,
  findInstalledExtensionRoot,
  verifyInstalledExtension,
  verifyInstalledExtensionRegistry,
  verifyPublicExtensionList,
  writeExtensionHostTestRunner,
  type ExtensionIdentity,
} from '../test/vsixInstallation';

interface RunnerActivationContext {
  subscriptions: unknown[];
}

function activateRunnerExtension(
  source: string,
  vscodeStub: unknown,
  context: RunnerActivationContext,
): void {
  const moduleExports: Record<string, unknown> = {};
  // `source` is the CommonJS module writeExtensionHostTestRunner just emitted, and
  // asserting it actually activates is what this test exists for. Nothing here runs
  // input from a request, a model, or a file the test did not itself write.
  // llm-guardrail-allow: evaluates only the runner this test just generated.
  const load = new Function('exports', 'require', `${source}\nreturn exports;`) as (
    exports: Record<string, unknown>,
    require: (id: string) => unknown,
  ) => Record<string, unknown>;
  const loaded = load(moduleExports, (id: string) => {
    if (id !== 'vscode') throw new Error(`runner extension required unexpected module ${id}`);
    return vscodeStub;
  });
  const activate = loaded.activate;
  if (typeof activate !== 'function') throw new Error('runner extension exports no activate()');
  (activate as (context: RunnerActivationContext) => void)(context);
}

const temporaryRoots: string[] = [];
const identity: ExtensionIdentity = {
  name: 'agi-workforce',
  publisher: 'agiworkforce',
  version: '0.3.0',
};

function temporaryRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-vsix-install-test-'));
  temporaryRoots.push(root);
  return root;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function makeInstalledFixture(root: string): {
  extensionsDirectory: string;
  extractedRoot: string;
  extractedVsixManifest: string;
  installedRoot: string;
} {
  const extensionsDirectory = path.join(root, 'extensions');
  const extractedRoot = path.join(root, 'extracted', 'extension');
  const extractedVsixManifest = path.join(root, 'extracted', 'extension.vsixmanifest');
  const installedRoot = path.join(extensionsDirectory, 'agiworkforce.agi-workforce-0.3.0');
  const manifest = { ...identity, main: './out/extension.js' };
  writeJson(path.join(extractedRoot, 'package.json'), manifest);
  fs.mkdirSync(path.join(extractedRoot, 'out'), { recursive: true });
  fs.writeFileSync(path.join(extractedRoot, 'out', 'extension.js'), 'verified bytes\n');
  fs.writeFileSync(extractedVsixManifest, '<PackageManifest />\n');

  writeJson(path.join(installedRoot, 'package.json'), {
    ...manifest,
    __metadata: {
      installedTimestamp: 1,
      targetPlatform: 'undefined',
      size: 42,
    },
  });
  fs.mkdirSync(path.join(installedRoot, 'out'), { recursive: true });
  fs.writeFileSync(path.join(installedRoot, 'out', 'extension.js'), 'verified bytes\n');
  fs.writeFileSync(path.join(installedRoot, '.vsixmanifest'), '<PackageManifest />\n');
  writeJson(path.join(extensionsDirectory, 'extensions.json'), [
    {
      identifier: { id: 'agiworkforce.agi-workforce' },
      version: '0.3.0',
      location: { fsPath: installedRoot },
      metadata: { source: 'vsix' },
    },
  ]);
  return { extensionsDirectory, extractedRoot, extractedVsixManifest, installedRoot };
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    fs.rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
  }
});

describe('installed VSIX verification', () => {
  it('proves the installed registry entry and every verified extension byte', () => {
    const fixture = makeInstalledFixture(temporaryRoot());
    expect(findInstalledExtensionRoot(fixture.extensionsDirectory, identity)).toBe(
      fs.realpathSync(fixture.installedRoot),
    );
    expect(() =>
      verifyInstalledExtension(
        fixture.extractedRoot,
        fixture.extractedVsixManifest,
        fixture.installedRoot,
      ),
    ).not.toThrow();
    expect(() =>
      verifyInstalledExtensionRegistry(
        fixture.extensionsDirectory,
        fixture.installedRoot,
        identity,
      ),
    ).not.toThrow();
  });

  it('rejects installer output with changed or unexpected runtime files', () => {
    const fixture = makeInstalledFixture(temporaryRoot());
    fs.writeFileSync(path.join(fixture.installedRoot, 'out', 'extension.js'), 'changed bytes\n');
    expect(() =>
      verifyInstalledExtension(
        fixture.extractedRoot,
        fixture.extractedVsixManifest,
        fixture.installedRoot,
      ),
    ).toThrow(/differs from the verified VSIX/u);

    fs.writeFileSync(path.join(fixture.installedRoot, 'out', 'extension.js'), 'verified bytes\n');
    fs.writeFileSync(path.join(fixture.installedRoot, 'unexpected.js'), 'unexpected\n');
    expect(() =>
      verifyInstalledExtension(
        fixture.extractedRoot,
        fixture.extractedVsixManifest,
        fixture.installedRoot,
      ),
    ).toThrow(/file set differs/u);
  });

  it('rejects duplicate matching installs and writes a separate test-runner extension', () => {
    const root = temporaryRoot();
    const fixture = makeInstalledFixture(root);
    const duplicate = path.join(fixture.extensionsDirectory, 'duplicate');
    writeJson(path.join(duplicate, 'package.json'), identity);
    expect(() => findInstalledExtensionRoot(fixture.extensionsDirectory, identity)).toThrow(
      /found 2/u,
    );

    const compiledTests = path.join(root, 'compiled-tests');
    fs.mkdirSync(path.join(compiledTests, 'suite'), { recursive: true });
    fs.writeFileSync(path.join(compiledTests, 'localModelFixture.js'), 'exports.fixture = true;\n');
    fs.writeFileSync(path.join(compiledTests, 'suite', 'extension.smoke.test.js'), 'test();\n');
    fs.writeFileSync(path.join(compiledTests, 'suite', 'index.js'), 'exports.run = run;\n');
    const runner = writeExtensionHostTestRunner(path.join(root, 'runner'), compiledTests);
    const runnerManifest = JSON.parse(
      fs.readFileSync(path.join(runner.extensionDevelopmentPath, 'package.json'), 'utf8'),
    ) as { publisher: string; name: string };
    expect(`${runnerManifest.publisher}.${runnerManifest.name}`).not.toBe(
      'agiworkforce.agi-workforce',
    );
    expect(
      path.relative(runner.extensionDevelopmentPath, runner.extensionTestsPath).startsWith('..'),
    ).toBe(false);
    expect(fs.readFileSync(runner.extensionTestsPath, 'utf8')).toBe('exports.run = run;\n');
    expect(
      fs.readFileSync(
        path.join(runner.extensionDevelopmentPath, 'out', 'test', 'localModelFixture.js'),
        'utf8',
      ),
    ).toBe('exports.fixture = true;\n');
  });

  it('gives the clean-profile host a stub language model so VS Code can reach the @agi participant', () => {
    const root = temporaryRoot();
    const compiledTests = path.join(root, 'compiled-tests');
    fs.mkdirSync(path.join(compiledTests, 'suite'), { recursive: true });
    fs.writeFileSync(path.join(compiledTests, 'localModelFixture.js'), 'exports.fixture = true;\n');
    fs.writeFileSync(path.join(compiledTests, 'suite', 'extension.smoke.test.js'), 'test();\n');
    fs.writeFileSync(path.join(compiledTests, 'suite', 'index.js'), 'exports.run = run;\n');

    const runner = writeExtensionHostTestRunner(path.join(root, 'runner'), compiledTests);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(runner.extensionDevelopmentPath, 'package.json'), 'utf8'),
    ) as { contributes?: { languageModelChatProviders?: Array<{ vendor: string }> } };
    expect(manifest.contributes?.languageModelChatProviders?.map((entry) => entry.vendor)).toEqual([
      E2E_STUB_MODEL_VENDOR,
    ]);

    const registrations: Array<{ vendor: string; provider: Record<string, unknown> }> = [];
    const context = { subscriptions: [] as unknown[] };
    activateRunnerExtension(
      fs.readFileSync(path.join(runner.extensionDevelopmentPath, 'extension.js'), 'utf8'),
      {
        lm: {
          registerLanguageModelChatProvider(vendor: string, provider: Record<string, unknown>) {
            registrations.push({ vendor, provider });
            return { dispose: () => undefined };
          },
        },
      },
      context,
    );

    expect(registrations.map((entry) => entry.vendor)).toEqual([E2E_STUB_MODEL_VENDOR]);
    expect(context.subscriptions).toHaveLength(1);
    const provider = registrations[0]?.provider as {
      provideLanguageModelChatInformation: () => Array<{ id: string; capabilities: unknown }>;
      provideLanguageModelChatResponse: () => Promise<void>;
    };
    const models = provider.provideLanguageModelChatInformation();
    expect(models.map((model) => model.id)).toEqual([E2E_STUB_MODEL_ID]);
    expect(models[0]?.capabilities).toMatchObject({ toolCalling: true });
    return expect(provider.provideLanguageModelChatResponse()).rejects.toThrow(
      /must never generate/u,
    );
  });

  it('requires one exact identity and version in the public VS Code extension listing', () => {
    expect(() =>
      verifyPublicExtensionList('agiworkforce.agi-workforce@0.3.0\n', identity),
    ).not.toThrow();
    expect(() => verifyPublicExtensionList('agiworkforce.agi-workforce@0.2.0\n', identity)).toThrow(
      /did not contain exactly one/u,
    );
    expect(() =>
      verifyPublicExtensionList(
        'agiworkforce.agi-workforce@0.3.0\nagiworkforce.agi-workforce@0.3.0\n',
        identity,
      ),
    ).toThrow(/did not contain exactly one/u);
  });
});
