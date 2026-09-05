import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import React from 'react';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const catalogFixture = await vi.hoisted(async () => {
  const { listCanonicalModels } = await import('@agiworkforce/types');
  const model = listCanonicalModels().find(
    (entry) => entry.capabilities.vision && entry.capabilities.tools,
  );
  if (!model) throw new Error('catalog exposes no model with vision and tools');
  return { id: model.id, name: model.name, provider: model.provider };
});

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
    id: 'fixture-locked-model',
    name: 'Locked Fixture',
    provider: 'Google',
    providerKey: 'google',
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
  isModelAllowedForTier: (modelId: string) => modelId !== 'fixture-locked-model',
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

vi.mock('zustand/middleware', async () => {
  const actual = await vi.importActual<typeof import('zustand/middleware')>('zustand/middleware');
  return { ...actual, persist: (config: (set: unknown) => unknown) => config };
});

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

const moreModelsRow = (dialog: HTMLElement) =>
  within(dialog).getByRole('button', { name: /More models/ });

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
    expect(within(selected).getByText('Balanced for everyday work')).toBeInTheDocument();
    expect(selected.querySelector('svg.text-primary')).not.toBeNull();

    const other = within(dialog).getByRole('button', { name: 'Secondary Fixture' });
    expect(other).toHaveAttribute('aria-pressed', 'false');
    expect(other.querySelector('svg.text-primary')).toBeNull();
  });

  it('derives a guidance line when the registry has no description', () => {
    const dialog = mountAndOpen();
    const row = within(dialog).getByRole('button', { name: 'Secondary Fixture' });
    expect(within(row).getByText('Anthropic')).toBeInTheDocument();
  });

  it('renders catalog capabilities as glyphs with a text description, not text pills', () => {
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
    expect(row.querySelectorAll('svg').length).toBeGreaterThanOrEqual(2);
  });

  it('keeps the More models row as a fixed-height expander with the locked roster behind it', () => {
    const dialog = mountAndOpen();
    const more = moreModelsRow(dialog);
    expect(more).toHaveAttribute('data-picker-row');
    expect(more.className).toContain('h-12');
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(more).toHaveTextContent('1');
    expect(
      within(dialog).queryByRole('button', { name: /Locked Fixture/ }),
    ).not.toBeInTheDocument();

    fireEvent.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    const locked = within(dialog).getByRole('button', { name: /Locked Fixture/ });
    expect(locked).toHaveTextContent('Upgrade');
    expect(locked.className).toContain('h-12');
  });

  it('hides the search box for a short roster and shows it first for a long one', () => {
    render(<ComposerFooter />);
    let dialog = openPicker();
    expect(
      within(dialog).queryByRole('textbox', { name: 'Search models' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Change model' }));

    useRoster([
      ...BASE_MODELS,
      ...Array.from({ length: 6 }, (_, index) => ({
        id: `fixture-extra-${index}`,
        name: `Extra Fixture ${index}`,
        provider: 'OpenAI',
        providerKey: 'openai',
        description: 'Padding',
      })),
    ]);
    dialog = openPicker();
    const search = within(dialog).getByRole('textbox', { name: 'Search models' });
    expect(search).toHaveAttribute('data-picker-row');
    const firstRow = modelRows(dialog)[0]!;
    expect(
      search.compareDocumentPosition(firstRow) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe('ComposerFooter · picker search reset', () => {
  beforeEach(() => {
    sel.id = 'fixture-primary-model';
    useRoster([
      ...BASE_MODELS,
      ...Array.from({ length: 6 }, (_, index) => ({
        id: `fixture-extra-${index}`,
        name: `Extra Fixture ${index}`,
        provider: 'OpenAI',
        providerKey: 'openai',
        description: 'Padding',
      })),
    ]);
  });

  it('clears the search when a row is picked so the next open shows the full roster', () => {
    render(<ComposerFooter />);
    let dialog = openPicker();
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Search models' }), {
      target: { value: 'Secondary' },
    });
    expect(modelRows(dialog)).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Secondary Fixture' }));
    expect(screen.queryByRole('dialog', { name: 'Models' })).not.toBeInTheDocument();

    dialog = openPicker();
    expect(within(dialog).getByRole('textbox', { name: 'Search models' })).toHaveValue('');
    expect(modelRows(dialog).length).toBeGreaterThan(1);
    expect(moreModelsRow(dialog)).toBeInTheDocument();
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
    expect(document.activeElement).toBe(moreModelsRow(dialog));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(rows[1]);
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(document.activeElement).toBe(moreModelsRow(dialog));
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(document.activeElement).toBe(rows[0]);

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Models' })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Change model' }));
  });

  it('skips disabled rows when walking with the arrow keys', () => {
    useRoster([BASE_MODELS[0]!, BASE_MODELS[1]!, COMING_SOON_MODEL, BASE_MODELS[2]!]);
    const dialog = mountAndOpen();
    fireEvent.click(moreModelsRow(dialog));
    const comingSoon = within(dialog).getByRole('button', { name: /Coming Soon Fixture/ });
    expect(comingSoon).toBeDisabled();

    const more = moreModelsRow(dialog);
    more.focus();
    fireEvent.keyDown(more, { key: 'ArrowDown' });
    expect(document.activeElement).not.toBe(comingSoon);
    expect(document.activeElement).toBe(
      within(dialog).getByRole('button', { name: /Locked Fixture/ }),
    );
  });
});
