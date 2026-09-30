import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { Mic } from 'lucide-react-native';
import { SettingsGroup, SettingsSwitchRow } from '@/src/features/settings/common';
import { toUserMessage } from '@/services/userMessage';
import {
  askFromSiriSupported,
  disableAskFromSiri,
  enableAskFromSiri,
  isAskFromSiriEnabled,
} from './askIntentToken';

export function AskFromSiriSetting() {
  const [enabled, setEnabled] = useState(isAskFromSiriEnabled);
  const [saving, setSaving] = useState(false);

  const change = useCallback(async (next: boolean) => {
    setSaving(true);
    try {
      if (next) await enableAskFromSiri();
      else await disableAskFromSiri();
      setEnabled(next);
    } catch (error) {
      setEnabled(isAskFromSiriEnabled());
      Alert.alert(
        next ? 'Ask from Siri was not turned on' : 'Ask from Siri was not fully turned off',
        toUserMessage(error, 'Check your connection and try again.'),
      );
    } finally {
      setSaving(false);
    }
  }, []);

  if (!askFromSiriSupported()) return null;
  return (
    <SettingsGroup>
      <SettingsSwitchRow
        label="Ask from Siri"
        description="Siri can send a question to AGI Workforce and read the answer without opening the app. Answers use your default model with no tools, and each one is saved as a chat."
        icon={Mic}
        value={enabled}
        onValueChange={(next) => void change(next)}
        disabled={saving}
        isLast
        testID="settings-ask-from-siri"
      />
    </SettingsGroup>
  );
}
