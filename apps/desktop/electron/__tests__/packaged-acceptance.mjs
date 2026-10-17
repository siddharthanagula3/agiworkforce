import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import process from 'node:process';
import console from 'node:console';
import { createRequire } from 'node:module';
import { URL, fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { declaredProtocolVersion } from '../../../../scripts/release/verify-cli-protocol-handshake.mjs';

// Explicitly invoked against an already built/signed bundle; never discovered
// by unit tests. Launches the unchanged packaged entry point, not a test main.
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const req = createRequire(path.join(repo, 'package.json'));
const { chromium } = req('@playwright/test');
const app = fs.realpathSync(path.resolve(process.argv[2] || ''));
const option = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
const updateZip = option('--update-zip');
const updateVersion = option('--update-version');
const temporary = [fs.realpathSync(os.tmpdir()), fs.realpathSync('/tmp')];
if (updateZip && (!updateVersion || !temporary.some((root) => app.startsWith(`${root}/agi-`))))
  throw new Error('Updater acceptance requires a version and an owned temporary installation.');
const reportDir = process.env.AGI_ACCEPTANCE_OUTPUT_DIR;
if (!app.endsWith('.app') || !reportDir)
  throw new Error('Pass a .app and AGI_ACCEPTANCE_OUTPUT_DIR.');
fs.mkdirSync(reportDir, { recursive: true });
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'agi-packaged-acceptance-'));
const profile = process.env.AGI_ACCEPTANCE_PROFILE || path.join(scratch, 'profile');
const home = path.join(scratch, 'cli');
fs.mkdirSync(profile, { recursive: true });
if (
  process.env.AGI_ACCEPTANCE_PROFILE &&
  !temporary.some((root) => fs.realpathSync(profile).startsWith(`${root}/agi-`))
)
  throw new Error('A retained acceptance profile must be inside an owned temporary directory.');
fs.mkdirSync(home);
const receipt = { at: new Date().toISOString(), app, checks: {}, requests: [] };
const info = (key) =>
  execFileSync(
    '/usr/libexec/PlistBuddy',
    ['-c', `Print :${key}`, path.join(app, 'Contents/Info.plist')],
    { encoding: 'utf8' },
  ).trim();
const executable = path.join(app, 'Contents/MacOS', info('CFBundleExecutable'));
const cli = path.join(app, 'Contents/Resources/agi-cli/agi');
let child, browser;
const server = http.createServer((request, response) => {
  receipt.requests.push(new URL(request.url, 'http://localhost').pathname);
  const origin = `http://127.0.0.1:${server.address().port}`;
  if (updateZip && request.url === '/owned-update.zip') {
    response.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Length': fs.statSync(updateZip).size,
    });
    fs.createReadStream(updateZip).pipe(response);
    return;
  }
  if (request.url.startsWith('/api/releases/desktop-cloud/update/')) {
    if (updateZip && decodeURIComponent(request.url.split('/').at(-1)) !== updateVersion) {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          url: `${origin}/owned-update.zip`,
          name: updateVersion,
          notes: 'Owned acceptance candidate',
          pub_date: new Date().toISOString(),
        }),
      );
    } else {
      response.writeHead(204);
      response.end();
    }
    return;
  }
  if (updateZip && request.url === '/api/releases/desktop-cloud/latest') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        version: updateVersion,
        platforms: { mac: true },
        architectures: { arm64: true, x64: true },
      }),
    );
    return;
  }
  if (request.url.startsWith('/api/')) {
    response.writeHead(401, { 'Content-Type': 'application/json' });
    response.end('{"error":{"code":"UNAUTHORIZED"}}');
    return;
  }
  response.setHeader('Content-Type', 'text/html');
  response.end(
    '<!doctype html><html><head><title>Packaged AGI acceptance</title><style>html,body{background:white;color:black}body{font:18px system-ui;margin:40px}</style></head><body><h1>Packaged AGI acceptance</h1><p>The signed app loaded its hosted renderer.</p></body></html>',
  );
});
function check(name, command, args) {
  const value = execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  receipt.checks[name] = value.trim() || 'passed';
  return value;
}
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function checkWorkspaceConsent() {
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(scratch, 'consent-workspace-')));
  const consentProfile = fs.mkdtempSync(path.join(scratch, 'consent-profile-'));
  fs.writeFileSync(
    path.join(workspace, 'README.md'),
    'Synthetic packaged consent check. No hooks or tools.\n',
  );
  const env = Object.fromEntries(
    ['PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'TMPDIR']
      .filter((key) => process.env[key])
      .map((key) => [key, process.env[key]]),
  );
  Object.assign(env, { AGIWORKFORCE_HOME: consentProfile, AGI_API_URL: 'http://127.0.0.1:9' });
  const protocolVersion = declaredProtocolVersion(
    fs.readFileSync(
      path.join(repo, 'crates/agiworkforce-protocol/src/developer_session.rs'),
      'utf8',
    ),
  );
  const input = `${JSON.stringify({
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion,
      clientInfo: {
        name: 'packaged-workspace-consent',
        title: 'Packaged consent check',
        version: '0.0.0',
      },
    },
  })}\n`;
  const invoke = (args) =>
    spawnSync(cli, args, {
      cwd: workspace,
      env,
      input,
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 1024 * 1024,
    });
  const refuses = (result) =>
    result.status !== 0 && result.stderr.includes('Current project is not trusted');
  if (!refuses(invoke(['app-server'])))
    throw new Error('An unapproved packaged workspace did not refuse.');
  const accepted = invoke([
    'app-server',
    '--workspace-consent',
    workspace,
    '--workspace-consent-at-ms',
    String(Date.now()),
  ]);
  if (accepted.status !== 0) throw new Error('The packaged CLI rejected native workspace consent.');
  const replies = accepted.stdout.split('\n').flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
  if (!replies.some((reply) => reply.id === 1 && reply.result?.protocolVersion === protocolVersion))
    throw new Error('The consented packaged CLI answered no protocol handshake.');
  if (!refuses(invoke(['app-server'])))
    throw new Error('Native consent persisted beyond its process.');
  receipt.checks.workspaceConsent = {
    handshake: 'passed',
    ordinaryRefusal: 'passed',
    processLifetime: 'passed',
    modelTurns: 0,
  };
}

