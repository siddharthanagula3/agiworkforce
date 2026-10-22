import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import process from 'node:process';
import console from 'node:console';
import { URL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import net from 'node:net';
import { clearTimeout, setTimeout } from 'node:timers';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const req = createRequire(path.join(repo, 'package.json'));
const browserOnly = process.argv.includes('--browser');
const packageIndex = process.argv.indexOf('--packaged');
const packaged = packageIndex < 0 ? null : fs.realpathSync(process.argv[packageIndex + 1]);
if (packaged && browserOnly)
  throw new Error('Packaged browser opening needs its own OS destination fixture.');
const { _electron: electron, chromium } = req('@playwright/test');
const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'agi-electron-harness-'))),
  owned = fs.realpathSync(
    fs.mkdtempSync(
      path.join(packaged ? path.join(os.homedir(), 'Desktop') : os.tmpdir(), 'agi-electron-owned-'),
    ),
  ),
  project = path.join(owned, 'project'),
  home = path.join(owned, 'cli'),
  profile = path.join(owned, 'profile');
[project, home, profile].forEach((p) => fs.mkdirSync(p));
const agi = packaged
  ? path.join(packaged, 'Contents/Resources/agi-cli/agi')
  : path.join(repo, 'target/debug/agi');
const safeEnvironment = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !/(TOKEN|SECRET|API_KEY|PASSWORD|PRIVATE_KEY|DATABASE|REDIS|^KV_|^CSC_|^APPLE_)/i.test(key),
    ),
  );
if (packaged)
  execFileSync('codesign', ['--verify', '--deep', '--strict', packaged], { stdio: 'pipe' });
const reportDir = process.env.AGI_ACCEPTANCE_OUTPUT_DIR || dir;
fs.mkdirSync(reportDir, { recursive: true });
let calls = [],
  routineCalls = 0;
const cssdir = path.join(repo, 'apps/web/.next/dev/static/chunks');
const css = (fs.existsSync(cssdir) ? fs.readdirSync(cssdir) : [])
  .filter((n) => n.endsWith('.css') && !n.includes('font_'))
  .map((n) => fs.readFileSync(path.join(cssdir, n), 'utf8'))
  .join('\n');

