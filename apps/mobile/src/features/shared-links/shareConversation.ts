import { Alert, Share } from 'react-native';
import { toUserMessage } from '@/services/userMessage';
import { createSharedLink, type SharedLinkMessage } from './service';

export interface ShareConversationInput {
  conversationId: string;
  title: string;
  modelId: string | null;
  readMessages: () => Promise<SharedLinkMessage[]> | SharedLinkMessage[];
  isCurrent: () => boolean;
}

export function confirmShareConversation(input: ShareConversationInput): void {
  Alert.alert(
    'Share a link to this chat?',
    'Anyone with the link can read the messages in this chat until the link expires. You can revoke it in Settings, Shared links.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Create link',
        onPress: () => {
          if (!input.isCurrent()) return;
          void (async () => {
            try {
              const messages = await input.readMessages();
              if (!input.isCurrent()) return;
              const link = await createSharedLink({
                conversationId: input.conversationId,
                title: input.title,
                modelId: input.modelId,
                messages,
              });
              await Share.share({ message: link.shareUrl, url: link.shareUrl });
            } catch (error: unknown) {
              Alert.alert(
                'Could not create the link',
                toUserMessage(error, 'Try again in a moment.'),
              );
            }
          })();
        },
      },
    ],
  );
}
