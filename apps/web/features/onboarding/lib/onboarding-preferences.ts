'use client';

import {
  fetchStoredPreferenceNamespace,
  refreshProfileConsumers,
  savePreferenceNamespace,
} from '@/app/settings/_lib/preferences-client';

const GENERAL_NAMESPACE = 'general';

interface StoredGeneralPreferences {
  preferredName?: string;
  workDescription?: string;
  instructions?: string;
  primaryUseCase?: string;
  onboardingCompletedAt?: string;
}

export interface OnboardingSeed {
  preferredName: string;
  workDescription: string;
}

function readGeneralNamespace(): Promise<StoredGeneralPreferences> {
  return fetchStoredPreferenceNamespace<StoredGeneralPreferences>(GENERAL_NAMESPACE);
}

export async function loadOnboardingSeed(): Promise<OnboardingSeed> {
  const stored = await readGeneralNamespace();
  return {
    preferredName: typeof stored.preferredName === 'string' ? stored.preferredName : '',
    workDescription: typeof stored.workDescription === 'string' ? stored.workDescription : '',
  };
}

async function persistGeneralPatch(patch: StoredGeneralPreferences): Promise<void> {
  const current = await readGeneralNamespace();
  await savePreferenceNamespace<StoredGeneralPreferences>(GENERAL_NAMESPACE, {
    ...current,
    ...patch,
  });
  await refreshProfileConsumers();
}

export async function completeOnboarding(input: {
  preferredName: string;
  workDescription: string;
  primaryUseCase: string | null;
}): Promise<void> {
  await persistGeneralPatch({
    preferredName: input.preferredName.trim(),
    workDescription: input.workDescription,
    primaryUseCase: input.primaryUseCase ?? '',
    onboardingCompletedAt: new Date().toISOString(),
  });
}

export async function skipOnboarding(): Promise<void> {
  await persistGeneralPatch({ onboardingCompletedAt: new Date().toISOString() });
}
