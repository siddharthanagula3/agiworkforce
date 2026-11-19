import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { create } from 'zustand';
import { useAuthStore } from '@/src/features/auth/store';
import { useTermsAcceptanceStore } from '@/src/features/auth/store/termsAcceptanceStore';
import {
  beginCloudPostAuthIntent,
  consumePostAuthDestination,
} from '@/src/features/auth/services/postAuthIntent';
import {
  beginCloudAccountAddition,
  endCloudAccountAddition,
} from '@/src/features/auth/services/accountAddition';
import { hasQueuedCloudSends } from '@/src/features/auth/services/cloudAccountTeardown';
import { CLERK_LOAD_SETTLE_MS } from '@/src/integrations/clerk';
import {
  NO_DEVICE_ACCOUNTS,
  deviceAccountErrorMessage,
  getDeviceAccountsClerk,
  releaseActiveAccountPushDevice,
  readDeviceAccounts,
  sameDeviceAccounts,
  type DeviceAccount,
  type DeviceAccounts,
} from './deviceAccounts';

interface AccountSwitchState {
  switchingTo: DeviceAccount | null;
  setSwitchingTo: (account: DeviceAccount | null) => void;
}

export const useAccountSwitchStore = create<AccountSwitchState>()((set) => ({
  switchingTo: null,
  setSwitchingTo: (account) => set({ switchingTo: account }),
}));

export function useDeviceAccounts(): DeviceAccounts {
  const clerkUserId = useAuthStore((state) => state.clerkUserId);
  const isClerkLoaded = useAuthStore((state) => state.isClerkLoaded);
  const [accounts, setAccounts] = useState<DeviceAccounts>(() =>
    readDeviceAccounts(getDeviceAccountsClerk()),
  );

  useEffect(() => {
    const clerk = getDeviceAccountsClerk();
    const refresh = () => {
      const next = clerk ? readDeviceAccounts(clerk) : NO_DEVICE_ACCOUNTS;
      setAccounts((current) => (sameDeviceAccounts(current, next) ? current : next));
    };
    refresh();
    return clerk ? clerk.addListener(refresh) : undefined;
  }, [clerkUserId, isClerkLoaded]);

  return accounts;
}

type AdoptionOutcome = 'ready' | 'terms' | 'pending';

function adoptionOutcome(userId: string): AdoptionOutcome | null {
  const auth = useAuthStore.getState();
  if (auth.clerkUserId !== userId) return null;
  if (auth.isClerkSignedIn) return 'ready';
  const terms = useTermsAcceptanceStore.getState();
  if (terms.userId === userId && (terms.status === 'required' || terms.status === 'error')) {
    return 'terms';
  }
  return null;
}

export function waitForAccountAdoption(
  userId: string,
  timeoutMs = CLERK_LOAD_SETTLE_MS,
): Promise<AdoptionOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    const unsubscribers: (() => void)[] = [];
    const finish = (outcome: AdoptionOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      for (const unsubscribe of unsubscribers) unsubscribe();
      resolve(outcome);
    };
    const check = () => {
      const outcome = adoptionOutcome(userId);
      if (outcome) finish(outcome);
    };
    const deadline = setTimeout(() => finish('pending'), timeoutMs);
    unsubscribers.push(useAuthStore.subscribe(check), useTermsAcceptanceStore.subscribe(check));
    check();
  });
}

export function useAccountSwitch() {
  const router = useRouter();
  const setSwitchingTo = useAccountSwitchStore((state) => state.setSwitchingTo);
  const additionInFlight = useRef(false);

  const performSwitch = useCallback(
    async (account: DeviceAccount) => {
      if (account.active || useAccountSwitchStore.getState().switchingTo) return;
      setSwitchingTo(account);
      try {
        await useAuthStore.getState().switchAccount(account.sessionId);
        const outcome = await waitForAccountAdoption(account.userId);
        if (outcome === 'terms') {
          router.push(beginCloudPostAuthIntent());
        } else if (outcome === 'ready') {
          consumePostAuthDestination();
        }
      } catch (error) {
        Alert.alert('Could not switch accounts', deviceAccountErrorMessage(error, 'switch'));
      } finally {
        setSwitchingTo(null);
      }
    },
    [router, setSwitchingTo],
  );

  const switchTo = useCallback(
    async (account: DeviceAccount) => {
      if (account.active || useAccountSwitchStore.getState().switchingTo) return;
      if (!hasQueuedCloudSends()) {
        await performSwitch(account);
        return;
      }
      Alert.alert(
        `Switch to ${account.email}?`,
        'Messages from this account that are still waiting to send will be discarded.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Discard and switch',
            style: 'destructive',
            onPress: () => void performSwitch(account),
          },
        ],
      );
    },
    [performSwitch],
  );

  const startAddition = useCallback(async () => {
    const { clerkUserId, isClerkSignedIn } = useAuthStore.getState();
    if (!clerkUserId || !isClerkSignedIn || useAccountSwitchStore.getState().switchingTo) return;
    if (additionInFlight.current) return;
    additionInFlight.current = true;
    try {
      const signIn = beginCloudAccountAddition(clerkUserId);
      try {
        await releaseActiveAccountPushDevice();
      } catch (error) {
        endCloudAccountAddition({ cancelled: true });
        Alert.alert('Could not add an account', deviceAccountErrorMessage(error, 'add'));
        return;
      }
      router.push(signIn);
    } finally {
      additionInFlight.current = false;
    }
  }, [router]);

  const addAccount = useCallback(async () => {
    const { clerkUserId, isClerkSignedIn } = useAuthStore.getState();
    if (!clerkUserId || !isClerkSignedIn || useAccountSwitchStore.getState().switchingTo) return;
    if (!hasQueuedCloudSends()) {
      await startAddition();
      return;
    }
    Alert.alert(
      'Add another account?',
      'Messages from this account that are still waiting to send will be discarded.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard and add account',
          style: 'destructive',
          onPress: () => void startAddition(),
        },
      ],
    );
  }, [startAddition]);

  return { switchTo, addAccount };
}
