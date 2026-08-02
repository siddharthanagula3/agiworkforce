/**
 * DES-C02 — the first-run onboarding "Cloud Mode" card never entered Cloud.
 *
 * `handleCloudMode` completed onboarding and called the OPTIONAL
 * `onCloudModeSelected` callback, which the only production mount
 * (`App.tsx` -> `OnboardingWelcome`) did not pass — a repo-wide grep found no
 * caller at all. The card's primary button was even labelled "Continue with
 * Local for now", so the very first screen of a Cloud demo silently chose the
 * Local trust boundary.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../lib/runtimeEnvironment', () => ({
  isTauri: true,
  isTestEnvironment: true,
  isDesktopUiDevLocal: false,
  supportsLocalAppMode: true,
  isCloudWeb: false,
}));

vi.mock('../../lib/tauri-mock', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
  isTauri: true,
  isTauriContext: () => true,
}));

vi.mock('../../api/ollama', () => ({
  OllamaClient: {
    isReadyForUse: vi.fn().mockResolvedValue({ available: false, modelCount: 0 }),
  },
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

import { OnboardingWizard } from './OnboardingWizard';
import { useAppModeStore } from '../../stores/appModeStore';
import { useSimpleModeStore } from '../../stores/ui';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('DES-C02: the first-run Cloud Mode card', () => {
  beforeEach(() => {
    useAppModeStore.setState({ mode: 'local', hasOnboarded: false, hasSelectedMode: false });
    useSimpleModeStore.setState({ onboardingCompleted: false });
  });

  it('is labelled with what it does, not with the opposite', () => {
    render(<OnboardingWizard onComplete={vi.fn()} />);

    const cloudCta = screen.getByTestId('onboarding-cloud-mode');
    expect(cloudCta).toHaveTextContent('Sign in to AGI Cloud');
    expect(cloudCta).not.toHaveTextContent(/Continue with Local/i);
  });

  it('hands the Cloud choice to the host and completes onboarding', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const onCloudModeSelected = vi.fn();

    render(<OnboardingWizard onComplete={onComplete} onCloudModeSelected={onCloudModeSelected} />);
    await user.click(screen.getByTestId('onboarding-cloud-mode'));

    expect(onCloudModeSelected).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(useAppModeStore.getState().hasSelectedMode).toBe(true);
    expect(useSimpleModeStore.getState().onboardingCompleted).toBe(true);
    // The card must not quietly pick Local for the user — that decision belongs
    // to the Local card and the "Skip for now" link.
    expect(useAppModeStore.getState().mode).toBe('local');
  });

  it('leaves the Local card as the explicit way to stay on device', async () => {
    const user = userEvent.setup();
    const onCloudModeSelected = vi.fn();
    useAppModeStore.setState({ mode: 'cloud' });

    render(<OnboardingWizard onComplete={vi.fn()} onCloudModeSelected={onCloudModeSelected} />);
    await user.click(screen.getByRole('button', { name: /start local mode/i }));

    expect(useAppModeStore.getState().mode).toBe('local');
    expect(onCloudModeSelected).not.toHaveBeenCalled();
  });

  it('is wired at the only production mount', () => {
    // The callback existing is worthless if nothing passes it; that omission is
    // exactly what made the card a no-op.
    const app = readFileSync(path.join(SRC, 'App.tsx'), 'utf8');
    expect(app).toMatch(/<OnboardingWelcome[\s\S]*?onCloudModeSelected=\{/);
    expect(app).toMatch(
      /onCloudModeSelected=\{\(\) =>\s*useAppModeStore\.getState\(\)\.setMode\('cloud'\)/,
    );
  });
});
