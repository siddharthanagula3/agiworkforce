import type { PlaywrightTestConfig } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';

import config from '../playwright.config';

type WebServer = Exclude<PlaywrightTestConfig['webServer'], undefined>;

const soleWebServer = (candidate: PlaywrightTestConfig): Exclude<WebServer, unknown[]> => {
  const declared = candidate.webServer;
  expect(
    declared,
    'the DOM e2e run declares no webServer, so it silently depends on a dev server someone started by hand',
  ).toBeDefined();
  return (Array.isArray(declared) ? declared[0]! : declared!) as Exclude<WebServer, unknown[]>;
};

const loadConfig = async (env: Record<string, string>): Promise<PlaywrightTestConfig> => {
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value);
  }
  vi.resetModules();
  return (await import('../playwright.config')).default;
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('desktop DOM e2e dev server contract', () => {
  it('starts its own dev server instead of assuming one is already running', () => {
    const webServer = soleWebServer(config);
    expect(webServer.command).toContain('dev:vite');
  });

  it('serves the suite from the same origin the projects navigate to', () => {
    const webServer = soleWebServer(config);
    expect(webServer.url).toBe(config.use?.baseURL);
  });

  it('pins the dev server to cloud mode so a local .env.local cannot flip every suite', () => {
    const webServer = soleWebServer(config);
    expect(webServer.env?.['VITE_DESKTOP_UI_DEV_LOCAL']).toBe('0');
  });

  it('reuses the server CI starts itself rather than racing it on a strict port', () => {
    const webServer = soleWebServer(config);
    expect(webServer.reuseExistingServer).toBe(true);
    expect(webServer.env?.['VITE_DEV_PORT']).toBe(new URL(webServer.url!).port);
  });

  it('moves the managed server and the suite together when the port is overridden', async () => {
    const overridden = await loadConfig({ PLAYWRIGHT_DEV_PORT: '5185' });
    const webServer = soleWebServer(overridden);

    expect(webServer.url).toBe('http://127.0.0.1:5185');
    expect(webServer.env?.['VITE_DEV_PORT']).toBe('5185');
    expect(overridden.use?.baseURL).toBe('http://127.0.0.1:5185');
  });

  it('stands aside when an operator points the suite at their own server', async () => {
    const external = await loadConfig({ PLAYWRIGHT_BASE_URL: 'http://127.0.0.1:4173' });

    expect(external.webServer).toBeUndefined();
    expect(external.use?.baseURL).toBe('http://127.0.0.1:4173');
  });
});
