/**
 * extension.smoke.test.ts — Minimal integration smoke test.
 *
 * Runs inside the VS Code extension host (NOT the vitest mock).
 * Asserts:
 *   1. The extension activates without throwing.
 *   2. At least one of the package.json commands is registered and resolvable.
 *   3. The `@agi` chat participant is registered (catches registration order bugs).
 *   4. The branded settings editor opens inside a real extension host.
 *   5. Two editor-chat commands create two independent webview tabs.
 *   6. The installed VSIX completes a native @agi turn through an isolated,
 *      loopback-only LM Studio-compatible provider.
 *
 * Requires: pnpm add -D mocha @types/mocha glob @types/glob
 */

import * as assert from 'assert';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { E2E_COMPLETE_RESPONSE, E2E_PROMPT_MARKER } from '../localModelFixture';

// Mocha's tdd UI is configured by the loader (`suite/index.ts`).
declare function suite(name: string, fn: () => void): void;
declare function test(name: string, fn: () => void | Promise<void>): void;

const MAX_FIXTURE_STATE_BYTES = 1024 * 1024;
const COMPLETE_TURN_TIMEOUT_MS = 50_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  assert.ok(isRecord(value), `${label} must be an object`);
  return value;
}

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    void promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function getFixtureState(url: string, controlToken: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const request = http.get(url, { headers: { 'x-agi-e2e-token': controlToken } }, (response) => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on('data', (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.byteLength;
        if (bytes <= MAX_FIXTURE_STATE_BYTES) chunks.push(buffer);
      });
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new Error(`fixture state returned HTTP ${response.statusCode ?? 'unknown'}`));
          return;
        }
        if (bytes > MAX_FIXTURE_STATE_BYTES) {
          reject(new Error(`fixture state exceeded ${MAX_FIXTURE_STATE_BYTES} bytes`));
          return;
        }
        try {
          resolve(
            requireRecord(JSON.parse(Buffer.concat(chunks).toString('utf8')), 'fixture state'),
          );
        } catch (error) {
          reject(error);
        }
      });
    });
    request.setTimeout(5_000, () => request.destroy(new Error('fixture state request timed out')));
    request.on('error', reject);
  });
}

async function waitForCompletedFixtureState(
  url: string,
  controlToken: string,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + 5_000;
  do {
    const state = await getFixtureState(url, controlToken);
    if (state.streamCompleted === true && state.responseClosed === true) return state;
    await new Promise((resolve) => setTimeout(resolve, 50));
  } while (Date.now() < deadline);
  return getFixtureState(url, controlToken);
}

function messageText(record: Record<string, unknown>): string | undefined {
  if (record.record_type !== 'message' || !isRecord(record.message)) return undefined;
  const content = record.message.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return undefined;
  return content
    .filter(isRecord)
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => String(block.text))
    .join('');
}

