import { useCallback, useMemo, useState } from 'react';
import type {
  ConversationMenuAction,
  ConversationMenuState,
} from '@/src/features/conversation-actions/useConversationActions';

interface ActionMenuContent {
  visible: boolean;
  title: string;
  message?: string;
  actions: ConversationMenuAction[];
}

const CLOSED: ActionMenuContent = { visible: false, title: '', actions: [] };

export interface ActionMenu {
  menu: ConversationMenuState;
  open: (title: string, actions: ConversationMenuAction[], message?: string) => void;
}

export function useActionMenu(): ActionMenu {
  const [content, setContent] = useState<ActionMenuContent>(CLOSED);

  const open = useCallback((title: string, actions: ConversationMenuAction[], message?: string) => {
    setContent({ visible: true, title, message, actions });
  }, []);

  const close = useCallback(() => {
    setContent((current) => (current.visible ? { ...current, visible: false } : current));
  }, []);

  const menu = useMemo<ConversationMenuState>(() => ({ ...content, close }), [close, content]);

  return { menu, open };
}
