// Live-interaction, real-native-WebDriver verification for
// DESKTOP-MCP-DOTFILE-CONFIG-FAKE-SUCCESS-01 (see docs/agent-context/known-flaws.md).
//
// Before the fix: adding an MCP server via Settings -> Developer
// (DotfileSettings.tsx, backed by ~/.agiworkforce/mcp.json) showed a success
// toast, but the live MCP client (core/mcp/config.rs, backed by a totally
// different app-data JSON file) never read that file, so the server never
// connected and exposed zero tools.
//
// This spec drives the real Settings -> Developer -> "MCP Servers" -> Add
// flow with a REAL, runnable MCP stdio server
// (`@modelcontextprotocol/server-everything`, the official MCP SDK reference/
// test server) and asserts, via the app's own live Tauri IPC bridge (not just
// a toast), that the server actually connects and its real tools (e.g.
// "echo") are discoverable through `mcp_list_servers` / `mcp_list_tools` --
// the exact same commands the live chat tool-loop uses. It then removes the
// server and confirms it is disconnected and the dotfile is restored.
//
// Uses a highly-unique server name and restores `~/.agiworkforce/mcp.json`
// to its prior state in an `after()` hook so this test is safe to run
// against a real developer machine's real dotfile / app-data.

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const SCREEN_DIR =
  '/private/tmp/claude-501/-Users-siddhartha-Desktop-agiworkforce/75367813-fb2a-4a49-bdcd-6412347c218f/scratchpad/desktop-qa-screens/mcp-dotfile';

const SERVER_NAME = `wdio-everything-${Date.now()}`;
const DOTFILE_MCP_JSON = path.join(os.homedir(), '.agiworkforce', 'mcp.json');

fs.mkdirSync(SCREEN_DIR, { recursive: true });

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
  parameters?: string[];
}

