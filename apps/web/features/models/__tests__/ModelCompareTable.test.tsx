import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CREDITS_PER_USD } from '@agiworkforce/types';

import type { ModelCatalogueEntry } from '@/app/api/models/catalogue/route';
import { ModelCompareTable } from '../components/ModelCompareTable';

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
    ...overrides,
  } as ModelCatalogueEntry;
}

function row(label: string): HTMLElement {
  return screen.getByRole('rowheader', { name: label }).closest('tr') as HTMLElement;
}

describe('the comparison table reads the catalogue, not a second copy of it', () => {
  it('puts each selected model in its own column with its exact identity', () => {
    render(
      <ModelCompareTable
        planLabel="Free"
        entries={[
          entry({ id: 'left-model', displayName: 'Left Model' }),
          entry({
            id: 'right-model',
            displayName: 'Right Model',
            developerLabel: 'Anthropic',
            admitted: false,
            minimumPlanLabel: 'Max 5x',
          }),
        ]}
      />,
    );

    expect(screen.getByRole('columnheader', { name: 'Left Model' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Right Model' })).toBeTruthy();
    expect(within(row('Model id')).getByText('left-model')).toBeTruthy();
    expect(within(row('Model id')).getByText('right-model')).toBeTruthy();
    expect(within(row('Access')).getByText('Included in Free')).toBeTruthy();
    expect(within(row('Access')).getByText('Max 5x and above')).toBeTruthy();
  });

  it('prices in credits at the shared conversion rate', () => {
    render(<ModelCompareTable planLabel="Free" entries={[entry({ inputPerMillion: 10 })]} />);
    expect(
      within(row('Input per million')).getByText(`${10 * CREDITS_PER_USD} credits`),
    ).toBeTruthy();
  });

  it('marks a capability the model does not have instead of leaving it blank', () => {
    render(
      <ModelCompareTable
        planLabel="Free"
        entries={[entry({ capabilities: { imageInput: true, webSearch: false } })]}
      />,
    );
    expect(within(row('Vision')).getByText('Yes')).toBeTruthy();
    expect(within(row('Search')).getByText('No')).toBeTruthy();
  });

  it('names a degraded model unavailable', () => {
    render(
      <ModelCompareTable planLabel="Free" entries={[entry({ temporarilyUnavailable: true })]} />,
    );
    expect(within(row('Status')).getByText('Temporarily unavailable')).toBeTruthy();
  });
});
