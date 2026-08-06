// Live-interaction, real-native-WebDriver verification for
// DESKTOP-CONNECTOR-MAPPING-DRIFT-FAKE-CONNECTED-01 (see
// docs/agent-context/known-flaws.md).
//
// Before the fix: the frontend catalog (connectorDefinitions.ts) advertised
// connectors (atlassian, google_sheets, context7, canva, hubspot) in the
// live Settings -> Connectors "Available to connect" grid that had no entry
// in the backend's `get_connector_mcp_mapping` (mcp_oauth.rs). Clicking
// Connect on those either silently no-opped while still emitting
// `connector:connected` (atlassian, google_sheets, context7 — a permanent or
// transient fake "Connected" badge with zero backing MCP server) or failed
// immediately with "Unknown provider" (canva, hubspot). Separately, Linear's
// catalog entry declared `authType: 'oauth'` even though its real backend
// mapping is API-key-credentialed, routing every Connect click to a broken
// OAuth flow and making a fully-working integration unreachable.
//
// This spec drives the real Settings -> Connectors panel and asserts, via
// the app's own live Tauri IPC bridge, that:
//  1. `mcp_get_supported_connector_ids` (the new single source of truth)
//     returns exactly the backend-mapped ids and excludes the drifted ones.
//  2. The live "Available to connect" grid no longer renders Context7,
//     Canva, or HubSpot cards.
//  3. Linear's card now advertises "API key" (not OAuth) and clicking
//     Connect opens the API-key dialog instead of erupting into an
//     "Unknown provider: linear" OAuth error.

import { waitForSettingsReady } from '../support/close-settings';
import { resolveScreenDir } from '../support/dom';

const SCREEN_DIR = resolveScreenDir('connector-mapping-drift');

type InvokeOutcome<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Calls a real Tauri command via the app's own IPC bridge
 * (`window.__TAURI_INTERNALS__.invoke`), same pattern as
 * mcp-dotfile-config.spec.ts.
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
    { timeout: 45000, timeoutMsg: `invoke('${cmd}') did not resolve in time`, interval: 300 },
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

function bodyContainsText(text: string) {
  return browser.execute(
    (needle: string) => document.body.textContent?.includes(needle) ?? false,
    text,
  ) as Promise<boolean>;
}

describe('Connector mapping drift no longer fake-badges unsupported connectors (DESKTOP-CONNECTOR-MAPPING-DRIFT-FAKE-CONNECTED-01)', () => {
  it('mcp_get_supported_connector_ids is the real backend mapping table, not the full catalog', async function () {
    this.timeout(60000);
    const ids = await invokeTauri<string[]>('mcp_get_supported_connector_ids');
    console.log('mcp_get_supported_connector_ids:', ids);

    for (const expected of [
      'github',
      'slack',
      'google_drive',
      'figma',
      'stripe',
      'vercel',
      'sentry',
      'linear',
      'notion',
      'cloudflare',
      'gmail',
      'google_calendar',
      'outlook',
      'jira',
    ]) {
      expect(ids).toContain(expected);
    }

    for (const drifted of ['atlassian', 'google_sheets', 'context7', 'canva', 'hubspot']) {
      expect(ids).not.toContain(drifted);
    }
  });

  it('mcp_list_connected_providers never reports a structurally-unsupported id as connected', async function () {
    this.timeout(60000);
    const connected = await invokeTauri<string[]>('mcp_list_connected_providers');
    console.log('mcp_list_connected_providers:', connected);

    for (const drifted of ['atlassian', 'google_sheets', 'context7', 'canva', 'hubspot']) {
      expect(connected).not.toContain(drifted);
    }
  });

  it('the live "Available to connect" grid hides Context7/Canva/HubSpot and fixes Linear', async function () {
    this.timeout(120000);

    await browser.pause(3000);

    const gear = await $('button[aria-label="Settings"]');
    await gear.waitForDisplayed({ timeout: 30000 });
    await gear.click();

    // Nav buttons are disabled while Settings loads; wait for interactivity
    // before clicking or the click is a silent no-op.
    await waitForSettingsReady();

    const clickedConnectors = await clickButtonWithText(
      'nav[aria-label="Settings sections"]',
      'Connectors',
    );
    console.log('Clicked Connectors nav item:', clickedConnectors);
    expect(clickedConnectors).toBe(true);
    await browser.pause(1500);

    // Let the async fetchSupportedConnectorIds() / fetchConnected() resolve.
    await browser.pause(2500);

    await browser.saveScreenshot(`${SCREEN_DIR}/00-connectors-panel.png`);

    const gridSection = await $('h4=Available to connect');
    await gridSection.waitForDisplayed({ timeout: 20000 });

    const hasContext7 = await bodyContainsText('Context7');
    const hasCanva = await bodyContainsText('Canva');
    const hasHubSpot = await bodyContainsText('HubSpot');
    const hasLinear = await bodyContainsText('Linear');
    console.log('Grid contains Context7:', hasContext7);
    console.log('Grid contains Canva:', hasCanva);
    console.log('Grid contains HubSpot:', hasHubSpot);
    console.log('Grid contains Linear:', hasLinear);

    expect(hasContext7).toBe(false);
    expect(hasCanva).toBe(false);
    expect(hasHubSpot).toBe(false);
    expect(hasLinear).toBe(true);

    // Find Linear's card via its "Connect Linear" button (unambiguous,
    // unlike text search which can match a large ancestor wrapping the
    // entire grid) and confirm it now advertises "API key", not "OAuth".
    const linearCardText = await browser.execute(() => {
      const button = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Connect Linear"]',
      );
      const card = button?.closest('.group');
      return card?.textContent ?? null;
    });
    console.log('Linear card text:', linearCardText);
    expect(linearCardText).toBeDefined();
    expect(linearCardText).toContain('API key');
    expect(linearCardText).not.toMatch(/\bOAuth\b/);

    await browser.saveScreenshot(`${SCREEN_DIR}/01-linear-card-api-key.png`);

    // Click Linear's Connect button and confirm the API-key dialog opens
    // instead of an "Unknown provider: linear" OAuth error.
    const clickedConnect = await browser.execute(() => {
      const button = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Connect Linear"]',
      );
      if (button) {
        button.click();
        return true;
      }
      return false;
    });
    console.log('Clicked "Connect Linear":', clickedConnect);
    expect(clickedConnect).toBe(true);
    await browser.pause(500);

    const apiKeyDialogVisible = await bodyContainsText('Enter your Linear API key to connect.');
    const unknownProviderError = await bodyContainsText('Unknown provider: linear');
    console.log('API key dialog visible:', apiKeyDialogVisible);
    console.log('Unknown provider error shown:', unknownProviderError);

    expect(apiKeyDialogVisible).toBe(true);
    expect(unknownProviderError).toBe(false);

    await browser.saveScreenshot(`${SCREEN_DIR}/02-linear-api-key-dialog.png`);

    // Close the dialog without submitting a real key.
    await clickButtonWithText('body', 'Cancel');
  });
});
