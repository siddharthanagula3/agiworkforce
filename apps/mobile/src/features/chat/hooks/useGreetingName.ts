import { useUser } from '@clerk/expo';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { useLocalSettingsStore } from '@/stores/settings/localSettingsStore';
import { useCloudSettingsStore } from '@/stores/settings/cloudSettingsStore';

export function useGreetingName(): string {
  const { user: clerkUser } = useUser();
  const isCloud = useChatAppModeStore((s) => s.appMode) === 'cloud';
  const localNickname = useLocalSettingsStore((s) => s.personalization.nickname);
  const localFullName = useLocalSettingsStore((s) => s.personalization.fullName);
  const localNameOptedOut = useLocalSettingsStore((s) => s.personalization.nameOptedOut === true);
  const cloudNickname = useCloudSettingsStore((s) => s.personalization.nickname);
  const cloudFullName = useCloudSettingsStore((s) => s.personalization.fullName);
  const cloudNameOptedOut = useCloudSettingsStore((s) => s.personalization.nameOptedOut === true);

  if (isCloud ? cloudNameOptedOut : localNameOptedOut) return '';
  const nickname = isCloud ? cloudNickname : localNickname;
  const fullName = isCloud ? cloudFullName : localFullName;
  const clerkFirstName = clerkUser?.firstName || clerkUser?.fullName?.split(' ')[0] || '';
  return nickname || fullName?.split(' ')[0] || (isCloud ? clerkFirstName : '');
}
