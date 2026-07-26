import type { PushNotificationAccountContext } from '@/services/notifications';
import { unregisterPushTokenForSignOut } from '@/src/features/auth/services/signOutPushTokenCleanup';

export type ClerkTokenResolver = () => Promise<string | null>;

interface PushTokenOwnerBinding {
  ownerId: string;
  generation: number;
  controller: AbortController;
  getToken: ClerkTokenResolver;
  capturedToken: Promise<string | null>;
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
    // Invoke synchronously. On an A -> B render the global Clerk bridge is
    // replaced with B immediately, so deferring this invocation by even one
    // microtask could accidentally cache B's JWT under A's owner id.
    return getToken().then(normalizedToken, () => null);
  } catch {
    return Promise.resolve(null);
  }
}

function bindingIsCurrent(binding: PushTokenOwnerBinding): boolean {
  return (
    activeBinding === binding &&
    lifecycleGeneration === binding.generation &&
    !binding.controller.signal.aborted
  );
}

function enqueueCleanup(binding: PushTokenOwnerBinding | null): Promise<void> {
  if (binding && !cleanupQueue.includes(binding)) {
    cleanupQueue.push(binding);
  }

  // A failed/offline DELETE deliberately leaves its owner at the front of the
  // queue. The next account transition retries it before attempting any newer
  // cleanup, so a rapid A -> B -> C sequence can never skip A and let C race a
  // still-owned server device row.
  const drain = cleanupTail
    .catch(() => undefined)
    .then(async () => {
      while (cleanupQueue.length > 0) {
        const queuedBinding = cleanupQueue[0]!;
        const token = await queuedBinding.capturedToken;
        if (!token) {
          throw new Error(
            `Cannot safely transfer the push token from Clerk account ${queuedBinding.ownerId}: its cleanup credential is unavailable`,
          );
        }
        await unregisterPushTokenForSignOut(token);
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

export async function clearPushTokenAccountSession(): Promise<void> {
  const previousBinding = activeBinding;
  activeBinding = null;
  lifecycleGeneration += 1;
  previousBinding?.controller.abort();
  await enqueueCleanup(previousBinding);
}

/** TEST-ONLY: reset module state between deterministic lifecycle tests. */
export function __resetPushTokenAccountLifecycleForTests(): void {
  activeBinding?.controller.abort();
  activeBinding = null;
  lifecycleGeneration += 1;
  cleanupQueue = [];
  cleanupTail = Promise.resolve();
}
