import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ModelCatalogueEntry } from '@/app/api/models/catalogue/route';
import { ModelCard } from '../components/ModelCard';
import { retirementLabel } from '../lib/model-presentation';

function entry(overrides: Partial<ModelCatalogueEntry> = {}): ModelCatalogueEntry {
  return {
    id: 'fixture-model',
    displayName: 'Fixture Model',
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
    inputPerMillion: 1,
    outputPerMillion: 2,
    priceBand: null,
    capabilities: {},
    admitted: true,
    temporarilyUnavailable: false,
    eventAccess: false,
    minimumPlanLabel: null,
    availability: 'live',
    requiresEnvironment: null,
    deprecatedOn: null,
    ...overrides,
  } as ModelCatalogueEntry;
}

function renderCard(overrides: Partial<ModelCatalogueEntry>): void {
  render(
    <ModelCard
      entry={entry(overrides)}
      planLabel="Pro"
      isFavourite={false}
      isCompared={false}
      canCompare
      onToggleFavourite={vi.fn()}
      onToggleCompare={vi.fn()}
      onTry={vi.fn()}
    />,
  );
}

describe('deprecation on a still-selectable model', () => {
  it('names the date the model stops being offered', () => {
    renderCard({ deprecatedOn: '2026-09-27' });
    expect(screen.getByTestId('model-retirement')).toHaveTextContent('Retiring 27 Sept 2026');
  });

  it('says nothing when the model has no retirement date', () => {
    renderCard({});
    expect(screen.queryByTestId('model-retirement')).toBeNull();
  });

  it('keeps the model selectable while it is deprecated', () => {
    renderCard({ deprecatedOn: '2026-09-27' });
    expect(screen.getByRole('button', { name: 'Try model' })).toBeEnabled();
  });
});

describe('retirementLabel', () => {
  const now = new Date('2026-09-18T00:00:00Z');

  it('reads as future before the date and as past after it', () => {
    expect(retirementLabel(entry({ deprecatedOn: '2026-09-27' }), now)).toBe(
      'Retiring 27 Sept 2026',
    );
    expect(retirementLabel(entry({ deprecatedOn: '2026-01-05' }), now)).toBe('Retired 5 Jan 2026');
  });

  it('is silent on an absent or unparseable date rather than guessing', () => {
    expect(retirementLabel(entry({ deprecatedOn: null }), now)).toBeNull();
    expect(retirementLabel(entry({ deprecatedOn: 'soon' }), now)).toBeNull();
  });
});
