import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { MonitorSmartphone, WrapText } from 'lucide-react-native';
import { CLOUD_CODE_SCREEN_TITLE } from '@/src/features/cloud-code/presentation';
import { FEATURES } from '@/lib/v1FeatureFlags';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import { isShownInMode } from '@/src/features/shell/destinationScope';
import {
  SettingsGroup,
  SettingsRow,
  SettingsScreenShell,
  SettingsSwitchRow,
} from '@/src/features/settings/Common';
import { useCodePreferences } from './store';

const REMOTE_CONTROL_SETTINGS_ROUTE = '/(app)/settings/remote-control';

export default function CodeSettingsScreen() {
  const router = useRouter();
  const wrapLongLines = useCodePreferences((state) => state.wrapLongLines);
  const setWrapLongLines = useCodePreferences((state) => state.setWrapLongLines);
  const appMode = useChatAppModeStore((state) => state.appMode);
  const offersRemoteControl =
    FEATURES.companion && isShownInMode(REMOTE_CONTROL_SETTINGS_ROUTE, appMode);

  const openRemoteControl = useCallback(() => {
    router.push(REMOTE_CONTROL_SETTINGS_ROUTE as Parameters<typeof router.push>[0]);
  }, [router]);

  return (
    <SettingsScreenShell title={CLOUD_CODE_SCREEN_TITLE}>
      <SettingsGroup>
        <SettingsSwitchRow
          testID="code-wrap-long-lines"
          label="Wrap long lines"
          description="Wrap code and diffs instead of scrolling sideways."
          icon={WrapText}
          value={wrapLongLines}
          onValueChange={setWrapLongLines}
          isLast
        />
      </SettingsGroup>
      {offersRemoteControl ? (
        <SettingsGroup>
          <SettingsRow
            label="Remote control"
            icon={MonitorSmartphone}
            onPress={openRemoteControl}
            isLast
          />
        </SettingsGroup>
      ) : null}
    </SettingsScreenShell>
  );
}
