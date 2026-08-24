import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PluginRegistryEntry } from '@agiworkforce/types';

const loadPluginEntryMock = vi.hoisted(() => vi.fn());

vi.mock('@/features/plugins/server/registry-source', () => ({
  loadPluginEntry: loadPluginEntryMock,
}));
vi.mock('@shared/components/layout/Header', () => ({ Header: () => <div /> }));
vi.mock('@/features/marketing/components/MarketingFooter', () => ({
  MarketingFooter: () => <div />,
}));
vi.mock('./ConnectorChecklist', () => ({ ConnectorChecklist: () => <div /> }));

import PluginDetailPage from './page';

describe('PluginDetailPage', () => {
  it('routes a Web-installable pack to the real Plugins settings entry point', async () => {
    const entry: PluginRegistryEntry = {
      id: 'fixture-research-pack',
      name: 'Research Pack',
      version: '1.0.0',
      description: 'A reviewed workflow pack.',
      category: 'Research',
      publisher: { id: 'agi', name: 'AGI', kind: 'first-party' },
      source: 'builtin',
      status: 'published',
      webInstallable: true,
      declaredSkills: ['literature-review'],
      requiredConnectors: [],
      capabilities: [],
      permissions: [],
      examplePrompts: [],
      versions: [],
      distribution: null,
      integrity: { sha256: null, signature: null, signatureAlgorithm: null },
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
    };
    loadPluginEntryMock.mockResolvedValue({ status: 'ok', entry, manifest: null });

    render(
      await PluginDetailPage({
        params: Promise.resolve({ id: entry.id }),
      }),
    );

    expect(screen.getByText('Managed in Website Settings.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open Plugin settings' })).toHaveAttribute(
      'href',
      '/apps',
    );
  });
});
