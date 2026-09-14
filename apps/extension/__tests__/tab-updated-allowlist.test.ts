import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const backgroundSource = readFileSync(resolve(process.cwd(), 'src/background.ts'), 'utf8');

describe('tabs.onUpdated context boundary', () => {
  it('does not transfer page context on navigation, including allowlisted pages', () => {
    expect(backgroundSource).not.toContain('syncTabContextWithDesktop');
    expect(backgroundSource).not.toMatch(/tabs\.onUpdated[\s\S]*?type:\s*['"]page_context['"]/);
  });

  it('fails closed for legacy implicit context-sync messages', () => {
    const handler = backgroundSource.slice(
      backgroundSource.indexOf("case 'SYNC_PAGE_CONTEXT'"),
      backgroundSource.indexOf("case 'APPROVE_CONTEXT_HANDOFF'"),
    );
    expect(handler).toContain('Implicit page-context transfer is disabled');
    expect(handler).not.toContain('sendNativeRequest');
  });
});

describe('tab events cost nothing when nothing is being watched', () => {
  it('answers onUpdated from one map-size check before touching the lease', () => {
    const handler = backgroundSource.slice(
      backgroundSource.indexOf('chrome.tabs.onUpdated.addListener('),
      backgroundSource.indexOf('chrome.tabs.onActivated.addListener('),
    );
    expect(handler).toMatch(
      /addListener\(\(tabId, changeInfo\) => \{\s*if \(!hasWatchedTabWork\(\)\) return;/,
    );
  });

  it('treats an in-flight discovery as a watch so the generation bump survives', () => {
    expect(backgroundSource).toMatch(
      /function hasWatchedTabWork\(\)[\s\S]*?computerUseRuns\.getActive\(\) !== null[\s\S]*?webmcpToolsByTab\.size > 0[\s\S]*?webmcpNavigationGenerationByTab\.size > 0/,
    );
    expect(backgroundSource).toContain(
      'const navigationGeneration = watchWebMCPNavigation(resolvedTabId);',
    );
  });

  it('leaves onActivated with no work to do when no run is active', () => {
    const handler = backgroundSource.slice(
      backgroundSource.indexOf('chrome.tabs.onActivated.addListener('),
      backgroundSource.indexOf('chrome.commands.onCommand.addListener('),
    );
    expect(handler).toContain('if (!lease) return;');
  });
});
