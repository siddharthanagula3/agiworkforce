/**
 * Theme System Types
 *
 * Defines the shape of a theme definition used throughout AGI Workforce.
 * Colors are expressed as HSL value strings (e.g. "222.2 84% 4.9%")
 * matching the CSS custom property format used in globals.css.
 */

export interface ThemeColors {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  border: string;
  input: string;
  ring: string;
  /** Optional syntax highlighting token colors (CSS color strings) */
  syntax?: Record<string, string>;
}

export interface ThemeDefinition {
  id: string;
  name: string;
  author?: string;
  variant: 'dark' | 'light';
  colors: ThemeColors;
}
