import { describe, expect, it } from 'vitest';
import {
  createActiveWebMCPPageIdentity,
  isWebMCPUpdateHintForActivePage,
  selectWebMCPToolsForActivePage,
} from '../src/features/side-panel/webmcp-tools';

const activePage = createActiveWebMCPPageIdentity(41, 'https://current.example/tools?secret=1', 7);
const validUpdate = {
  type: 'WEBMCP_TOOLS_CHANGED',
  tabId: 41,
  pageGeneration: 7,
  url: 'https://current.example/tools',
  tools: [
    {
      name: 'search_users',
      description: 'Search users',
      source: 'declarative',
    },
  ],
};

describe('side-panel WebMCP source attribution', () => {
  it('accepts normalized tools for the exact active tab and path', () => {
    expect(selectWebMCPToolsForActivePage(validUpdate, activePage)).toEqual([
      { name: 'search_users', description: 'Search users' },
    ]);
  });

  it('rejects a background tab or another window even when the URL is identical', () => {
    expect(selectWebMCPToolsForActivePage({ ...validUpdate, tabId: 99 }, activePage)).toBeNull();
  });

  it('rejects stale metadata after the active tab navigates', () => {
    const navigated = createActiveWebMCPPageIdentity(41, 'https://current.example/account', 8);
    expect(selectWebMCPToolsForActivePage(validUpdate, navigated)).toBeNull();
  });

  it('rejects a delayed discovery across query/hash navigation with the same redacted URL', () => {
    const navigated = createActiveWebMCPPageIdentity(
      41,
      'https://current.example/tools?account=other#details',
      8,
    );

    expect(navigated?.url).toBe(activePage?.url);
    expect(selectWebMCPToolsForActivePage(validUpdate, navigated)).toBeNull();
  });

  it('uses broadcasts only as exact-tab/url refresh hints', () => {
    const hint = { ...validUpdate, pageGeneration: undefined };
    expect(isWebMCPUpdateHintForActivePage(hint, activePage)).toBe(true);
    expect(isWebMCPUpdateHintForActivePage({ ...hint, tabId: 99 }, activePage)).toBe(false);
  });
});
