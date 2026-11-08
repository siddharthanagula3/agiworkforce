'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAppCommand } from '@shared/lib/app-commands';
import { useChatStore } from '@shared/stores/web-chat-store';

/**
 * File > New Temporary Chat opens a new chat that stays out of history.
 *
 * It sets the same pending flag the composer's Temporary chat row sets, then
 * opens `/chat` so the next send is temporary.
 */
export function useTemporaryChat(): void {
  const router = useRouter();
  useEffect(() => {
    return onAppCommand('new-temporary-chat', () => {
      useChatStore.getState().setPendingTemporaryChat(true);
      router.push('/chat');
    });
  }, [router]);
}
