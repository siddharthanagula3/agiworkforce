import type * as vscode from 'vscode';

export const ONBOARDING_SEEN_KEY = 'agiWorkforce.onboardingSeen';

export function shouldShowOnboarding(globalState: Pick<vscode.Memento, 'get'>): boolean {
  return globalState.get<boolean>(ONBOARDING_SEEN_KEY) !== true;
}
