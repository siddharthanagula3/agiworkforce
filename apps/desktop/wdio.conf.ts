// WebdriverIO + Tauri native E2E config. See docs/products/agi-desktop and
// node_modules/@wdio/tauri-service/docs for the full reference; this covers
// native window/element checks that Playwright (driving :5175 in a plain
// browser) cannot — real macOS window chrome, native dialogs, tray, etc.
//
// Requires the ISOLATED debug build (com.agiworkforce.desktop.wdio bundle
// identifier, own app-data directory — never the user's installed-app
// database, and no macOS keychain prompt at startup):
//   pnpm run test:e2e:build
//   (= cd src-tauri && TAURI_CONFIG="$(cat tauri.conf.wdio.json)" cargo build
//    — TAURI_CONFIG takes the merge-config JSON CONTENT, not a file path)
// and the Vite dev server running on the devUrl the binary was built against:
//   pnpm run dev:vite
// onPrepare below refuses to start against a production-identifier binary.
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
