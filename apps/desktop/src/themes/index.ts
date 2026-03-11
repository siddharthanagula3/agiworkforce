/**
 * Theme Registry
 *
 * Central registry for built-in and custom themes.
 * Themes are applied by setting CSS custom properties on :root,
 * mirroring the HSL variable convention in globals.css.
 */

import type { ThemeDefinition } from './types';
import { catppuccinMocha } from './presets/catppuccin-mocha';
import { catppuccinLatte } from './presets/catppuccin-latte';
import { dracula } from './presets/dracula';
import { nord } from './presets/nord';
import { tokyoNight } from './presets/tokyo-night';
import { gruvboxDark } from './presets/gruvbox-dark';
import { gruvboxLight } from './presets/gruvbox-light';
import { oneDark } from './presets/one-dark';
import { solarizedDark } from './presets/solarized-dark';
import { solarizedLight } from './presets/solarized-light';
import { monokai } from './presets/monokai';
import { githubDark } from './presets/github-dark';
import { githubLight } from './presets/github-light';
import { rosePine } from './presets/rose-pine';
import { kanagawa } from './presets/kanagawa';

export type { ThemeDefinition } from './types';

const CUSTOM_THEMES_KEY = 'agi-custom-themes';

export const BUILTIN_THEMES: ThemeDefinition[] = [
  catppuccinMocha,
  catppuccinLatte,
  dracula,
  nord,
  tokyoNight,
  gruvboxDark,
  gruvboxLight,
  oneDark,
  solarizedDark,
  solarizedLight,
  monokai,
  githubDark,
  githubLight,
  rosePine,
  kanagawa,
];

export function getThemeById(id: string): ThemeDefinition | undefined {
  return [...BUILTIN_THEMES, ...getCustomThemes()].find((t) => t.id === id);
}

/**
 * Apply a theme definition to the document root via CSS custom properties.
 * The variant class (dark/light) is also toggled so Tailwind's dark: utilities work.
 */
export function applyTheme(theme: ThemeDefinition): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const { colors, variant } = theme;

  // Toggle Tailwind dark class based on variant
  root.classList.remove('dark', 'light');
  root.classList.add(variant);

  // Apply all CSS custom properties
  root.style.setProperty('--background', colors.background);
  root.style.setProperty('--foreground', colors.foreground);
  root.style.setProperty('--card', colors.card);
  root.style.setProperty('--card-foreground', colors.cardForeground);
  root.style.setProperty('--popover', colors.popover);
  root.style.setProperty('--popover-foreground', colors.popoverForeground);
  root.style.setProperty('--primary', colors.primary);
  root.style.setProperty('--primary-foreground', colors.primaryForeground);
  root.style.setProperty('--secondary', colors.secondary);
  root.style.setProperty('--secondary-foreground', colors.secondaryForeground);
  root.style.setProperty('--muted', colors.muted);
  root.style.setProperty('--muted-foreground', colors.mutedForeground);
  root.style.setProperty('--accent', colors.accent);
  root.style.setProperty('--accent-foreground', colors.accentForeground);
  root.style.setProperty('--destructive', colors.destructive);
  root.style.setProperty('--destructive-foreground', colors.destructiveForeground);
  root.style.setProperty('--border', colors.border);
  root.style.setProperty('--input', colors.input);
  root.style.setProperty('--ring', colors.ring);

  // Store the active theme id on the root for reference
  root.setAttribute('data-theme-id', theme.id);
}

/**
 * Remove all inline CSS custom properties set by applyTheme,
 * falling back to the stylesheet defaults.
 */
export function clearAppliedTheme(): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const properties = [
    '--background',
    '--foreground',
    '--card',
    '--card-foreground',
    '--popover',
    '--popover-foreground',
    '--primary',
    '--primary-foreground',
    '--secondary',
    '--secondary-foreground',
    '--muted',
    '--muted-foreground',
    '--accent',
    '--accent-foreground',
    '--destructive',
    '--destructive-foreground',
    '--border',
    '--input',
    '--ring',
  ];

  for (const prop of properties) {
    root.style.removeProperty(prop);
  }

  root.removeAttribute('data-theme-id');
}

export function getCustomThemes(): ThemeDefinition[] {
  if (typeof localStorage === 'undefined') return [];

  try {
    const raw = localStorage.getItem(CUSTOM_THEMES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as ThemeDefinition[]) : [];
  } catch {
    return [];
  }
}

export function saveCustomTheme(theme: ThemeDefinition): void {
  if (typeof localStorage === 'undefined') return;

  const existing = getCustomThemes().filter((t) => t.id !== theme.id);
  localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify([...existing, theme]));
}

export function deleteCustomTheme(id: string): void {
  if (typeof localStorage === 'undefined') return;

  const remaining = getCustomThemes().filter((t) => t.id !== id);
  localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(remaining));
}
