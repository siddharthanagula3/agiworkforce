// WebdriverIO + Tauri native E2E config. See docs/products/agi-desktop and
// node_modules/@wdio/tauri-service/docs for the full reference; this covers
// native window/element checks that Playwright (driving :5175 in a plain
// browser) cannot — real macOS window chrome, native dialogs, tray, etc.
//
// Requires a debug build with the embedded WebDriver plugin linked:
//   (cd src-tauri && cargo build)
// and the Vite dev server running on the devUrl the binary was built against:
//   pnpm run dev:vite
//
// IPC mocking: tauri-plugin-wdio (Cargo.toml) + @wdio/tauri-plugin (this
// package's devDependencies) add browser.tauri.execute()/mock()/restoreAllMocks()
// on top of the embedded driver above -- use this to test BYOK/cloud provider
// flows without a real API key, e.g.:
//   const mock = await browser.tauri.mock('llm_send_message');
//   await mock.mockReturnValue({ content: 'test-only assistant reply' });

const appBinaryPath = '../../target/debug/agiworkforce-desktop';

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

export const config: WebdriverIO.Config = {
  runner: 'local',
  specs: ['./wdio/specs/**/*.spec.ts'],
  maxInstances: 1,

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
    timeout: 120000,
  },
  reporters: ['spec'],
};
