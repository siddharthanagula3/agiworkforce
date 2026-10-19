import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { actionNeedsApproval } from '../src/features/computer-use/askBeforeActing';
import { originApprovedForBrowserControl } from '../src/features/computer-use/browserControlConsent';

const fullAccess = {
  alwaysAsk: false,
  crucial: false,
  mode: 'full' as const,
  allowedForTask: false,
  readsOnly: false,
};

describe('Full access acts without asking on approved sites only', () => {
  it('skips the question on an approved site', async () => {
    await expect(
      actionNeedsApproval({ ...fullAccess, siteApproved: async () => true }),
    ).resolves.toBe(false);
  });

  it('still asks on a site that is not approved, including one reached by a one-time grant', async () => {
    await expect(
      actionNeedsApproval({ ...fullAccess, siteApproved: async () => false }),
    ).resolves.toBe(true);
    await expect(
      actionNeedsApproval({
        ...fullAccess,
        siteApproved: () =>
          originApprovedForBrowserControl(
            'https://once.example',
            async () => [],
            async () => true,
          ),
      }),
    ).resolves.toBe(true);
  });

  it('asks when the site cannot be checked', async () => {
    await expect(
      actionNeedsApproval({
        ...fullAccess,
        siteApproved: async () => {
          throw new Error('tab closed');
        },
      }),
    ).resolves.toBe(true);
  });

  it('keeps Ask first, Allow for this task, read-only tools and always-ask actions as before', async () => {
    const approved = vi.fn(async () => true);
    await expect(
      actionNeedsApproval({ ...fullAccess, mode: 'ask', siteApproved: approved }),
    ).resolves.toBe(true);
    await expect(
      actionNeedsApproval({
        ...fullAccess,
        mode: 'ask',
        allowedForTask: true,
        siteApproved: approved,
      }),
    ).resolves.toBe(false);
    await expect(
      actionNeedsApproval({
        ...fullAccess,
        mode: 'ask',
        readsOnly: true,
        siteApproved: approved,
      }),
    ).resolves.toBe(false);
    await expect(
      actionNeedsApproval({
        ...fullAccess,
        alwaysAsk: true,
        allowedForTask: true,
        siteApproved: approved,
      }),
    ).resolves.toBe(true);
    expect(approved).not.toHaveBeenCalled();
  });

  it('counts a site as approved only when it is on the allowlist with browser-control consent', async () => {
    await expect(
      originApprovedForBrowserControl(
        'https://kept.example',
        async () => ['https://kept.example'],
        async () => true,
      ),
    ).resolves.toBe(true);
    await expect(
      originApprovedForBrowserControl(
        'https://kept.example',
        async () => ['https://kept.example'],
        async () => false,
      ),
    ).resolves.toBe(false);
  });

  it('is the gate the background uses for every browser action', () => {
    const background = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../src/background.ts'),
      'utf8',
    );
    expect(background).toMatch(/actionNeedsApproval\(\{[\s\S]{0,400}siteApproved/);
    expect(background).not.toMatch(
      /if \(!askBeforeActing \|\| allowedForTask\.has\(toolName\)\) return true/,
    );
  });
});
