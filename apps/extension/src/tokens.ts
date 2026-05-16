import { agiExtensionCssVars, cssVarsToString } from '@agiworkforce/design-tokens';

export function getExtensionTokensCss(mode: 'dark' | 'light' = 'dark'): string {
  return `:root {\n${cssVarsToString(agiExtensionCssVars[mode])}\n}`;
}
