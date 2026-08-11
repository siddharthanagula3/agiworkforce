import { describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs', () => ({ useAuth: vi.fn() }));

import { readLoadedMessageMetadata } from './useConversations';

const validCard = {
  schemaVersion: 1,
  cardId: 'tool-fixture-map',
  kind: 'map-search.v1',
  createdAt: '2026-08-11T00:00:00.000Z',
  fallback: { headline: 'Map search', text: 'Map search: coffee near Austin' },
  producedBy: { toolCallId: 'tool-fixture-map', toolName: 'search_maps' },
  body: {
    title: 'Coffee near Austin',
    query: 'coffee near Austin',
    actions: [
      {
        provider: 'google_maps',
        label: 'Open in Google Maps',
        url: 'https://www.google.com/maps/search/?api=1&query=coffee%20near%20Austin',
      },
    ],
  },
};

describe('conversation message card hydration', () => {
  it('replaces persisted raw cards with canonical parsed cards and salvages valid entries', () => {
    const metadata = readLoadedMessageMetadata({
      label: 'fixture',
      interactiveCards: [{ arbitrary: true }, validCard],
    });

    expect((metadata as Record<string, unknown> | undefined)?.['label']).toBe('fixture');
    expect(metadata?.interactiveCards).toHaveLength(1);
    expect(metadata?.interactiveCards?.[0]).toMatchObject({
      cardId: 'tool-fixture-map',
      recognized: true,
      kind: 'map-search.v1',
    });
  });
});
