import { Archive, Link2, MessageSquareDashed, Trash2 } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAuthStore } from '@/src/features/auth/store';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import {
  TEMPORARY_CHAT_CLOUD_EXPLAINER,
  TEMPORARY_CHAT_LOCAL_EXPLAINER,
} from '@/src/features/chat/components/TemporaryChatBanner';
import {
  SettingsGroup,
  SettingsRow,
  SettingsScreenShell,
  SettingsSwitchRow,
} from '@/src/features/settings/Common';
import { useOpenCloudRoute } from '@/src/features/settings/useOpenCloudRoute';

export const CLOUD_CHAT_RETENTION =
  'Deleted and temporary chats are normally deleted for good after 30 days. A workspace legal hold can keep them longer.';

export const PRIVACY_CENTER_ROUTE = '/(app)/settings/cloud-privacy';

export default function ChatPrivacyScreen() {
  const router = useRouter();
  const openCloudRoute = useOpenCloudRoute();
  const isCloud = useChatAppModeStore((s) => s.appMode) === 'cloud';
  const isClerkLoaded = useAuthStore((s) => s.isClerkLoaded);
  const isClerkSignedIn = useAuthStore((s) => s.isClerkSignedIn);
  const isTemporaryChat = useSettingsStore((s) => s.isTemporaryChat);
  const setTemporaryChat = useSettingsStore((s) => s.setTemporaryChat);
  const signInValue = isClerkLoaded && !isClerkSignedIn ? 'Sign in' : undefined;

  return (
    <SettingsScreenShell title="Chat privacy" backHref={PRIVACY_CENTER_ROUTE}>
      <SettingsGroup
        footnote={isCloud ? TEMPORARY_CHAT_CLOUD_EXPLAINER : TEMPORARY_CHAT_LOCAL_EXPLAINER}
      >
        <SettingsSwitchRow
          label="Temporary Chat"
          icon={MessageSquareDashed}
          value={isTemporaryChat}
          onValueChange={setTemporaryChat}
          testID="chat-privacy-temporary-chat"
          isLast
        />
      </SettingsGroup>

      <SettingsGroup footnote={isCloud ? CLOUD_CHAT_RETENTION : undefined}>
        {isCloud ? (
          <>
            <SettingsRow
              label="Shared links"
              icon={Link2}
              value={signInValue}
              onPress={openCloudRoute('/(app)/settings/shared-links')}
            />
            <SettingsRow
              label="Archived chats"
              icon={Archive}
              value={signInValue}
              onPress={openCloudRoute('/(app)/settings/archived-chats')}
            />
          </>
        ) : null}
        <SettingsRow
          label="Delete all chats"
          icon={Trash2}
          value="Data Controls"
          onPress={() =>
            router.push('/(app)/settings/data-controls' as Parameters<typeof router.push>[0])
          }
          isLast
        />
      </SettingsGroup>
    </SettingsScreenShell>
  );
}
