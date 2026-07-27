export type AgiThemeMode = 'light' | 'dark';
export type CssVariableMap = Record<`--${string}`, string>;

export const agiPalette = {
  light: {
    surface: {
      base: '#faf9f7',
      raised: '#ffffff',
      overlay: '#ffffff',
      hover: '#f0eeeb',
      sidebar: '#f5f4f1',
      input: '#ffffff',
      code: '#f6f8fa',
    },
    text: {
      primary: '#1a1915',
      secondary: '#6b6560',
      muted: '#8b8680',
      placeholder: '#9b9590',
    },
    border: {
      subtle: 'rgba(26, 25, 21, 0.08)',
      strong: 'rgba(26, 25, 21, 0.15)',
    },
    accent: {
      primary: '#21808d',
      secondary: '#da7756',
      secondarySoft: '#f5c1a9',
    },
    state: {
      danger: '#dc2626',
      info: '#2563eb',
      success: '#16a34a',
      warning: '#d97706',
    },
  },
  dark: {
    surface: {
      base: '#1a1915',
      raised: '#242220',
      overlay: '#2e2b28',
      hover: '#363330',
      sidebar: '#151410',
      input: '#242220',
      code: '#11100d',
    },
    text: {
      primary: '#e8e4db',
      secondary: '#8b8680',
      muted: '#5c5955',
      placeholder: '#6b6560',
    },
    border: {
      subtle: 'rgba(255, 235, 205, 0.08)',
      strong: 'rgba(255, 235, 205, 0.15)',
    },
    accent: {
      primary: '#21808d',
      secondary: '#da7756',
      secondarySoft: '#f5c1a9',
    },
    state: {
      danger: '#ef4444',
      info: '#3b82f6',
      success: '#22c55e',
      warning: '#f59e0b',
    },
  },
} as const;

/**
 * ChatGPT-leaning "cool" palette. Founder decision 2026-07-27: desktop and both
 * extensions follow ChatGPT colors (apps/web's chat surface already did, via
 * `[data-chat-theme='cool']`).
 *
 * Values are the same ones `chat.css` already ships under that attribute, so
 * the two stay in lockstep and the WCAG work recorded there (AUDIT-FIX GOV-34)
 * carries over instead of being re-derived. Do not drift one without the other.
 *
 * `state.warning` in dark is the one addition: #ef8c57 sampled from the
 * "Full access" permission chip in the reference capture, which is exactly what
 * our own permission chips render.
 */
export const agiCoolPalette = {
  light: {
    surface: {
      base: '#ffffff',
      raised: '#ffffff',
      overlay: '#ffffff',
      hover: '#f0f0f0',
      sidebar: '#f9f9f9',
      input: '#ffffff',
      code: '#f7f7f8',
    },
    text: {
      primary: '#0d0d0d',
      secondary: '#5d5d5d',
      muted: '#6a6a6a',
      placeholder: '#6a6a6a',
    },
    border: {
      subtle: 'rgba(0, 0, 0, 0.1)',
      strong: 'rgba(0, 0, 0, 0.16)',
    },
    accent: {
      primary: '#0b84ff',
      secondary: '#0a6ed1',
      secondarySoft: 'rgba(11, 132, 255, 0.12)',
    },
    state: {
      danger: '#dc2626',
      info: '#0b84ff',
      success: '#16a34a',
      warning: '#b45309',
    },
  },
  dark: {
    surface: {
      base: '#212121',
      raised: '#2f2f2f',
      overlay: '#2a2a2d',
      hover: '#2f2f2f',
      sidebar: '#171717',
      input: '#2f2f2f',
      code: '#1e1e1e',
    },
    text: {
      primary: '#ececec',
      secondary: '#b4b4b4',
      muted: '#999999',
      placeholder: '#999999',
    },
    border: {
      subtle: 'rgba(255, 255, 255, 0.1)',
      strong: 'rgba(255, 255, 255, 0.16)',
    },
    accent: {
      primary: '#0b84ff',
      secondary: '#0a6ed1',
      secondarySoft: 'rgba(11, 132, 255, 0.16)',
    },
    state: {
      danger: '#ef4444',
      info: '#0b84ff',
      success: '#22c55e',
      warning: '#ef8c57',
    },
  },
} as const;

