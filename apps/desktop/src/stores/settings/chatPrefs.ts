export type AgentMode = 'safe' | 'plan' | 'build' | 'autopilot';

export interface ChatPreferences {
  compactMode: boolean;
  autoApproveTools: boolean;
  memoryEnabled?: boolean;
  allowToolAssistedMemoryGeneration?: boolean;
  autoSaveMemories?: boolean;
  agentMode: AgentMode;
  autoTTS?: boolean;
  temporaryChat?: boolean;
}
