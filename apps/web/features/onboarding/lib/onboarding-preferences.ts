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
  onboardingCompletedAt?: string;
}

export interface OnboardingSeed {
  preferredName: string;
  workDescription: string;
}

/**
 * The step-2 answer chooses which starter prompts the wizard offers and is
 * spent there. It is dropped rather than carried through a save because a
 * value kept on the account is a label every later reader can act on, and the
 * user was asked what they wanted to do first, not for a category to be filed
 * under. Dropping it here also clears the one accounts answered before this.
 */
function withoutDurableUseCase(stored: StoredGeneralPreferences): StoredGeneralPreferences {
  const { primaryUseCase: _spent, ...rest } = stored as StoredGeneralPreferences & {
    primaryUseCase?: string;
  };
  return rest;
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
  const current = withoutDurableUseCase(await readGeneralNamespace());
  await savePreferenceNamespace<StoredGeneralPreferences>(GENERAL_NAMESPACE, {
    ...current,
    ...patch,
  });
  await refreshProfileConsumers();
}

export async function completeOnboarding(input: {
  preferredName: string;
  workDescription: string;
}): Promise<void> {
  await persistGeneralPatch({
    preferredName: input.preferredName.trim(),
    workDescription: input.workDescription,
    onboardingCompletedAt: new Date().toISOString(),
  });
}

export async function skipOnboarding(): Promise<void> {
  await persistGeneralPatch({ onboardingCompletedAt: new Date().toISOString() });
}
