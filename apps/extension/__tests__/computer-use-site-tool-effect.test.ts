/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const tabs = vi.hoisted(() => ({ url: 'https://example.com/checkout' }));

vi.stubGlobal('chrome', {
  tabs: { get: async () => ({ url: tabs.url }) },
  storage: { local: { get: async () => ({}), set: async () => undefined } },
  runtime: { id: 'test-extension', getURL: (path: string) => `chrome-extension://test${path}` },
});

import { resolveApprovalRequirement } from '../src/features/computer-use/agentLoop';
import type { SiteToolDescriptor } from '../src/features/tools/siteToolRegistry';

const READ_TOOL: SiteToolDescriptor = { name: 'search', effect: 'read', source: 'declarative' };
const WRITE_TOOL: SiteToolDescriptor = {
  name: 'placeOrder',
  effect: 'write',
  source: 'imperative',
};

beforeEach(() => {
  tabs.url = 'https://example.com/checkout';
});

describe('a page-declared tool is gated like an action', () => {
  it('does not ask on an ordinary page, so the run autonomy governs it', async () => {
    const requirement = await resolveApprovalRequirement(
      1,
      'placeOrder',
      {},
      { siteTools: [WRITE_TOOL] },
    );

    expect(requirement.alwaysAsk).toBe(false);
  });

  it('always asks on a site the approval policy flags, read or write', async () => {
    tabs.url = 'https://chase.com/transfer';

    const write = await resolveApprovalRequirement(
      1,
      'placeOrder',
      {},
      { siteTools: [WRITE_TOOL] },
    );
    const read = await resolveApprovalRequirement(1, 'search', {}, { siteTools: [READ_TOOL] });

    expect(write.alwaysAsk).toBe(true);
    expect(read.alwaysAsk).toBe(true);
  });

  it('leaves a tool the page did not declare on the ordinary policy path', async () => {
    const requirement = await resolveApprovalRequirement(
      1,
      'download_file',
      {},
      { siteTools: [READ_TOOL] },
    );

    expect(requirement).toEqual({ alwaysAsk: true, reason: 'download' });
  });
});
