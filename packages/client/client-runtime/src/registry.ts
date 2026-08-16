
import type { RuntimeTier, CommandCapability } from '@agiworkforce/types';

const COMMAND_PREFIXES: Record<string, { tier: RuntimeTier; featureGroup: string }> = {
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

  agi_: { tier: 'desktop-preferred', featureGroup: 'Agent' },
  agent_: { tier: 'desktop-preferred', featureGroup: 'Agent' },
  swarm_: { tier: 'desktop-preferred', featureGroup: 'Agent Swarm' },
  orchestrat: { tier: 'desktop-preferred', featureGroup: 'Orchestration' },
  background_: { tier: 'desktop-preferred', featureGroup: 'Background Tasks' },
};

const COMMAND_OVERRIDES: Record<string, CommandCapability> = {
  get_app_version: { tier: 'desktop-only', featureGroup: 'System', commandName: 'get_app_version' },
  check_for_updates: {
    tier: 'desktop-only',
    featureGroup: 'System',
    commandName: 'check_for_updates',
  },
  cloud_chat_stream: { tier: 'cloud', featureGroup: 'Chat', commandName: 'cloud_chat_stream' },
};

export function resolveCommandCapability(commandName: string): CommandCapability {
  const override = COMMAND_OVERRIDES[commandName];
  if (override) return override;

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

  return { tier: 'desktop-only', featureGroup: 'Unknown', commandName };
}
