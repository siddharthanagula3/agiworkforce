'use client';

import { useEffect, useMemo } from 'react';
import { ChatInterface } from '@agiworkforce/chat';
import { WebRuntime } from './WebRuntime';
import { supabase } from '@shared/lib/supabase-client';

export default function ChatPage() {
  const runtime = useMemo(() => new WebRuntime(), []);

  // Handle chat:action events (logout, etc.) — mirrors desktop App.tsx behavior
  useEffect(() => {
    const handleChatAction = (e: Event) => {
      const detail = (e as CustomEvent).detail as { type: string; tab?: string };
      if (detail.type === 'logout') {
        void supabase.auth.signOut().then(() => {
          window.location.href = '/login';
        });
      }
      // Settings, keyboard shortcuts, etc. are handled by the chat package's
      // built-in SettingsModal via useUIStore — no host-level handler needed.
    };
    window.addEventListener('chat:action', handleChatAction);
    return () => window.removeEventListener('chat:action', handleChatAction);
  }, []);

  return (
    <div className="h-screen w-full" data-theme-managed="">
      <ChatInterface
        runtime={runtime}
        className="h-full w-full"
        manageTheme={false}
        enableShortcuts={true}
      />
    </div>
  );
}