export const agiRadii = {
  sm: '6px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  '2xl': '24px',
} as const;

/**
 * Font stacks per docs/design/design-spec-2026-05-15.md §2. Each value is a
 * complete CSS `font-family` string and can be applied directly via
 * `style.fontFamily`. Mirrored into `agiChatCssVars` as `--chat-font-*` for
 * stylesheet consumers.
 */
export const agiTypography = {
  sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  serif: "'IBM Plex Serif', Georgia, 'Times New Roman', serif",
  display: "'Crimson Pro', 'Inter Display', 'IBM Plex Serif', Georgia, 'Times New Roman', serif",
  mono: "'JetBrains Mono', 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace",
} as const;

/**
 * Shadow ramps shared across surfaces. Values picked to read clearly on the
 * warm-off-white canvas (light mode) and the warm-charcoal canvas (dark mode)
 * without producing hard cut-outs on either.
 */
export const agiShadows = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.04)',
  md: '0 4px 16px rgba(0, 0, 0, 0.12)',
  lg: '0 12px 32px rgba(0, 0, 0, 0.18)',
} as const;

export const agiChatCssVars = {
  light: {
    '--chat-bg': agiPalette.light.surface.base,
    '--chat-fg': agiPalette.light.text.primary,
    '--chat-surface-base': agiPalette.light.surface.base,
    '--chat-surface-elevated': agiPalette.light.surface.raised,
    '--chat-surface-overlay': agiPalette.light.surface.overlay,
    '--chat-surface-hover': agiPalette.light.surface.hover,
    '--chat-sidebar-bg': agiPalette.light.surface.sidebar,
    '--chat-input-bg': agiPalette.light.surface.input,
    '--chat-code-bg': agiPalette.light.surface.code,
    '--chat-text-primary': agiPalette.light.text.primary,
    '--chat-text-secondary': agiPalette.light.text.secondary,
    '--chat-text-muted': agiPalette.light.text.muted,
    '--chat-text-placeholder': agiPalette.light.text.placeholder,
    '--chat-border': agiPalette.light.border.subtle,
    '--chat-border-strong': agiPalette.light.border.strong,
    '--chat-border-subtle': agiPalette.light.border.subtle,
    '--chat-accent-primary': agiPalette.light.accent.secondary,
    '--chat-accent-secondary': agiPalette.light.accent.primary,
    '--chat-user-bubble-bg': agiPalette.light.surface.hover,
    '--chat-thinking-text': agiPalette.light.text.secondary,
    '--chat-thinking-line': agiPalette.light.border.subtle,
    '--chat-badge-result': agiPalette.light.state.success,
    '--chat-badge-neutral': agiPalette.light.text.muted,
    '--chat-destructive': agiPalette.light.state.danger,
    '--chat-info': agiPalette.light.state.info,
    '--chat-success': agiPalette.light.state.success,
    '--chat-warning': agiPalette.light.state.warning,
    '--chat-radius-sm': agiRadii.sm,
    '--chat-radius-md': agiRadii.md,
    '--chat-radius-lg': agiRadii.lg,
    '--chat-radius-xl': agiRadii.xl,
    '--chat-radius-2xl': agiRadii['2xl'],
    '--chat-font-sans': agiTypography.sans,
    '--chat-font-serif': agiTypography.serif,
    '--chat-font-display': agiTypography.display,
    '--chat-font-mono': agiTypography.mono,
    '--chat-shadow-sm': agiShadows.sm,
    '--chat-shadow-md': agiShadows.md,
    '--chat-shadow-lg': agiShadows.lg,
  },
  dark: {
    '--chat-bg': agiPalette.dark.surface.base,
    '--chat-fg': agiPalette.dark.text.primary,
    '--chat-surface-base': agiPalette.dark.surface.base,
    '--chat-surface-elevated': agiPalette.dark.surface.raised,
    '--chat-surface-overlay': agiPalette.dark.surface.overlay,
    '--chat-surface-hover': agiPalette.dark.surface.hover,
    '--chat-sidebar-bg': agiPalette.dark.surface.sidebar,
    '--chat-input-bg': agiPalette.dark.surface.input,
    '--chat-code-bg': agiPalette.dark.surface.code,
    '--chat-text-primary': agiPalette.dark.text.primary,
    '--chat-text-secondary': agiPalette.dark.text.secondary,
    '--chat-text-muted': agiPalette.dark.text.muted,
    '--chat-text-placeholder': agiPalette.dark.text.placeholder,
    '--chat-border': agiPalette.dark.border.subtle,
    '--chat-border-strong': agiPalette.dark.border.strong,
    '--chat-border-subtle': agiPalette.dark.border.subtle,
    '--chat-accent-primary': agiPalette.dark.accent.secondary,
    '--chat-accent-secondary': agiPalette.dark.accent.primary,
    '--chat-user-bubble-bg': '#2a2724',
    '--chat-thinking-text': agiPalette.dark.text.secondary,
    '--chat-thinking-line': agiPalette.dark.border.subtle,
    '--chat-badge-result': agiPalette.dark.state.success,
    '--chat-badge-neutral': agiPalette.dark.text.placeholder,
    '--chat-destructive': agiPalette.dark.state.danger,
    '--chat-info': agiPalette.dark.state.info,
    '--chat-success': agiPalette.dark.state.success,
    '--chat-warning': agiPalette.dark.state.warning,
    '--chat-radius-sm': agiRadii.sm,
    '--chat-radius-md': agiRadii.md,
    '--chat-radius-lg': agiRadii.lg,
    '--chat-radius-xl': agiRadii.xl,
    '--chat-radius-2xl': agiRadii['2xl'],
    '--chat-font-sans': agiTypography.sans,
    '--chat-font-serif': agiTypography.serif,
    '--chat-font-display': agiTypography.display,
    '--chat-font-mono': agiTypography.mono,
    '--chat-shadow-sm': '0 1px 2px rgba(0, 0, 0, 0.32)',
    '--chat-shadow-md': '0 4px 16px rgba(0, 0, 0, 0.48)',
    '--chat-shadow-lg': '0 12px 32px rgba(0, 0, 0, 0.56)',
  },
} as const satisfies Record<AgiThemeMode, CssVariableMap>;

