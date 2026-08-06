// WebdriverIO + Tauri native E2E config. See docs/products/agi-desktop and
// node_modules/@wdio/tauri-service/docs for the full reference; this covers
// native window/element checks that Playwright (driving :5175 in a plain
// browser) cannot — real macOS window chrome, native dialogs, tray, etc.
//
// Requires the ISOLATED BUNDLED-ASSET build (com.agiworkforce.desktop.wdio
// bundle identifier, own app-data directory — never the user's installed-app
// database, and no macOS keychain prompt at startup):
//   pnpm run test:e2e:build
//   (= vite build, then `cargo build --features tauri/custom-protocol` with
//    TAURI_CONFIG set to the merge JSON that wdio/tauri-config.mjs prints —
//    TAURI_CONFIG takes the JSON CONTENT, not a file path)
// NO Vite dev server is involved, and pointing WDIO at one cannot work. Reason
// (measured against the running binary, 2026-08-01):
//
//   The app uses Tauri's `isolation` pattern, so invoke() does not talk to Rust
//   directly — it queues each message until a hidden iframe served from
//   `isolation-<uuid>://localhost` posts `__TAURI_ISOLATION_READY__` back to the
//   main frame. A plain `cargo build` has no `custom-protocol` feature, so the
//   binary loads the frontend from the devUrl (http://127.0.0.1:5173), and
//   WKWebView does not deliver that handshake from the isolation frame's opaque
//   `null` origin to an http:// parent. The queue is never flushed, so every
//   invoke() promise hangs FOREVER with no resolve and no reject, and the shell
//   sits on "Opening encrypted local data…" — which is exactly what a spec that
//   only asserts a non-empty document would happily pass against. The same
//   handshake IS delivered when the parent is `tauri://localhost`, which is why
//   the harness drives a bundled-asset build.
//
// onPrepare below refuses to start against a production-identifier binary, and
// `before` refuses to run specs unless the frontend really came from the Tauri
// asset protocol.
//
// IPC mocking: tauri-plugin-wdio (Cargo.toml) + @wdio/tauri-plugin (this
// package's devDependencies) add browser.tauri.execute()/mock()/restoreAllMocks()
// on top of the embedded driver above -- use this to test BYOK/cloud provider
// flows without a real API key, e.g.:
//   const mock = await browser.tauri.mock('llm_send_message');
//   await mock.mockReturnValue({ content: 'test-only assistant reply' });

// CI and local parallel agents can point WDIO at an isolated debug build with
// its own bundle identifier/app-data directory. This prevents a native smoke
// run from opening or mutating the user's installed-app database.
const appBinaryPath =
  process.env['AGI_DESKTOP_WDIO_BINARY'] ?? '../../target/debug/agiworkforce-desktop';

// The embedded WebDriver server binds a fixed port (default 4445) unless overridden
// here or via TAURI_WEBDRIVER_PORT. With multiple agents/CI runs on this machine
// launching native WDIO concurrently, a shared fixed port causes intermittent
// ECONNREFUSED that looks like an app crash but is really port contention
// (see DESKTOP-WDIO-FIXED-PORT-CONTENTION-01 in known-flaws.md). Default to a
// random high port per run so independent runs don't collide; set
// TAURI_WEBDRIVER_PORT explicitly if you need a stable, reproducible port (e.g. CI).
const embeddedPort = process.env.TAURI_WEBDRIVER_PORT
  ? Number(process.env.TAURI_WEBDRIVER_PORT)
  : 40000 + Math.floor(Math.random() * 5000);

// @wdio/tauri-service's embedded DirectEvalClient does not read the service
// option above; it independently resolves TAURI_WEBDRIVER_PORT and otherwise
// falls back to 4445. Publish the chosen random port so browser.tauri.execute()
// and focus detection address this run's native host instead of a stale app
// still listening on the default port.
process.env['TAURI_WEBDRIVER_PORT'] = String(embeddedPort);

