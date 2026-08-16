
export type AppServerCapabilities = {
  threads: boolean;
  turns: boolean;
  streaming: boolean;
  approvals: boolean;
  tools: boolean;
  mcp: boolean;
  checkpoints: boolean;
  worktrees: boolean;
  models: boolean;
};
