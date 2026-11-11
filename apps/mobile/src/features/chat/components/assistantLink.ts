import { Alert, Linking } from 'react-native';
import {
  classifyExternalLink,
  getSystemIntentPrompt,
} from '@/src/features/chat/utils/externalUrls';
import { openUntrustedUrlInAppBrowser } from '@/lib/safeOpenURL';

export function openAssistantLink(url: string): void {
  const kind = classifyExternalLink(url);
  if (kind === 'http') {
    void openUntrustedUrlInAppBrowser(url);
    return;
  }
  if (kind !== 'system-intent') return;
  const prompt = getSystemIntentPrompt(url);
  if (!prompt) return;
  Alert.alert(prompt.title, prompt.message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Open', onPress: () => Linking.openURL(url).catch(() => undefined) },
  ]);
}
