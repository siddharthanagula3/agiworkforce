export type Platform = 'ios' | 'android';

export interface DeviceClass {
  platform: Platform;
  className: string;
  simulator: string;
  width: number;
  height: number;
  storeSlot: string | null;
}

export interface Screenshot {
  id: string;
  name: string;
  spec: string;
  heading: string;
  subhead: string;
}

export const DEVICES: DeviceClass[] = [
  {
    platform: 'ios',
    className: 'iphone-17-pro-max',
    simulator: 'iPhone 17 Pro Max',
    width: 1320,
    height: 2868,
    storeSlot: 'App Store Connect — iPhone 6.9" (required)',
  },
  {
    platform: 'ios',
    className: 'ipad-pro-13',
    simulator: 'iPad Pro 13-inch (M5)',
    width: 2048,
    height: 2732,
    storeSlot: 'App Store Connect — iPad 13" (required while ios.supportsTablet is true)',
  },
  {
    platform: 'android',
    className: 'phone',
    simulator: 'pixel_8_api_34',
    width: 1080,
    height: 1920,
    storeSlot: 'Play Console — phone screenshots (required)',
  },
  {
    platform: 'ios',
    className: 'iphone-17-pro',
    simulator: 'iPhone 17 Pro',
    width: 1206,
    height: 2622,
    storeSlot: null,
  },
  {
    platform: 'ios',
    className: 'ipad-pro-11',
    simulator: 'iPad Pro 11-inch (M5)',
    width: 1668,
    height: 2388,
    storeSlot: null,
  },
  {
    platform: 'android',
    className: 'tablet-10',
    simulator: 'pixel_tablet_api_34',
    width: 1440,
    height: 2560,
    storeSlot: 'Play Console — 10" tablet (optional; needed for the large-screen listing)',
  },
];

export const SCREENSHOTS: Screenshot[] = [
  {
    id: '01',
    name: 'local-demo-chat',
    spec: '01-multi-provider.spec.ts',
    heading: 'Local chat first',
    subhead: 'Start privately, then sign in to unlock cloud.',
  },
  {
    id: '02',
    name: 'onboarding-local',
    spec: '02-onboarding-local.spec.ts',
    heading: 'Start without an account',
    subhead: 'Local setup, device fit, and model readiness.',
  },
  {
    id: '03',
    name: 'first-message',
    spec: '03-chat-first-message.spec.ts',
    heading: 'Chat with local models',
    subhead: 'Composer, model badge, and performance feedback.',
  },
  {
    id: '04',
    name: 'cloud-sign-in',
    spec: '04-mode-toggle-to-sign-in.spec.ts',
    heading: 'Sign in for Cloud',
    subhead: 'Cloud chat opens to any signed-in account.',
  },
  {
    id: '06',
    name: 'voice-recording',
    spec: '06-voice-record-and-send.spec.ts',
    heading: 'Hold to speak',
    subhead: 'Voice input feeds the same local chat workflow.',
  },
];

export const VERIFY_SCREENSHOT: Screenshot = {
  id: '99',
  name: 'verify-capture-wiring',
  spec: '99-verify-capture-wiring.spec.ts',
  heading: 'Capture wiring check',
  subhead: 'Not a store frame.',
};

export function deviceForClassName(className: string): DeviceClass | undefined {
  return DEVICES.find((device) => device.className === className);
}
