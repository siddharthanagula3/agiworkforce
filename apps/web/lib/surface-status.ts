export const COMING_SOON_LABEL = 'Coming soon';
export const AVAILABLE_NOW_LABEL = 'Available now';

export const SURFACE_STATUS = {
  web: AVAILABLE_NOW_LABEL,
  desktop: 'Linux assets · v1.2.0',
  cli: AVAILABLE_NOW_LABEL,
  mobile: COMING_SOON_LABEL,
  vscode: COMING_SOON_LABEL,
  chrome: COMING_SOON_LABEL,
} as const;

export const NOTIFY_CTA = {
  label: 'Get notified',
  href: '/download',
} as const;
