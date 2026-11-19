import { useMemo } from 'react';
import { create } from 'zustand';
import { ActionMenuSheet } from '@/src/features/conversation-actions/RenameConversationModal';
import type {
  ConversationMenuAction,
  ConversationMenuState,
} from '@/src/features/conversation-actions/useConversationActions';

interface ActionMenuRequest {
  title: string;
  actions: ConversationMenuAction[];
  dismissLabel: string;
}

interface ActionMenuHostState extends ActionMenuRequest {
  visible: boolean;
  show: (request: ActionMenuRequest) => void;
  close: () => void;
}

const useActionMenuHostStore = create<ActionMenuHostState>()((set) => ({
  visible: false,
  title: '',
  actions: [],
  dismissLabel: '',
  show: (request) => set({ ...request, visible: true }),
  close: () => set((state) => (state.visible ? { visible: false } : state)),
}));

export function showActionMenu(request: ActionMenuRequest): void {
  useActionMenuHostStore.getState().show(request);
}

export function ActionMenuHost() {
  const visible = useActionMenuHostStore((s) => s.visible);
  const title = useActionMenuHostStore((s) => s.title);
  const actions = useActionMenuHostStore((s) => s.actions);
  const dismissLabel = useActionMenuHostStore((s) => s.dismissLabel);
  const close = useActionMenuHostStore((s) => s.close);
  const menu = useMemo<ConversationMenuState>(
    () => ({ visible, title, actions, close }),
    [actions, close, title, visible],
  );
  return <ActionMenuSheet menu={menu} dismissLabel={dismissLabel} />;
}
