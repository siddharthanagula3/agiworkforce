'use client';

import { useEffect, useRef } from 'react';
import type { ProjectChatDefaults } from '@agiworkforce/cloud-contracts';
import { useChatStore } from '@shared/stores/web-chat-store';
import { composerTogglesFromProjectDefaults } from '@/features/projects/lib/project-chat-defaults';

export function useProjectChatDefaults({
  projectId,
  chatDefaults,
  conversationId,
}: {
  projectId: string | null;
  chatDefaults: ProjectChatDefaults | null | undefined;
  conversationId: string | null;
}): void {
  const appliedRef = useRef<string | null>(null);
  useEffect(() => {
    if (conversationId) {
      appliedRef.current = null;
      return;
    }
    const toggles = composerTogglesFromProjectDefaults(chatDefaults);
    if (!projectId || !toggles) return;
    const key = `${projectId}:${JSON.stringify(toggles)}`;
    if (appliedRef.current === key) return;
    appliedRef.current = key;
    useChatStore.getState().setComposerToggles(toggles, null);
  }, [chatDefaults, conversationId, projectId]);
}
