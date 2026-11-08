/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const tabs = vi.hoisted(() => ({ url: 'https://example.com/checkout' }));

vi.stubGlobal('chrome', {
  tabs: { get: async () => ({ url: tabs.url }) },
  storage: { local: { get: async () => ({}), set: async () => undefined } },
  runtime: { id: 'test-extension', getURL: (path: string) => `chrome-extension://test${path}` },
});

import { resolveApprovalRequirement } from '../src/features/computer-use/agentLoop';
import { getBrowserToolDefinitions } from '../src/features/computer-use/browserToolDefinitions';
import { BrowserAgentSiteTools } from '../src/features/tools/browserAgentSiteTools';

beforeEach(() => {
  tabs.url = 'https://example.com/checkout';
});

describe('browser site tools use the canonical approval path', () => {
  it.each(['read', 'write'] as const)(
    'passes the site-tool requirement for a declared %s tool',
    async (effect) => {
      const browserSiteTools = new BrowserAgentSiteTools({
        signal: new AbortController().signal,
        currentTabId: () => 1,
        navigationGeneration: () => 1,
        assertCurrent: async () => undefined,
        send: async () => ({ success: false }),
      });
      const prepare = vi.spyOn(browserSiteTools, 'prepare').mockResolvedValue({
        tabId: 1,
        navigationGeneration: 1,
        binding: {
          pageInstanceId: '00000000-0000-0000-0000-000000000001',
          url: tabs.url,
          descriptor: {
            name: 'page_action',
            description: 'Page action',
            effect,
            source: 'imperative',
          },
        },
        arguments: {},
      });
      const args = { name: 'page_action', arguments: {} };
      const requirement = await resolveApprovalRequirement(1, 'call_site_tool', args, {
        browserSiteTools,
      });

      expect(prepare).toHaveBeenCalledWith(args);
      expect(requirement).toEqual({ alwaysAsk: true, reason: 'site_tool' });
    },
  );

  it('rejects canonical execution when the task has no bound site-tool service', async () => {
    await expect(
      resolveApprovalRequirement(1, 'call_site_tool', { name: 'page_action', arguments: {} }),
    ).rejects.toThrow('Site tools are unavailable for this task.');
  });

  it('rejects legacy aliases even if a caller supplies page-declared read metadata', async () => {
    const legacyOptions = {
      maxSteps: 1,
      siteTools: [{ name: 'site_search', effect: 'read', source: 'imperative' }],
      callSiteTool: vi.fn(),
    };
    await expect(resolveApprovalRequirement(1, 'site_search', {}, legacyOptions)).rejects.toThrow(
      'Unsupported browser action',
    );
    expect(legacyOptions.callSiteTool).not.toHaveBeenCalled();
  });

  it('keeps native download approval independent of page declarations', async () => {
    expect(await resolveApprovalRequirement(1, 'download_file', {})).toEqual({
      alwaysAsk: true,
      reason: 'download',
    });
  });

  it('advertises canonical discovery and execution only when the service is available', () => {
    const names = (available: boolean) =>
      getBrowserToolDefinitions(false, available).map((tool) => tool.function.name);
    expect(names(true)).toContain('discover_site_tools');
    expect(names(true)).toContain('call_site_tool');
    expect(names(false)).not.toContain('discover_site_tools');
    expect(names(false)).not.toContain('call_site_tool');
  });

  it('does not restore automatic alias discovery or unbound browser-agent execution', () => {
    const background = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../src/background.ts'),
      'utf8',
    );
    const loop = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../src/features/computer-use/agentLoop.ts'),
      'utf8',
    );
    expect(background).toContain('browserSiteTools: new BrowserAgentSiteTools(');
    expect(background).not.toContain('discoverRunSiteTools');
    expect(background).not.toContain('callRunSiteTool');
    expect(loop).not.toContain('siteToolDefinitions');
    expect(loop).not.toContain('options.callSiteTool');
    expect(loop).not.toContain('options.siteTools');
  });
});
