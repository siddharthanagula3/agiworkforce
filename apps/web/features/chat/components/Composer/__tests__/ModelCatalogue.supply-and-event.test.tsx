import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ModelCatalogueEntry } from '@/app/api/models/catalogue/route';
import { ModelCatalogue } from '../ModelCatalogue';

/**
 * Two rules the picker has to keep.
 *
 * A customer chooses a MODEL, never a supplier. Which reseller or gateway
 * carries the traffic is our commercial business, and naming it in the picker
 * both confuses the choice and advertises our supply chain: the catalogue
 * served labels like "OpenRouter" and "Alibaba Model Studio" straight into the
 * model detail card and into the search index behind it.
 *
 * A model that cannot answer must not look selectable. `temporarilyUnavailable`
 * is the health state the catalogue computes when every route it has is
 * degraded; before it existed the only way to discover an unfunded provider was
 * to send a turn and read the error.
 */

const SUPPLIER_WORDS = ['OpenRouter', 'Alibaba', 'Model Studio', 'Vercel', 'Gateway', 'Bedrock'];

function entry(overrides: Partial<ModelCatalogueEntry> = {}): ModelCatalogueEntry {
  return {
    id: 'fixture-model',
    displayName: 'Fixture Model',
    provider: 'open_router',
    providerLabel: 'OpenRouter',
    developer: 'openai',
    developerLabel: 'OpenAI',
    family: null,
    routes: [
      {
        routeId: 'fixture-model@open_router',
        provider: 'open_router',
        label: 'OpenRouter',
        isDefault: true,
        status: 'available',
        freeInventory: null,
      },
    ],
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

function renderCatalogue(entries: ModelCatalogueEntry[], onSelect = vi.fn()) {
  render(
    <ModelCatalogue
      entries={entries}
      developers={[{ key: 'openai', label: 'OpenAI', count: entries.length, admitted: 1 }]}
      favouriteModelIds={[]}
      selectedModelId="other-model"
      query=""
      onQueryChange={vi.fn()}
      onSelect={onSelect}
      onToggleFavourite={vi.fn()}
      onBack={vi.fn()}
      isEnvironmentLocked={() => ({ locked: false })}
    />,
  );
  return onSelect;
}

function openDetailCard(): void {
  fireEvent.click(screen.getByRole('button', { name: /about fixture model/i }));
}

describe('model catalogue - the customer chooses a model, not a supplier', () => {
  it('names no supplier in the list', () => {
    renderCatalogue([entry()]);

    for (const word of SUPPLIER_WORDS) {
      expect(screen.queryByText(new RegExp(word, 'i'))).toBeNull();
    }
  });

  it('names no supplier in the model detail card', () => {
    renderCatalogue([entry()]);
    openDetailCard();

    expect(screen.getByText('Fixture Model')).toBeTruthy();
    expect(screen.queryByText(/available through/i)).toBeNull();
    for (const word of SUPPLIER_WORDS) {
      expect(screen.queryByText(new RegExp(word, 'i'))).toBeNull();
    }
  });

  it('still shows the model developer, which is part of the model identity', () => {
    renderCatalogue([entry()]);

    expect(screen.getAllByText('OpenAI').length).toBeGreaterThan(0);
  });
});

describe('model catalogue - a model that cannot answer is not selectable', () => {
  it('marks it unavailable rather than dropping it', () => {
    renderCatalogue([entry({ temporarilyUnavailable: true })]);

    expect(screen.getByText('Fixture Model')).toBeTruthy();
    expect(screen.getAllByText(/temporarily unavailable/i).length).toBeGreaterThan(0);
  });

  it('refuses the click instead of sending a turn that will fail', () => {
    const onSelect = renderCatalogue([entry({ temporarilyUnavailable: true })]);

    const row = screen.getByRole('option', { name: /fixture model/i });
    expect(row.hasAttribute('disabled')).toBe(true);

    fireEvent.click(row);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('says so to a screen reader, not only in colour', () => {
    renderCatalogue([entry({ temporarilyUnavailable: true })]);

    expect(
      screen.getByRole('option', { name: /fixture model - temporarily unavailable/i }),
    ).toBeTruthy();
  });

  it('stays selectable while it is healthy', () => {
    const onSelect = renderCatalogue([entry()]);

    fireEvent.click(screen.getByRole('option', { name: /fixture model/i }));
    expect(onSelect).toHaveBeenCalledWith('fixture-model');
  });
});

describe('model catalogue - event access reads as temporary', () => {
  it('badges a model the event promotes', () => {
    renderCatalogue([entry({ eventAccess: true })]);

    expect(screen.getByText('Free during event')).toBeTruthy();
  });

  it('says nothing about an event for a model included in the plan', () => {
    renderCatalogue([entry()]);

    expect(screen.queryByText(/free during event/i)).toBeNull();
  });

  /** Promoting something nobody can reach would be a promise the event breaks. */
  it('does not advertise a promoted model that cannot answer', () => {
    renderCatalogue([entry({ eventAccess: true, temporarilyUnavailable: true })]);

    expect(screen.queryByText(/free during event/i)).toBeNull();
    expect(screen.getAllByText(/temporarily unavailable/i).length).toBeGreaterThan(0);
  });
});
