import { Alert } from 'react-native';
import { useChatViewStore } from '@/stores/chat/chatViewStore';
import type { MobileImageGenerationRequestDecision } from './resolveMobileImageGenerationRequest';

export function alertBlockedImageRequest(
  decision: Extract<MobileImageGenerationRequestDecision, { status: 'blocked' }>,
): void {
  const { alert, switchModel } = decision;
  if (!switchModel) {
    Alert.alert(alert.title, alert.message);
    return;
  }
  Alert.alert(alert.title, alert.message, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: `Use ${switchModel.name}`,
      onPress: () => useChatViewStore.getState().setMediaModel('image', switchModel.id),
    },
  ]);
}
