import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { listChatModels } from '@agiworkforce/types';

import type { ModelCatalogueEntry } from '@/app/api/models/catalogue/route';
import { creditsPerMillionTokens, estimateMessageCredits } from '@/lib/billing/credit-estimates';
import { ModelCatalogue } from '../ModelCatalogue';

/**
 * The About card is read by a customer choosing a model. It printed the
 * registry pipeline state ("promoted") as if it were a product attribute and
 * filled every fact the catalogue does not publish with "Not published". A
 * fact with no published value is now absent, and the pipeline state is never
 * shown.
 */

const UNPRICED_ID = 'fixture-unpriced-model';
const DISPLAY_NAME = 'Fixture Model';
const PLAN_LABEL = 'Fixture Plan';
const PRICE_TERMS = ['Typical message', 'Credits per 1M tokens'];

function entry(overrides: Partial<ModelCatalogueEntry> = {}): ModelCatalogueEntry {
  return {
    id: UNPRICED_ID,
    displayName: DISPLAY_NAME,
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
    freePool: false,
    capabilities: {},
    admitted: true,
    temporarilyUnavailable: false,
    eventAccess: false,
    minimumPlanLabel: null,
    minimumPlan: null,
    availability: 'live',
    requiresEnvironment: null,
    ...overrides,
  } as ModelCatalogueEntry;
}

function openAboutCard(shown: ModelCatalogueEntry): HTMLElement {
  const { container } = render(
    <ModelCatalogue
      entries={[shown]}
      developers={[{ key: 'openai', label: 'OpenAI', admittedCount: 1, totalCount: 1 }]}
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
  fireEvent.click(screen.getByRole('button', { name: `About ${shown.displayName}` }));
  expect(screen.getByRole('button', { name: 'Back to the model list' })).toBeTruthy();
  return container;
}

function terms(container: HTMLElement): string[] {
  return [...container.querySelectorAll('dt')].map((term) => term.textContent ?? '');
}

function pricedModelId(): string {
  const priced = listChatModels().find(
    (model) => estimateMessageCredits(model.id) !== null && creditsPerMillionTokens(model.id),
  );
  if (!priced) throw new Error('The catalogue has no chat model with a published token price.');
  return priced.id;
}

describe('model About card - the registry pipeline state is not a product fact', () => {
  it('never prints the stage or its label', () => {
    const container = openAboutCard(entry({ stage: 'promoted' }));

    expect(terms(container)).not.toContain('Lifecycle stage');
    expect(container.textContent).not.toMatch(/lifecycle stage/i);
    expect(container.textContent).not.toMatch(/promoted/i);
  });
});

describe('model About card - a fact with no published value is absent', () => {
  it('keeps the published facts and drops the rest without a placeholder', () => {
    const container = openAboutCard(entry({ stage: 'promoted', releasedOn: null }));

    expect(container.textContent).not.toMatch(/not published/i);
    expect(terms(container)).toEqual(['Family', 'Context ceiling', 'Output ceiling']);
    expect(screen.getByText('128K')).toBeTruthy();
  });

  it('drops a release date that does not parse', () => {
    const container = openAboutCard(entry({ releasedOn: 'not-a-date' }));

    expect(terms(container)).not.toContain('Released');
    expect(container.textContent).not.toMatch(/not published|invalid date/i);
  });

  it('shows the family alone, outside a two column grid, when nothing else is published', () => {
    const container = openAboutCard(
      entry({ contextTokens: null, maxOutputTokens: null, releasedOn: null }),
    );

    expect(terms(container)).toEqual(['Family']);
    expect(container.querySelector('dl')?.className).not.toMatch(/grid/);
  });

  it('lays several facts out in the two column grid', () => {
    const container = openAboutCard(entry());

    expect(container.querySelector('dl')?.className).toMatch(/grid-cols-2/);
  });
});

describe('model About card - what a message costs', () => {
  it('shows both credit rows for a model with a published price', () => {
    const container = openAboutCard(entry({ id: pricedModelId() }));

    expect(terms(container)).toEqual(expect.arrayContaining(PRICE_TERMS));
    expect(screen.getByText(/^A typical message is about/)).toBeTruthy();
  });

  it('says a free pool model uses no credits on both rows', () => {
    const container = openAboutCard(entry({ freePool: true }));

    expect(terms(container)).toEqual(expect.arrayContaining(PRICE_TERMS));
    expect(screen.getAllByText('Free, uses no credits')).toHaveLength(2);
  });

  it('shows no credit figure for a model that is free during an event', () => {
    const container = openAboutCard(entry({ id: pricedModelId(), eventAccess: true }));

    for (const term of PRICE_TERMS) expect(terms(container)).not.toContain(term);
    expect(screen.queryByText(/^A typical message is about/)).toBeNull();
    expect(container.textContent).not.toMatch(/credits?\b/i);
  });
});

describe('model About card - notes that stay', () => {
  it('still tells an account below the plan how to get the model', () => {
    openAboutCard(entry({ admitted: false, minimumPlanLabel: PLAN_LABEL }));

    expect(screen.getByText(`Upgrade to use · ${PLAN_LABEL}`)).toBeTruthy();
  });

  it('still lists the capabilities', () => {
    openAboutCard(entry({ capabilities: { imageInput: true } }));

    expect(screen.getByText('Capabilities')).toBeTruthy();
    expect(screen.getByText('Vision')).toBeTruthy();
  });
});
