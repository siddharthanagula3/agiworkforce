'use client';

import { Search } from '@agiworkforce/icons';
import { cn } from '../cn';
import { useUiTranslation } from '../i18n';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../primitives/Dialog';
import type { SidebarSession } from './types';

export interface SearchOverlayProps {
  open: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  results: SidebarSession[];
  activeSessionId?: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}

export function SearchOverlay({
  open,
  query,
  onQueryChange,
  results,
  activeSessionId,
  onSelect,
  onClose,
}: SearchOverlayProps) {
  const { t } = useUiTranslation('chat');

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent
        hideCloseButton
        closeLabel={t('sidebar.closeSearch', 'Close search')}
        overlayProps={{ className: 'bg-black/50' }}
        className="block w-[min(96vw,42rem)] max-w-2xl gap-0 border-0 bg-transparent p-0 shadow-none backdrop-blur-none"
      >
        <DialogTitle className="sr-only">
          {t('sidebar.searchConversations', 'Search conversations')}
        </DialogTitle>
        <DialogDescription className="sr-only">
          {t(
            'sidebar.searchConversationsDescription',
            'Search your conversation history and open a matching conversation.',
          )}
        </DialogDescription>
        <div className="overflow-hidden rounded-xl bg-[hsl(var(--card))] shadow-2xl">
          <div className="flex items-center gap-3 border-b border-[hsl(var(--border))] px-5 py-4">
            <Search className="h-5 w-5 text-[hsl(var(--muted-foreground))]" />
            <input
              aria-label={t('sidebar.searchConversations', 'Search conversations')}
              placeholder={t('sidebar.searchConversations', 'Search conversations...')}
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              className="flex-1 bg-transparent text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none"
              autoFocus
            />
            <kbd className="rounded bg-[hsl(var(--muted))] px-2 py-1 text-xs text-[hsl(var(--muted-foreground))]">
              ESC
            </kbd>
          </div>
          <div className="max-h-96 overflow-y-auto p-2">
            {results.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
                {t('sidebar.noConversationsFound', 'No conversations found')}
              </div>
            ) : (
              results.slice(0, 10).map((conv) => (
                <button
                  type="button"
                  key={conv.id}
                  onClick={() => {
                    onSelect(conv.id);
                    onClose();
                  }}
                  className={cn(
                    'w-full rounded-lg px-3 py-2 text-left transition-colors',
                    conv.id === activeSessionId
                      ? 'bg-[hsl(var(--primary))]/10'
                      : 'hover:bg-[hsl(var(--accent))]',
                  )}
                >
                  <div className="text-sm font-medium text-[hsl(var(--foreground))]">
                    {conv.title || t('sidebar.untitled', 'Untitled')}
                  </div>
                  {(conv.lastMessage ?? conv.preview) && (
                    <div className="mt-1 truncate text-xs text-[hsl(var(--muted-foreground))]">
                      {conv.lastMessage ?? conv.preview}
                    </div>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
