import { agiExtensionCssVars, cssVarsToString } from '@agiworkforce/design-tokens';

/**
 * Emit one fixed palette. Use for surfaces that must NOT follow the OS theme —
 * the in-page panel is injected into arbitrary web pages and pins itself light
 * so it stays legible against typical page backgrounds.
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
  ].join('\n');
}
