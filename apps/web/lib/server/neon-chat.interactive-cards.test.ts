import { describe, expect, it, vi } from 'vitest';
import { INTERACTIVE_CARDS_MAX_PER_MESSAGE } from '@agiworkforce/types';

vi.mock('server-only', () => ({}));
vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }));
vi.mock('@/lib/server/neon-db', () => ({ getNeonDb: vi.fn() }));

import { normalizeMessageMetadata } from './neon-chat';

function card(cardId: string) {
  return {
    schemaVersion: 1,
    cardId,
    kind: 'map-search.v1',
    createdAt: '2026-08-11T00:00:00.000Z',
    fallback: { headline: 'Map search', text: 'Map search: coffee near Austin' },
    producedBy: { toolCallId: cardId, toolName: 'search_maps' },
    body: {
      title: 'Coffee near Austin',
      query: 'coffee near Austin',
      actions: [
        {
          provider: 'openstreetmap',
          label: 'Open in OpenStreetMap',
          url: 'https://www.openstreetmap.org/search?query=coffee%20near%20Austin',
        },
      ],
    },
  };
}

describe('normalizeMessageMetadata interactive cards', () => {
  it('rejects too many cards before evaluating the total metadata size', () => {
    const metadata = {
      interactiveCards: Array.from({ length: INTERACTIVE_CARDS_MAX_PER_MESSAGE + 1 }, (_, index) =>
        card(`tool-fixture-${index}`),
      ),
      oversizedLaterField: 'x'.repeat(40_000),
    };

    expect(() => normalizeMessageMetadata(metadata)).toThrow(/too many interactive cards/i);
  });

  it('keeps only cards that pass the canonical persisted-card parser', () => {
    const valid = card('tool-fixture-valid');
    const normalized = normalizeMessageMetadata({
      label: 'fixture',
      interactiveCards: [{ arbitrary: true }, valid],
    });

    expect(normalized).toEqual({
      label: 'fixture',
      interactiveCards: [expect.objectContaining(valid)],
    });
  });
});
