import { describe, expect, it, vi } from 'vitest';
import { billingPlanCapabilityUpgradeMessage } from '@agiworkforce/types';
import type {
  DirectoryAdapter,
  DirectoryConnectorDetail,
  DirectoryEntry,
  DirectorySection,
} from '@agiworkforce/ui';

import {
  CONNECTORS_PLAN_LOCK,
  planLockConnectorDetail,
  planLockConnectorDirectory,
  planLockConnectorSection,
} from '../services/connectors-directory';

const PLAN_MESSAGE = billingPlanCapabilityUpgradeMessage('connectors');

function entry(patch: Partial<DirectoryEntry> = {}): DirectoryEntry {
  return {
    id: 'notion',
    name: 'Notion',
    description: 'Pages and databases',
    installed: false,
    installable: true,
    connectableMode: 'connect',
    ...patch,
  };
}

function detail(patch: Partial<DirectoryConnectorDetail> = {}): DirectoryConnectorDetail {
  return {
    kind: 'connector',
    id: 'notion',
    name: 'Notion',
    summary: 'Pages and databases',
    connected: false,
    connectable: true,
    connectableMode: 'connect',
    ...patch,
  };
}

function section(entries: readonly DirectoryEntry[]): DirectorySection {
  return { entries, installable: true };
}

describe('connectors locked to a plan that does not include them', () => {
  it('keeps connected entries as they are and leaves the rest without an action or setup copy', () => {
    const connected = entry({ id: 'sentry', name: 'Sentry', installed: true });
    const locked = planLockConnectorSection(
      section([
        connected,
        entry({ statusLabel: 'Needs setup', installNotice: 'Opens Notion.', setupPending: true }),
      ]),
    );

    expect(locked.locked).toEqual(CONNECTORS_PLAN_LOCK);
    expect(locked.locked?.label).toBe(PLAN_MESSAGE);
    expect(locked.installable).toBe(false);
    expect(locked.entries[0]).toBe(connected);
    expect(locked.entries[1]).toMatchObject({ installable: false });
    expect(locked.entries[1]).not.toHaveProperty('statusLabel');
    expect(locked.entries[1]).not.toHaveProperty('installNotice');
    expect(locked.entries[1]).not.toHaveProperty('setupPending');
  });

  it('keeps a connected detail disconnectable without offering a reconnect it cannot finish', () => {
    const locked = planLockConnectorDetail(
      detail({ connected: true, needsReauthorization: true }),
    ) as DirectoryConnectorDetail;

    expect(locked.connected).toBe(true);
    expect(locked).not.toHaveProperty('needsReauthorization');
    expect(locked).not.toHaveProperty('listingNote');
  });

  it('names the plan on a detail that is not connected instead of a connect or setup action', () => {
    const locked = planLockConnectorDetail(
      detail({
        connectableMode: 'needs-setup',
        setupNotice: 'Notion needs credentials this deployment has not set.',
        authorizationPending: true,
        desktopHref: '/download',
        related: [entry({ id: 'linear', name: 'Linear', statusLabel: 'Needs setup' })],
      }),
    ) as DirectoryConnectorDetail;

    expect(locked.listingNote).toBe(PLAN_MESSAGE);
    expect(locked).not.toHaveProperty('setupNotice');
    expect(locked).not.toHaveProperty('authorizationPending');
    expect(locked).not.toHaveProperty('desktopHref');
    expect(locked.related?.[0]).toMatchObject({ installable: false });
    expect(locked.related?.[0]).not.toHaveProperty('statusLabel');
  });

  it('refuses to connect, to take credentials or to add a connector, and leaves other sections alone', async () => {
    const install = vi.fn(async () => undefined);
    const requestCredentials = vi.fn();
    const createEntry = vi.fn();
    const skill = {
      kind: 'skill' as const,
      id: 'review',
      name: 'Review',
      description: '',
      files: [],
    };
    const loadDetail = vi.fn(async (sectionKey: string) =>
      sectionKey === 'connectors' ? detail() : skill,
    );
    const adapter: DirectoryAdapter = {
      sections: ['skills', 'connectors'],
      connectors: section([entry()]),
      skills: section([entry({ id: 'review', name: 'Review' })]),
      install,
      requestCredentials,
      createEntry,
      loadDetail,
    };

    const locked = planLockConnectorDirectory(adapter);

    await expect(locked.install?.('connectors', 'notion')).resolves.toBe(PLAN_MESSAGE);
    locked.requestCredentials?.('connectors', 'notion');
    locked.createEntry?.('connectors');
    expect(install).not.toHaveBeenCalled();
    expect(requestCredentials).not.toHaveBeenCalled();
    expect(createEntry).not.toHaveBeenCalled();

    await locked.install?.('skills', 'review');
    locked.createEntry?.('skills');
    expect(install).toHaveBeenCalledWith('skills', 'review');
    expect(createEntry).toHaveBeenCalledWith('skills');
    expect(locked.skills).toBe(adapter.skills);
    await expect(locked.loadDetail?.('skills', 'review')).resolves.toBe(skill);
    await expect(locked.loadDetail?.('connectors', 'notion')).resolves.toMatchObject({
      listingNote: PLAN_MESSAGE,
    });
  });

  it('keeps one detail loader per source loader so a detail is not reloaded on every render', () => {
    const loadDetail = vi.fn(async () => null);
    const adapter: DirectoryAdapter = { sections: ['connectors'], loadDetail };

    expect(planLockConnectorDirectory(adapter).loadDetail).toBe(
      planLockConnectorDirectory({ ...adapter }).loadDetail,
    );
  });
});
