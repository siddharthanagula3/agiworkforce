export const FEATURES = {
  v1LocalOnly: false,

  projects: true,

  cloudChat: true,

  billing: false,

  usageDashboard: true,

  auth: true,

  byokKeys: false,

  cloudTasks: true,

  agents: false,

  dispatch: true,

  schedules: true,

  companion: true,

  connectors: true,

  skills: true,

  webSearch: true,

  research: true,

  computerUse: false,

  imageGen: true,

  crossDeviceSync: false,

  codeExecution: true,
} as const;

export type FeatureKey = keyof typeof FEATURES;
