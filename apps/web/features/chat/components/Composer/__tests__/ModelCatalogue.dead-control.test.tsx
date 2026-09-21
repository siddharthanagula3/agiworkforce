import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ModelCatalogueEntry } from '@/app/api/models/catalogue/route';
import { ModelCatalogue } from '../ModelCatalogue';

/**
 * A row the composer cannot hold used to close the picker with the selection
 * unchanged and say nothing: no request, no console message, no notice. The
 * row and the store now answer from one predicate, so a row is either
 * selectable or visibly unavailable, never a control that does nothing.
 */

const OFFERED_ID = 'fixture-offered-model';
const WITHHELD_ID = 'fixture-withheld-model';

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
    minimumPlanLabel: null,
    availability: 'live',
    requiresEnvironment: null,
    ...overrides,
  } as ModelCatalogueEntry;
}

function renderCatalogue(
  entries: ModelCatalogueEntry[],
  isSelectable?: (modelId: string) => boolean,
) {
  const onSelect = vi.fn();
  render(
    <ModelCatalogue
      entries={entries}
      developers={[
        {
          key: 'openai',
          label: 'OpenAI',
          admittedCount: entries.length,
          totalCount: entries.length,
        },
      ]}
      favouriteModelIds={[]}
      recentModelIds={[]}
      selectedModelId="fixture-other-model"
      query=""
      onQueryChange={vi.fn()}
      onSelect={onSelect}
      onToggleFavourite={vi.fn()}
      onBack={vi.fn()}
      isEnvironmentLocked={() => ({ locked: false })}
      {...(isSelectable ? { isSelectable } : {})}
    />,
  );
  return onSelect;
}

describe('model catalogue - no row is a silent dead control', () => {
  it('selects a row the composer can hold', () => {
    const onSelect = renderCatalogue([entry()], (modelId) => modelId === OFFERED_ID);

    fireEvent.click(screen.getByRole('option', { name: /offered fixture/i }));

    expect(onSelect).toHaveBeenCalledWith(OFFERED_ID);
  });

  it('refuses the click on a row the composer cannot hold', () => {
    const onSelect = renderCatalogue(
      [entry({ id: WITHHELD_ID, displayName: 'Withheld Fixture' })],
      (modelId) => modelId === OFFERED_ID,
    );

    const row = screen.getByRole('option', { name: /withheld fixture/i });
    expect(row.hasAttribute('disabled')).toBe(true);

    fireEvent.click(row);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('gives that row its reason instead of leaving it looking selectable', () => {
    renderCatalogue(
      [entry({ id: WITHHELD_ID, displayName: 'Withheld Fixture' })],
      (modelId) => modelId === OFFERED_ID,
    );

    const row = screen.getByRole('option', {
      name: /withheld fixture - not available in this app/i,
    });
    expect(within(row).getByText(/not available in this app/i)).toBeTruthy();
  });

  it('says nothing about availability when every row can be held', () => {
    renderCatalogue([entry()], () => true);

    expect(screen.queryByText(/not available in this app/i)).toBeNull();
  });

  it('leaves the rows selectable when no predicate is supplied', () => {
    const onSelect = renderCatalogue([entry()]);

    fireEvent.click(screen.getByRole('option', { name: /offered fixture/i }));

    expect(onSelect).toHaveBeenCalledWith(OFFERED_ID);
  });
});

describe('model catalogue - the capability filters read as toggles', () => {
  it('groups them under a label a screen reader can announce', () => {
    renderCatalogue([entry()]);

    const group = screen.getByRole('group', { name: /filter by capability/i });
    expect(within(group).getAllByRole('button').length).toBeGreaterThan(1);
  });

  it('reports each filter as pressed or not, not only by colour', () => {
    renderCatalogue([entry()]);

    const group = screen.getByRole('group', { name: /filter by capability/i });
    const chip = within(group).getAllByRole('button')[0]!;
    expect(chip.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps the filters out of the model list a driver walks', () => {
    renderCatalogue([entry()]);

    const group = screen.getByRole('group', { name: /filter by capability/i });
    expect(within(group).queryAllByRole('option')).toHaveLength(0);
  });
});
