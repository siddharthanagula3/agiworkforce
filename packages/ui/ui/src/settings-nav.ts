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
  EyeOff,
  Clock3,
  Activity,
  Users,
  MonitorSmartphone,
  Laptop,
  type LucideIcon,
  LifeBuoy,
} from 'lucide-react';

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
  | 'connections'
  | 'cowork'
  | 'connectors'
  | 'agi-code'
  | 'agi-in-chrome'
  | 'plugins'
  | 'memory'
  | 'notifications'
  | 'voice'
  | 'extensions'
  | 'developer'
  | 'security'
  | 'safety'
  | 'team'
  | 'reflect'
  | 'time-focus'
  | 'skills'
  | 'help'
  // Conversation-data sections. Web registers these as settings sections and
  // routes to them, but deliberately keeps them out of SETTINGS_NAV_GROUPS_WEB
  // and links to them from its Privacy section instead.
  | 'archived'
  | 'deleted-chats'
  | 'shared-links';

export interface SettingsNavEntry {
  key: SettingsNavKey;
  label: string;
  icon: LucideIcon;
  keywords?: string[];
}

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
  {
    key: 'connections',
    label: 'Connections',
    icon: MonitorSmartphone,
    keywords: ['mobile', 'phone', 'device', 'pairing', 'remote control', 'screen sharing'],
  },
  {
    key: 'cowork',
    label: 'Cowork',
    icon: Laptop,
    keywords: ['dispatch', 'remote task', 'mobile task', 'phone task'],
  },
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

const SETTINGS_NAV_KEY_SET: ReadonlySet<string> = new Set<SettingsNavKey>([
  ...SETTINGS_NAV.map((entry) => entry.key),
  'security',
  'safety',
  'team',
  'reflect',
  'time-focus',
  'skills',
  'help',
  'archived',
  'deleted-chats',
  'shared-links',
]);

export function isSettingsNavKey(value: string): value is SettingsNavKey {
  return SETTINGS_NAV_KEY_SET.has(value);
}

export const SETTINGS_NAV_KEYWORDS: Partial<Record<SettingsNavKey, string[]>> = SETTINGS_NAV.reduce<
  Partial<Record<SettingsNavKey, string[]>>
>((map, entry) => {
  if (entry.keywords && entry.keywords.length > 0) map[entry.key] = entry.keywords;
  return map;
}, {});

export interface SettingsNavGroup {
  label?: string;
  keys: SettingsNavKey[];
}

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
    keys: [
      'connections',
      'cowork',
      'connectors',
      'agi-code',
      'agi-in-chrome',
      'plugins',
      'agents',
      'memory',
    ],
  },
  { label: 'Desktop app', keys: ['notifications', 'voice', 'extensions'] },
  { label: 'Advanced', keys: ['developer'] },
];

export interface SettingsNavItem {
  key: SettingsNavKey;
  label: string;
  icon: LucideIcon;
  keywords?: string[];
}

export interface SettingsNavGroupResolved {
  label?: string;
  items: SettingsNavItem[];
}

export const SETTINGS_NAV_GROUPS_WEB: SettingsNavGroupResolved[] = [
  {
    items: [
      {
        key: 'general',
        label: 'General',
        icon: Settings2,
        keywords: ['profile', 'name', 'personalization', 'custom instructions', 'instructions'],
      },
      { key: 'account', label: 'Account', icon: UserRound },
      { key: 'team', label: 'Team', icon: Users },
      { key: 'privacy', label: 'Privacy', icon: Shield },
      { key: 'billing', label: 'Billing', icon: CreditCard },
      { key: 'usage', label: 'Usage', icon: Gauge },
      { key: 'capabilities', label: 'Capabilities', icon: Zap },
      { key: 'security', label: 'Security', icon: Lock },
      { key: 'safety', label: 'Safety', icon: EyeOff },
      { key: 'notifications', label: 'Notifications', icon: Bell },
      { key: 'reflect', label: 'Reflect', icon: Activity },
      { key: 'time-focus', label: 'Time and focus', icon: Clock3 },
      { key: 'skills', label: 'Skills', icon: BookOpen },
      { key: 'connectors', label: 'Connectors', icon: Plug },
      { key: 'plugins', label: 'Plugins', icon: Puzzle },
      { key: 'help', label: 'Help', icon: LifeBuoy },
    ],
  },
];
