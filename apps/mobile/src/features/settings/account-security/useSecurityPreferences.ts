import { useCallback, useEffect, useRef, useState } from 'react';
import {
  captureCloudAccountEpoch,
  isCloudAccountEpochCurrent,
  subscribeCloudAccountEpochChange,
  type CloudAccountEpoch,
} from '@/src/features/auth/services/cloudAccountSession';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import {
  fetchLockdownMode,
  fetchSessionTimeout,
  saveLockdownMode,
  saveSessionTimeout,
  SESSION_TIMEOUT_MINUTES,
  type SessionTimeoutMinutes,
} from './service';

type Field<T> = { value: T | null; busy: boolean; error: string | null };
export type SecuritySettingsOwner = {
  account: CloudAccountEpoch;
  controller: AbortController;
  timeout: Field<SessionTimeoutMinutes>;
  lockdown: Field<boolean>;
};

export function isSecuritySettingsOwnerCurrent(
  owner: SecuritySettingsOwner | null,
): owner is SecuritySettingsOwner {
  const auth = useAuthStore.getState();
  return Boolean(
    owner &&
    !owner.controller.signal.aborted &&
    isCloudAccountEpochCurrent(owner.account) &&
    auth.isClerkLoaded &&
    auth.isClerkSignedIn &&
    auth.clerkUserId === owner.account.ownerId &&
    useChatAppModeStore.getState().appMode === 'cloud',
  );
}

export function useSecurityPreferences() {
  const ownerRef = useRef<SecuritySettingsOwner | null>(null);
  const [view, setView] = useState<SecuritySettingsOwner | null>(null);
  const current = useCallback(
    (owner: SecuritySettingsOwner) =>
      ownerRef.current === owner && isSecuritySettingsOwnerCurrent(owner),
    [],
  );
  const publish = useCallback(
    (owner: SecuritySettingsOwner) => {
      if (current(owner)) setView({ ...owner });
    },
    [current],
  );

  const read = useCallback(
    async <T>(
      owner: SecuritySettingsOwner,
      field: Field<T>,
      fetchValue: () => Promise<T>,
      uncertain = false,
    ) => {
      try {
        const value = await fetchValue();
        if (!current(owner)) return;
        field.value = value;
        field.error = uncertain
          ? 'The save could not be confirmed. The server-reported setting is shown; the change may still finish.'
          : null;
      } catch {
        if (!current(owner)) return;
        field.value = null;
        field.error = uncertain
          ? 'The save could not be confirmed. Retry loading the setting before changing it.'
          : 'Could not load this setting. Retry loading it.';
      } finally {
        if (current(owner)) {
          field.busy = false;
          publish(owner);
        }
      }
    },
    [current, publish],
  );

  const loadTimeout = useCallback(
    (owner: SecuritySettingsOwner) => {
      if (!current(owner) || owner.timeout.busy) return;
      owner.timeout.busy = true;
      publish(owner);
      void read(owner, owner.timeout, () =>
        fetchSessionTimeout({
          accountEpoch: owner.account,
          signal: owner.controller.signal,
        }),
      );
    },
    [current, publish, read],
  );
  const loadLockdown = useCallback(
    (owner: SecuritySettingsOwner) => {
      if (!current(owner) || owner.lockdown.busy) return;
      owner.lockdown.busy = true;
      publish(owner);
      void read(owner, owner.lockdown, () =>
        fetchLockdownMode({
          accountEpoch: owner.account,
          signal: owner.controller.signal,
        }),
      );
    },
    [current, publish, read],
  );

  useEffect(() => {
    const retire = () => {
      ownerRef.current?.controller.abort();
      ownerRef.current = null;
    };
    const renew = () => {
      retire();
      const account = captureCloudAccountEpoch();
      const owner: SecuritySettingsOwner | null = account
        ? {
            account,
            controller: new AbortController(),
            timeout: { value: null, busy: false, error: null },
            lockdown: { value: null, busy: false, error: null },
          }
        : null;
      if (!isSecuritySettingsOwnerCurrent(owner)) {
        setView(null);
        return;
      }
      ownerRef.current = owner;
      setView({ ...owner });
      loadTimeout(owner);
      loadLockdown(owner);
    };
    const stopAccount = subscribeCloudAccountEpochChange(renew);
    const stopAuth = useAuthStore.subscribe((next, previous) => {
      if (
        next.clerkUserId !== previous.clerkUserId ||
        next.isClerkSignedIn !== previous.isClerkSignedIn ||
        next.isClerkLoaded !== previous.isClerkLoaded
      )
        renew();
    });
    const stopMode = useChatAppModeStore.subscribe((next, previous) => {
      if (next.appMode !== previous.appMode) renew();
    });
    renew();
    return () => {
      retire();
      stopAccount();
      stopAuth();
      stopMode();
    };
  }, [loadTimeout, loadLockdown]);

  const owner =
    view && ownerRef.current?.controller === view.controller && isSecuritySettingsOwnerCurrent(view)
      ? ownerRef.current
      : null;
  const cycleTimeout = async () => {
    if (!owner || !current(owner) || owner.timeout.busy || owner.timeout.value === null) return;
    const next =
      SESSION_TIMEOUT_MINUTES[
        (SESSION_TIMEOUT_MINUTES.indexOf(owner.timeout.value) + 1) % SESSION_TIMEOUT_MINUTES.length
      ];
    if (next === undefined) return;
    owner.timeout.busy = true;
    publish(owner);
    let uncertain = false;
    const options = { accountEpoch: owner.account, signal: owner.controller.signal };
    try {
      await saveSessionTimeout(next, options);
    } catch {
      uncertain = true;
    }
    if (current(owner))
      await read(owner, owner.timeout, () => fetchSessionTimeout(options), uncertain);
  };
  const changeLockdown = async (next: boolean) => {
    if (!owner || !current(owner) || owner.lockdown.busy || owner.lockdown.value === null) return;
    owner.lockdown.busy = true;
    publish(owner);
    let uncertain = false;
    const options = { accountEpoch: owner.account, signal: owner.controller.signal };
    try {
      await saveLockdownMode(next, options);
    } catch {
      uncertain = true;
    }
    if (current(owner))
      await read(owner, owner.lockdown, () => fetchLockdownMode(options), uncertain);
  };
  return {
    owner,
    timeout: owner?.timeout.value ?? null,
    lockdown: owner?.lockdown.value ?? null,
    savingTimeout: owner?.timeout.busy ?? false,
    savingLockdown: owner?.lockdown.busy ?? false,
    timeoutError: owner?.timeout.error ?? null,
    lockdownError: owner?.lockdown.error ?? null,
    cycleTimeout,
    changeLockdown,
    retryTimeout: () => {
      if (owner) loadTimeout(owner);
    },
    retryLockdown: () => {
      if (owner) loadLockdown(owner);
    },
  };
}
