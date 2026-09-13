export const FEATURES = {
  projects: true,

  cloudChat: true,

  billing: false,

  usageDashboard: true,

  auth: true,

  cloudTasks: true,

  dispatch: true,

  schedules: true,

  companion: true,

  connectors: true,

  skills: true,

  webSearch: true,

  research: true,

  imageGen: true,

  crossDeviceSync: false,

  codeExecution: true,
} as const;

export type FeatureKey = keyof typeof FEATURES;
