import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const registryFixtures = await vi.hoisted(async () => {
  const { listCanonicalModels, getMinimumRequiredTier, PLAN_LABEL } =
    await import('@agiworkforce/types');
  const models = listCanonicalModels();
  const catalog = models.find((entry) => entry.capabilities.vision && entry.capabilities.tools);
  if (!catalog) throw new Error('catalog exposes no model with vision and tools');
  const locked = models.find((entry) => {
    if (entry.id === catalog.id) return false;
    const minimumTier = getMinimumRequiredTier(entry.id);
    return minimumTier !== null && minimumTier !== 'basic';
  });
  if (!locked) throw new Error('catalog exposes no model gated above the entry plan');
  return {
    catalog: { id: catalog.id, name: catalog.name, provider: catalog.provider },
    locked: {
      id: locked.id,
      name: locked.name,
      provider: locked.provider,
      planLabel: PLAN_LABEL[getMinimumRequiredTier(locked.id)!],
    },
  };
});

const catalogFixture = registryFixtures.catalog;
const lockedFixture = registryFixtures.locked;

const sel = vi.hoisted(() => ({ id: 'fixture-primary-model' }));

const BASE_MODELS = vi.hoisted(() => [
  {
    id: 'fixture-primary-model',
    name: 'Primary Fixture',
    provider: 'OpenAI',
    providerKey: 'openai',
    description: 'Balanced for everyday work',
  },
  {
    id: 'fixture-secondary-model',
    name: 'Secondary Fixture',
    provider: 'Anthropic',
    providerKey: 'anthropic',
    description: '',
  },
  {
    id: registryFixtures.locked.id,
    name: registryFixtures.locked.name,
    provider: registryFixtures.locked.provider,
    providerKey: registryFixtures.locked.provider,
    description: 'Needs a bigger plan',
  },
]);

const COMING_SOON_MODEL = vi.hoisted(() => ({
  id: 'fixture-coming-soon',
  name: 'Coming Soon Fixture',
  provider: 'OpenAI',
  providerKey: 'openai',
  description: 'Announced',
  availability: 'coming_soon',
}));

const MODELS = vi.hoisted(() => [] as Record<string, unknown>[]);

vi.mock('@shared/stores/model-store', () => ({
  useModelStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      selectedModelId: sel.id,
      setSelectedModelId: (id: string) => {
        sel.id = id;
      },
      getSelectedModel: () => MODELS.find((m) => m['id'] === sel.id) ?? MODELS[0],
    }),
  AVAILABLE_MODELS: MODELS,
}));

vi.mock('@shared/stores/web-auth-store', () => ({
  useBillingStore: (selector: (state: unknown) => unknown) =>
    selector({
      subscription: { tier: 'max_15x' },
      initialized: true,
      isLoading: false,
      error: null,
    }),
}));

vi.mock('@shared/config/llm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@shared/config/llm')>()),
  isModelAllowedForTier: (modelId: string) => modelId !== registryFixtures.locked.id,
}));

vi.mock('@agiworkforce/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/ui')>();
  const { createContext, useContext, cloneElement } = await import('react');
  const PopoverContext = createContext<{ open: boolean; onOpenChange: (o: boolean) => void }>({
    open: false,
    onOpenChange: () => undefined,
  });
  return {
    ...actual,
    Popover: ({
      children,
      open,
      onOpenChange,
    }: {
      children: React.ReactNode;
      open: boolean;
      onOpenChange: (o: boolean) => void;
    }) => (
      <PopoverContext.Provider value={{ open, onOpenChange }}>{children}</PopoverContext.Provider>
    ),
    PopoverTrigger: ({ children }: { children: React.ReactElement<{ onClick?: () => void }> }) => {
      const ctx = useContext(PopoverContext);
      return cloneElement(children, { onClick: () => ctx.onOpenChange(!ctx.open) });
    },
    PopoverContent: ({
      children,
      ref,
      onCloseAutoFocus: _onCloseAutoFocus,
      align: _align,
      sideOffset: _sideOffset,
      collisionPadding: _collisionPadding,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & {
      children: React.ReactNode;
      ref?: React.Ref<HTMLDivElement>;
      onCloseAutoFocus?: unknown;
      align?: unknown;
      sideOffset?: unknown;
      collisionPadding?: unknown;
    }) => {
      const ctx = useContext(PopoverContext);
      return ctx.open ? (
        <div role="dialog" data-testid="popover-content" ref={ref} {...props}>
          {children}
        </div>
      ) : null;
    },
  };
});

