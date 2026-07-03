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
//   await mock.mockReturnValue({ content: 'fake response' });

const appBinaryPath = '../../target/debug/agiworkforce-desktop';

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
