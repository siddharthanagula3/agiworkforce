import { create } from 'zustand';
import type { PushNotificationAccountContext } from '@/services/notifications';
import { pushRegistrationPostsSettled } from '@/services/pushRegistrationPosts';
import {
  PushTokenCleanupCredentialRejectedError,
  releasePushDeviceForAccountHandover,
  unregisterPushTokenForSignOut,
} from '@/src/features/auth/services/signOutPushTokenCleanup';

export type ClerkTokenResolver = () => Promise<string | null>;

interface PushRegistrationRequestState {
  heldForUserId: string | null;
  generation: number;
}

export const usePushRegistrationRequestStore = create<PushRegistrationRequestState>(() => ({
  heldForUserId: null,
  generation: 0,
}));

export function holdPushRegistrationFor(userId: string): void {
  usePushRegistrationRequestStore.setState({ heldForUserId: userId });
}

export function clearPushRegistrationHold(): void {
  usePushRegistrationRequestStore.setState({ heldForUserId: null });
}

export function requestPushReregistration(): void {
  usePushRegistrationRequestStore.setState((state) => ({
    heldForUserId: null,
    generation: state.generation + 1,
  }));
}

interface PushTokenOwnerBinding {
  ownerId: string;
  generation: number;
  controller: AbortController;
  getToken: ClerkTokenResolver;
  capturedToken: Promise<string | null>;
  published: boolean;
  suspended: boolean;
  inheritedCleanupToken: Promise<string | null> | null;
}

function mayHaveRegistered(binding: PushTokenOwnerBinding): boolean {
  return binding.published || binding.inheritedCleanupToken !== null;
}

let activeBinding: PushTokenOwnerBinding | null = null;
let lifecycleGeneration = 0;
let cleanupQueue: PushTokenOwnerBinding[] = [];
let cleanupTail: Promise<void> = Promise.resolve();

function normalizedToken(token: string | null): string | null {
  const value = token?.trim();
  return value ? value : null;
}

function captureToken(getToken: ClerkTokenResolver): Promise<string | null> {
  try {
    return getToken().then(normalizedToken, () => null);
  } catch {
    return Promise.resolve(null);
  }
}

function bindingIsCurrent(binding: PushTokenOwnerBinding): boolean {
  return (
    activeBinding === binding &&
    lifecycleGeneration === binding.generation &&
    !binding.suspended &&
    !binding.controller.signal.aborted
  );
}

function enqueueCleanup(binding: PushTokenOwnerBinding | null): Promise<void> {
  if (binding && !cleanupQueue.includes(binding)) {
    cleanupQueue.push(binding);
  }

  const drain = cleanupTail
    .catch(() => undefined)
    .then(async () => {
      while (cleanupQueue.length > 0) {
        const queuedBinding = cleanupQueue[0]!;
        const token =
          (await queuedBinding.capturedToken) ?? (await queuedBinding.inheritedCleanupToken);
        if (token) {
          try {
            await unregisterPushTokenForSignOut(token);
          } catch (error) {
            if (!(error instanceof PushTokenCleanupCredentialRejectedError)) throw error;
          }
        } else if (mayHaveRegistered(queuedBinding)) {
          throw new Error(
            `Cannot safely transfer the push token from Clerk account ${queuedBinding.ownerId}: its cleanup credential is unavailable`,
          );
        }
        cleanupQueue.shift();
      }
    });
  cleanupTail = drain;
  return drain;
}

export async function beginPushTokenAccountSession(
  ownerId: string,
  getToken: ClerkTokenResolver,
): Promise<PushNotificationAccountContext | null> {
  const normalizedOwnerId = ownerId.trim();
  if (!normalizedOwnerId) {
    throw new Error('Push-token registration requires a non-empty Clerk user id');
  }

  const previousBinding = activeBinding;
  previousBinding?.controller.abort();

  const binding: PushTokenOwnerBinding = {
    ownerId: normalizedOwnerId,
    generation: ++lifecycleGeneration,
    controller: new AbortController(),
    getToken,
    capturedToken: captureToken(getToken),
    published: false,
    suspended: false,
    inheritedCleanupToken:
      previousBinding?.ownerId === normalizedOwnerId
        ? previousBinding.published
          ? previousBinding.capturedToken
          : previousBinding.inheritedCleanupToken
        : null,
  };
  activeBinding = binding;

  const cleanup =
    previousBinding && previousBinding.ownerId !== normalizedOwnerId
      ? enqueueCleanup(previousBinding)
      : enqueueCleanup(null);
  await cleanup;
  if (!bindingIsCurrent(binding)) return null;

  const initialToken = await binding.capturedToken;
  if (!initialToken || !bindingIsCurrent(binding)) return null;

  binding.published = true;
  return {
    ownerId: binding.ownerId,
    signal: binding.controller.signal,
    isCurrent: () => bindingIsCurrent(binding),
    getAuthToken: async () => {
      if (!bindingIsCurrent(binding)) return null;
      const token = await captureToken(binding.getToken);
      return bindingIsCurrent(binding) ? token : null;
    },
  };
}

export async function releasePushDeviceForAccountChange(authToken: string | null): Promise<void> {
  if (activeBinding) activeBinding.suspended = true;
  await pushRegistrationPostsSettled();
  if (!authToken) {
    throw new Error('The push registration cannot be released without the account credential');
  }
  await releasePushDeviceForAccountHandover(authToken);
}

export async function clearPushTokenAccountSession(): Promise<void> {
  const previousBinding = activeBinding;
  activeBinding = null;
  lifecycleGeneration += 1;
  previousBinding?.controller.abort();
  await enqueueCleanup(previousBinding);
}

export function __resetPushTokenAccountLifecycleForTests(): void {
  usePushRegistrationRequestStore.setState({ heldForUserId: null, generation: 0 });
  activeBinding?.controller.abort();
  activeBinding = null;
  lifecycleGeneration += 1;
  cleanupQueue = [];
  cleanupTail = Promise.resolve();
}