export const agiNativeColors = {
  light: {
    terraCotta: agiPalette.light.accent.secondary,
    teal: agiPalette.light.accent.primary,
    warmPeach: agiPalette.light.accent.secondarySoft,
    background: agiPalette.light.surface.base,
    surfaceBase: agiPalette.light.surface.base,
    surfaceElevated: agiPalette.light.surface.raised,
    surfaceOverlay: agiPalette.light.surface.overlay,
    surfaceHover: agiPalette.light.surface.hover,
    textPrimary: agiPalette.light.text.primary,
    textSecondary: 'rgba(26, 25, 21, 0.75)',
    textMuted: 'rgba(26, 25, 21, 0.5)',
    border: agiPalette.light.border.subtle,
    borderLight: 'rgba(26, 25, 21, 0.06)',
    charcoal900: '#f0f0f0',
    charcoal800: '#e5e5e5',
    charcoal700: '#d4d4d4',
    agentThinking: '#a855f7',
    agentActive: '#3b82f6',
    agentSuccess: '#10b981',
    agentError: '#ef4444',
    agentWarning: '#f59e0b',
    white: '#ffffff',
    black: '#000000',
    transparent: 'transparent',
    scrim: 'rgba(0, 0, 0, 0.55)',
  },
  dark: {
    terraCotta: agiPalette.dark.accent.secondary,
    teal: agiPalette.dark.accent.primary,
    warmPeach: agiPalette.dark.accent.secondarySoft,
    background: agiPalette.dark.surface.base,
    surfaceBase: agiPalette.dark.surface.base,
    surfaceElevated: agiPalette.dark.surface.raised,
    surfaceOverlay: agiPalette.dark.surface.overlay,
    surfaceHover: agiPalette.dark.surface.hover,
    textPrimary: agiPalette.dark.text.primary,
    textSecondary: 'rgba(232, 228, 219, 0.75)',
    textMuted: 'rgba(232, 228, 219, 0.5)',
    border: agiPalette.dark.border.subtle,
    borderLight: 'rgba(255, 235, 205, 0.06)',
    charcoal900: '#1f2121',
    charcoal800: '#2a2c2c',
    charcoal700: '#363838',
    agentThinking: '#a855f7',
    agentActive: '#3b82f6',
    agentSuccess: '#10b981',
    agentError: '#ef4444',
    agentWarning: '#f59e0b',
    white: '#ffffff',
    black: '#000000',
    transparent: 'transparent',
    scrim: 'rgba(0, 0, 0, 0.55)',
  },
} as const;

