export type ThemeMode = 'light' | 'dark' | 'system';

export const tokens = {
  colors: {
    bg: 'var(--chat-bg, #0a0a0a)',
    fg: 'var(--chat-fg, #fafafa)',
    border: 'var(--chat-border, #262626)',
    surfaceBase: 'var(--chat-surface-base, #111111)',
    surfaceHover: 'var(--chat-surface-hover, #1a1a1a)',
    textMuted: 'var(--chat-text-muted, #737373)',
    accentPrimary: 'var(--chat-accent-primary, #3b82f6)',
  },
  spacing: {
    sidebarWidth: 260,
    sidebarCollapsedWidth: 48,
    artifactPanelWidth: 420,
  },
  sidebar: {
    animationMs: 200,
  },
} as const;