vi.mock('@features/chat/lib/use-model-catalogue', () => ({
  useModelCatalogue: () => ({
    status: 'ready',
    entries: MODELS.map((model) => ({
      id: model['id'],
      displayName: model['name'],
      provider: model['providerKey'],
      family: null,
      isRouter: false,
      releasedOn: null,
      stage: null,
      openWeight: false,
      contextTokens: null,
      maxOutputTokens: null,
      inputPerMillion: 0,
      outputPerMillion: 0,
      priceBand: null,
      capabilities: {},
      admitted: model['id'] !== registryFixtures.locked.id,
      minimumPlanLabel:
        model['id'] === registryFixtures.locked.id ? registryFixtures.locked.planLabel : null,
      availability: model['availability'] ?? 'live',
      requiresEnvironment: null,
    })),
    providers: [{ key: 'openai', admittedCount: 1, totalCount: 1 }],
    count: MODELS.length,
    planLabel: 'Max 15x',
  }),
}));

vi.mock('@features/chat/lib/use-model-favourites', () => ({
  useModelFavourites: () => ({ favouriteModelIds: [], toggleFavourite: vi.fn() }),
}));

vi.mock('zustand/middleware', async () => {
  const actual = await vi.importActual<typeof import('zustand/middleware')>('zustand/middleware');
  return { ...actual, persist: (config: (set: unknown) => unknown) => config };
});

import { MODEL_PICKER_GUIDANCE } from '@agiworkforce/unified-chat/model-picker';
import { ComposerFooter } from '../ComposerFooter';

const useRoster = (models: Record<string, unknown>[]) => {
  MODELS.splice(0, MODELS.length, ...models);
};

const openPicker = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Change model' }));
  return screen.getByRole('dialog', { name: 'Models' });
};

const mountAndOpen = () => {
  render(<ComposerFooter />);
  return openPicker();
};

const modelRows = (dialog: HTMLElement) =>
  within(dialog)
    .getAllByRole('button')
    .filter((button) => button.hasAttribute('aria-pressed'));

const allModelsRow = (dialog: HTMLElement) =>
  within(dialog).getByRole('button', { name: /All models/ });

const planPageLink = (dialog: HTMLElement) =>
  within(dialog).getByRole('link', { name: 'What each plan includes' });

