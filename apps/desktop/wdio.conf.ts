
const appBinaryPath =
  process.env['AGI_DESKTOP_WDIO_BINARY'] ?? '../../target/debug/agiworkforce-desktop';

const embeddedPort = process.env.TAURI_WEBDRIVER_PORT
  ? Number(process.env.TAURI_WEBDRIVER_PORT)
  : 40000 + Math.floor(Math.random() * 5000);

process.env['TAURI_WEBDRIVER_PORT'] = String(embeddedPort);

process.env['AGI_DESKTOP_WDIO_DATABASE_KEY'] =
  process.env['AGI_DESKTOP_WDIO_DATABASE_KEY'] ?? 'a'.repeat(64);

export const config: WebdriverIO.Config = {
  runner: 'local',
  specs: ['./wdio/specs/**/*.spec.ts'],
  maxInstances: 1,

  onPrepare: async () => {
    const { spawnSync } = await import('node:child_process');
    const { resolve } = await import('node:path');
    const { rmSync } = await import('node:fs');
    const { homedir } = await import('node:os');

    const binary = resolve(process.cwd(), appBinaryPath);
    const probe = spawnSync('grep', ['-aq', 'com.agiworkforce.desktop.wdio', binary]);
    if (probe.status !== 0) {
      throw new Error(
        `WDIO refuses to drive ${binary}: it does not embed the isolated ` +
          'com.agiworkforce.desktop.wdio identifier. Build it with ' +
          '`pnpm run test:e2e:build` first (see header of this file).',
      );
    }

    for (const dir of [
      `${homedir()}/Library/Application Support/com.agiworkforce.desktop.wdio`,
      `${homedir()}/Library/WebKit/com.agiworkforce.desktop.wdio`,
      `${homedir()}/Library/Caches/com.agiworkforce.desktop.wdio`,
    ]) {
      rmSync(dir, { recursive: true, force: true });
    }

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

  before: async () => {

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

    await browser.tauri.switchWindow('main');

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
    timeout: 300000,
  },
  reporters: ['spec'],
};
