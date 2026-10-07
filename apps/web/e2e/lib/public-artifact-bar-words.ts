import type { Locator } from '@playwright/test';
import {
  bindPublicWindowBarSources,
  measurePublicWindowBarWords,
  type PublicWindowBarSourceContract,
} from './public-window-bar-words';

export type ArtifactBarSourceContract = PublicWindowBarSourceContract;

export async function bindArtifactBarSources(
  frame: Locator,
  scope: ArtifactBarSourceContract['scope'],
) {
  return bindPublicWindowBarSources(frame, scope, 'artifact');
}

export async function measureArtifactBarWords(
  frame: Locator,
  contract: ArtifactBarSourceContract,
  canonicalInput: unknown,
  fontProofInput: unknown,
) {
  return measurePublicWindowBarWords(frame, contract, canonicalInput, fontProofInput, 'artifact');
}
