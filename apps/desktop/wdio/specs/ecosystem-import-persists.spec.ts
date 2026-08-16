
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { waitForSettingsReady } from '../support/close-settings';
import { resolveScreenDir } from '../support/dom';

const SCREEN_DIR = resolveScreenDir('ecosystem-import');

const UNIQUE_SUFFIX = `wdio-eco-${Date.now()}`;
const ZED_CONFIG_DIR = path.join(os.homedir(), '.config', 'zed');
const ZED_SETTINGS_PATH = path.join(ZED_CONFIG_DIR, 'settings.json');
const ZED_CONFIG_DIR_PREEXISTED = fs.existsSync(ZED_CONFIG_DIR);
const DOTFILE_MCP_JSON = path.join(os.homedir(), '.agiworkforce', 'mcp.json');

const IMPORTED_SERVER_NAME = `zed:${UNIQUE_SUFFIX}`;

interface McpServerInfo {
  name: string;
  enabled: boolean;
  connected: boolean;
  toolCount?: number;
  tool_count?: number;
  command: string;
}

interface McpToolInfo {
  id: string;
  name: string;
  description: string;
  server: string;
}

type InvokeOutcome<T> = { ok: true; value: T } | { ok: false; error: string };

async function invokeTauri<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const resultKey = `__wdio_invoke_${cmd}_${Math.random().toString(36).slice(2)}`;

  await browser.execute(
    (invokeCmd: string, invokeArgs: Record<string, unknown> | undefined, key: string) => {
      const w = window as unknown as {
        __TAURI_INTERNALS__: {
          invoke: (c: string, a?: Record<string, unknown>) => Promise<unknown>;
        };
        [k: string]: unknown;
      };
      w.__TAURI_INTERNALS__
        .invoke(invokeCmd, invokeArgs)
        .then((value) => {
          w[key] = { ok: true, value };
        })
        .catch((error: unknown) => {
          w[key] = { ok: false, error: String(error) };
        });
    },
    cmd,
    args,
    resultKey,
  );

  await browser.waitUntil(
    async () => {
      const has = (await browser.execute((key: string) => key in window, resultKey)) as boolean;
      return has;
    },
    { timeout: 20000, timeoutMsg: `invoke('${cmd}') did not resolve in time`, interval: 300 },
  );

  const outcome = (await browser.execute(
    (key: string) => (window as unknown as Record<string, unknown>)[key],
    resultKey,
  )) as InvokeOutcome<T>;

  if (!outcome.ok) {
    throw new Error(`invoke('${cmd}') rejected: ${outcome.error}`);
  }
  return outcome.value;
}

function clickButtonWithText(containerSelector: string, text: string) {
  return browser.execute(
    (containerSel: string, label: string) => {
      const container = document.querySelector(containerSel) ?? document;
      const buttons = Array.from(container.querySelectorAll('button'));
      const match = buttons.find((b) => (b.textContent ?? '').trim().startsWith(label));
      if (match) {
        (match as HTMLButtonElement).click();
        return true;
      }
      return false;
    },
    containerSelector,
    text,
  ) as Promise<boolean>;
}

function writeSyntheticZedConfig() {
  fs.mkdirSync(ZED_CONFIG_DIR, { recursive: true });
  const config = {
    context_servers: {
      [UNIQUE_SUFFIX]: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-everything'],
      },
    },
  };
  fs.writeFileSync(ZED_SETTINGS_PATH, JSON.stringify(config, null, 2));
}

async function cleanup() {
  try {
    await invokeTauri('mcp_disconnect_server', { name: IMPORTED_SERVER_NAME });
  } catch (err) {
    console.log('CLEANUP — mcp_disconnect_server (non-fatal):', err);
  }

  try {
    await invokeTauri('dotfile_remove_mcp_server', { name: IMPORTED_SERVER_NAME });
  } catch (err) {
    console.log('CLEANUP — dotfile_remove_mcp_server (non-fatal):', err);
  }

  try {
    if (fs.existsSync(DOTFILE_MCP_JSON)) {
      const raw = JSON.parse(fs.readFileSync(DOTFILE_MCP_JSON, 'utf-8')) as {
        mcpServers?: Record<string, unknown>;
      };
      if (raw.mcpServers && IMPORTED_SERVER_NAME in raw.mcpServers) {
        delete raw.mcpServers[IMPORTED_SERVER_NAME];
        fs.writeFileSync(DOTFILE_MCP_JSON, JSON.stringify(raw, null, 2));
        console.log('CLEANUP — scrubbed test server directly from ~/.agiworkforce/mcp.json');
      }
    }
  } catch (err) {
    console.log('CLEANUP — direct dotfile scrub failed:', err);
  }

  try {
    if (!ZED_CONFIG_DIR_PREEXISTED && fs.existsSync(ZED_CONFIG_DIR)) {
      fs.rmSync(ZED_CONFIG_DIR, { recursive: true, force: true });
      console.log('CLEANUP — removed synthetic ~/.config/zed directory');
    } else if (ZED_CONFIG_DIR_PREEXISTED && fs.existsSync(ZED_SETTINGS_PATH)) {
      fs.rmSync(ZED_SETTINGS_PATH, { force: true });
      console.log('CLEANUP — removed synthetic ~/.config/zed/settings.json');
    }
  } catch (err) {
    console.log('CLEANUP — Zed config removal failed:', err);
  }
}