/**
 * Chrome extension surface. Uses {@link agiCoolPalette} — see the founder
 * decision recorded there; the panel sits beside ChatGPT-colored browser chrome
 * and previously shipped the warm Claude ramp.
 */
export const agiExtensionCssVars = {
  dark: {
    '--agi-ext-bg': agiCoolPalette.dark.surface.base,
    '--agi-ext-surface': agiCoolPalette.dark.surface.raised,
    '--agi-ext-overlay': agiCoolPalette.dark.surface.overlay,
    '--agi-ext-hover': agiCoolPalette.dark.surface.hover,
    '--agi-ext-text': agiCoolPalette.dark.text.primary,
    '--agi-ext-text-muted': agiCoolPalette.dark.text.secondary,
    '--agi-ext-border': agiCoolPalette.dark.border.subtle,
    '--agi-ext-border-strong': agiCoolPalette.dark.border.strong,
    '--agi-ext-accent': agiCoolPalette.dark.accent.primary,
    '--agi-ext-accent-secondary': agiCoolPalette.dark.accent.secondary,
    '--agi-ext-focus': agiCoolPalette.dark.accent.primary,
    // Brand identity, deliberately NOT part of the cool ramp. The chrome
    // (surfaces, text, borders, buttons) follows ChatGPT; the AGI mark keeps
    // its own colors, the same way ChatGPT and Claude each keep their logo
    // against neutral UI. Mirrors packages/ui/ui/src/AgiMark.tsx.
    '--agi-ext-brand': agiPalette.dark.accent.secondary,
    '--agi-ext-brand-alt': agiPalette.dark.accent.primary,
    '--agi-ext-on-accent': '#ffffff',
    '--agi-ext-shadow-panel': 'rgba(0, 0, 0, 0.12)',
    '--agi-ext-danger': agiCoolPalette.dark.state.danger,
    '--agi-ext-danger-bg': 'rgba(239, 68, 68, 0.12)',
    '--agi-ext-danger-border': 'rgba(239, 68, 68, 0.3)',
    '--agi-ext-danger-shadow': 'rgba(220, 38, 38, 0.4)',
    '--agi-ext-transparent-shadow': 'rgba(220, 38, 38, 0)',
    '--agi-ext-success': agiCoolPalette.dark.state.success,
    '--agi-ext-success-bg': 'rgba(34, 197, 94, 0.12)',
    '--agi-ext-success-border': 'rgba(34, 197, 94, 0.32)',
    '--agi-ext-warning': agiCoolPalette.dark.state.warning,
    '--agi-ext-warning-bg': 'rgba(239, 140, 87, 0.12)',
    '--agi-ext-warning-border': 'rgba(239, 140, 87, 0.32)',
    '--agi-ext-info': agiCoolPalette.dark.state.info,
    '--agi-ext-modal-shadow': 'rgba(0, 0, 0, 0.5)',
    '--agi-ext-scrim': 'rgba(0, 0, 0, 0.6)',
  },
  light: {
    '--agi-ext-bg': agiCoolPalette.light.surface.base,
    '--agi-ext-surface': agiCoolPalette.light.surface.raised,
    '--agi-ext-overlay': agiCoolPalette.light.surface.overlay,
    '--agi-ext-hover': agiCoolPalette.light.surface.hover,
    '--agi-ext-text': agiCoolPalette.light.text.primary,
    '--agi-ext-text-muted': agiCoolPalette.light.text.secondary,
    '--agi-ext-border': agiCoolPalette.light.border.subtle,
    '--agi-ext-border-strong': agiCoolPalette.light.border.strong,
    '--agi-ext-accent': agiCoolPalette.light.accent.primary,
    '--agi-ext-accent-secondary': agiCoolPalette.light.accent.secondary,
    '--agi-ext-focus': agiCoolPalette.light.accent.primary,
    // See the dark block: brand identity stays off the cool ramp.
    '--agi-ext-brand': agiPalette.light.accent.secondary,
    '--agi-ext-brand-alt': agiPalette.light.accent.primary,
    '--agi-ext-on-accent': '#ffffff',
    '--agi-ext-shadow-panel': 'rgba(0, 0, 0, 0.12)',
    '--agi-ext-danger': agiCoolPalette.light.state.danger,
    '--agi-ext-danger-bg': 'rgba(220, 38, 38, 0.08)',
    '--agi-ext-danger-border': 'rgba(220, 38, 38, 0.24)',
    '--agi-ext-danger-shadow': 'rgba(220, 38, 38, 0.3)',
    '--agi-ext-transparent-shadow': 'rgba(220, 38, 38, 0)',
    '--agi-ext-success': agiCoolPalette.light.state.success,
    '--agi-ext-success-bg': 'rgba(22, 163, 74, 0.08)',
    '--agi-ext-success-border': 'rgba(22, 163, 74, 0.24)',
    '--agi-ext-warning': agiCoolPalette.light.state.warning,
    '--agi-ext-warning-bg': 'rgba(180, 83, 9, 0.08)',
    '--agi-ext-warning-border': 'rgba(180, 83, 9, 0.24)',
    '--agi-ext-info': agiCoolPalette.light.state.info,
    '--agi-ext-modal-shadow': 'rgba(0, 0, 0, 0.32)',
    '--agi-ext-scrim': 'rgba(0, 0, 0, 0.45)',
  },
} as const satisfies Record<AgiThemeMode, CssVariableMap>;

