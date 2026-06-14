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
  | 'appearance'
  | 'privacy'
  | 'models-keys'
  | 'agents'
  | 'skills'
  | 'connectors'
  | 'plugins'
  | 'memory'
  | 'notifications'
  | 'voice';

export interface SettingsNavEntry {
  key: SettingsNavKey;
  label: string;
  icon: LucideIcon;
}

/** Flat list of every settings entry (key/label/icon), in canonical order. */
export const SETTINGS_NAV: SettingsNavEntry[] = [
  { key: 'general', label: 'General', icon: Settings2 },
  { key: 'account', label: 'Account', icon: CreditCard },
  { key: 'appearance', label: 'Personalization', icon: UserRound },
  { key: 'privacy', label: 'Privacy', icon: Shield },
  { key: 'models-keys', label: 'Models & Keys', icon: Server },
  { key: 'agents', label: 'Agents', icon: Zap },
  { key: 'skills', label: 'Skills', icon: BookOpen },
  { key: 'connectors', label: 'Connectors', icon: Plug },
  { key: 'plugins', label: 'Plugins', icon: Puzzle },
  { key: 'memory', label: 'Memory', icon: Brain },
  { key: 'notifications', label: 'Notifications', icon: Bell },
  { key: 'voice', label: 'Voice', icon: Mic },
];

export interface SettingsNavGroup {
  /** Optional section heading (omitted for the first/default group). */
  label?: string;
  /** Keys referencing entries in SETTINGS_NAV. */
  keys: SettingsNavKey[];
}

/** Grouped navigation — the section structure both surfaces render. */
export const SETTINGS_NAV_GROUPS: SettingsNavGroup[] = [
  { keys: ['general', 'account', 'appearance', 'privacy', 'models-keys'] },
  { label: 'Tools', keys: ['skills', 'connectors', 'plugins', 'agents', 'memory'] },
  { label: 'Desktop app', keys: ['notifications', 'voice'] },
];
