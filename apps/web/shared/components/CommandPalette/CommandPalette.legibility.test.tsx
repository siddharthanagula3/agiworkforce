import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { CommandPalette } from './CommandPalette';

const modelFixtureIds = vi.hoisted(() => ({
  primary: 'test-command-legibility-model-primary',
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/',
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'dark', setTheme: vi.fn() }),
}));

vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({ isLoaded: true, user: { publicMetadata: {} } }),
}));

vi.mock('@/shared/stores/model-store', () => ({
  AVAILABLE_MODELS: [
    {
      id: modelFixtureIds.primary,
      name: 'Fixture Primary Model',
      provider: 'Provider A',
      description: 'Primary command palette fixture model',
    },
  ],
  useModelStore: (
    selector: (state: { selectedModelId: string; setSelectedModelId: () => void }) => unknown,
  ) => selector({ selectedModelId: modelFixtureIds.primary, setSelectedModelId: vi.fn() }),
}));

vi.mock('@agiworkforce/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@agiworkforce/ui')>();
  return {
    ...actual,
    Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
      open ? <div data-testid="dialog">{children}</div> : null,
    DialogContent: ({ className, children }: { className?: string; children: React.ReactNode }) => (
      <div className={className}>{children}</div>
    ),
    DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
    DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  };
});

type Rgb = [number, number, number];

function hsl(h: number, s: number, l: number): Rgb {
  const S = s / 100;
  const L = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255)) as Rgb;
}

// Mirrors the :root (light) and .dark token blocks in app/globals.css. The
// palette is light-first there and the palette this component renders is
// entirely semantic, so every label has to clear AA under BOTH maps, a
// dark-only check is exactly how `text-white` on `bg-white/10` used to pass.
type ThemeName = 'light' | 'dark';

const THEME_TOKENS: Record<ThemeName, Record<string, Rgb>> = {
  light: {
    background: hsl(40, 23, 97),
    foreground: hsl(222.2, 84, 4.9),
    popover: hsl(0, 0, 100),
    'popover-foreground': hsl(222.2, 84, 4.9),
    muted: hsl(210, 40, 96.1),
    'muted-foreground': hsl(215.4, 16.3, 44),
    accent: hsl(210, 40, 96.1),
    'accent-foreground': hsl(222.2, 47.4, 11.2),
  },
  dark: {
    background: hsl(240, 14, 6.7),
    foreground: hsl(210, 40, 98),
    popover: hsl(240, 12, 9),
    'popover-foreground': hsl(210, 40, 98),
    muted: hsl(240, 10, 15),
    'muted-foreground': hsl(215, 20.2, 65.1),
    accent: hsl(240, 10, 15),
    'accent-foreground': hsl(210, 40, 98),
  },
};

function composite(over: Rgb, alpha: number, under: Rgb): Rgb {
  return [0, 1, 2].map((i) => over[i]! * alpha + under[i]! * (1 - alpha)) as Rgb;
}

function relativeLuminance([r, g, b]: Rgb): number {
  const channel = (value: number) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}

function classList(element: Element): string[] {
  return (element.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
}

function semanticToken(
  token: string,
  prefix: 'bg' | 'text',
  theme: ThemeName,
): { rgb: Rgb; alpha: number } | null {
  const match = new RegExp(`^${prefix}-([a-z-]+?)(?:/(\\d+))?$`).exec(token);
  if (!match) return null;
  const rgb = THEME_TOKENS[theme][match[1]!];
  if (!rgb) return null;
  return { rgb, alpha: match[2] ? Number(match[2]) / 100 : 1 };
}

function backgroundOf(element: Element, theme: ThemeName): Rgb {
  const chain: Element[] = [];
  for (let node: Element | null = element; node; node = node.parentElement) chain.push(node);

  let resolved = THEME_TOKENS[theme]['background']!;
  for (const node of chain.reverse()) {
    for (const token of classList(node)) {
      const bg = semanticToken(token, 'bg', theme);
      if (bg) resolved = composite(bg.rgb, bg.alpha, resolved);
    }
  }
  return resolved;
}

function foregroundOf(element: Element, theme: ThemeName): Rgb | null {
  for (let node: Element | null = element; node; node = node.parentElement) {
    for (const token of classList(node)) {
      const fg = semanticToken(token, 'text', theme);
      if (fg) return fg.rgb;
    }
  }
  return null;
}

function hasOwnText(element: Element): boolean {
  return Array.from(element.childNodes).some(
    (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim().length > 0,
  );
}

describe('CommandPalette legibility', () => {
  it.each(['light', 'dark'] as const)(
    'renders every visible label at WCAG AA contrast against its own background in %s theme',
    (theme) => {
      const { container } = render(<CommandPalette open onOpenChange={vi.fn()} />);

      const labels = Array.from(container.querySelectorAll('*'))
        .filter(hasOwnText)
        .filter((element) => !classList(element).includes('sr-only'));

      const resolved = labels.filter((element) => foregroundOf(element, theme) !== null);
      expect(resolved.length).toBeGreaterThan(0);

      const failures = resolved
        .map((element) => {
          const ratio = contrastRatio(foregroundOf(element, theme)!, backgroundOf(element, theme));
          return ratio < 4.5
            ? `${(element.textContent ?? '').trim().slice(0, 24)} @ ${ratio.toFixed(2)}:1`
            : null;
        })
        .filter((failure): failure is string => failure !== null);

      expect(failures).toEqual([]);
    },
  );

  it('paints every surface from a theme token rather than a dark-only literal', () => {
    const { container } = render(<CommandPalette open onOpenChange={vi.fn()} />);

    const themeBlind = Array.from(container.querySelectorAll('*'))
      .flatMap(classList)
      .filter((token) => /^(bg|text|border|divide)-(zinc|gray|white|black)(\/|-|$)/.test(token));

    expect(themeBlind).toEqual([]);
  });
});
