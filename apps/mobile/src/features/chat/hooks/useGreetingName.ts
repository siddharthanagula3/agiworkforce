import { useEffect, useSyncExternalStore } from 'react';
import { useUser } from '@clerk/expo';
import {
  recordedCloudAccountOwnerId,
  subscribeCloudAccountEpochChange,
} from '@/src/features/auth/services/cloudAccountSession';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useCloudProfileStore } from '@/src/features/settings/cloud-account/cloudProfileStore';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';
import { useCloudSettingsStore } from '@/stores/settings/cloudSettingsStore';

const PERSON_NAME_WORD = /^\p{L}[\p{L}\p{M}]*(?:['’-]\p{L}[\p{L}\p{M}]*)*$/u;
const SERVER_PLACEHOLDER_NAME = 'user';

function firstNameFromProfile(
  displayName: string | null,
  handles: ReadonlyArray<string | null | undefined>,
): string {
  const word = displayName?.trim().split(/\s+/, 1)[0] ?? '';
  if (!PERSON_NAME_WORD.test(word)) return '';
  const lowered = word.toLowerCase();
  if (lowered === SERVER_PLACEHOLDER_NAME) return '';
  const isHandle = handles.some((handle) => handle?.trim().toLowerCase() === lowered);
  return isHandle ? '' : word;
}

export function useGreetingName(): string {
  const { user: clerkUser } = useUser();
  const isCloud = useChatAppModeStore((s) => s.appMode) === 'cloud';
  const isClerkSignedIn = useAuthStore((s) => s.isClerkSignedIn);
  const localNickname = useLocalSettingsStore((s) => s.personalization.nickname);
  const localFullName = useLocalSettingsStore((s) => s.personalization.fullName);
  const localNameOptedOut = useLocalSettingsStore((s) => s.personalization.nameOptedOut === true);
  const cloudNickname = useCloudSettingsStore((s) => s.personalization.nickname);
  const cloudFullName = useCloudSettingsStore((s) => s.personalization.fullName);
  const cloudNameOptedOut = useCloudSettingsStore((s) => s.personalization.nameOptedOut === true);
  const userId = clerkUser?.id;
  const profileName = useCloudProfileStore((s) =>
    userId && s.ownerId === userId ? s.displayName : null,
  );
  const loadProfile = useCloudProfileStore((s) => s.load);
  const activeAccountId = useSyncExternalStore(
    subscribeCloudAccountEpochChange,
    recordedCloudAccountOwnerId,
  );

  const optedOut = isCloud ? cloudNameOptedOut : localNameOptedOut;
  const nickname = (isCloud ? cloudNickname : localNickname)?.trim() ?? '';
  const fullName = (isCloud ? cloudFullName : localFullName)?.trim() ?? '';
  const clerkFirstName = clerkUser?.firstName || clerkUser?.fullName?.split(' ')[0] || '';
  const needsProfileName = isCloud && !optedOut && !nickname && !fullName && !clerkFirstName;
  const canReadProfile = needsProfileName && isClerkSignedIn && Boolean(userId);

  const accountActive = Boolean(userId) && activeAccountId === userId;

  useEffect(() => {
    if (!canReadProfile || !userId || !accountActive) return;
    const state = useCloudProfileStore.getState();
    if (state.ownerId === userId && (state.loaded || state.loading)) return;
    void loadProfile(userId);
  }, [canReadProfile, accountActive, userId, loadProfile]);

  if (optedOut) return '';
  const profileFirstName = canReadProfile
    ? firstNameFromProfile(profileName, [
        clerkUser?.primaryEmailAddress?.emailAddress?.split('@')[0],
        clerkUser?.username,
      ])
    : '';
  return nickname || fullName.split(' ')[0] || (isCloud ? clerkFirstName || profileFirstName : '');
}
