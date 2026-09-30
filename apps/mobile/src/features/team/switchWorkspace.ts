import { Alert } from 'react-native';
import { useChatStore } from '@/stores/chatStore';
import { setActiveWorkspace } from '@/src/features/team';

export async function switchWorkspace(organizationId: string | null): Promise<boolean> {
  try {
    await setActiveWorkspace(organizationId);
  } catch {
    Alert.alert('Could not switch workspace', 'Your workspace was not changed. Try again.');
    return false;
  }
  try {
    await useChatStore.getState().loadConversations();
  } catch {
    Alert.alert('Workspace changed', 'Refresh your chats to see this workspace’s history.');
  }
  return true;
}