type InvokeOutcome<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Calls a real Tauri command via the app's own IPC bridge
 * (`window.__TAURI_INTERNALS__.invoke`, the same primitive
 * `@tauri-apps/api/core`'s `invoke()` uses) and polls for the async result.
 * Avoids relying on `executeAsync` (protocol support varies across
 * WebDriver backends); only needs synchronous `execute`, which this harness
 * already relies on elsewhere in this repo.
 */
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

async function removeTestServerIfPresent() {
  try {
    const servers = await invokeTauri<McpServerInfo[]>('mcp_list_servers');
    const isConnected = servers.some((s) => s.name === SERVER_NAME);
    console.log('CLEANUP — test server still registered before cleanup:', isConnected);
  } catch (err) {
    console.log('CLEANUP — mcp_list_servers check failed (non-fatal):', err);
  }

  // Best-effort: remove from the dotfile UI if the Remove button is present.
  try {
    const removed = await browser.execute((name: string) => {
      const button = document.querySelector<HTMLButtonElement>(
        `button[aria-label="Remove MCP server ${name}"]`,
      );
      if (button) {
        button.click();
        return true;
      }
      return false;
    }, SERVER_NAME);
    console.log('CLEANUP — clicked Remove in DotfileSettings UI:', removed);
    if (removed) {
      await browser.pause(1500);
    }
  } catch (err) {
    console.log('CLEANUP — UI removal attempt failed (non-fatal):', err);
  }

  // Absolute fallback: scrub the dotfile directly on disk so a failed test
  // never leaves permanent cruft in the developer's real
  // ~/.agiworkforce/mcp.json.
  try {
    if (fs.existsSync(DOTFILE_MCP_JSON)) {
      const raw = JSON.parse(fs.readFileSync(DOTFILE_MCP_JSON, 'utf-8')) as {
        mcpServers?: Record<string, unknown>;
      };
      if (raw.mcpServers && SERVER_NAME in raw.mcpServers) {
        delete raw.mcpServers[SERVER_NAME];
        fs.writeFileSync(DOTFILE_MCP_JSON, JSON.stringify(raw, null, 2));
        console.log('CLEANUP — scrubbed test server directly from ~/.agiworkforce/mcp.json');
      }
    }
  } catch (err) {
    console.log('CLEANUP — direct dotfile scrub failed:', err);
  }
}

describe('MCP dotfile config actually connects (DESKTOP-MCP-DOTFILE-CONFIG-FAKE-SUCCESS-01)', () => {
  after(async () => {
    await removeTestServerIfPresent();
  });

  it('adding a server via Settings -> Developer connects it live and exposes real tools', async function () {
    this.timeout(120000);

    await browser.pause(1500);

    const gear = await $('button[aria-label="Settings"]');
    await gear.waitForDisplayed({ timeout: 15000 });
    await gear.click();

    const nav = await $('nav[aria-label="Settings sections"]');
    await nav.waitForDisplayed({ timeout: 10000 });

    const clickedDeveloper = await clickButtonWithText(
      'nav[aria-label="Settings sections"]',
      'Developer',
    );
    console.log('Clicked Developer nav item:', clickedDeveloper);
    expect(clickedDeveloper).toBe(true);
    await browser.pause(800);

    await browser.saveScreenshot(`${SCREEN_DIR}/00-developer-tab.png`);

    // Open the "Add" form inside the MCP Servers section.
    const clickedAdd = await clickButtonWithText('body', 'Add');
    console.log('Clicked Add (MCP Servers section):', clickedAdd);
    expect(clickedAdd).toBe(true);
    await browser.pause(300);

    const nameInput = await $('input[placeholder="Server name"]');
    await nameInput.waitForDisplayed({ timeout: 5000 });
    await nameInput.setValue(SERVER_NAME);

    const commandInput = await $('input[placeholder="Command (e.g. npx)"]');
    await commandInput.setValue('npx');

    const argsInput = await $('input[placeholder="Args (space-separated)"]');
    await argsInput.setValue('-y @modelcontextprotocol/server-everything');

    await browser.saveScreenshot(`${SCREEN_DIR}/01-add-form-filled.png`);

    const clickedAddServer = await clickButtonWithText('body', 'Add Server');
    console.log('Clicked "Add Server" submit:', clickedAddServer);
    expect(clickedAddServer).toBe(true);

    // Real toast confirmation (sonner) — the pre-fix "fake success" symptom.
    const toast = await $(`*=Added MCP server: ${SERVER_NAME}`);
    const toastAppeared = await toast
      .waitForDisplayed({ timeout: 10000 })
      .then(() => true)
      .catch(() => false);
    console.log('Success toast appeared:', toastAppeared);
    await browser.saveScreenshot(`${SCREEN_DIR}/02-after-add-toast.png`);

    // The write-to-disk half already worked before this fix. Confirm it here
    // as a baseline, then prove the previously-broken half: the LIVE MCP
    // client actually connecting this server and discovering its tools.
    const dotfileContent = JSON.parse(fs.readFileSync(DOTFILE_MCP_JSON, 'utf-8')) as {
      mcpServers: Record<string, unknown>;
    };
    console.log(
      '~/.agiworkforce/mcp.json contains test server:',
      SERVER_NAME in dotfileContent.mcpServers,
    );
    expect(SERVER_NAME in dotfileContent.mcpServers).toBe(true);

    // Give the spawned `npx -y @modelcontextprotocol/server-everything`
    // process time to install/start and complete the MCP handshake.
    let servers: McpServerInfo[] = [];
    let connected = false;
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      servers = await invokeTauri<McpServerInfo[]>('mcp_list_servers');
      const entry = servers.find((s) => s.name === SERVER_NAME);
      if (entry?.connected) {
        connected = true;
        break;
      }
      await browser.pause(2000);
    }
    console.log(
      'mcp_list_servers entry for test server:',
      JSON.stringify(servers.find((s) => s.name === SERVER_NAME)),
    );
    expect(connected).toBe(true);

    const tools = await invokeTauri<McpToolInfo[]>('mcp_list_tools');
    const ourTools = tools.filter((t) => t.server === SERVER_NAME);
    console.log('Real tools discovered for test server:', ourTools.map((t) => t.name).join(', '));
    expect(ourTools.length).toBeGreaterThan(0);
    expect(ourTools.some((t) => t.name === 'echo')).toBe(true);

    // Best-effort: also try a real tool call end-to-end through the same
    // registry the chat tool-loop uses. Pre-seed an "always-allow"
    // permission for this (server, tool) pair first — the same
    // persisted-permission mechanism ConnectorDetailView's dropdown writes
    // to — so the call doesn't block on the interactive per-tool approval
    // dialog. This is NOT asserted as a hard pass/fail: a separate, deliberate
    // "Agent mode: Safe" guardrail (see mcp_call_tool's
    // request_tool_confirmation vs. mcp_connect_server's
    // request_tool_confirmation_no_mode_gate) blocks direct/non-conversational
    // tool invocation outside a real chat agent loop, which is exactly what
    // driving `mcp_call_tool` straight over the raw IPC bridge from a test
    // does — an orthogonal, working-as-designed safety gate, not a defect in
    // this fix. The load-bearing assertion for
    // DESKTOP-MCP-DOTFILE-CONFIG-FAKE-SUCCESS-01 is the tool-discovery check
    // above (real, connected, tools discoverable via the live registry).
    const echoTool = ourTools.find((t) => t.name === 'echo');
    expect(echoTool).toBeDefined();
    try {
      await invokeTauri('connector_permission_set', {
        connectorId: SERVER_NAME,
        toolName: 'echo',
        level: 'always-allow',
        destructive: false,
      });
      const callResult = await invokeTauri<unknown>('mcp_call_tool', {
        toolId: echoTool!.id,
        arguments: { message: 'DESKTOP-MCP-DOTFILE-CONFIG-FAKE-SUCCESS-01 verified' },
      });
      console.log('Real tool call result:', JSON.stringify(callResult).slice(0, 400));
    } catch (err) {
      console.log(
        'Real tool call did not complete (non-fatal; likely blocked by the separate ' +
          'Agent-mode "Safe mode" guardrail for direct/non-conversational tool invocation, ' +
          'not a regression in this fix):',
        err,
      );
    }

    await browser.saveScreenshot(`${SCREEN_DIR}/03-server-connected.png`);

    // Now remove it and confirm the live client actually disconnects it too
    // (not just the file write).
    const removedViaUi = await browser.execute((name: string) => {
      const button = document.querySelector<HTMLButtonElement>(
        `button[aria-label="Remove MCP server ${name}"]`,
      );
      if (button) {
        button.click();
        return true;
      }
      return false;
    }, SERVER_NAME);
    console.log('Clicked Remove for test server:', removedViaUi);
    expect(removedViaUi).toBe(true);

    // dotfile_remove_mcp_server's reload_active_config disconnects and
    // reconnects every configured server (same as mcp_update_config), so
    // give it time to cycle through the developer machine's other real
    // servers (filesystem, git, etc.) rather than a fixed short pause.
    let serversAfterRemoval: McpServerInfo[] = [];
    let stillPresent = true;
    const removalDeadline = Date.now() + 30000;
    while (Date.now() < removalDeadline) {
      serversAfterRemoval = await invokeTauri<McpServerInfo[]>('mcp_list_servers');
      stillPresent = serversAfterRemoval.some((s) => s.name === SERVER_NAME);
      if (!stillPresent) break;
      await browser.pause(1000);
    }
    console.log('Test server still present after removal:', stillPresent);
    expect(stillPresent).toBe(false);

    const dotfileAfterRemoval = JSON.parse(fs.readFileSync(DOTFILE_MCP_JSON, 'utf-8')) as {
      mcpServers: Record<string, unknown>;
    };
    console.log(
      '~/.agiworkforce/mcp.json still contains test server after removal:',
      SERVER_NAME in dotfileAfterRemoval.mcpServers,
    );
    expect(SERVER_NAME in dotfileAfterRemoval.mcpServers).toBe(false);

    await browser.saveScreenshot(`${SCREEN_DIR}/04-after-removal.png`);
  });
});
