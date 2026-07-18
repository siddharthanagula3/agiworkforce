import {
  Settings2,
  CreditCard,
  UserRound,
  Shield,
  Server,
  Zap,
  BookOpen,
  Plug,
  Puzzle,
  Brain,
  Bell,
  Mic,
  Gauge,
  Blocks,
  Terminal,
  Code2,
  Globe,
  Lock,
  Clock3,
  type LucideIcon,
} from 'lucide-react';

/**
 * Canonical settings navigation — the single source of truth for the grouped,
 * icon'd settings nav shared by the desktop Settings modal and the web settings
 * page. Pure config (no IO / no store): each surface maps `key` to its own
 * routing (desktop tab id, web route href) and renders its own list.
 *
 * Source of truth: apps/desktop/src/features/settings/SettingsPanel.tsx
 * (SETTINGS_NAV + NAV_GROUPS). Keep the desktop config importing from here so
 * the two surfaces cannot drift.
 */

export type SettingsNavKey =
  | 'general'
  | 'account'
  | 'billing'
  | 'usage'
  | 'appearance'
  | 'privacy'
  | 'models-keys'
  | 'capabilities'
  | 'agents'
  | 'connectors'
  | 'agi-code'
  | 'agi-in-chrome'
  | 'plugins'
  | 'memory'
  | 'notifications'
  | 'voice'
  | 'extensions'
  | 'developer'
  // Web-only sections (not part of the desktop SETTINGS_NAV, which drives the
  // desktop panel renderer — see apps/desktop settings-ia contract test).
  | 'security'
  | 'time-focus'
  | 'skills';

export interface SettingsNavEntry {
  key: SettingsNavKey;
  label: string;
  icon: LucideIcon;
  /**
   * Extra search aliases so settings search matches common terms that differ
   * from the visible label — e.g. "theme"/"dark"/"light" resolve to the
   * Personalization tab, which also houses the Appearance/Themes section.
   * Without these, searching the obvious term ("theme") returns no results.
   */
  keywords?: string[];
}

/** Flat list of every settings entry (key/label/icon), in canonical order. */
export const SETTINGS_NAV: SettingsNavEntry[] = [
  {
    key: 'general',
    label: 'General',
    icon: Settings2,
    keywords: ['mode', 'keybindings', 'shortcuts'],
  },
  {
    key: 'account',
    label: 'Account',
    icon: CreditCard,
    keywords: ['billing', 'subscription', 'plan'],
  },
  {
    key: 'billing',
    label: 'Billing',
    icon: CreditCard,
    keywords: ['subscription', 'plan', 'invoice', 'payment', 'stripe', 'portal'],
  },
  {
    key: 'usage',
    label: 'Usage',
    icon: Gauge,
    keywords: ['tokens', 'budget', 'cost', 'limits', 'spend'],
  },
  {
    key: 'appearance',
    label: 'Personalization',
    icon: UserRound,
    keywords: [
      'theme',
      'themes',
      'appearance',
      'dark',
      'light',
      'color',
      'colour',
      'font',
      'accessibility',
      'dyslexic',
      'custom instructions',
    ],
  },
  { key: 'privacy', label: 'Privacy', icon: Shield, keywords: ['data', 'telemetry', 'analytics'] },
  {
    key: 'models-keys',
    label: 'Models & Keys',
    icon: Server,
    keywords: ['api', 'api key', 'byok', 'provider', 'ollama', 'openai', 'anthropic'],
  },
  {
    key: 'capabilities',
    label: 'Capabilities',
    icon: BookOpen,
    keywords: ['skills', 'computer use', 'tool access', 'permissions', 'code execution'],
  },
  { key: 'agents', label: 'Agents', icon: Zap },
  { key: 'connectors', label: 'Connectors', icon: Plug, keywords: ['mcp', 'integration'] },
  {
    key: 'agi-code',
    label: 'AGI Code',
    icon: Code2,
    keywords: ['cli', 'claude.md', 'agents.md', 'instructions', 'code agent', 'vs code'],
  },
  {
    key: 'agi-in-chrome',
    label: 'AGI in Chrome',
    icon: Globe,
    keywords: ['browser', 'extension', 'bridge', 'native messaging', 'pairing'],
  },
  { key: 'plugins', label: 'Plugins', icon: Puzzle },
  { key: 'memory', label: 'Memory', icon: Brain },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'voice', label: 'Voice', icon: Mic, keywords: ['speech', 'tts', 'microphone', 'audio'] },
  {
    key: 'extensions',
    label: 'Extensions',
    icon: Blocks,
    keywords: ['mcp extension', 'install', 'uninstall', 'enable', 'disable'],
  },
  {
    key: 'developer',
    label: 'Developer',
    icon: Terminal,
    keywords: ['config', 'dotfile', 'config.toml', 'logs', 'advanced', 'agent execution'],
  },
];