// Reading the SQLCipher key from the OS Keychain blocks on a GUI approval
// dialog whenever the requesting binary's signature is unknown — and every
// `cargo build` re-signs the debug binary. Nobody can click Allow under WDIO,
// so the app would hang before opening its database and every command would
// time out. The isolated `*.wdio` bundle (and only that bundle) accepts this
// per-run key instead; see OsDatabaseKeyStore::harness_key.
process.env['AGI_DESKTOP_WDIO_DATABASE_KEY'] =
  process.env['AGI_DESKTOP_WDIO_DATABASE_KEY'] ?? 'a'.repeat(64);

export const config: WebdriverIO.Config = {
  runner: 'local',
  specs: ['./wdio/specs/**/*.spec.ts'],
  maxInstances: 1,

  // A stale production-identifier binary hangs every spec ~3 minutes on the
  // macOS keychain prompt and opens the user's real app database. Fail fast
  // instead: the isolated build (test:e2e:build) bakes the wdio identifier
  // into the binary, so its absence means the wrong artifact is on disk.
  onPrepare: async () => {
    const { spawnSync } = await import('node:child_process');
    const { resolve } = await import('node:path');
    const { rmSync } = await import('node:fs');
    const { homedir } = await import('node:os');

    // This config is loaded as ESM (no __dirname); wdio runs it from apps/desktop.
    const binary = resolve(process.cwd(), appBinaryPath);
    const probe = spawnSync('grep', ['-aq', 'com.agiworkforce.desktop.wdio', binary]);
    if (probe.status !== 0) {
      throw new Error(
        `WDIO refuses to drive ${binary}: it does not embed the isolated ` +
          'com.agiworkforce.desktop.wdio identifier. Build it with ' +
          '`pnpm run test:e2e:build` first (see header of this file).',
      );
    }

    // Specs share one app-data profile, and a spec that persists a mode or
    // layout choice otherwise leaks it into the next file's boot (the
    // sidebar-navigation -> smoke Cloud-boot poisoning on this branch). Reset
    // the isolated profile from the filesystem BEFORE the app launches —
    // clearing it through browser.execute() would race the tauri plugin's own
    // init wait and reload the page out from under it.
    for (const dir of [
      `${homedir()}/Library/Application Support/com.agiworkforce.desktop.wdio`,
      `${homedir()}/Library/WebKit/com.agiworkforce.desktop.wdio`,
      `${homedir()}/Library/Caches/com.agiworkforce.desktop.wdio`,
    ]) {
      rmSync(dir, { recursive: true, force: true });
    }

    // If the product CSP ever regresses to an explicit frame-src, the harness
    // merge keeps specs runnable (see wdio/tauri-config.mjs). Never let that
    // compensation hide the product defect: a packaged isolation build would
    // block its own IPC relay and every invoke() would hang forever.
    const { readFileSync } = await import('node:fs');
    const productConfigPath = resolve(process.cwd(), 'src-tauri/tauri.conf.json');
    const productConfig = JSON.parse(readFileSync(productConfigPath, 'utf8')) as {
      app?: { security?: { csp?: string; pattern?: { use?: string } } };
    };
    const productCsp = productConfig.app?.security?.csp ?? '';
    const pinsFrameSrc = productCsp
      .split(';')
      .some((directive) => directive.trim().startsWith('frame-src'));
    if (productConfig.app?.security?.pattern?.use === 'isolation' && pinsFrameSrc) {
      console.warn(
        `\n!! ${productConfigPath} pins \`frame-src\` while app.security.pattern is "isolation".\n` +
          '!! Tauri only appends the generated isolation schema to `default-src`, so the packaged\n' +
          '!! app blocks isolation-<uuid>://localhost and EVERY invoke() hangs with no rejection.\n' +
          '!! These specs pass only because test:e2e:build folds frame-src into default-src.\n',
      );
    }
  },

  services: [
    [
      '@wdio/tauri-service',
      {
        appBinaryPath,
        driverProvider: 'embedded',
        embeddedPort,
        logLevel: 'info',
        captureBackendLogs: true,
        captureFrontendLogs: true,
        backendLogLevel: 'debug',
        frontendLogLevel: 'debug',
      },
    ],
  ],

  capabilities: [
    {
      browserName: 'tauri',
      'tauri:options': {
        application: appBinaryPath,
      },
    },
  ],

  logLevel: 'info',
  bail: 0,
  waitforTimeout: 10000,
  connectionRetryTimeout: 90000,
  connectionRetryCount: 3,

  // A binary built without `tauri/custom-protocol` loads the frontend from the
  // devUrl, where the isolation relay's ready handshake is silently dropped and
  // every invoke() hangs forever (see the header). The WDIO frontend plugin also
  // requires the harness-only `app.withGlobalTauri=true` merge so its direct-eval
  // channel can reach window.__TAURI__.core.invoke. Both failures render
  // plausible-looking UI, so fail loudly here rather than let every command pay
  // the plugin's 5s timeout.
  before: async () => {
    // One app instance serves every spec file, so a spec that fails while an
    // owned webview is open (e.g. the `cloud-sign-in` window, which shows an
    // http(s) page) leaves that webview as the CURRENT WebDriver context for
    // the next spec file — measured directly: 0-10's fresh session reported
    // getWindowHandle() === 'cloud-sign-in' and the probe read that window's
    // `http:` document, refusing the whole file with a bogus "built without
    // custom-protocol" error that then cascaded through 20+ files on
    // 2026-08-03. `browser.tauri.switchWindow` is NOT usable this early (the
    // service's own before() runs concurrently and its plugin may not be
    // attached), so re-target `main` with the raw WebDriver window switch —
    // the embedded driver uses window labels as handles — inside the probe
    // loop below.

    // WDIO runs service and config `before` hooks concurrently. The embedded
    // driver can therefore attach while WebKit still exposes its initial
    // about:blank document. Poll the renderer instead of misdiagnosing that
    // transient document as a missing custom-protocol feature.
    let runtime = {
      protocol: 'unavailable',
      hasGlobalInvoke: false,
      hasWdioPlugin: false,
    };
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      try {
        const handles = await browser.getWindowHandles();
        if (handles.includes('main') && (await browser.getWindowHandle()) !== 'main') {
          await browser.switchToWindow('main');
        }
      } catch {
        // Window enumeration can race the renderer swap; probe anyway and
        // retry on the next iteration.
      }
      try {
        runtime = await browser.execute(() => {
          const harnessWindow = window as typeof window & {
            __TAURI__?: { core?: { invoke?: unknown } };
            wdioTauri?: { waitForInit?: unknown };
          };
          return {
            protocol: location.protocol,
            hasGlobalInvoke: typeof harnessWindow.__TAURI__?.core?.invoke === 'function',
            hasWdioPlugin: typeof harnessWindow.wdioTauri?.waitForInit === 'function',
          };
        });
      } catch {
        // The initial browsing context may disappear between navigation and
        // executeScript. Retry against the next renderer document.
      }
      if (runtime.protocol === 'tauri:' && runtime.hasGlobalInvoke && runtime.hasWdioPlugin) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (runtime.protocol !== 'tauri:') {
      throw new Error(
        `WDIO refuses to run: the webview loaded the frontend over "${runtime.protocol}" instead of the ` +
          'Tauri asset protocol, so the app was built without `--features tauri/custom-protocol`. ' +
          'Under the isolation pattern that build can never complete an IPC call. ' +
          'Rebuild with `pnpm run test:e2e:build`.',
      );
    }
    if (!runtime.hasGlobalInvoke) {
      throw new Error(
        'WDIO refuses to run: window.__TAURI__.core.invoke is unavailable. ' +
          'The @wdio/tauri-plugin bridge requires the isolated harness config to set ' +
          '`app.withGlobalTauri=true`. Rebuild with `pnpm run test:e2e:build`.',
      );
    }
    if (!runtime.hasWdioPlugin) {
      throw new Error(
        'WDIO refuses to run: the frontend @wdio/tauri-plugin did not initialize. ' +
          'The bundled harness must be built with `VITE_WDIO_E2E=1`; rebuild with ' +
          '`pnpm run test:e2e:build`.',
      );
    }

    // Mark the single `main` webview as an explicit selection. The service's
    // generic auto-focus hook otherwise compares the native window title
    // ("AGI Workforce") with document.title ("AGI") before every selector,
    // repeatedly tries to switch back to the already-active handle, and turns
    // ordinary waits into a command storm. Explicit selection is the service's
    // supported way to keep focus management from undoing the caller's target.
    await browser.tauri.switchWindow('main');

    // Close owned webviews leaked by a prior spec file's mid-flight failure
    // (see the cascade note at the top of this hook). Runs from the `main`
    // context so WebDriver's session-killing `closeWindow()` is never needed.
    try {
      await browser.execute(async () => {
        const tauri = (
          window as unknown as {
            __TAURI__?: {
              webviewWindow?: {
                WebviewWindow?: {
                  getAll(): Promise<Array<{ label: string; close(): Promise<void> }>>;
                };
              };
            };
          }
        ).__TAURI__;
        // Only transient auth webviews: the app pre-creates hidden `overlay`
        // and `floating` windows at startup, and closing those would break
        // the features (and specs) that summon them.
        const leakProne = new Set(['cloud-sign-in']);
        const all = (await tauri?.webviewWindow?.WebviewWindow?.getAll()) ?? [];
        for (const owned of all) {
          if (leakProne.has(owned.label)) {
            await owned.close().catch(() => {});
          }
        }
      });
    } catch {
      // Leaked-window cleanup is best-effort; specs re-assert their own state.
    }

    // Normalize a prior file's leaked signed-out Cloud selection back to the
    // Local shell. Specs share one profile, and a cloud spec that fails
    // mid-journey (its `after` may not fully run) leaves `mode: 'cloud'`
    // persisted — the next file then boots into AuthPage, which has no
    // Settings gear, no composer, and no sidebar, so every selector it waits
    // for times out. Every file's canonical baseline is the Local shell (the
    // same state the onPrepare profile wipe produces after onboarding).
    try {
      const authHeading = await $('h1=Sign in to AGI Cloud');
      if (await authHeading.isExisting()) {
        await browser.execute(() => {
          const raw = window.localStorage.getItem('app-mode-store');
          let version = 3;
          let previous: Record<string, unknown> = {};
          if (raw) {
            try {
              const parsed = JSON.parse(raw) as {
                state?: Record<string, unknown>;
                version?: number;
              };
              previous = parsed.state ?? {};
              if (typeof parsed.version === 'number') version = parsed.version;
            } catch {
              // Rewrite from scratch below.
            }
          }
          window.localStorage.setItem(
            'app-mode-store',
            JSON.stringify({
              state: { ...previous, mode: 'local', hasSelectedMode: true },
              version,
            }),
          );
          window.location.reload();
        });
        await browser.waitUntil(
          async () =>
            (await $('button=New chat').isExisting()) ||
            (await $('button=Use Local Mode').isExisting()) ||
            (await $('button[aria-label="Settings"]').isExisting()),
          {
            timeout: 45_000,
            interval: 250,
            timeoutMsg: 'Local shell did not come back after resetting a leaked Cloud selection',
          },
        );
      }
    } catch {
      // Best-effort: a spec that needs a specific mode still sets it itself.
    }

    // Close a settings dialog left open by a prior file's mid-test failure.
    // Reopening while it is already open is a state no-op (`open` and
    // `initialTab` are both unchanged), so the next spec sees whatever tab
    // the failed spec was on — measured: local-model-install died with the
    // dialog on Models & Keys and main-window-close then couldn't find the
    // General tab's #keepInMenuBar toggle. Escape may raise the
    // "Discard unsaved changes?" confirmation; take the discard path.
    try {
      const { closeAnySettingsDialog } = await import('./wdio/support/close-settings');
      await closeAnySettingsDialog();
    } catch {
      // Best-effort; the spec's own waits surface any remaining dialog.
    }
  },

  framework: 'mocha',
  mochaOpts: {
    ui: 'bdd',
    // 5 minutes: some specs (e.g. real local-LLM generation via Ollama) need
    // more headroom than typical UI-interaction tests. Per-test overrides via
    // `this.timeout(...)` are also supported for outliers.
    timeout: 300000,
  },
  reporters: ['spec'],
};
