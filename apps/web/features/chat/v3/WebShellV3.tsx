'use client';

import { useCallback, useMemo, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChatInterface,
  type ChatHostBridge,
  type ChatInterfaceProps,
} from '@agiworkforce/unified-chat';
import type { ChatRuntime } from '@agiworkforce/unified-chat';
import { WebSidebar } from './WebSidebar';
import { WebEmptyChat } from './WebEmptyChat';
import { WebSearchModalCmdK } from './WebSearchModalCmdK';

// ─── mode type ───────────────────────────────────────────────────────────────

export type V3Mode = 'chat' | 'work' | 'code';

// ─── props ───────────────────────────────────────────────────────────────────

export interface WebShellV3Props {
  runtime: ChatRuntime | null;
  className?: string;
  hostBridge?: ChatHostBridge | null;
  onModelSelectorClick?: () => void;
  onVoiceClick?: () => void;
  onNavigateView?: ChatInterfaceProps['onNavigateView'];
}

const VIEW_ROUTES: Record<string, string> = {
  projects: '/projects',
  artifacts: '/gallery',
  'customize-home': '/customize',
  'work-projects': '/agi-work',
  'work-artifacts': '/gallery',
  'work-dispatch': '/agi-work',
  code: '/agi-code',
  routines: '/agi-code',
  'voice-settings': '/settings/voice',
  account: '/settings/account',
  schedules: '/schedules',
};

export function resolveWebViewRoute(view: string): string | undefined {
  return VIEW_ROUTES[view];
}

/**
 * v3 web shell.
 *
 * Layout mirrors DesktopShellV3: WebSidebar (240/64px collapsible) left +
 * main view area right. Uses web-compatible store imports instead of Tauri.
 * SearchModalCmdK bound to Ctrl+K / Cmd+K globally.
 */
export function WebShellV3({
  runtime,
  className,
  hostBridge,
  onModelSelectorClick,
  onVoiceClick,
  onNavigateView,
}: WebShellV3Props) {
  const router = useRouter();
  const [mode, setMode] = useState<V3Mode>('chat');
  const [searchOpen, setSearchOpen] = useState(false);
  const sidebarConversations = useMemo(
    () => hostBridge?.getSnapshot().conversations ?? [],
    [hostBridge],
  );

  // Global Ctrl+K / Cmd+K to open search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleNewChat = useCallback(() => {
    void (async () => {
      try {
        const hostConversationId = hostBridge?.createConversation?.('New Conversation');
        if (hostConversationId) {
          hostBridge?.selectConversation?.(hostConversationId);
          return;
        }

        if (!runtime) return;
        const created = await runtime.createConversation('New Conversation');
        const conversationId = typeof created === 'string' ? created : created.id;
        hostBridge?.selectConversation?.(conversationId);
      } catch (error) {
        console.error('Failed to create a new conversation', error);
      }
    })();
  }, [hostBridge, runtime]);

  const handleNavigateView = useCallback(
    (view: string) => {
      if (onNavigateView) {
        onNavigateView(view as Parameters<NonNullable<typeof onNavigateView>>[0]);
        return;
      }
      const route = resolveWebViewRoute(view);
      if (route) {
        router.push(route);
      }
    },
    [onNavigateView, router],
  );

  const handleJumpConversation = useCallback(
    (id: string) => {
      hostBridge?.selectConversation?.(id);
    },
    [hostBridge],
  );

  return (
    <div
      className={className}
      data-v3-shell=""
      style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden' }}
    >
      <WebSidebar
        mode={mode}
        onModeChange={setMode}
        onNewChat={handleNewChat}
        onOpenSearch={() => setSearchOpen(true)}
        onNavigateView={handleNavigateView}
        onJumpConversation={handleJumpConversation}
        onOpenAccountMenu={() => handleNavigateView('account')}
        conversations={sidebarConversations}
      />

      <div style={{ flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden' }}>
        <ChatInterface
          runtime={runtime}
          className="h-full w-full"
          manageTheme={false}
          enableShortcuts={true}
          hostBridge={hostBridge}
          onModelSelectorClick={onModelSelectorClick}
          onVoiceClick={onVoiceClick}
          onNavigateView={onNavigateView}
          emptyStateSlot={<WebEmptyChat />}
          sidebarSlot={null}
          showProvenanceFooter={true}
        />
      </div>

      {searchOpen && (
        <WebSearchModalCmdK
          onClose={() => setSearchOpen(false)}
          onNavigate={(dest, item) => {
            if (dest === 'chat' && item.kind === 'chat') {
              hostBridge?.selectConversation?.(item.id);
            }
          }}
        />
      )}
    </div>
  );
}
