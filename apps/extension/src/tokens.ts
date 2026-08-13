import { agiExtensionCssVars, cssVarsToString } from '@agiworkforce/design-tokens';

/**
 * Emit one fixed palette for tests or deliberately fixed-theme consumers.
 * User-facing extension surfaces should normally use the automatic helper
 * below so they match Chrome's current colour scheme.
 */
export function getExtensionTokensCss(mode: 'dark' | 'light' = 'dark'): string {
  return `:root {\n${cssVarsToString(agiExtensionCssVars[mode])}\n}`;
}

/**
 * Emit both palettes, with the light set applied under `prefers-color-scheme:
 * light`, so the surface follows the user's system theme.
 *
 * The side panel and options page shipped `getExtensionTokensCss('dark')`
 * hardcoded even though a complete light set has always existed in the same
 * package — on a light-mode machine the panel was a dark slab beside light
 * browser chrome. Dark stays the default so a browser without the media query
 * lands on the previous appearance rather than an unstyled one.
 *
 * `selector` lets a shadow-DOM surface swap `:root` for `:host`.
 */
export function getExtensionTokensCssAuto(selector = ':root'): string {
  return [
    `${selector} {`,
    cssVarsToString(agiExtensionCssVars.dark),
    '}',
    '@media (prefers-color-scheme: light) {',
    `  ${selector} {`,
    cssVarsToString(agiExtensionCssVars.light),
    '  }',
    '}',
    '@media (forced-colors: active) {',
    `  ${selector} {`,
    '    --agi-ext-bg: Canvas;',
    '    --agi-ext-surface: Canvas;',
    '    --agi-ext-overlay: Canvas;',
    '    --agi-ext-hover: Highlight;',
    '    --agi-ext-text: CanvasText;',
    '    --agi-ext-text-muted: CanvasText;',
    '    --agi-ext-border: CanvasText;',
    '    --agi-ext-border-strong: CanvasText;',
    '    --agi-ext-accent: Highlight;',
    '    --agi-ext-accent-secondary: Highlight;',
    '    --agi-ext-focus: Highlight;',
    '    --agi-ext-brand: Highlight;',
    '    --agi-ext-brand-alt: Highlight;',
    '    --agi-ext-on-accent: HighlightText;',
    '    --agi-ext-shadow-panel: transparent;',
    '    --agi-ext-danger: CanvasText;',
    '    --agi-ext-danger-bg: Canvas;',
    '    --agi-ext-danger-border: CanvasText;',
    '    --agi-ext-danger-shadow: transparent;',
    '    --agi-ext-transparent-shadow: transparent;',
    '    --agi-ext-success: CanvasText;',
    '    --agi-ext-success-bg: Canvas;',
    '    --agi-ext-success-border: CanvasText;',
    '    --agi-ext-warning: CanvasText;',
    '    --agi-ext-warning-bg: Canvas;',
    '    --agi-ext-warning-border: CanvasText;',
    '    --agi-ext-info: CanvasText;',
    '    --agi-ext-modal-shadow: transparent;',
    '    --agi-ext-scrim: transparent;',
    '  }',
    '}',
  ].join('\n');
}