fs.writeFileSync(
  path.join(dir, 'entry.tsx'),
  String.raw`import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {useLocalSession} from '@/features/code/hooks/use-local-session';
import {LocalRoutinesSection} from '@/features/schedules/components/LocalRoutinesSection';
function App(){
 const [session,setSession]=useState(()=>JSON.parse(localStorage.getItem('owned-session')||'null'));
 const state=useLocalSession(session,{agentMode:'ask'});
 Object.assign(window,{__state:state,__selectSession:(value:any)=>{localStorage.setItem('owned-session',JSON.stringify(value));setSession(value);}});
 return <main className="mx-auto max-w-3xl p-6"><h1 className="text-2xl">Owned Electron integration</h1><button onClick={()=>void state.send('PARENT_NORMAL_CHILD')}>Run normal child</button>{state.approvals.map(a=><section key={a.requestId}><p>{a.summary}</p><button onClick={()=>void state.decideApproval(a,'approve_once')}>Approve owned write once</button></section>)}<pre id="state">{JSON.stringify({messages:state.messages,turn:state.turn,children:state.childTasks,error:state.error,loading:state.loading},null,2)}</pre><LocalRoutinesSection/></main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
`,
);
req('esbuild').buildSync({
  absWorkingDir: repo,
  entryPoints: [path.join(dir, 'entry.tsx')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  outfile: path.join(dir, 'bundle.js'),
  jsx: 'automatic',
  nodePaths: [path.join(repo, 'node_modules')],
  alias: {
    '@': path.join(repo, 'apps/web'),
    '@/features/desktop-host': path.join(
      repo,
      'apps/web/features/desktop-host/lib/runtime-client.ts',
    ),
  },
  define: { 'process.env.NODE_ENV': '"production"' },
});
if (process.argv.includes('--check-bundle')) {
  console.log(
    JSON.stringify({
      phase: 'fixture-compilation-only',
      bundleSha256: crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(dir, 'bundle.js')))
        .digest('hex'),
    }),
  );
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(owned, { recursive: true, force: true });
  process.exit(0);
}
const server = http.createServer(async (q, s) => {
  const u = new URL(q.url, 'http://localhost');
  if (u.pathname.startsWith('/api/releases/desktop-cloud/update/')) {
    s.writeHead(204);
    return s.end();
  }
  if (u.pathname === '/api/me') {
    s.writeHead(401, { 'Content-Type': 'application/json' });
    return s.end('{"error":"owned fixture signed out"}');
  }
  if (u.pathname === '/v1/models') {
    s.setHeader('Content-Type', 'application/json');
    return s.end(JSON.stringify({ data: [{ id: 'owned-fixture-model' }] }));
  }
  if (u.pathname === '/v1/chat/completions') {
    let data = '';
    for await (const c of q) data += c;
    const body = JSON.parse(data),
      messages = body.messages,
      users = messages
        .filter((m) => m.role === 'user')
        .map((m) => JSON.stringify(m.content))
        .join(' '),
      child = users.includes('CHILD_APPROVAL_FIRST') && !users.includes('PARENT_NORMAL_CHILD'),
      routine = users.includes('OWNED_ROUTINE_ONLY'),
      hasResult = messages.some((m) => m.role === 'tool');
    calls.push({ child, routine, hasResult });
    let message,
      finish = 'stop';
    if (browserOnly) {
      if (hasResult) message = { role: 'assistant', content: 'Browser relay completed.' };
      else {
        message = {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              index: 0,
              id: 'call_' + crypto.randomUUID(),
              type: 'function',
              function: {
                name: 'run_command',
                arguments: JSON.stringify({
                  command: `"$BROWSER" 'http://${q.headers.host}/owned-browser-target'`,
                }),
              },
            },
          ],
        };
        finish = 'tool_calls';
      }
    } else if (routine) {
      routineCalls++;
      message = { role: 'assistant', content: 'Routine completed.' };
    } else if (hasResult)
      message = {
        role: 'assistant',
        content: child ? 'Child completed.' : 'Parent completed with owned child.',
      };
    else {
      const name = child ? 'write_file' : 'task',
        args = child
          ? { path: path.join(project, 'child-result.txt'), content: 'OWNED_CHILD_SUCCESS\n' }
          : { description: 'Owned normal child', prompt: 'CHILD_APPROVAL_FIRST' };
      message = {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            index: 0,
            id: 'call_' + crypto.randomUUID(),
            type: 'function',
            function: { name, arguments: JSON.stringify(args) },
          },
        ],
      };
      finish = 'tool_calls';
    }
    s.setHeader('Content-Type', 'text/event-stream');
    s.end(
      'data: ' +
        JSON.stringify({ choices: [{ index: 0, delta: message, finish_reason: null }] }) +
        '\n\ndata: ' +
        JSON.stringify({
          choices: [{ index: 0, delta: {}, finish_reason: finish }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }) +
        '\n\ndata: [DONE]\n\n',
    );
    return;
  }
  if (u.pathname === '/bundle.js') {
    s.setHeader('Content-Type', 'text/javascript');
    return s.end(fs.readFileSync(dir + '/bundle.js'));
  }
  if (u.pathname === '/styles.css') {
    s.setHeader('Content-Type', 'text/css');
    return s.end(css);
  }
  if (u.pathname.endsWith('.woff2')) {
    const f = path.join(repo, 'apps/web/.next/dev/static/media', path.basename(u.pathname));
    if (fs.existsSync(f)) {
      s.setHeader('Content-Type', 'font/woff2');
      return s.end(fs.readFileSync(f));
    }
  }
  if (u.pathname.startsWith('/api/')) {
    s.writeHead(404, { 'Content-Type': 'application/json' });
    return s.end('{"error":"outside owned fixture"}');
  }
  s.setHeader('Content-Type', 'text/html');
  s.end(
    '<!doctype html><html><head><title>Owned AGI native acceptance</title><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script>globalThis.process={env:{NODE_ENV:"production"}};</script><script type="module" src="/bundle.js"></script></body></html>',
  );
});
async function launch(origin) {
  const env = safeEnvironment();
  delete env.ELECTRON_RUN_AS_NODE;
  if (packaged) {
    const socket = net.createServer();
    await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
    const port = socket.address().port;
    await new Promise((resolve) => socket.close(resolve));
    const executable = path.join(packaged, 'Contents/MacOS/AGI Desktop');
    const log = fs.openSync(path.join(dir, 'packaged.log'), 'a');
    const child = spawn(
      executable,
      [`--user-data-dir=${profile}`, `--remote-debugging-port=${port}`],
      {
        env: { ...env, AGI_CLOUD_APP_ORIGIN: origin, AGIWORKFORCE_HOME: home },
        stdio: ['ignore', log, log],
      },
    );
    fs.closeSync(log);
    const until = Date.now() + 30_000;
    let browser;
    while (Date.now() < until) {
      if (child.exitCode !== null)
        throw new Error('Packaged application exited before its renderer started.');
      try {
        const response = await globalThis.fetch(`http://127.0.0.1:${port}/json/version`);
        if (response.ok) {
          browser = await chromium.connectOverCDP((await response.json()).webSocketDebuggerUrl);
          break;
        }
      } catch {
        /* Renderer is starting. */
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    if (!browser) {
      child.kill('SIGTERM');
      throw new Error('Packaged renderer did not start.');
    }
    return {
      firstWindow: async () => {
        while (Date.now() < until) {
          const page = browser
            .contexts()[0]
            .pages()
            .find((page) => page.url() === `${origin}/chat`);
          if (page) {
            await page.bringToFront();
            return page;
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error('Packaged main window did not load.');
      },
      close: async () => {
        if (child.exitCode === null) {
          console.log('PACKAGED_NATIVE_QUIT_READY: quit the owned application normally.');
          await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
              child.kill('SIGTERM');
              reject(new Error('The owned packaged app was not quit.'));
            }, 300_000);
            child.once('exit', () => {
              clearTimeout(timer);
              resolve();
            });
          });
        }
        await browser.close().catch(() => undefined);
      },
    };
  }
  return electron.launch({
    args: [dir],
    env: {
      ...env,
      AGI_CLOUD_APP_ORIGIN: origin,
      AGIWORKFORCE_HOME: home,
      ...(browserOnly ? { AGI_OWNED_FIXTURE_KEY: 'test-only-owned-fixture' } : {}),
      AGI_OWNED_PROFILE: profile,
      AGI_OWNED_BOOTSTRAP_FIXTURE: fileURLToPath(
        new URL('./fixtures/native-bootstrap.cjs', import.meta.url),
      ),
      AGI_OWNED_MAIN: path.join(repo, 'apps/desktop/electron/dist/main.cjs'),
      AGI_OWNED_BROWSER_ONLY: browserOnly ? '1' : '0',
      AGI_OWNED_PROJECT: project,
      AGI_OWNED_ORIGIN: origin,
    },
    timeout: 30000,
  });
}
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const origin = 'http://127.0.0.1:' + server.address().port;
  fs.writeFileSync(
    path.join(home, 'config.toml'),
    `[default]\nmodel="owned-fixture-model"\nprovider="${browserOnly ? 'owned-fixture' : 'lmstudio'}"\nstream=true\n[providers.${browserOnly ? 'owned-fixture' : 'lmstudio'}]\n${browserOnly ? 'api_key_env="AGI_OWNED_FIXTURE_KEY"\n' : ''}base_url="${origin}/v1"\n[telemetry]\nproduct_analytics=false\n[updates]\ncheck_on_startup=false\n`,
  );
  execFileSync(agi, ['init'], {
    cwd: project,
    env: { ...safeEnvironment(), AGIWORKFORCE_HOME: home },
    stdio: 'pipe',
  });
  fs.writeFileSync(
    path.join(profile, 'settings.json'),
    JSON.stringify({
      cliPath: packaged ? '' : agi,
      showInMenuBar: false,
      launchAtLogin: false,
      quickAskShortcut: '',
      screenshotShortcut: '',
      windowShotShortcut: '',
      voiceShortcut: '',
      stopShortcut: '',
    }),
  );
  fs.writeFileSync(
    dir + '/package.json',
    JSON.stringify({ name: 'agi-owned-acceptance', version: '0.0.1', main: 'bootstrap.cjs' }),
  );
  fs.writeFileSync(
    path.join(dir, 'bootstrap.cjs'),
    String.raw`const { bootstrapOwnedNative } = require(process.env.AGI_OWNED_BOOTSTRAP_FIXTURE);
bootstrapOwnedNative(require('electron'), process.env, globalThis, require);
`,
  );
  let app;
  let completed = false;
  const errors = [];
  const receipt = {
    capturedAt: new Date().toISOString(),
    source: {
      mainSha256: crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(repo, 'apps/desktop/electron/dist/main.cjs')))
        .digest('hex'),
      preloadSha256: crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(repo, 'apps/desktop/electron/dist/preload.cjs')))
        .digest('hex'),
      cliSha256: crypto.createHash('sha256').update(fs.readFileSync(agi)).digest('hex'),
    },
    ...(packaged
      ? {
          packaged,
          asarSha256: crypto
            .createHash('sha256')
            .update(fs.readFileSync(path.join(packaged, 'Contents/Resources/app.asar')))
            .digest('hex'),
        }
      : {}),
    owned,
    project,
    boundary: packaged
      ? 'unchanged signed Electron package and bundled CLI; actual hosted hook; scripted loopback model; native dialogs answered by the operator'
      : 'actual Electron main/preload, CLI and hosted hook; scripted local model and native-dialog answers',
  };
  try {
    app = await launch(origin);
    let page = await app.firstWindow();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.waitForFunction(() => globalThis.window.agiHost && globalThis.window.__state, {
      timeout: 30000,
    });
    const invoke = (command, args = {}) =>
      page.evaluate(
        async ({ command, args }) => {
          const r = await globalThis.window.agiHost.invokeRuntime(command, args);
          if (!r.ok) throw Error(JSON.stringify(r.error));
          return r.value;
        },
        { command, args },
      );
    if (packaged && process.argv.includes('--operator-ready')) {
      console.log('PACKAGED_NATIVE_OPERATOR_READY: focus the owned app, then send a newline.');
      await new Promise((resolve) => {
        process.stdin.resume();
        process.stdin.once('data', () => {
          process.stdin.pause();
          resolve();
        });
      });
    }
    if (packaged) console.log(JSON.stringify({ phase: 'PICK_OWNED_FOLDER', project, packaged }));
    const root = await invoke('workspace_pick_root');
    if (packaged)
      console.log(
        JSON.stringify({ phase: 'PICKED_FOLDER', expected: project, actual: root?.path }),
      );
    if (!root || fs.realpathSync(root.path) !== project)
      throw new Error('The selected folder is outside the owned acceptance project.');
    if (packaged) console.log('PACKAGED_NATIVE_AGENT_CONSENT: review only the owned folder.');
    await invoke('developer_sessions_allow', { rootId: root.id });
    if (packaged)
      console.log(
        JSON.stringify({
          phase: 'BUNDLED_RUNTIME',
          status: await invoke('developer_runtime_status'),
        }),
      );
    const session = await invoke('developer_session_start', { rootId: root.id });
    await page.evaluate((s) => globalThis.window.__selectSession(s), session);
    await page.waitForFunction(
      () => globalThis.window.__state && !globalThis.window.__state.loading,
    );
    if (browserOnly) {
      await page.getByRole('button', { name: 'Run normal child', exact: true }).click();
      const approvals = [];
      const deadline = Date.now() + 30000;
      while (true) {
        const state = await page.evaluate(() => ({
          approvals: globalThis.window.__state.approvals,
          turn: globalThis.window.__state.turn,
          messages: globalThis.window.__state.messages,
          error: globalThis.window.__state.error,
        }));
        if (state.approvals.length) {
          approvals.push(
            ...state.approvals.map((a) => ({
              requestId: a.requestId,
              turnId: a.turnId,
              summary: a.summary,
            })),
          );
          await page.getByRole('button', { name: 'Approve owned write once' }).click();
        }
        if (state.messages.some((m) => m.text === 'Browser relay completed.')) break;
        if (Date.now() > deadline)
          throw Error('Browser helper did not finish: ' + JSON.stringify(state));
        await page.waitForTimeout(100);
      }
      const opened = fs
        .readFileSync(path.join(profile, 'opened.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map(JSON.parse);
      if (opened.length !== 1 || opened[0].url !== origin + '/owned-browser-target')
        throw Error('Wrong or duplicated fallback destination ' + JSON.stringify(opened));
      if (approvals.length !== 2)
        throw Error(
          'Expected command approval and scoped browser approval: ' + JSON.stringify(approvals),
        );
      receipt.approvals = approvals;
      receipt.opened = opened;
      receipt.modelCalls = calls;
      receipt.errors = errors;
      receipt.boundary += '; OS open acknowledgement captured by fixture';
      fs.writeFileSync(
        path.join(reportDir, 'browser-owner-live.json'),
        JSON.stringify(receipt, null, 2),
      );
      console.log(
        JSON.stringify(
          { browserHelper: true, normalApprovals: approvals.length, oneFallback: opened, errors },
          null,
          2,
        ),
      );
    } else {
      await page.getByRole('button', { name: 'Run normal child', exact: true }).click();
      await page
        .getByRole('button', { name: 'Approve owned write once' })
        .waitFor({ timeout: 30000 });
      receipt.approvalBeforeReload = await page.evaluate(() =>
        globalThis.window.__state.approvals.map((a) => ({
          requestId: a.requestId,
          turnId: a.turnId,
          summary: a.summary,
        })),
      );
      await page.reload();
      await page
        .getByRole('button', { name: 'Approve owned write once' })
        .waitFor({ timeout: 30000 });
      receipt.approvalAfterReload = await page.evaluate(() =>
        globalThis.window.__state.approvals.map((a) => ({
          requestId: a.requestId,
          turnId: a.turnId,
          summary: a.summary,
        })),
      );
      if (
        JSON.stringify(receipt.approvalBeforeReload) !== JSON.stringify(receipt.approvalAfterReload)
      )
        throw Error('Approval identity changed across renderer restart');
      await page.getByRole('button', { name: 'Approve owned write once' }).click();
      await page.waitForFunction(
        () =>
          globalThis.window.__state.childTasks[0]?.state === 'completed' &&
          globalThis.window.__state.messages.some(
            (m) =>
              m.role === 'assistant' &&
              JSON.stringify(m).includes('Parent completed with owned child.'),
          ),
        { timeout: 30000 },
      );
      receipt.finalState = await page.evaluate(() => ({
        messages: globalThis.window.__state.messages,
        children: globalThis.window.__state.childTasks,
        error: globalThis.window.__state.error,
        turn: globalThis.window.__state.turn,
      }));
      if (
        receipt.finalState.messages.filter(
          (message) => message.text === 'Parent completed with owned child.',
        ).length !== 1 ||
        receipt.finalState.turn.reply !== ''
      )
        throw Error('Completion output was duplicated or lost');
      if (
        fs.readFileSync(path.join(project, 'child-result.txt'), 'utf8') !== 'OWNED_CHILD_SUCCESS\n'
      )
        throw Error('Owned child write missing');
      const id = crypto.randomUUID();
      const routine = {
        requestId: id,
        name: 'Owned one-shot',
        rootId: root.id,
        model: 'lmstudio:owned-fixture-model',
        prompt: 'OWNED_ROUTINE_ONLY',
        schedule: {
          type: 'once',
          enabled: true,
          executeAt: new Date(Date.now() + (packaged ? 60_000 : 4000)).toISOString(),
          timezone: 'America/Chicago',
        },
        missedExecutionPolicy: 'run_once',
        keepAwake: true,
        notificationSettings: {
          onSuccess: false,
          onFailure: true,
          onApproval: true,
          push: false,
          email: false,
        },
      };
      const models = await invoke('developer_model_list', { rootId: root.id });
      routine.model = models.models.find((m) => m.provider === 'lmstudio').id;
      if (packaged) console.log('PACKAGED_NATIVE_ROUTINE_CONSENT: review the owned one-shot only.');
      await invoke('local_routine_create', routine);
      const deadline = Date.now() + (packaged ? 120_000 : 30000);
      while (true) {
        const state = await invoke('local_routine_list');
        if (state.routines.find((x) => x.id === id)?.runs[0]?.state === 'completed') break;
        if (Date.now() > deadline)
          throw Error('Routine did not complete: ' + JSON.stringify(state));
        await page.waitForTimeout(200);
      }
      receipt.routine = await invoke('local_routine_list');
      receipt.routineModelCalls = routineCalls;
      await page.screenshot({ path: path.join(reportDir, 'electron-live.png') });
      await app.close();
      app = null;
      app = await launch(origin);
      page = await app.firstWindow();
      await page.waitForFunction(() => globalThis.window.agiHost && globalThis.window.__state);
      await page.waitForTimeout(2500);
      const restored = await page.evaluate(async () =>
        globalThis.window.agiHost.invokeRuntime('local_routine_list'),
      );
      if (
        !restored.ok ||
        restored.value.routines[0].runs.length !== 1 ||
        routineCalls !== receipt.routineModelCalls
      )
        throw Error('Restart did not preserve settled one-shot history or replayed effects');
      receipt.noReplayAfterRestart = true;
      receipt.errors = errors;
      receipt.modelCalls = calls;
      fs.writeFileSync(
        path.join(reportDir, 'electron-live.json'),
        JSON.stringify(receipt, null, 2),
      );
      console.log(
        JSON.stringify(
          {
            normalChild: true,
            rendererRestart: true,
            oneShot: true,
            noReplay: true,
            errors,
            owned,
          },
          null,
          2,
        ),
      );
    }
    completed = true;
  } catch (error) {
    console.error('Native acceptance failed before cleanup:', error);
    throw error;
  } finally {
    if (app) await app.close();
    server.close();
    console.log('Acceptance reports:', reportDir);
    if (completed) {
      fs.rmSync(owned, { recursive: true, force: true });
      if (path.resolve(reportDir) !== path.resolve(dir))
        fs.rmSync(dir, { recursive: true, force: true });
    }
  }
})().catch((e) => {
  console.error(e);
  server.close();
  process.exitCode = 1;
});
