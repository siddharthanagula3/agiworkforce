import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ModelCatalogueEntry } from '@/app/api/models/catalogue/route';
import { ModelCatalogueBrowser } from '../components/ModelCatalogueBrowser';

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

const ENTRIES: ModelCatalogueEntry[] = [
  entry({
    id: 'vision-one',
    displayName: 'Vision One',
    capabilities: { imageInput: true },
  }),
  entry({
    id: 'text-two',
    displayName: 'Text Two',
    developer: 'anthropic',
    developerLabel: 'Anthropic',
  }),
  entry({
    id: 'locked-three',
    displayName: 'Locked Three',
    developer: 'google',
    developerLabel: 'Google',
    admitted: false,
    minimumPlanLabel: 'Max 5x',
  }),
];

const DEVELOPERS = [
  { key: 'openai', label: 'OpenAI', admittedCount: 1, totalCount: 1 },
  { key: 'anthropic', label: 'Anthropic', admittedCount: 1, totalCount: 1 },
  { key: 'google', label: 'Google', admittedCount: 0, totalCount: 1 },
];

function renderBrowser(overrides: Partial<Parameters<typeof ModelCatalogueBrowser>[0]> = {}) {
  const onTry = vi.fn();
  render(
    <ModelCatalogueBrowser
      entries={ENTRIES}
      developers={DEVELOPERS}
      planLabel="Free"
      status="ready"
      autoProfile={{
        id: 'auto',
        profile: 'balanced',
        label: 'Auto',
        description: 'Routes each request to a model that fits it.',
      }}
      favouriteModelIds={['text-two']}
      recentModelIds={['locked-three']}
      onRetry={vi.fn()}
      onToggleFavourite={vi.fn()}
      onTry={onTry}
      {...overrides}
    />,
  );
  return { onTry };
}

function visibleModelIds(): string[] {
  return screen
    .getAllByTestId('model-card')
    .map((card) => card.getAttribute('data-model-id') ?? '');
}

describe('the models page filters the catalogue', () => {
  it('lists every model until a filter narrows it', () => {
    renderBrowser();
    expect(visibleModelIds().sort()).toEqual(['locked-three', 'text-two', 'vision-one']);
  });

  it('searches over the display name and the model id', () => {
    renderBrowser();
    fireEvent.change(screen.getByLabelText('Search models'), { target: { value: 'vision' } });
    expect(visibleModelIds()).toEqual(['vision-one']);
  });

  it('narrows to one developer and clears on a second press', () => {
    renderBrowser();
    const anthropic = screen.getByRole('button', { name: 'Anthropic (1)' });
    fireEvent.click(anthropic);
    expect(visibleModelIds()).toEqual(['text-two']);
    fireEvent.click(anthropic);
    expect(visibleModelIds()).toHaveLength(3);
  });

  it('narrows to a capability', () => {
    renderBrowser();
    fireEvent.click(screen.getByRole('button', { name: 'Vision' }));
    expect(visibleModelIds()).toEqual(['vision-one']);
  });

  it('separates what the plan includes from what needs an upgrade', () => {
    renderBrowser();
    fireEvent.click(screen.getByRole('button', { name: 'Needs an upgrade' }));
    expect(visibleModelIds()).toEqual(['locked-three']);
    fireEvent.click(screen.getByRole('button', { name: 'In your plan' }));
    expect(visibleModelIds().sort()).toEqual(['text-two', 'vision-one']);
  });

  it('shows favourites and recents from the shared sources', () => {
    renderBrowser();
    fireEvent.click(screen.getByRole('button', { name: 'Favourites' }));
    expect(visibleModelIds()).toEqual(['text-two']);
    fireEvent.click(screen.getByRole('button', { name: 'Recent' }));
    expect(visibleModelIds()).toEqual(['locked-three']);
  });

  it('starts a chat on the chosen model and never on a locked one', () => {
    const { onTry } = renderBrowser();
    fireEvent.click(screen.getByRole('button', { name: 'Try Auto' }));
    expect(onTry).toHaveBeenCalledWith('auto');

    const cards = screen.getAllByTestId('model-card');
    const locked = cards.find((card) => card.getAttribute('data-model-id') === 'locked-three');
    const lockedTry = locked?.querySelector('button:not([aria-pressed])') as HTMLButtonElement;
    expect(lockedTry.disabled).toBe(true);
  });
});