async function waitForPersistedTurn(
  agiHome: string,
  threadId: string,
  expectedResponse: string,
): Promise<Record<string, unknown>[]> {
  assert.match(
    threadId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu,
    'local runtime thread id must be a UUID',
  );
  const sessionPath = path.join(agiHome, 'managed_sessions', `${threadId}.jsonl`);
  const deadline = Date.now() + 5_000;
  do {
    if (fs.existsSync(sessionPath)) {
      const records = fs
        .readFileSync(sessionPath, 'utf8')
        .trim()
        .split(/\r?\n/u)
        .filter(Boolean)
        .map((line) => requireRecord(JSON.parse(line) as unknown, 'managed session record'));
      if (records.some((record) => messageText(record) === expectedResponse)) return records;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  } while (Date.now() < deadline);
  throw new Error(`managed session ${threadId} did not persist the completed response`);
}

suite('AGI Workforce extension — smoke', () => {
  test('extension activates and is found by id', async () => {
    const ext = vscode.extensions.getExtension('agiworkforce.agi-workforce');
    assert.ok(ext, 'extension agiworkforce.agi-workforce not found');
    if (!ext.isActive) await ext.activate();
    assert.strictEqual(ext.isActive, true, 'extension failed to activate');
  });

  test('package.json version matches getExtensionVersion()', async () => {
    const ext = vscode.extensions.getExtension('agiworkforce.agi-workforce');
    assert.ok(ext);
    const declared = (ext.packageJSON as { version: string }).version;
    assert.match(declared, /^\d+\.\d+\.\d+/, `version "${declared}" does not match semver shape`);
  });

  test('all package.json commands are registered', async () => {
    const ext = vscode.extensions.getExtension('agiworkforce.agi-workforce');
    assert.ok(ext);
    if (!ext.isActive) await ext.activate();
    const declared = (
      (ext.packageJSON as { contributes?: { commands?: Array<{ command: string }> } }).contributes
        ?.commands ?? []
    ).map((c) => c.command);
    assert.ok(declared.length > 0, 'no commands declared in package.json contributes.commands');
    const all = new Set(await vscode.commands.getCommands(true));
    // Collect EVERY missing command before failing so a single run reports the
    // full breakage surface instead of stopping at the first missing id.
    const missing = declared.filter((id) => !all.has(id));
    assert.deepStrictEqual(
      missing,
      [],
      `${missing.length} command(s) declared in package.json are not registered at runtime:\n` +
        missing.map((id) => `  - ${id}`).join('\n'),
    );
  });

  test('newConversation command resolves without throwing', async () => {
    const all = await vscode.commands.getCommands(true);
    // No silent skip: if the command is absent that is itself a failure.
    assert.ok(
      all.includes('agi-workforce.newConversation'),
      'command "agi-workforce.newConversation" is not registered at runtime',
    );
    await vscode.commands.executeCommand('agi-workforce.newConversation');
  });

  test('branded settings command opens without throwing', async () => {
    const all = await vscode.commands.getCommands(true);
    assert.ok(
      all.includes('agi-workforce.openSettings'),
      'command "agi-workforce.openSettings" is not registered at runtime',
    );
    await vscode.commands.executeCommand('agi-workforce.openSettings', 'configuration');
  });

  test('editor chat supports parallel conversation tabs', async () => {
    await vscode.commands.executeCommand('agi-workforce.openChatInEditor');
    await vscode.commands.executeCommand('agi-workforce.openChatInEditor');

    let chatTabs: readonly vscode.Tab[] = [];
    const deadline = Date.now() + 2_000;
    do {
      chatTabs = vscode.window.tabGroups.all
        .flatMap((group) => group.tabs)
        .filter(
          (tab) =>
            typeof tab.input === 'object' &&
            tab.input !== null &&
            'viewType' in tab.input &&
            String(tab.input.viewType).endsWith('agi-workforce.chatPanel'),
        );
      if (chatTabs.length === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    } while (Date.now() < deadline);

    const visibleTabs = vscode.window.tabGroups.all
      .flatMap((group) => group.tabs)
      .map((tab) => ({
        label: tab.label,
        viewType:
          typeof tab.input === 'object' && tab.input !== null && 'viewType' in tab.input
            ? String(tab.input.viewType)
            : undefined,
      }));
    assert.strictEqual(
      chatTabs.length,
      2,
      `expected two independent AGI Chat editor tabs; visible tabs: ${JSON.stringify(visibleTabs)}`,
    );
    assert.deepStrictEqual(
      chatTabs.map((tab) => tab.label),
      ['AGI Chat', 'AGI Chat 2'],
      'parallel chat tabs should have distinguishable labels',
    );
  });

  if (process.env.AGI_VSCODE_E2E_PACKAGED === '1') {
    test('loads the verified VSIX from the isolated installed-extension registry', async () => {
      const expectedRoot = process.env.AGI_VSCODE_E2E_EXPECTED_EXTENSION_ROOT;
      const expectedEmptyPath = process.env.AGI_VSCODE_E2E_EMPTY_PATH;
      const vsixSha256 = process.env.AGI_VSCODE_E2E_VSIX_SHA256;
      assert.strictEqual(
        process.env.AGI_VSCODE_E2E_INSTALLED,
        '1',
        'packaged test did not run through the VS Code installer',
      );
      assert.ok(expectedRoot, 'packaged test did not receive the installed extension root');
      assert.ok(expectedEmptyPath, 'packaged test did not receive the isolated PATH directory');
      assert.match(vsixSha256 ?? '', /^[a-f0-9]{64}$/u, 'packaged test did not receive a SHA-256');

      const ext = vscode.extensions.getExtension('agiworkforce.agi-workforce');
      assert.ok(ext, 'extension agiworkforce.agi-workforce not found');
      assert.strictEqual(
        fs.realpathSync(ext.extensionPath),
        fs.realpathSync(expectedRoot),
        'extension host loaded source or another install instead of the installed VSIX bytes',
      );
      assert.strictEqual(
        path.resolve(process.env.PATH ?? ''),
        path.resolve(expectedEmptyPath),
        'packaged extension host inherited an ambient executable PATH',
      );
    });
  }

  const packagedCliPath = process.env.AGI_VSCODE_E2E_CLI;
  if (process.env.AGI_VSCODE_E2E_PACKAGED === '1' && packagedCliPath !== undefined) {
    test('initializes, shuts down, and replaces the configured absolute AGI runtime', async () => {
      assert.ok(path.isAbsolute(packagedCliPath), 'packaged runtime path must be absolute');
      assert.ok(fs.statSync(packagedCliPath).isFile(), 'packaged runtime path must be a file');
      assert.ok(vscode.workspace.workspaceFolders?.length, 'runtime probe requires a workspace');

      await vscode.workspace
        .getConfiguration('agiWorkforce')
        .update('cliPath', packagedCliPath, vscode.ConfigurationTarget.Global);
      assert.strictEqual(
        vscode.workspace.getConfiguration('agiWorkforce').get<string>('cliPath'),
        packagedCliPath,
        'extension did not retain the explicit absolute CLI path',
      );

      // This shipped command resolves session history through LocalRuntimePool,
      // which starts the configured `agi app-server`. The missing id is
      // intentional: it avoids mutating session data after the real handshake.
      await vscode.commands.executeCommand(
        'agi-workforce.openConversation',
        `packaged-runtime-probe-${Date.now()}`,
      );

      // A ready result requires LocalRuntimeClient.restart() to shut down the
      // process above and complete a fresh protocol-validated initialize call.
      const result = await vscode.commands.executeCommand<unknown>(
        'agi-workforce.restartLocalRuntime',
      );
      assert.deepStrictEqual(result, { ok: true, restartedWorkspaces: 1 });
    });

    const fixtureModel = process.env.AGI_VSCODE_E2E_FIXTURE_MODEL;
    const fixtureStateUrl = process.env.AGI_VSCODE_E2E_FIXTURE_STATE_URL;
    const fixtureControlToken = process.env.AGI_VSCODE_E2E_FIXTURE_CONTROL_TOKEN;
    if (
      fixtureModel !== undefined &&
      fixtureStateUrl !== undefined &&
      fixtureControlToken !== undefined
    ) {
      test('completes a native @agi turn through the configured loopback provider', async () => {
        assert.strictEqual(
          process.env.AGIWORKFORCE_NO_KEYRING,
          '1',
          'packaged turn must not access the real OS keyring',
        );
        const agiHome = process.env.AGIWORKFORCE_HOME;
        assert.ok(agiHome, 'packaged turn did not receive an isolated AGI home');
        assert.ok(path.isAbsolute(agiHome), 'isolated AGI home must be absolute');
        const isolatedHome = process.env.HOME;
        assert.ok(isolatedHome, 'packaged turn did not receive an isolated process home');
        assert.strictEqual(
          path.dirname(agiHome),
          path.dirname(isolatedHome),
          'CLI config and process homes must belong to the same disposable run root',
        );
        assert.strictEqual(process.env.AGIWORKFORCE_MODEL, fixtureModel);
        assert.strictEqual(process.env.AGIWORKFORCE_PROVIDER, 'lmstudio');
        const configPath = path.join(agiHome, 'config.toml');
        const configText = fs.readFileSync(configPath, 'utf8');
        const fixtureProviderBaseUrl = `${new URL(fixtureStateUrl).origin}/v1`;
        assert.ok(
          configText.includes(`model = ${JSON.stringify(fixtureModel)}`),
          'isolated CLI config does not own the fixture model',
        );
        assert.ok(
          configText.includes('provider = "lmstudio"'),
          'isolated CLI config does not own the fixture provider',
        );
        assert.ok(
          configText.includes(`base_url = ${JSON.stringify(fixtureProviderBaseUrl)}`),
          'isolated CLI config does not point LM Studio at the random-port fixture',
        );
        assert.ok(
          configText.includes(
            `[providers.ollama]\nbase_url = ${JSON.stringify(new URL(fixtureStateUrl).origin)}`,
          ),
          'isolated CLI config must not probe an ambient Ollama install',
        );
        if (process.platform !== 'win32') {
          assert.strictEqual(
            fs.statSync(configPath).mode & 0o777,
            0o600,
            'isolated CLI config must be owner-readable only',
          );
        }

        const commands = await vscode.commands.getCommands(true);
        assert.ok(
          commands.includes('workbench.action.chat.open'),
          'pinned VS Code does not expose workbench.action.chat.open',
        );
        await vscode.workspace
          .getConfiguration('agiWorkforce')
          .update('cliPath', packagedCliPath, vscode.ConfigurationTarget.Global);
        await vscode.workspace
          .getConfiguration('agiWorkforce')
          .update('model', fixtureModel, vscode.ConfigurationTarget.Global);

        const commandResult = requireRecord(
          await withTimeout(
            vscode.commands.executeCommand<unknown>('workbench.action.chat.open', {
              blockOnResponse: true,
              isPartialQuery: false,
              query: `@agi ${E2E_PROMPT_MARKER}`,
            }),
            COMPLETE_TURN_TIMEOUT_MS,
            'native @agi loopback turn',
          ),
          'native chat command result',
        );
        assert.strictEqual(
          commandResult.errorDetails,
          undefined,
          `native @agi turn returned an error: ${JSON.stringify(commandResult.errorDetails)}`,
        );
        const metadata = requireRecord(commandResult.metadata, 'native chat result metadata');
        const threadId = metadata.localThreadId;
        assert.ok(typeof threadId === 'string' && threadId !== '', 'chat result has no thread id');
        assert.strictEqual(metadata.localThreadModel, fixtureModel);
        assert.strictEqual(metadata.localThreadProvider, 'lmstudio');
        assert.strictEqual(metadata.localThreadTrustMode, 'local');

        const fixtureState = await waitForCompletedFixtureState(
          fixtureStateUrl,
          fixtureControlToken,
        );
        assert.deepStrictEqual(fixtureState.errors, [], 'loopback fixture recorded request errors');
        assert.ok(
          typeof fixtureState.modelRequests === 'number' && fixtureState.modelRequests >= 2,
          `expected discovery and pre-turn model probes, got ${String(fixtureState.modelRequests)}`,
        );
        assert.ok(
          typeof fixtureState.ollamaProbeRequests === 'number' &&
            fixtureState.ollamaProbeRequests >= 1,
          'local discovery did not use the isolated Ollama probe endpoint',
        );
        assert.strictEqual(fixtureState.chatRequests, 1);
        assert.strictEqual(fixtureState.firstDeltaSent, true);
        assert.strictEqual(fixtureState.secondDeltaSent, true);
        assert.strictEqual(fixtureState.doneSent, true);
        assert.strictEqual(fixtureState.streamCompleted, true);
        assert.strictEqual(fixtureState.responseClosed, true);
        assert.strictEqual(fixtureState.holdReleased, true);
        const requestMetadata = requireRecord(
          fixtureState.lastChatRequest,
          'captured chat request metadata',
        );
        assert.strictEqual(requestMetadata.model, fixtureModel);
        assert.strictEqual(requestMetadata.stream, true);
        assert.strictEqual(requestMetadata.includeUsage, true);
        assert.strictEqual(requestMetadata.promptMarkerFound, true);
        assert.ok(
          typeof requestMetadata.messageCount === 'number' && requestMetadata.messageCount > 0,
          'chat request did not include messages',
        );
        assert.strictEqual(requestMetadata.remoteAddress, '127.0.0.1');

        const records = await waitForPersistedTurn(agiHome, threadId, E2E_COMPLETE_RESPONSE);
        const header = requireRecord(records[0], 'managed session header');
        assert.strictEqual(header.record_type, 'header');
        assert.strictEqual(header.model, fixtureModel);
        assert.strictEqual(header.created_by, 'vscode');
        assert.ok(
          typeof header.workspace_root === 'string' && header.workspace_root !== '',
          'managed session header has no workspace root',
        );
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        assert.ok(workspaceRoot, 'native turn has no isolated VS Code workspace');
        assert.strictEqual(
          fs.realpathSync(header.workspace_root),
          fs.realpathSync(workspaceRoot),
          'persisted session workspace does not match the isolated VS Code workspace',
        );
        const routingAuthority = requireRecord(
          header.routing_authority,
          'managed session routing authority',
        );
        assert.strictEqual(routingAuthority.provider, 'lmstudio');
        assert.strictEqual(routingAuthority.privacy_mode, 'local');
        assert.ok(
          records.some(
            (record) =>
              isRecord(record.message) &&
              record.message.role === 'user' &&
              messageText(record)?.includes(E2E_PROMPT_MARKER) === true,
          ),
          'persisted user turn does not contain the native-chat prompt marker',
        );
        assert.ok(
          records.some(
            (record) =>
              isRecord(record.message) &&
              record.message.role === 'assistant' &&
              messageText(record) === E2E_COMPLETE_RESPONSE,
          ),
          'persisted assistant turn does not contain the combined streamed response',
        );
      });
    }
  }
});