export interface SettingsNavGroup {
  /** Optional section heading (omitted for the first/default group). */
  label?: string;
  /** Keys referencing entries in SETTINGS_NAV. */
  keys: SettingsNavKey[];
}

/** Grouped navigation — the section structure both surfaces render. */
export const SETTINGS_NAV_GROUPS: SettingsNavGroup[] = [
  {
    keys: [
      'general',
      'account',
      'billing',
      'usage',
      'appearance',
      'privacy',
      'models-keys',
      'capabilities',
    ],
  },
  {
    label: 'Tools',
    keys: ['connectors', 'agi-code', 'agi-in-chrome', 'plugins', 'agents', 'memory'],
  },
  { label: 'Desktop app', keys: ['notifications', 'voice', 'extensions'] },
  { label: 'Advanced', keys: ['developer'] },
];

// ---------------------------------------------------------------------------
// Web projection — grouped nav rendered by the shared SettingsModal shell.
// ---------------------------------------------------------------------------

/**
 * A resolved nav entry (key + label + icon) — the shape the shared shell
 * renders directly, so a surface can inject its own groups without the shell
 * needing to know about SETTINGS_NAV lookups.
 */
export interface SettingsNavItem {
  key: SettingsNavKey;
  label: string;
  icon: LucideIcon;
}

/** A rendered group: optional heading + its items, in order. */
export interface SettingsNavGroupResolved {
  label?: string;
  items: SettingsNavItem[];
}

/**
 * Web settings IA (founder directive, 2026-07-10): ONE flat, unlabeled list.
 * Skills / Connectors / Plugins are plain items directly after the core
 * settings items — deliberately NO "Customize" group heading (unlike
 * claude.ai's sidebar, which groups them; we drop that heading). Memory is
 * folded into Capabilities (reachable via a chevron link, deep-linkable at
 * /settings/memory). AGI Code is omitted: web has no AGI-Code settings
 * surface to back it.
 */
export const SETTINGS_NAV_GROUPS_WEB: SettingsNavGroupResolved[] = [
  {
    items: [
      { key: 'general', label: 'General', icon: Settings2 },
      { key: 'account', label: 'Account', icon: UserRound },
      { key: 'privacy', label: 'Privacy', icon: Shield },
      { key: 'billing', label: 'Billing', icon: CreditCard },
      { key: 'usage', label: 'Usage', icon: Gauge },
      { key: 'capabilities', label: 'Capabilities', icon: Zap },
      { key: 'security', label: 'Security', icon: Lock },
      { key: 'notifications', label: 'Notifications', icon: Bell },
      { key: 'time-focus', label: 'Time and focus', icon: Clock3 },
      { key: 'skills', label: 'Skills', icon: BookOpen },
      { key: 'connectors', label: 'Connectors', icon: Plug },
      { key: 'plugins', label: 'Plugins', icon: Puzzle },
    ],
  },
];
