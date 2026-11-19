import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ModelCatalogueEntry } from '@/app/api/models/catalogue/route';
import { ModelCatalogue } from '../ModelCatalogue';

const OFFERED_ID = 'fixture-offered-model';

function entry(overrides: Partial<ModelCatalogueEntry> = {}): ModelCatalogueEntry {
  return {
    id: OFFERED_ID,
    displayName: 'Offered Fixture',
    developer: 'openai',
    developerLabel: 'OpenAI',
    family: null,
    routeCount: 1,
    isRouter: false,
    releasedOn: null,
    stage: null,
    openWeight: false,
    contextTokens: 128_000,
    maxOutputTokens: 8_192,
    priceBand: null,
    capabilities: { imageInput: true },
    admitted: true,
    temporarilyUnavailable: false,
    eventAccess: false,
    promotionEndsAt: null,
    minimumPlanLabel: null,
    availability: 'live',
    requiresEnvironment: null,
    ...overrides,
  } as ModelCatalogueEntry;
}

describe('model catalogue developer rail', () => {
  it('counts the rows the developer lists, locked ones included', () => {
    const entries = [
      entry({ id: 'fixture-a', displayName: 'Fixture A' }),
      entry({ id: 'fixture-b', displayName: 'Fixture B' }),
      entry({ id: 'fixture-c', displayName: 'Fixture C', admitted: false }),
      entry({ id: 'fixture-d', displayName: 'Fixture D', admitted: false }),
    ];
    render(
      <ModelCatalogue
        entries={entries}
        developers={[{ key: 'openai', label: 'OpenAI', admittedCount: 2, totalCount: 4 }]}
        favouriteModelIds={[]}
        recentModelIds={[]}
        selectedModelId="fixture-other-model"
        query=""
        onQueryChange={vi.fn()}
        onSelect={vi.fn()}
        onToggleFavourite={vi.fn()}
        onBack={vi.fn()}
        isEnvironmentLocked={() => ({ locked: false })}
      />,
    );

    const tab = screen.getByRole('tab', { name: /OpenAI/ });
    expect(tab.textContent).toBe('OpenAI4');
    expect(screen.getAllByRole('option')).toHaveLength(4);
  });
});
