import { test } from '@playwright/test';
import { measurePublicFeatureMockup } from './lib/public-feature-mockup';

const composer = {
  name: 'composer',
  pathname: '/features/ai-chat',
  role: 'region',
  region: 'One box, more than text.',
  figure: 'The AGI composer with a slash menu open',
  bodyWords: { selector: '[data-composer-command-description]' },
  sourceFiles: [
    'apps/web/app/layout.tsx',
    'apps/web/app/globals.css',
    'apps/web/app/features/ai-chat/page.tsx',
    'apps/web/features/marketing/components/DeviceMockups.tsx',
    'apps/web/features/marketing/components/FeatureScenes.tsx',
    'apps/web/features/marketing/components/composer-mockup-responsive.css',
    'apps/web/features/marketing/components/legacy-landing.css',
    'apps/web/features/marketing/components/legacy-pages.css',
    'apps/web/features/marketing/components/mockup-responsive.css',
    'apps/web/features/marketing/components/motion/motion.css',
    'apps/web/features/marketing/components/system/system.css',
    'apps/web/features/marketing/components/system/MarketingHeader.tsx',
    'apps/web/shared/components/layout/Header.tsx',
    'packages/contracts/types/src/interaction-modes.json',
    'packages/contracts/types/src/interaction-modes.ts',
    'packages/ui/unified-chat/src/lib/slashCommands.ts',
    'apps/web/features/chat/components/Composer/SlashCommandMenu.tsx',
    'apps/web/features/chat/components/Composer/ChatComposerNew.tsx',
    'apps/web/features/chat/components/Composer/AttachmentPreview.tsx',
    'apps/web/features/chat/components/Composer/VoiceInputButton.tsx',
    'apps/web/features/chat/components/Composer/SendButton.tsx',
    'packages/ui/design-tokens/src/foundation.css',
    'packages/ui/design-tokens/src/tailwind.css',
    'apps/web/e2e/public-composer-mockup.spec.ts',
  ],
} as const;

test.describe('public Web composer readability', () => {
  for (const width of [320, 360, 390, 768, 1024, 1366, 1440, 1920] as const) {
    for (const theme of ['light', 'dark'] as const) {
      test(`composer at ${width}px ${theme}`, async ({ browser, baseURL }, testInfo) => {
        await measurePublicFeatureMockup(browser, baseURL, testInfo, composer, width, theme);
      });
    }
  }
});