try {
  check('strictSignature', 'codesign', ['--verify', '--deep', '--strict', app]);
  check('gatekeeper', 'spctl', ['--assess', '--type', 'execute', app]);
  check('notarizationTicket', 'xcrun', ['stapler', 'validate', app]);
  receipt.checks.bundleId = info('CFBundleIdentifier');
  receipt.checks.version = info('CFBundleShortVersionString');
  receipt.checks.architecture = check('architecture', 'lipo', ['-archs', executable]).trim();
  receipt.artifacts = {
    asar: hash(path.join(app, 'Contents/Resources/app.asar')),
    cli: hash(cli),
    input: hash(path.join(app, 'Contents/Resources/agi-input')),
  };
  check('protocolHandshake', process.execPath, [
    path.join(repo, 'scripts/release/verify-cli-protocol-handshake.mjs'),
    cli,
  ]);
  if (process.env.AGI_ACCEPTANCE_EXPECT_WORKSPACE_CONSENT === '1') checkWorkspaceConsent();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const portOwner = net.createServer();
  await new Promise((resolve) => portOwner.listen(0, '127.0.0.1', resolve));
  const port = portOwner.address().port;
  await new Promise((resolve) => portOwner.close(resolve));
  const allowed = ['PATH', 'HOME', 'USER', 'LOGNAME', 'LANG', 'LC_ALL', 'TMPDIR'];
  const env = Object.fromEntries(
    allowed.filter((key) => process.env[key]).map((key) => [key, process.env[key]]),
  );
  const log = fs.openSync(path.join(scratch, 'app.log'), 'a');
  child = spawn(executable, [`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`], {
    env: { ...env, AGIWORKFORCE_HOME: home, AGI_CLOUD_APP_ORIGIN: origin },
    stdio: ['ignore', log, log],
  });
  fs.closeSync(log);
  const deadline = Date.now() + 30_000;
  let endpoint;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Packaged app exited ${child.exitCode}`);
    try {
      const response = await globalThis.fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        endpoint = (await response.json()).webSocketDebuggerUrl;
        break;
      }
    } catch {
      /* Startup not ready. */
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  if (!endpoint) throw new Error('Packaged renderer debug endpoint did not start.');
  browser = await chromium.connectOverCDP(endpoint);
  const context = browser.contexts()[0];
  let page;
  while (Date.now() < deadline) {
    page = context.pages().find((candidate) => candidate.url() === `${origin}/chat`);
    if (page) break;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  if (!page) throw new Error('Packaged hosted renderer did not load.');
  await page.getByRole('heading', { name: 'Packaged AGI acceptance' }).waitFor();
  const bridge = await page.evaluate(async () => ({
    platform: globalThis.window.agiHost?.platform,
    version: globalThis.window.agiHost?.appVersion,
    node: typeof globalThis.window.require,
    status: await globalThis.window.agiHost.invokeRuntime('developer_runtime_status'),
    routines: await globalThis.window.agiHost.invokeRuntime('local_routine_list'),
  }));
  if (
    bridge.platform !== 'electron-darwin' ||
    bridge.version !== receipt.checks.version ||
    bridge.node !== 'undefined'
  )
    throw new Error('Packaged preload identity or Node isolation failed.');
  if (!bridge.status.ok || !bridge.routines.ok)
    throw new Error('Packaged runtime bridge refused its hosted renderer.');
  receipt.checks.packagedHostedBridge = bridge;
  if (process.env.AGI_ACCEPTANCE_EXPECT_BROWSER_SIGN_IN === '1') {
    const signIn = await page.evaluate(async () => {
      const host = globalThis.window.agiHost;
      return {
        cancellation: host.browserSignIn?.cancellation === true,
        before: await host.invokeRuntime('browser_sign_in_state'),
        cancelled: await host.invokeRuntime('browser_sign_in_cancel'),
        after: await host.invokeRuntime('browser_sign_in_state'),
      };
    });
    if (
      !signIn.cancellation ||
      !signIn.before.ok ||
      signIn.before.value.kind !== 'idle' ||
      !signIn.cancelled.ok ||
      signIn.cancelled.value.cancelled !== true ||
      !signIn.after.ok ||
      signIn.after.value.kind !== 'idle'
    ) {
      throw new Error('Packaged browser sign-in cancellation contract failed.');
    }
    receipt.checks.browserSignIn = signIn;
  }

  const preferences = await page.evaluate(() => globalThis.window.agiHost.readPreferences());
  receipt.checks.sessionApprovalAlerts = preferences.preferences.sessionApprovalAlerts;
  if (
    process.env.AGI_ACCEPTANCE_EXPECT_APPROVAL_ALERTS &&
    String(preferences.preferences.sessionApprovalAlerts) !==
      process.env.AGI_ACCEPTANCE_EXPECT_APPROVAL_ALERTS
  )
    throw new Error('Preferences were not preserved through update.');
  await page.bringToFront();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        globalThis.window.requestAnimationFrame(() =>
          globalThis.window.requestAnimationFrame(resolve),
        ),
      ),
  );
  await page.screenshot({ path: path.join(reportDir, 'packaged-startup.png') });
  receipt.checks.updateFeedRequested = receipt.requests.some((request) =>
    request.startsWith('/api/releases/desktop-cloud/update/'),
  );
  if (!updateZip) receipt.checks.updaterNoRelease = receipt.checks.updateFeedRequested;
  if (updateZip) {
    const marker = !preferences.preferences.sessionApprovalAlerts;
    await page.evaluate(
      (value) => globalThis.window.agiHost.writePreferences({ sessionApprovalAlerts: value }),
      marker,
    );
    receipt.checks.preferenceMarker = { key: 'sessionApprovalAlerts', value: marker };
    const until = Date.now() + 90_000;
    let update;
    while (Date.now() < until) {
      update = await page.evaluate(() => globalThis.window.agiHost.checkForUpdate());
      if (update.readyToInstall && update.version === updateVersion) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (!update?.readyToInstall || update.version !== updateVersion)
      throw new Error('Signed updater payload was not accepted.');
    receipt.checks.signedUpdateDownloaded = { ...update, zipSha256: hash(updateZip) };
    fs.writeFileSync(
      path.join(reportDir, 'update-ready.json'),
      JSON.stringify({ ...receipt, profile }, null, 2),
    );
    console.log(
      'PACKAGED_UPDATE_READY: quit the owned application normally to verify deferred installation.',
    );
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('Owned application was not quit for update acceptance.')),
          120_000,
        ),
      ),
    ]);
    const installedBy = Date.now() + 90_000;
    let applied = false;
    while (Date.now() < installedBy) {
      try {
        if (info('CFBundleShortVersionString') === updateVersion) {
          execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'ignore' });
          applied = true;
          break;
        }
      } catch {
        /* Installer is still replacing its owned bundle. */
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!applied) throw new Error('The signed update was not installed after normal quit.');
    receipt.checks.appliedOnNormalQuit = {
      version: info('CFBundleShortVersionString'),
      asar: hash(path.join(app, 'Contents/Resources/app.asar')),
      profile,
    };
    check('updatedGatekeeper', 'spctl', ['--assess', '--type', 'execute', app]);
    check('updatedTicket', 'xcrun', ['stapler', 'validate', app]);
  }
  receipt.status = 'passed';
} catch (error) {
  receipt.status = 'failed';
  receipt.failure = String(error);
  receipt.diagnostics = scratch;
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => undefined);
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  await new Promise((resolve) => server.close(resolve));
  fs.writeFileSync(
    path.join(reportDir, 'packaged-acceptance.json'),
    JSON.stringify(receipt, null, 2),
  );
  if (receipt.status === 'passed') fs.rmSync(scratch, { recursive: true, force: true });
  console.log(JSON.stringify(receipt));
}
