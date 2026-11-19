export const FEATURES = {
  projects: true,

  cloudChat: true,

  billing: false,

  auth: true,

  cloudTasks: true,

  dispatch: false,

  schedules: true,

  companion: false,

  connectors: true,

  skills: true,

  webSearch: true,

  research: true,

  imageGen: true,

  videoGen: false,

  bankLinking: false,

  pluginMarketplaceAdmin: false,

  codeExecution: true,

  appLanguage: false,

  linkBrowser: false,
} as const;

export type FeatureKey = keyof typeof FEATURES;
