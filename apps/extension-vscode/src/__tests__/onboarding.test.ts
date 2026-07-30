import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ONBOARDING_SEEN_KEY, shouldShowOnboarding } from '../features/onboarding/onboardingState';
import { parseWebviewMessage } from '../protocol/webviewMessages';

describe('VS Code onboarding host contract', () => {
  it('shows until the durable global state flag is true', () => {
    const values = new Map<string, unknown>();
    const state = {
      get: <T>(key: string) => values.get(key) as T | undefined,
    };

    expect(shouldShowOnboarding(state)).toBe(true);
    values.set(ONBOARDING_SEEN_KEY, true);
    expect(shouldShowOnboarding(state)).toBe(false);
  });

  it.each(['completeOnboarding', 'openPermissionDocs', 'openPrivacySettings', 'openWebTasks'])(
    'runtime-validates the %s webview action',
    (type) => {
      expect(parseWebviewMessage({ type })).toEqual({ type });
      expect(parseWebviewMessage({ type, payload: { injected: true } })).toEqual({
        type,
      });
    },
  );

  it('contributes the replay command and four-step VS Code walkthrough with real media', () => {
    const extensionRoot = resolve(__dirname, '../..');
    const packageJson = JSON.parse(
      readFileSync(resolve(extensionRoot, 'package.json'), 'utf8'),
    ) as {
      contributes: {
        commands: Array<{ command: string }>;
        walkthroughs: Array<{
          id: string;
          steps: Array<{
            id: string;
            media: { markdown: string };
            completionEvents: string[];
          }>;
        }>;
      };
    };
    const commandIds = packageJson.contributes.commands.map((command) => command.command);
    const walkthrough = packageJson.contributes.walkthroughs.find(
      (candidate) => candidate.id === 'agiWorkforce.gettingStarted',
    );

    expect(commandIds).toContain('agi-workforce.showOnboarding');
    expect(commandIds).toContain('agi-workforce.openWebTasks');
    expect(walkthrough?.steps).toHaveLength(4);
    for (const step of walkthrough?.steps ?? []) {
      expect(step.completionEvents.length).toBeGreaterThan(0);
      expect(existsSync(resolve(extensionRoot, step.media.markdown))).toBe(true);
    }
  });
});
