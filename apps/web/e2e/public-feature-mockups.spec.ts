import { test } from '@playwright/test';
import { measurePublicFeatureMockup } from './lib/public-feature-mockup';

const scenes = [
  {
    name: 'agent',
    pathname: '/features/agents',
    role: 'region',
    region: 'Delegation only works if the default is no.',
    figure: 'Example Web file-write approval request',
  },
  {
    name: 'artifacts',
    pathname: '/features/artifacts',
    role: 'region',
    region: 'Run it, then decide. Not before.',
    figure: 'Example Web HTML artifact preview and source',
  },
  {
    name: 'research',
    pathname: '/features/deep-research',
    role: 'region',
    region: 'Deep research',
    figure: 'Example Web research plan awaiting approval',
  },
  {
    name: 'memory',
    pathname: '/features/memory',
    role: 'region',
    region: 'Every fact AGI keeps is a sentence you can read.',
    figure: 'Authored example of a current Web memory draft',
  },
  {
    name: 'project',
    pathname: '/features/projects',
    role: 'region',
    region: 'A project rebuilds its own context into every prompt.',
    figure: 'An AGI project home with instructions, files and threads',
  },
  {
    name: 'composer',
    pathname: '/features/ai-chat',
    role: 'region',
    region: 'One box, more than text.',
    figure: 'The AGI composer with a slash menu open',
  },
  {
    name: 'console-members',
    pathname: '/teams',
    role: 'region',
    region: 'Seats, roles, and a console that decides what each role can reach.',
    figure: 'The AGI workspace console',
  },
  {
    name: 'console-policy',
    pathname: '/enterprise',
    role: 'article',
    region: 'A ceiling the console enforces, not a preference it records.',
    figure: 'The AGI workspace console',
  },
  {
    name: 'console-audit',
    pathname: '/enterprise',
    role: 'article',
    region: 'Every administrative and identity event, readable and streamable.',
    figure: 'The AGI workspace console',
  },
] as const;

const widths = [320, 360, 390, 768, 1024, 1366, 1440, 1920] as const;
const themes = ['light', 'dark'] as const;
const sharedSources = [
  'apps/web/app/layout.tsx',
  'apps/web/app/globals.css',
  'apps/web/features/marketing/components/DeviceMockups.tsx',
  'apps/web/features/marketing/components/FeatureScenes.tsx',
  'apps/web/features/marketing/components/agent-mockup-responsive.css',
  'apps/web/features/marketing/components/artifact-mockup-responsive.css',
  'apps/web/features/marketing/components/research-mockup-responsive.css',
  'apps/web/features/marketing/components/legacy-pages.css',
  'apps/web/features/marketing/components/legacy-landing.css',
  'apps/web/features/marketing/components/mockup-responsive.css',
  'apps/web/features/marketing/components/system/system.css',
  'apps/web/features/marketing/components/system/SplitFeature.tsx',
  'apps/web/features/marketing/components/pages/surfaces/shared.tsx',
  'apps/web/lib/e2b/execution-tools.ts',
  'apps/web/lib/e2b/types.ts',
  'apps/web/lib/e2b/unavailability.ts',
  'apps/web/shared/lib/cookie-consent.ts',
  'packages/contracts/types/src/tool-approval-policy.ts',
  'packages/contracts/types/src/tool-status.ts',
  'packages/contracts/types/src/tool-display.ts',
  'packages/platform/artifacts/package.json',
  'packages/platform/artifacts/src/index.ts',
  'packages/platform/artifacts/src/artifact-derivation.ts',
  'packages/platform/artifacts/src/artifact-store.ts',
  'packages/platform/artifacts/src/artifacts.ts',
  'packages/platform/artifacts/src/artifact-sync.ts',
  'packages/platform/artifacts/src/artifact-changes.ts',
  'packages/ui/design-tokens/src/foundation.css',
  'packages/ui/design-tokens/src/tailwind.css',
  'apps/web/e2e/lib/public-route-inventory.ts',
  'apps/web/e2e/lib/public-page-readiness.ts',
  'apps/web/e2e/lib/public-typography.ts',
  'apps/web/e2e/lib/public-text-contrast.ts',
  'apps/web/e2e/lib/public-viewport-strip-capture.ts',
  'apps/web/e2e/public-feature-mockups.spec.ts',
];

test.describe('public feature mockup readability baseline', () => {
  for (const scene of scenes) {
    for (const width of widths) {
      for (const theme of themes) {
        test(`${scene.name} at ${width}px ${theme}`, async ({ browser, baseURL }, testInfo) => {
          await measurePublicFeatureMockup(
            browser,
            baseURL,
            testInfo,
            { ...scene, sourceFiles: sharedSources },
            width,
            theme,
          );
        });
      }
    }
  }
});
