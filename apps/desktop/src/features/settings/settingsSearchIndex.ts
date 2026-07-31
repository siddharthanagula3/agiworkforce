import type { SettingsNavKey } from '@agiworkforce/ui';

export interface DesktopSettingSearchEntry {
  id: string;
  tab: SettingsNavKey;
  label: string;
  description: string;
  keywords?: string[];
}

/**
 * Searchable controls in the mounted Desktop settings owner. Entries describe
 * real controls or destinations; they are not a feature catalogue.
 */
export const DESKTOP_SETTINGS_SEARCH_INDEX: DesktopSettingSearchEntry[] = [
  {
    id: 'global-hotkey',
    tab: 'general',
    label: 'Global hotkey',
    description: 'Open AGI Workforce with a system-wide keyboard shortcut.',
    keywords: ['shortcut', 'key combination'],
  },
  {
    id: 'menu-bar',
    tab: 'general',
    label: 'Show in menu bar',
    description: 'Keep AGI Workforce available after the main window closes.',
    keywords: ['tray', 'background', 'close', 'dock'],
  },
  {
    id: 'theme',
    tab: 'general',
    label: 'Theme',
    description: 'Choose the light, dark, or system appearance.',
    keywords: ['appearance', 'color'],
  },
  {
    id: 'language',
    tab: 'general',
    label: 'Language',
    description: 'Choose the Desktop interface language.',
  },
  {
    id: 'network-proxy',
    tab: 'general',
    label: 'LLM network proxy',
    description: 'Configure proxy authentication, bypass hosts, and a custom root CA.',
    keywords: ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'corporate network', 'certificate'],
  },
  {
    id: 'keybindings',
    tab: 'general',
    label: 'Keyboard shortcuts',
    description: 'Review and change app keyboard shortcuts.',
    keywords: ['redo', 'undo', 'hotkey'],
  },
  {
    id: 'response-style',
    tab: 'appearance',
    label: 'Response style',
    description: 'Adjust formality, warmth, detail, and emoji usage.',
    keywords: ['personality', 'tone'],
  },
  {
    id: 'custom-instructions',
    tab: 'appearance',
    label: 'Custom instructions',
    description: 'Tell the assistant how you want it to respond.',
  },
  {
    id: 'reduce-motion',
    tab: 'appearance',
    label: 'Reduce motion',
    description: 'Disable non-essential animation.',
    keywords: ['animation', 'accessibility'],
  },
  {
    id: 'dyslexic-font',
    tab: 'appearance',
    label: 'Dyslexic friendly font',
    description: 'Use OpenDyslexic throughout the application.',
    keywords: ['font', 'accessibility', 'readability'],
  },
  {
    id: 'export-data',
    tab: 'privacy',
    label: 'Export your data',
    description: 'Export the data owned by this Desktop installation.',
  },
  {
    id: 'data-storage',
    tab: 'privacy',
    label: 'Data storage',
    description: 'Review and clear locally stored application data.',
    keywords: ['clear local storage', 'cache'],
  },
  {
    id: 'crash-reporting',
    tab: 'privacy',
    label: 'Crash reporting',
    description: 'Control diagnostic crash reports.',
    keywords: ['telemetry', 'diagnostics'],
  },
  {
    id: 'app-analytics',
    tab: 'privacy',
    label: 'App analytics',
    description: 'Control product and performance analytics.',
    keywords: ['telemetry', 'metrics'],
  },
  {
    id: 'master-password',
    tab: 'privacy',
    label: 'Master password',
    description: 'Manage protection for encrypted local credentials.',
    keywords: ['security', 'credentials'],
  },
  {
    id: 'api-keys',
    tab: 'models-keys',
    label: 'API keys (BYOK)',
    description: 'Configure provider credentials for bring-your-own-key models.',
    keywords: ['OpenAI', 'Anthropic', 'provider'],
  },
  {
    id: 'local-models',
    tab: 'models-keys',
    label: 'Local models',
    description: 'Configure Ollama and locally available models.',
    keywords: ['offline', 'Ollama'],
  },
  {
    id: 'agent-mode',
    tab: 'models-keys',
    label: 'Always use agent mode',
    description: 'Start supported local conversations in agent mode.',
  },
  {
    id: 'auto-approve-tools',
    tab: 'models-keys',
    label: 'Auto-approve tools',
    description: 'Configure the local tool approval default.',
    keywords: ['permissions', 'tools'],
  },
  {
    id: 'computer-use',
    tab: 'capabilities',
    label: 'Computer use',
    description: 'Configure supported on-device computer control.',
    keywords: ['screen', 'automation'],
  },
  {
    id: 'deep-research',
    tab: 'capabilities',
    label: 'Deep research',
    description: 'Configure multi-source research behavior.',
    keywords: ['citations', 'sources'],
  },
  {
    id: 'remote-control',
    tab: 'connections',
    label: 'Remote control',
    description: 'Pair the mobile companion to monitor this Mac and review approvals.',
    keywords: ['mobile', 'phone', 'pairing', 'device'],
  },
  {
    id: 'dispatch',
    tab: 'cowork',
    label: 'Dispatch',
    description: 'Review the boundary for mobile-started work on this Mac.',
    keywords: ['remote task', 'phone task'],
  },
  {
    id: 'connector-catalog',
    tab: 'connectors',
    label: 'Connector catalog',
    description: 'Browse and manage supported service connectors.',
    keywords: ['integration', 'MCP'],
  },
  {
    id: 'bundle-registry',
    tab: 'connectors',
    label: 'MCP bundle registry',
    description: 'Browse and configure installable MCP server bundles.',
    keywords: ['tool management', 'server'],
  },
  {
    id: 'instruction-files',
    tab: 'agi-code',
    label: 'Instruction files',
    description: 'Configure repository instruction-file discovery.',
    keywords: ['AGENTS.md', 'CLAUDE.md', 'coding agent'],
  },
  {
    id: 'chrome-bridge',
    tab: 'agi-in-chrome',
    label: 'AGI in Chrome',
    description: 'Review the browser extension and native bridge.',
    keywords: ['browser extension', 'native messaging'],
  },
  {
    id: 'plugin-catalog',
    tab: 'plugins',
    label: 'Plugins',
    description: 'Browse and manage installed plugins.',
    keywords: ['extensions', 'apps'],
  },
  {
    id: 'custom-agents',
    tab: 'agents',
    label: 'Custom agents',
    description: 'Create and manage reusable agent configurations.',
  },
  {
    id: 'enable-memories',
    tab: 'memory',
    label: 'Enable memories',
    description: 'Control automatic memory retrieval and generation.',
  },
  {
    id: 'tool-assisted-memory',
    tab: 'memory',
    label: 'Tool-assisted memory',
    description: 'Allow memory generation from chats that use tools.',
    keywords: ['connectors', 'code execution', 'web search'],
  },
  {
    id: 'notifications-enabled',
    tab: 'notifications',
    label: 'Notifications enabled',
    description: 'Control in-app and system notification delivery.',
  },
  {
    id: 'notification-sound',
    tab: 'notifications',
    label: 'Sound effects',
    description: 'Play sounds for messages and completed tasks.',
  },
  {
    id: 'app-icon-badge',
    tab: 'notifications',
    label: 'App icon badge',
    description: 'Show the unread notification count on the app icon.',
  },
  {
    id: 'dictation-hotkey',
    tab: 'voice',
    label: 'Dictation hotkey',
    description: 'Choose the shortcut used to start voice dictation.',
  },
  {
    id: 'transcription-provider',
    tab: 'voice',
    label: 'Transcription provider',
    description: 'Choose the speech-to-text provider.',
    keywords: ['voice', 'speech'],
  },
  {
    id: 'microphone',
    tab: 'voice',
    label: 'Microphone',
    description: 'Choose the input device used for dictation.',
    keywords: ['audio', 'input device'],
  },
  {
    id: 'voice-language',
    tab: 'voice',
    label: 'Voice language',
    description: 'Choose the language used for transcription.',
  },
  {
    id: 'mcp-extensions',
    tab: 'extensions',
    label: 'MCP extensions',
    description: 'Review installed Model Context Protocol extensions.',
    keywords: ['install', 'uninstall'],
  },
  {
    id: 'agent-execution',
    tab: 'developer',
    label: 'Agent execution',
    description: 'Configure the terminal sandbox and execution permissions.',
    keywords: ['sandbox', 'network', 'permissions'],
  },
  {
    id: 'allowed-directories',
    tab: 'developer',
    label: 'Allowed directories',
    description: 'Review folders available to local tools.',
    keywords: ['filesystem', 'folder access'],
  },
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function isSubsequence(query: string, candidate: string): boolean {
  let queryIndex = 0;
  for (const character of candidate) {
    if (character === query[queryIndex]) queryIndex += 1;
    if (queryIndex === query.length) return true;
  }
  return false;
}

export function searchDesktopSettings(query: string): DesktopSettingSearchEntry[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];

  return DESKTOP_SETTINGS_SEARCH_INDEX.map((entry) => {
    const searchable = normalize(
      [entry.label, entry.description, ...(entry.keywords ?? [])].join(' '),
    );
    const directIndex = searchable.indexOf(normalizedQuery);
    const fuzzyMatch =
      normalizedQuery.length >= 3 && isSubsequence(normalizedQuery, normalize(entry.label));

    return {
      entry,
      score: directIndex === 0 ? 3 : directIndex > 0 ? 2 : fuzzyMatch ? 1 : 0,
    };
  })
    .filter((match) => match.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || left.entry.label.localeCompare(right.entry.label),
    )
    .map((match) => match.entry);
}