export const agiVsCodeCssVars = {
  // Panel palette. Fixed (not theme-derived) so the panel looks the same across
  // VS Code + Cursor + Windsurf + Antigravity.
  //
  // Founder decision 2026-07-27 replaced the Linear-style indigo set approved
  // 2026-06-13 (#09090b / #5e6ad2) with {@link agiCoolPalette}, so this panel,
  // the Chrome panel and desktop now share one ChatGPT-leaning ramp instead of
  // three different ones. The diff tokens below stay theme-derived — they must
  // agree with the host editor's own diff colors, not with our brand.
  '--agi-vscode-bg': agiCoolPalette.dark.surface.base,
  '--agi-vscode-surface': agiCoolPalette.dark.surface.sidebar,
  '--agi-vscode-overlay': agiCoolPalette.dark.surface.overlay,
  '--agi-vscode-text': agiCoolPalette.dark.text.primary,
  '--agi-vscode-text-muted': agiCoolPalette.dark.text.secondary,
  '--agi-vscode-border': agiCoolPalette.dark.border.strong,
  '--agi-vscode-button': agiCoolPalette.dark.accent.primary,
  '--agi-vscode-button-text': '#ffffff',
  '--agi-vscode-focus': agiCoolPalette.dark.accent.primary,
  '--agi-vscode-hover': agiCoolPalette.dark.surface.hover,
  '--agi-vscode-terra': agiCoolPalette.dark.accent.secondary,
  '--agi-vscode-success': agiCoolPalette.dark.state.success,
  '--agi-vscode-warning': agiCoolPalette.dark.state.warning,
  '--agi-vscode-warning-bg': 'rgba(239, 140, 87, 0.12)',
  '--agi-vscode-warning-border': 'rgba(239, 140, 87, 0.32)',
  '--agi-vscode-danger': 'var(--vscode-errorForeground, #ef4444)',
  '--agi-vscode-danger-bg': 'rgba(239, 68, 68, 0.12)',
  '--agi-vscode-danger-border': 'rgba(239, 68, 68, 0.3)',
  '--agi-vscode-diff-added-bg':
    'var(--vscode-diffEditor-insertedLineBackground, rgba(76, 175, 80, 0.08))',
  '--agi-vscode-diff-removed-bg':
    'var(--vscode-diffEditor-removedLineBackground, rgba(244, 67, 54, 0.08))',
  '--agi-vscode-diff-modified-bg': 'rgba(255, 152, 0, 0.06)',
  '--agi-vscode-diff-added-gutter': 'var(--vscode-diffEditor-insertedTextBorder, #4caf50)',
  '--agi-vscode-diff-removed-gutter': 'var(--vscode-diffEditor-removedTextBorder, #f44336)',
  '--agi-vscode-diff-modified-gutter': '#ff9800',
} as const satisfies CssVariableMap;

export function cssVarsToString(vars: CssVariableMap): string {
  return Object.entries(vars)
    .map(([name, value]) => `${name}: ${value};`)
    .join('\n');
}