describe('import_ecosystem_mcp_servers actually persists and connects (sibling of DESKTOP-MCP-DOTFILE-CONFIG-FAKE-SUCCESS-01)', () => {
  before(function () {
    if (ZED_CONFIG_DIR_PREEXISTED) {
      throw new Error(
        `Refusing to run: ${ZED_CONFIG_DIR} already exists on this machine. ` +
          'This spec only writes a synthetic Zed config when none exists, to avoid ' +
          "clobbering a real developer's settings.",
      );
    }
  });

  after(async () => {
    await cleanup();
  });

  it('detects the synthetic tool, imports its MCP server, persists it, and connects it live', async function () {
    this.timeout(150000);

    writeSyntheticZedConfig();

    await browser.pause(1500);

    const gear = await $('button[aria-label="Settings"]');
    await gear.waitForDisplayed({ timeout: 15000 });
    await gear.click();

    await waitForSettingsReady();

    const clickedDeveloper = await clickButtonWithText(
      'nav[aria-label="Settings sections"]',
      'Developer',
    );
    console.log('Clicked Developer nav item:', clickedDeveloper);
    expect(clickedDeveloper).toBe(true);
    await browser.pause(800);

    await browser.saveScreenshot(`${SCREEN_DIR}/00-developer-tab.png`);

    const detected = await invokeTauri<Array<{ name: string }>>('detect_ecosystem_tools');
    console.log(
      'detect_ecosystem_tools:',
      detected.map((t) => t.name),
    );
    expect(detected.some((t) => t.name === 'Zed')).toBe(true);

    let clickedImport = false;
    await browser.waitUntil(
      async () => {
        clickedImport = await clickButtonWithText('body', 'Import MCP Servers');
        return clickedImport;
      },
      {
        timeout: 20_000,
        interval: 500,
        timeoutMsg: 'The "Import MCP Servers" button never rendered in the Developer tab',
      },
    );
    console.log('Clicked "Import MCP Servers":', clickedImport);
    expect(clickedImport).toBe(true);

    const toast = await $('*=Imported');
    const toastAppeared = await toast
      .waitForDisplayed({ timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    console.log('Import toast appeared:', toastAppeared);
    await browser.saveScreenshot(`${SCREEN_DIR}/01-after-import-toast.png`);

    let dotfileHasEntry = false;
    const dotfileDeadline = Date.now() + 15000;
    while (Date.now() < dotfileDeadline) {
      if (fs.existsSync(DOTFILE_MCP_JSON)) {
        const raw = JSON.parse(fs.readFileSync(DOTFILE_MCP_JSON, 'utf-8')) as {
          mcpServers?: Record<string, unknown>;
        };
        if (raw.mcpServers && IMPORTED_SERVER_NAME in raw.mcpServers) {
          dotfileHasEntry = true;
          break;
        }
      }
      await browser.pause(500);
    }
    console.log(`~/.agiworkforce/mcp.json contains '${IMPORTED_SERVER_NAME}':`, dotfileHasEntry);
    expect(dotfileHasEntry).toBe(true);

    let servers: McpServerInfo[] = [];
    let connected = false;
    const connectDeadline = Date.now() + 90000;
    while (Date.now() < connectDeadline) {
      servers = await invokeTauri<McpServerInfo[]>('mcp_list_servers');
      const entry = servers.find((s) => s.name === IMPORTED_SERVER_NAME);
      if (entry?.connected) {
        connected = true;
        break;
      }
      await browser.pause(2000);
    }
    console.log(
      'mcp_list_servers entry for imported server:',
      JSON.stringify(servers.find((s) => s.name === IMPORTED_SERVER_NAME)),
    );
    expect(connected).toBe(true);

    const tools = await invokeTauri<McpToolInfo[]>('mcp_list_tools');
    const ourTools = tools.filter((t) => t.server === IMPORTED_SERVER_NAME);
    console.log(
      'Real tools discovered for imported server:',
      ourTools.map((t) => t.name).join(', '),
    );
    expect(ourTools.length).toBeGreaterThan(0);
    expect(ourTools.some((t) => t.name === 'echo')).toBe(true);

    await browser.saveScreenshot(`${SCREEN_DIR}/02-imported-server-connected.png`);
  });
});
