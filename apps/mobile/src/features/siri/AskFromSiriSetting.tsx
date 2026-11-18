import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Mic } from 'lucide-react-native';
import { SettingsGroup, SettingsSwitchRow } from '@/src/features/settings/Common';
import { EgressBlockedError } from '@/lib/egressGuard';
import { toUserMessage } from '@/services/userMessage';
import { CloudProviderConsentRequiredError } from '@/services/llmGate';
import { subscribeCloudProviderConsentChange } from '@/services/providerConsent';
import { askFromSiriTokenForgotten } from '@/src/features/chat/store/cloudModeDoor';
import { useChatAppModeStore } from '@/src/features/chat/store/appModeStore';
import {
  askFromSiriSupported,
  disableAskFromSiri,
  enableAskFromSiri,
  isAskFromSiriEnabled,
} from './askIntentToken';

export function AskFromSiriSetting() {
  const [enabled, setEnabled] = useState(isAskFromSiriEnabled);
  const [saving, setSaving] = useState(false);
  const isCloud = useChatAppModeStore((s) => s.appMode) === 'cloud';

  const readStored = useCallback(() => setEnabled(isAskFromSiriEnabled()), []);
  useFocusEffect(readStored);
  useEffect(readStored, [readStored, isCloud]);
  useEffect(
    () =>
      subscribeCloudProviderConsentChange(() => {
        readStored();
        void askFromSiriTokenForgotten().then(readStored);
      }),
    [readStored],
  );

  const change = useCallback(async (next: boolean) => {
    setSaving(true);
    try {
      if (next) await enableAskFromSiri();
      else await disableAskFromSiri();
      setEnabled(next);
    } catch (error) {
      const stillOn = isAskFromSiriEnabled();
      setEnabled(stillOn);
      if (error instanceof CloudProviderConsentRequiredError) return;
      if (!next && !stillOn && error instanceof EgressBlockedError) return;
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
        description={
          isCloud || enabled
            ? 'Ask AGI through Siri and hear the answer, saved as a chat.'
            : 'Needs AGI Cloud. Switch to Cloud mode to turn it on.'
        }
        icon={Mic}
        value={enabled}
        onValueChange={(next) => void change(next)}
        disabled={saving || (!isCloud && !enabled)}
        isLast
        testID="settings-ask-from-siri"
      />
    </SettingsGroup>
  );
}
