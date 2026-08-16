import { enterLocalDesktopShell, waitForDesktopShell } from '../support/desktop-shell';
import { closeAnySettingsDialog, waitForSettingsReady } from '../support/close-settings';
import { resolveScreenDir } from '../support/dom';

const SCREEN_DIR = resolveScreenDir('local-capability-mcp-approval');

interface McpConfigSnapshot {
  mcpServers: Record<string, unknown>;
}

async function invokeNative<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return browser.execute(
    async (nativeCommand, nativeArgs) => {
      const tauri = (
        window as unknown as {
          __TAURI_INTERNALS__?: {
            invoke: (name: string, payload?: Record<string, unknown>) => Promise<unknown>;
          };
        }
      ).__TAURI_INTERNALS__;
      if (!tauri) throw new Error('Tauri invoke bridge is unavailable');
      return tauri.invoke(nativeCommand, nativeArgs);
    },
    command,
    args,
  ) as Promise<T>;
}

function bodyShowsCurrentCapabilityReason(bodyText: string): boolean {
  return (
    bodyText.includes('not verified for Tasks') ||
    bodyText.includes('not verified for agentic planning')
  );
}

describe('AGI Desktop Local capability honesty and MCP approval', () => {
  it('withholds unsupported AGI Work and keeps a custom MCP server disconnected until approval', async function () {
    this.timeout(180_000);

    const expectedModel = process.env['AGI_WDIO_OLLAMA_MODEL_ID'];
    if (!expectedModel) {
      throw new Error('AGI_WDIO_OLLAMA_MODEL_ID must name a real installed Ollama model');
    }

    await waitForDesktopShell();
    await enterLocalDesktopShell();

    const originalMcpConfig = await invokeNative<McpConfigSnapshot>('mcp_get_config');
    const fixtureToken = Date.now().toString();
    const fixtureDisplayName = `MCP approval fixture ${fixtureToken}`;
    const fixtureServerName = `custom-mcp-approval-fixture-${fixtureToken}`;
    const fixtureConnectorLabel = `MCP Approval Fixture ${fixtureToken}`;
    const fixtureTarget = 'http://127.0.0.1:9/sse';

    const clickElement = async (element: WebdriverIO.Element) => {
      await element.waitForExist({ timeout: 15_000 });
      await element.scrollIntoView({ block: 'center' });
      await element.waitForDisplayed({ timeout: 15_000 });
      await element.click();
    };

    const clickSettingsSection = async (label: string) => {
      const section = await $(
        `//nav[@aria-label="Settings sections"]//button[starts-with(normalize-space(.), ${JSON.stringify(label)})]`,
      );
      await clickElement(section);
    };

    try {
      const expandSidebar = await $('button[aria-label="Expand sidebar"]');
      if ((await expandSidebar.isExisting()) && (await expandSidebar.isDisplayed())) {
        await clickElement(expandSidebar);
      }

      const localTab = await $('button=Local');
      if ((await localTab.isExisting()) && (await localTab.isDisplayed())) {
        await clickElement(localTab);
      }

      await clickElement(await $('button=New chat'));
      await clickElement(await $('button[aria-label="Select model"]'));
      const modelOption = await $(`button*=${expectedModel}`);
      await modelOption.waitForExist({ timeout: 45_000 });
      await clickElement(modelOption);
      await browser.waitUntil(
        async () =>
          (await $('button[aria-label="Select model"]').getText()).includes(expectedModel),
        {
          timeout: 10_000,
          interval: 100,
          timeoutMsg: `Desktop did not retain the explicit Local model selection: ${expectedModel}`,
        },
      );

      expect(await $('button=AGI Work').isExisting()).toBe(false);
      expect(bodyShowsCurrentCapabilityReason(await $('body').getText())).toBe(false);
      await clickElement(await $('button=Project'));
      await browser.waitUntil(
        async () => {
          const bodyText = await $('body').getText();
          return (
            bodyShowsCurrentCapabilityReason(bodyText) &&
            bodyText.includes('Project chat still works')
          );
        },
        {
          timeout: 10_000,
          interval: 100,
          timeoutMsg: 'The project menu did not explain why AGI Work is unavailable for this model',
        },
      );
      await browser.saveScreenshot(`${SCREEN_DIR}/01-local-agentic-capability-honest.png`);
      await browser.keys('Escape');

      await clickElement(await $('button[aria-label="Settings"]'));
      await waitForSettingsReady();
      await clickSettingsSection('Connectors');
      await browser.waitUntil(async () => await $('button=Add custom').isDisplayed(), {
        timeout: 15_000,
        interval: 100,
        timeoutMsg: 'Connectors settings did not render the custom connector action',
      });

      await clickElement(await $('button=Add custom'));
      const name = await $('input#custom-mcp-name');
      const url = await $('input#custom-mcp-url');
      await name.setValue(fixtureDisplayName);
      await url.setValue(fixtureTarget);
      await clickElement(await $('button=Save connector'));

      await browser.waitUntil(async () => (await $('body').getText()).includes('Connector saved'), {
        timeout: 10_000,
        interval: 100,
        timeoutMsg: 'Custom connector save did not expose its disconnected terminal state',
      });
      await browser.saveScreenshot(`${SCREEN_DIR}/02-mcp-saved-disconnected.png`);
      await clickElement(await $('button=Review connector'));

      await browser.waitUntil(
        async () =>
          (await $('body').getText()).includes('Saved · Disconnected') &&
          (await $('body').getText()).includes(fixtureTarget),
        {
          timeout: 10_000,
          interval: 100,
          timeoutMsg: 'Saved custom MCP server was not visible with its exact target',
        },
      );

      await clickElement(await $(`button[aria-label="Connect ${fixtureConnectorLabel}"]`));
      const approval = await $('[data-testid="mcp-tool-confirmation-prompt"]');
      await approval.waitForDisplayed({ timeout: 15_000 });
      const approvalText = await approval.getText();
      expect(approvalText).toContain(fixtureServerName);
      expect(approvalText).toContain(fixtureTarget);
      expect(
        await browser.execute(() => {
          const prompt = document.querySelector<HTMLElement>(
            '[data-testid="mcp-tool-confirmation-prompt"]',
          );
          if (!prompt) return false;
          const rect = prompt.getBoundingClientRect();
          const topmost = document.elementFromPoint(rect.left + rect.width / 2, rect.top + 48);
          return Boolean(topmost?.closest('[data-testid="mcp-tool-confirmation-prompt"]'));
        }),
      ).toBe(true);
      expect(
        await browser.execute(() =>
          Boolean(document.activeElement?.closest('[data-testid="mcp-tool-confirmation-prompt"]')),
        ),
      ).toBe(true);
      await browser.saveScreenshot(`${SCREEN_DIR}/03-mcp-explicit-approval.png`);

      await clickElement(await approval.$('button[aria-label="Deny"]'));
      await browser.waitUntil(
        async () =>
          (await $('body').getText()).includes('Saved · Disconnected') &&
          (await $('body').getText()).includes(
            'Connection cancelled. The server remains saved and disconnected.',
          ),
        {
          timeout: 15_000,
          interval: 100,
          timeoutMsg: 'Denied MCP connection did not remain visibly disconnected',
        },
      );
      expect(await $('[data-testid="mcp-tool-confirmation-prompt"]').isExisting()).toBe(false);
      expect((await $('body').getText()).includes('mcp_connect_server')).toBe(false);
      await browser.saveScreenshot(`${SCREEN_DIR}/04-mcp-denied-disconnected.png`);

      const removeButton = await $(`button[aria-label="Remove ${fixtureConnectorLabel}"]`);
      await clickElement(removeButton);
      await browser.waitUntil(async () => !(await removeButton.isExisting()), {
        timeout: 10_000,
        interval: 100,
        timeoutMsg: 'Custom MCP fixture was not removed after the manual journey',
      });
    } finally {
      const pendingApproval = await $('[data-testid="mcp-tool-confirmation-prompt"]');
      if ((await pendingApproval.isExisting()) && (await pendingApproval.isDisplayed())) {
        const deny = await pendingApproval.$('button[aria-label="Deny"]');
        if (await deny.isDisplayed()) await deny.click();
        await browser.waitUntil(async () => !(await pendingApproval.isExisting()), {
          timeout: 10_000,
          interval: 100,
          timeoutMsg: 'Pending MCP approval did not close during fixture cleanup',
        });
      }
      await invokeNative<void>('mcp_update_config', { newConfig: originalMcpConfig });
      expect(await closeAnySettingsDialog()).toBe(true);
    }
  });
});
