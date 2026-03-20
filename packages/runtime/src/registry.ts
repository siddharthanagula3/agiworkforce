/**
 * Prefix-based command classification registry.
 *
 * Determines whether a Tauri command can run in the cloud, requires the desktop,
 * or prefers desktop but has a cloud fallback. Covers ~95% of commands via prefix
 * matching; edge cases go in COMMAND_OVERRIDES.
 */

import type { RuntimeTier, CommandCapability } from '@agiworkforce/types';

const COMMAND_PREFIXES: Record<string, { tier: RuntimeTier; featureGroup: string }> = {
  // Cloud-capable commands (can run via API gateway)
  chat_: { tier: 'cloud', featureGroup: 'Chat' },
  llm_: { tier: 'cloud', featureGroup: 'LLM Models' },
  skill_: { tier: 'cloud', featureGroup: 'Skills' },
  analytics_: { tier: 'cloud', featureGroup: 'Analytics' },
  settings_: { tier: 'cloud', featureGroup: 'Settings' },
  auth_: { tier: 'cloud', featureGroup: 'Authentication' },
  user_: { tier: 'cloud', featureGroup: 'User' },
  billing_: { tier: 'cloud', featureGroup: 'Billing' },
  subscription_: { tier: 'cloud', featureGroup: 'Billing' },
  notification_: { tier: 'cloud', featureGroup: 'Notifications' },
  team_: { tier: 'cloud', featureGroup: 'Teams' },
  project_: { tier: 'cloud', featureGroup: 'Projects' },
  template_: { tier: 'cloud', featureGroup: 'Templates' },
  onboarding_: { tier: 'cloud', featureGroup: 'Onboarding' },
  governance_: { tier: 'cloud', featureGroup: 'Governance' },

  // Desktop-only commands (require native system access)
  browser_: { tier: 'desktop-only', featureGroup: 'Browser Automation' },
  file_: { tier: 'desktop-only', featureGroup: 'File System' },
  terminal_: { tier: 'desktop-only', featureGroup: 'Terminal' },
  git_: { tier: 'desktop-only', featureGroup: 'Git' },
  voice_: { tier: 'desktop-only', featureGroup: 'Voice' },
  computer_use_: { tier: 'desktop-only', featureGroup: 'Computer Use' },
  automation_: { tier: 'desktop-only', featureGroup: 'Desktop Automation' },
  window_: { tier: 'desktop-only', featureGroup: 'Window Management' },
  tray_: { tier: 'desktop-only', featureGroup: 'System Tray' },
  shortcut_: { tier: 'desktop-only', featureGroup: 'Keyboard Shortcuts' },
  capture_: { tier: 'desktop-only', featureGroup: 'Screen Capture' },
  screen_: { tier: 'desktop-only', featureGroup: 'Screen' },
  ocr_: { tier: 'desktop-only', featureGroup: 'OCR' },
  vision_: { tier: 'desktop-only', featureGroup: 'Vision' },
  native_: { tier: 'desktop-only', featureGroup: 'Native Messaging' },
  extension_: { tier: 'desktop-only', featureGroup: 'Extensions' },
  ollama_: { tier: 'desktop-only', featureGroup: 'Local LLMs' },
  lsp_: { tier: 'desktop-only', featureGroup: 'LSP' },
  code_: { tier: 'desktop-only', featureGroup: 'Code Editing' },

  // Desktop-preferred commands (cloud fallback available but desktop is better)
  mcp_: { tier: 'desktop-preferred', featureGroup: 'MCP Tools' },
  research_: { tier: 'desktop-preferred', featureGroup: 'Research' },
  email_: { tier: 'desktop-preferred', featureGroup: 'Email' },
  calendar_: { tier: 'desktop-preferred', featureGroup: 'Calendar' },
  memory_: { tier: 'desktop-preferred', featureGroup: 'Memory' },
  knowledge_: { tier: 'desktop-preferred', featureGroup: 'Knowledge' },
  embedding_: { tier: 'desktop-preferred', featureGroup: 'Embeddings' },
  document_: { tier: 'desktop-preferred', featureGroup: 'Documents' },
  artifact_: { tier: 'desktop-preferred', featureGroup: 'Artifacts' },
  marketplace_: { tier: 'desktop-preferred', featureGroup: 'Marketplace' },
  workflow_: { tier: 'desktop-preferred', featureGroup: 'Workflows' },
  database_: { tier: 'desktop-preferred', featureGroup: 'Database' },
  cache_: { tier: 'desktop-preferred', featureGroup: 'Cache' },
  diagnostic_: { tier: 'desktop-preferred', featureGroup: 'Diagnostics' },

  // Agent commands — desktop-preferred (cloud can proxy simpler agent tasks)
  agi_: { tier: 'desktop-preferred', featureGroup: 'Agent' },
  agent_: { tier: 'desktop-preferred', featureGroup: 'Agent' },
  swarm_: { tier: 'desktop-preferred', featureGroup: 'Agent Swarm' },
  orchestrat: { tier: 'desktop-preferred', featureGroup: 'Orchestration' },
  background_: { tier: 'desktop-preferred', featureGroup: 'Background Tasks' },
};

/** Per-command overrides for edge cases not covered by prefix matching. */
const COMMAND_OVERRIDES: Record<string, CommandCapability> = {
  // Settings that need local filesystem but have cloud equivalents
  get_app_version: { tier: 'desktop-only', featureGroup: 'System', commandName: 'get_app_version' },
  check_for_updates: {
    tier: 'desktop-only',
    featureGroup: 'System',
    commandName: 'check_for_updates',
  },
  // Cloud-specific overrides
  cloud_chat_stream: { tier: 'cloud', featureGroup: 'Chat', commandName: 'cloud_chat_stream' },
};

/**
 * Resolve the runtime capability tier for a given command name.
 * Checks overrides first, then prefix matching, then falls back to desktop-only.
 */
export function resolveCommandCapability(commandName: string): CommandCapability {
  // Check explicit overrides first
  const override = COMMAND_OVERRIDES[commandName];
  if (override) return override;

  // Prefix match — longest prefix wins
  let bestMatch: { tier: RuntimeTier; featureGroup: string } | undefined;
  let bestLen = 0;

  for (const [prefix, config] of Object.entries(COMMAND_PREFIXES)) {
    if (commandName.startsWith(prefix) && prefix.length > bestLen) {
      bestMatch = config;
      bestLen = prefix.length;
    }
  }

  if (bestMatch) {
    return { tier: bestMatch.tier, featureGroup: bestMatch.featureGroup, commandName };
  }

  // Unknown commands default to desktop-only (safe fallback)
  return { tier: 'desktop-only', featureGroup: 'Unknown', commandName };
}
