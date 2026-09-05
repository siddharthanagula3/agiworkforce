import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const depthFixtures = await vi.hoisted(async () => {
  const { listCanonicalModels, getReasoningDepthIndicator } = await import('@agiworkforce/types');
  const rated = listCanonicalModels()
    .map((model) => ({ model, indicator: getReasoningDepthIndicator(model.id) }))
    .filter((entry) => entry.indicator !== null)
    .map(({ model, indicator }) => ({
      id: model.id,
      name: model.name,
      provider: model.provider,
      filled: indicator!.filled,
      scale: indicator!.scale,
    }))
    .sort((a, b) => b.filled - a.filled);
  if (rated.length === 0) throw new Error('catalog exposes no model with a reasoningDots hint');
  const deepest = rated[0]!;
  const shallowest = rated[rated.length - 1]!;
  if (shallowest.filled >= shallowest.scale) {
    throw new Error('catalog exposes no partially filled reasoningDots hint');
  }
  const toPickerModel = (fixture: (typeof rated)[number]) => ({
    id: fixture.id,
    name: fixture.name,
    provider: fixture.provider,
    providerKey: fixture.provider,
    description: 'depth fixture',
  });
  return {
    deepest,
    shallowest,
    pickerModels: [toPickerModel(deepest), toPickerModel(shallowest)],
  };
});

vi.mock('@shared/stores/model-store', () => ({
  useModelStore: (selector: (state: unknown) => unknown) =>
    selector({
      selectedModelId: depthFixtures.deepest.id,
      setSelectedModelId: vi.fn(),
      getSelectedModel: () => depthFixtures.pickerModels[0],
    }),
  AVAILABLE_MODELS: depthFixtures.pickerModels,
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

vi.mock('../StyleSelector', () => ({
  StyleSelector: () => <div data-testid="style-selector" />,
}));

vi.mock('@agiworkforce/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@agiworkforce/ui')>()),
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) =>
    asChild ? <>{children}</> : <div>{children}</div>,
  PopoverContent: ({
    children,
    ...props
  }: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }) => (
    <div role="dialog" data-testid="popover-content" {...props}>
      {children}
    </div>
  ),
}));

vi.mock('zustand/middleware', async () => {
  const actual = await vi.importActual<typeof import('zustand/middleware')>('zustand/middleware');
  return {
    ...actual,
    persist: (config: (set: unknown) => unknown) => config,
  };
});

import { ComposerFooter } from '../ComposerFooter';

const filledDots = (indicator: HTMLElement) =>
  Array.from(indicator.children).filter((dot) => dot.className.includes('bg-foreground')).length;

describe('ComposerFooter · reasoning depth indicator', () => {
  it('renders the catalog reasoningDots hint on every rated model row', () => {
    render(<ComposerFooter />);

    for (const fixture of [depthFixtures.deepest, depthFixtures.shallowest]) {
      const indicator = screen.getByRole('img', {
        name: `Reasoning depth ${fixture.filled} of ${fixture.scale}`,
      });
      expect(indicator.childElementCount).toBe(fixture.scale);
      expect(filledDots(indicator)).toBe(fixture.filled);
    }
  });

  it('distinguishes a shallower model by filling fewer dots on the same scale', () => {
    render(<ComposerFooter />);

    const deep = screen.getByRole('img', {
      name: `Reasoning depth ${depthFixtures.deepest.filled} of ${depthFixtures.deepest.scale}`,
    });
    const shallow = screen.getByRole('img', {
      name: `Reasoning depth ${depthFixtures.shallowest.filled} of ${depthFixtures.shallowest.scale}`,
    });

    expect(deep.childElementCount).toBe(shallow.childElementCount);
    expect(filledDots(shallow)).toBeLessThan(filledDots(deep));
  });
});
