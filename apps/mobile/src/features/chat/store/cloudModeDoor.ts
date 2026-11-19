import { COMPANY_SITE_NAME } from '@agiworkforce/types';
import { whenMmkvReady } from '@/lib/mmkv';
import {
  cloudProviderConsentWithdrawalInProgress,
  ensureCloudProviderConsent,
  finishUnfinishedCloudProviderConsentWithdrawal,
  hasCurrentCloudProviderConsent,
  subscribeCloudProviderConsentChange,
} from '@/services/providerConsent';
import {
  recordedCloudAccountOwnerId,
  subscribeCloudAccountEpochChange,
} from '@/src/features/auth/services/cloudAccountSession';
import { useAuthStore } from '@/src/features/auth/store';
import {
  forgetAskFromSiriOnDevice,
  revokeForgottenAskFromSiri,
} from '@/src/features/siri/askIntentToken';
import { showToast } from '@/src/shared/components/Toast';
import { setAppModeAdmission, useChatAppModeStore, type MobileChatAppMode } from './appModeStore';

export const STANDING_CLOUD_WORK_MAY_STILL_RUN = `Scheduled or running tasks may still run, so pause them in ${COMPANY_SITE_NAME} on the web.`;

interface CloudEntryRequest {
  readonly ownerId: string;
  onEntered: (() => void) | null;
}

let pendingEntry: CloudEntryRequest | null = null;
let askedEntry: CloudEntryRequest | null = null;

function sharingCurrent(): boolean {
  try {
    return hasCurrentCloudProviderConsent();
  } catch {
    return false;
  }
}

function sessionReadyFor(ownerId: string): boolean {
  const auth = useAuthStore.getState();
  return (
    auth.isClerkSignedIn &&
    auth.clerkUserId === ownerId &&
    recordedCloudAccountOwnerId() === ownerId
  );
}

function withdrawing(whenUnknown: boolean): boolean {
  try {
    return cloudProviderConsentWithdrawalInProgress();
  } catch {
    return whenUnknown;
  }
}

function askWhenReady(): void {
  const request = pendingEntry;
  if (!request || askedEntry === request || !sessionReadyFor(request.ownerId)) return;
  if (withdrawing(true)) return;
  askedEntry = request;
  void ensureCloudProviderConsent()
    .catch(() => false)
    .then((allowed) => {
      if (askedEntry === request) askedEntry = null;
      if (pendingEntry !== request) {
        askWhenReady();
        return;
      }
      pendingEntry = null;
      useChatAppModeStore.getState().setAppMode(allowed && sharingCurrent() ? 'cloud' : 'local');
      if (useChatAppModeStore.getState().appMode === 'cloud') request.onEntered?.();
    });
}

function requestCloudEntry(): void {
  const ownerId = recordedCloudAccountOwnerId();
  if (ownerId === null) return;
  if (pendingEntry?.ownerId === ownerId) pendingEntry.onEntered = null;
  else pendingEntry = { ownerId, onEntered: null };
  void Promise.resolve().then(askWhenReady);
}

export function enterCloudMode(onEntered: () => void): boolean {
  useChatAppModeStore.getState().setAppMode('cloud');
  if (useChatAppModeStore.getState().appMode === 'cloud') {
    onEntered();
    return true;
  }
  if (pendingEntry) pendingEntry.onEntered = onEntered;
  return false;
}

function admitAppMode(requested: MobileChatAppMode): MobileChatAppMode {
  if (requested === 'local') {
    pendingEntry = null;
    return 'local';
  }
  if (sharingCurrent()) return 'cloud';
  if (!withdrawing(false)) requestCloudEntry();
  return 'local';
}

function leaveCloudWithoutSharing(): boolean {
  if (useChatAppModeStore.getState().appMode !== 'cloud' || sharingCurrent()) return false;
  useChatAppModeStore.getState().setAppMode('local');
  return true;
}

let askFromSiriForgotten: Promise<void> = Promise.resolve();
let askFromSiriTurnOff: Promise<void> = Promise.resolve();

function warnTurnedOffOnThisDeviceOnly(error: unknown): void {
  console.warn('[cloudModeDoor] Ask from Siri was turned off on this device only:', error);
}

let askFromSiriTurningOff = false;
let askFromSiriTurnOffAgain = false;

function turnOffAskFromSiriWithoutSharing(): void {
  if (askFromSiriTurningOff) {
    if (sharingCurrent()) askFromSiriTurnOffAgain = true;
    return;
  }
  if (sharingCurrent()) return;
  askFromSiriTurningOff = true;
  const forgotten = forgetAskFromSiriOnDevice();
  askFromSiriForgotten = forgotten.catch((error: unknown) => {
    console.warn('[cloudModeDoor] the Ask from Siri token could not be removed:', error);
  });
  askFromSiriTurnOff = forgotten
    .then(revokeForgottenAskFromSiri)
    .catch(warnTurnedOffOnThisDeviceOnly)
    .finally(() => {
      askFromSiriTurningOff = false;
      if (!askFromSiriTurnOffAgain) return;
      askFromSiriTurnOffAgain = false;
      turnOffAskFromSiriWithoutSharing();
      return askFromSiriTurnOff;
    });
}

export function askFromSiriTokenForgotten(): Promise<void> {
  return askFromSiriForgotten;
}

export function askFromSiriTurnedOff(): Promise<void> {
  return askFromSiriTurnOff;
}

export function installCloudModeDoor(): () => void {
  setAppModeAdmission(admitAppMode);
  if (leaveCloudWithoutSharing()) requestCloudEntry();
  const stopConsent = subscribeCloudProviderConsentChange(() => {
    if (withdrawing(false)) pendingEntry = null;
    leaveCloudWithoutSharing();
    turnOffAskFromSiriWithoutSharing();
  });
  const stopAccount = subscribeCloudAccountEpochChange(() => {
    if (pendingEntry && pendingEntry.ownerId !== recordedCloudAccountOwnerId()) pendingEntry = null;
    if (leaveCloudWithoutSharing()) requestCloudEntry();
    turnOffAskFromSiriWithoutSharing();
  });
  const stopAuth = useAuthStore.subscribe(askWhenReady);
  let installed = true;
  whenMmkvReady(() => {
    if (!installed) return;
    const finished = finishUnfinishedCloudProviderConsentWithdrawal();
    if (finished) {
      useChatAppModeStore.getState().setAppMode('local');
      if (!finished.standingWorkPaused) showToast(STANDING_CLOUD_WORK_MAY_STILL_RUN);
      return;
    }
    turnOffAskFromSiriWithoutSharing();
    askWhenReady();
  });
  return () => {
    installed = false;
    setAppModeAdmission(null);
    stopConsent();
    stopAccount();
    stopAuth();
    pendingEntry = null;
    askedEntry = null;
    askFromSiriForgotten = Promise.resolve();
    askFromSiriTurnOff = Promise.resolve();
    askFromSiriTurningOff = false;
    askFromSiriTurnOffAgain = false;
  };
}
