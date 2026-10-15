export type AgentMode = 'safe' | 'plan' | 'build' | 'autopilot';

export interface ChatPreferences {
  compactMode: boolean;
  autoApproveTools: boolean;
  memoryEnabled?: boolean;
  allowToolAssistedMemoryGeneration?: boolean;
  autoSaveMemories?: boolean;
  agentMode: AgentMode;
  sendShortcut?: 'enter' | 'mod-enter';
  autoTTS?: boolean;
  temporaryChat?: boolean;
}