describe('ComposerFooter · picker rows', () => {
  beforeEach(() => {
    sel.id = 'fixture-primary-model';
    useRoster(BASE_MODELS);
  });

  it('renders every model as a fixed-height two-line row with the check on the selected one', () => {
    const dialog = mountAndOpen();
    const rows = modelRows(dialog);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const row of rows) {
      expect(row).toHaveAttribute('data-picker-row');
      expect(row.className).toContain('h-12');
    }

    const selected = within(dialog).getByRole('button', { name: 'Primary Fixture' });
    expect(selected).toHaveAttribute('aria-pressed', 'true');
    expect(within(selected).getByText('Primary Fixture')).toBeInTheDocument();
    expect(
      Object.values(MODEL_PICKER_GUIDANCE).some((phrase) => within(selected).queryByText(phrase)),
    ).toBe(true);
    expect(selected.querySelector('svg.text-primary')).not.toBeNull();

    const other = within(dialog).getByRole('button', { name: 'Secondary Fixture' });
    expect(other).toHaveAttribute('aria-pressed', 'false');
    expect(other.querySelector('svg.text-primary')).toBeNull();
  });

  it('gives a model with no catalog description the same profile phrase', () => {
    const dialog = mountAndOpen();
    const row = within(dialog).getByRole('button', { name: 'Secondary Fixture' });
    const guidance = row.querySelector('span.text-muted-foreground')?.textContent ?? '';
    expect(Object.values(MODEL_PICKER_GUIDANCE)).toContain(guidance);
  });

  it('keeps catalog capabilities in the row description for screen readers only', () => {
    useRoster([
      ...BASE_MODELS,
      {
        id: catalogFixture.id,
        name: catalogFixture.name,
        provider: catalogFixture.provider,
        providerKey: catalogFixture.provider,
        description: 'catalog fixture',
      },
    ]);
    const dialog = mountAndOpen();
    const row = within(dialog).getByRole('button', { name: catalogFixture.name });
    const descriptionId = row.getAttribute('aria-describedby');
    expect(descriptionId).toBeTruthy();
    const description = document.getElementById(descriptionId!)!;
    expect(description.textContent).toMatch(/Vision/);
    expect(description.textContent).toMatch(/Tools/);
    expect(within(row).queryByText('Vision')).not.toBeInTheDocument();
    expect(within(row).queryByText('Tools')).not.toBeInTheDocument();
  });

  it('opens the catalogue from All models and names the plan on a locked row there', () => {
    const dialog = mountAndOpen();
    const more = allModelsRow(dialog);
    expect(more).toHaveAttribute('data-picker-row');
    expect(more.className).toContain('h-12');
    expect(more).toHaveTextContent(String(BASE_MODELS.length));
    expect(
      within(dialog).queryByRole('option', { name: new RegExp(lockedFixture.name) }),
    ).not.toBeInTheDocument();

    fireEvent.click(more);
    expect(within(dialog).getByRole('textbox', { name: 'Search models' })).toBeInTheDocument();
    const locked = within(dialog).getByRole('option', { name: new RegExp(lockedFixture.name) });
    expect(locked).toHaveTextContent(`${lockedFixture.planLabel} and above`);
    expect(locked.className).toContain('h-12');
  });

  it('carries no header and no search field, matching the reference menu', () => {
    const dialog = mountAndOpen();
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-label', 'Models');
    expect(within(dialog).queryByText('Models')).not.toBeInTheDocument();
  });

  it('opens the catalogue on the typed query instead of filtering the short list', () => {
    const dialog = mountAndOpen();
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();

    // One character is all the short list handles: it opens the catalogue and
    // the catalogue's own autofocused field takes the rest of the typing.
    fireEvent.keyDown(dialog, { key: 'S' });

    const search = within(dialog).getByRole('textbox', { name: 'Search models' });
    expect(search).toHaveValue('S');
    expect(within(dialog).queryByRole('button', { name: /All models/ })).not.toBeInTheDocument();
  });

  it('puts one guidance phrase per routing profile on a row, not the catalog tagline', () => {
    const dialog = mountAndOpen();
    const phrases = new Set<string>(Object.values(MODEL_PICKER_GUIDANCE));
    for (const row of modelRows(dialog)) {
      const guidance = row.querySelector('span.text-muted-foreground')?.textContent ?? '';
      expect(phrases.has(guidance)).toBe(true);
    }
    expect(within(dialog).queryByText('Balanced for everyday work')).not.toBeInTheDocument();
  });

  it('drops the capability glyph row from short list rows', () => {
    useRoster([
      ...BASE_MODELS,
      {
        id: catalogFixture.id,
        name: catalogFixture.name,
        provider: catalogFixture.provider,
        providerKey: catalogFixture.provider,
        description: 'catalog fixture',
      },
    ]);
    const dialog = mountAndOpen();
    const row = within(dialog).getByRole('button', { name: catalogFixture.name });
    expect(within(row).queryByLabelText(/^Vision$/)).not.toBeInTheDocument();
    expect(row.querySelector('[aria-label^="Price band"]')).not.toBeNull();
  });
});

describe('ComposerFooter · picker query reset', () => {
  beforeEach(() => {
    sel.id = 'fixture-primary-model';
    useRoster(BASE_MODELS);
  });

  it('clears the typed query and closes the catalogue when the picker closes', () => {
    render(<ComposerFooter />);
    let dialog = openPicker();
    fireEvent.keyDown(dialog, { key: 'S' });
    expect(within(dialog).getByRole('textbox', { name: 'Search models' })).toHaveValue('S');

    // Escape unwinds the catalogue, then the panel; Tab would cycle inside the
    // dialog rather than close it, which is the contract.
    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Models' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Models' })).not.toBeInTheDocument();

    dialog = openPicker();
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
    expect(allModelsRow(dialog)).toBeInTheDocument();
  });
});

describe('ComposerFooter · picker keyboard', () => {
  beforeEach(() => {
    sel.id = 'fixture-primary-model';
    useRoster(BASE_MODELS);
  });

  it('focuses the first row on open, walks rows with the arrow keys, and closes on Escape', async () => {
    const dialog = mountAndOpen();
    const rows = modelRows(dialog);

    await waitFor(() => expect(document.activeElement).toBe(rows[0]));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows[1]);
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(allModelsRow(dialog));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(rows[1]);
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(document.activeElement).toBe(planPageLink(dialog));
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(document.activeElement).toBe(rows[0]);

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Models' })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Change model' }));
  });

  it('keeps a coming soon row non-selectable in the catalogue', () => {
    useRoster([BASE_MODELS[0]!, BASE_MODELS[1]!, COMING_SOON_MODEL, BASE_MODELS[2]!]);
    const dialog = mountAndOpen();
    fireEvent.click(allModelsRow(dialog));
    const comingSoon = within(dialog).getByRole('option', { name: /Coming Soon Fixture/ });
    expect(comingSoon).toBeDisabled();
    expect(comingSoon).toHaveTextContent('Coming soon');
  });
});
