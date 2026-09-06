import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const sel = vi.hoisted(() => ({ id: 'fixture-primary-model' }));

const MODELS = vi.hoisted(() => [
  {
    id: 'fixture-primary-model',
    name: 'Primary Fixture',
    provider: 'OpenAI',
    providerKey: 'openai',
    description: 'Balanced',
  },
  {
    id: 'fixture-secondary-model',
    name: 'Secondary Fixture',
    provider: 'Anthropic',
    providerKey: 'anthropic',
    description: 'Balanced',
  },
]);

const CATALOGUE_ENTRIES = vi.hoisted(() => [
  {
    id: 'fixture-primary-model',
    displayName: 'Primary Fixture',
    provider: 'openai',
    providerLabel: 'openai',
    developer: 'openai',
    developerLabel: 'openai',
    routes: [],
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
    admitted: true,
    minimumPlanLabel: null,
    availability: 'live',
    requiresEnvironment: null,
  },
  {
    id: 'fixture-secondary-model',
    displayName: 'Secondary Fixture',
    provider: 'anthropic',
    providerLabel: 'anthropic',
    developer: 'anthropic',
    developerLabel: 'anthropic',
    routes: [],
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
    admitted: true,
    minimumPlanLabel: null,
    availability: 'live',
    requiresEnvironment: null,
  },
]);

vi.mock('@shared/stores/model-store', () => ({
  useModelStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      selectedModelId: sel.id,
      setSelectedModelId: (id: string) => {
        sel.id = id;
      },
      getSelectedModel: () => MODELS.find((m) => m.id === sel.id) ?? MODELS[0],
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
  isModelAllowedForTier: () => true,
}));

vi.mock('@shared/stores/web-chat-store', () => ({
  useChatStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ activeConversationId: null, conversations: [], messages: [] }),
}));

vi.mock('@features/chat/lib/use-model-catalogue', () => ({
  useModelCatalogue: () => ({
    status: 'ready',
    entries: CATALOGUE_ENTRIES,
    developers: [
      { key: 'openai', label: 'openai', admittedCount: 1, totalCount: 1 },
      { key: 'anthropic', label: 'anthropic', admittedCount: 1, totalCount: 1 },
    ],
    count: CATALOGUE_ENTRIES.length,
    planLabel: 'Max 15x',
  }),
}));

vi.mock('@features/chat/lib/use-model-favourites', () => ({
  useModelFavourites: () => ({ favouriteModelIds: [], toggleFavourite: vi.fn() }),
}));

vi.mock('./StyleSelector', () => ({ StyleSelector: () => <div /> }));

vi.mock('zustand/middleware', async () => {
  const actual = await vi.importActual<typeof import('zustand/middleware')>('zustand/middleware');
  return { ...actual, persist: (config: (set: unknown) => unknown) => config };
});

import { ComposerFooter } from '../ComposerFooter';

const openPicker = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Change model' }));
  return screen.getByRole('dialog', { name: 'Models' });
};

const openCatalogue = (dialog: HTMLElement) => {
  fireEvent.click(within(dialog).getByRole('button', { name: /All models/ }));
  return dialog;
};

const tabbables = (root: HTMLElement) =>
  Array.from(
    root.querySelectorAll<HTMLElement>('button:not([disabled]), input, a[href], [tabindex="0"]'),
  );

/**
 * The contract, written before the implementation: the short list is a menu, so
 * Tab leaves it; the catalogue is a dialog, so Tab cycles its regions and never
 * escapes, and Escape unwinds one layer at a time.
 */
describe('ComposerFooter · picker keyboard contract', () => {
  beforeEach(() => {
    sel.id = 'fixture-primary-model';
  });

  it('short list: Tab closes the menu, matching the reference', () => {
    render(<ComposerFooter />);
    const dialog = openPicker();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.queryByRole('dialog', { name: 'Models' })).not.toBeInTheDocument();
    expect(dialog).not.toBeInTheDocument();
  });

  it('short list: arrows walk the rows and Escape returns focus to the trigger', async () => {
    render(<ComposerFooter />);
    const dialog = openPicker();
    const rows = within(dialog)
      .getAllByRole('button')
      .filter((button) => button.hasAttribute('aria-pressed'));
    await waitFor(() => expect(document.activeElement).toBe(rows[0]));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows[1]);

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Models' })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Change model' }));
  });

  it('catalogue: Escape closes the catalogue first and leaves the short list open', () => {
    render(<ComposerFooter />);
    const dialog = openCatalogue(openPicker());
    expect(within(dialog).getByRole('textbox', { name: 'Search models' })).toBeInTheDocument();

    fireEvent.keyDown(within(dialog).getByRole('textbox', { name: 'Search models' }), {
      key: 'Escape',
    });

    expect(screen.getByRole('dialog', { name: 'Models' })).toBeInTheDocument();
    expect(
      within(screen.getByRole('dialog', { name: 'Models' })).queryByRole('textbox', {
        name: 'Search models',
      }),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('dialog', { name: 'Models' })).getByRole('button', {
        name: /All models/,
      }),
    ).toBeInTheDocument();
  });

  it('catalogue: a second Escape closes the short list and returns focus to the trigger', () => {
    render(<ComposerFooter />);
    const dialog = openCatalogue(openPicker());
    fireEvent.keyDown(within(dialog).getByRole('textbox', { name: 'Search models' }), {
      key: 'Escape',
    });
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Models' }), { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: 'Models' })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Change model' }));
  });

  it('catalogue: Tab does not close it, and focus stays inside', () => {
    render(<ComposerFooter />);
    const dialog = openCatalogue(openPicker());

    fireEvent.keyDown(within(dialog).getByRole('textbox', { name: 'Search models' }), {
      key: 'Tab',
    });

    expect(screen.getByRole('dialog', { name: 'Models' })).toBeInTheDocument();
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('catalogue: Tab cycles rail, chips, search and list, and wraps at the end', () => {
    render(<ComposerFooter />);
    const dialog = openCatalogue(openPicker());

    const rail = within(dialog).getAllByRole('tab');
    const chips = within(dialog)
      .getAllByRole('button')
      .filter((button) => button.hasAttribute('aria-pressed'));
    const rows = within(dialog).getAllByRole('option');
    expect(rail.length).toBeGreaterThan(0);
    expect(chips.length).toBeGreaterThan(0);
    expect(rows.length).toBeGreaterThan(0);

    const order = tabbables(dialog);
    expect(order).toContain(rail[0]);
    expect(order).toContain(chips[0]);
    expect(order).toContain(rows[0]);

    const last = order[order.length - 1]!;
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(order[0]);
  });

  it('catalogue: Shift+Tab from the first region wraps to the last', () => {
    render(<ComposerFooter />);
    const dialog = openCatalogue(openPicker());
    const order = tabbables(dialog);
    const first = order[0]!;
    first.focus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(order[order.length - 1]);
  });
});
