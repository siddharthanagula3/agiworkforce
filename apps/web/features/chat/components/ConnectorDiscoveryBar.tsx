'use client';

/**
 * ConnectorDiscoveryBar
 *
 * Horizontal row of service icons shown in the empty chat state below
 * SuggestedPrompts. Lets users know they can connect external tools.
 * Dismiss state is persisted in the chat preferences store (Zustand persist).
 */

import { Github, Settings, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { cn } from '@shared/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@shared/ui/tooltip';
import { useChatPreferencesStore } from '@features/chat/stores/chat-preferences-store';

interface ConnectorDef {
  id: string;
  name: string;
  /** Lucide component — only used for GitHub; others fall back to emoji */
  lucideIcon?: React.ComponentType<{ className?: string }>;
  emoji?: string;
  color: string;
  bgColor: string;
}

const CONNECTORS: ConnectorDef[] = [
  {
    id: 'github',
    name: 'GitHub',
    lucideIcon: Github,
    color: 'text-zinc-200',
    bgColor: 'bg-zinc-700/60',
  },
  {
    id: 'gmail',
    name: 'Gmail',
    emoji: '📧',
    color: 'text-red-300',
    bgColor: 'bg-red-500/20',
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    emoji: '📁',
    color: 'text-blue-300',
    bgColor: 'bg-blue-500/20',
  },
  {
    id: 'slack',
    name: 'Slack',
    emoji: '💬',
    color: 'text-purple-300',
    bgColor: 'bg-purple-500/20',
  },
  {
    id: 'notion',
    name: 'Notion',
    emoji: '📝',
    color: 'text-zinc-200',
    bgColor: 'bg-zinc-600/30',
  },
  {
    id: 'jira',
    name: 'Jira',
    emoji: '🎯',
    color: 'text-blue-300',
    bgColor: 'bg-blue-700/30',
  },
  {
    id: 'figma',
    name: 'Figma',
    emoji: '🎨',
    color: 'text-orange-300',
    bgColor: 'bg-orange-500/20',
  },
  {
    id: 'calendar',
    name: 'Calendar',
    emoji: '📅',
    color: 'text-blue-300',
    bgColor: 'bg-blue-500/20',
  },
];

export function ConnectorDiscoveryBar() {
  const router = useRouter();
  const dismissed = useChatPreferencesStore((s) => s.connectorBarDismissed);
  const setConnectorBarDismissed = useChatPreferencesStore((s) => s.setConnectorBarDismissed);

  if (dismissed) {
    return null;
  }

  function handleConnectorClick() {
    toast.info('Configure connectors in Settings');
    router.push('/dashboard/settings');
  }

  function handleSettingsClick(e: React.MouseEvent) {
    e.stopPropagation();
    router.push('/dashboard/settings');
  }

  function handleDismiss(e: React.MouseEvent) {
    e.stopPropagation();
    setConnectorBarDismissed(true);
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="w-full max-w-2xl">
        {/* Header row */}
        <div className="mb-2 flex items-center justify-between px-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Connect your tools</span>
          </div>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleSettingsClick}
                  aria-label="Open connector settings"
                  className="rounded p-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
                >
                  <Settings className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>Manage integrations</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleDismiss}
                  aria-label="Dismiss connector bar"
                  className="rounded p-1 text-muted-foreground/60 transition-colors hover:text-muted-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>Dismiss</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Scrollable connector icon row */}
        <div
          className={cn(
            'flex items-center gap-2 overflow-x-auto pb-1',
            'scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border/40',
            'sm:justify-center sm:overflow-x-visible',
          )}
          role="list"
          aria-label="Available integrations"
        >
          {CONNECTORS.map((connector) => {
            const LucideIcon = connector.lucideIcon;
            return (
              <Tooltip key={connector.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    role="listitem"
                    onClick={handleConnectorClick}
                    aria-label={`Connect ${connector.name}`}
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/20',
                      'transition-all duration-150 hover:scale-110 hover:border-border/50 hover:shadow-sm',
                      connector.bgColor,
                    )}
                  >
                    {LucideIcon ? (
                      <LucideIcon className={cn('h-4 w-4', connector.color)} />
                    ) : (
                      <span className="text-base leading-none" aria-hidden="true">
                        {connector.emoji}
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{connector.name}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}

          {/* "More" pill pointing to settings */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleSettingsClick}
                aria-label="See all connectors in settings"
                className={cn(
                  'flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-border/20 px-3',
                  'bg-muted/30 transition-all duration-150 hover:border-border/50 hover:bg-muted/50',
                )}
              >
                <span className="text-xs font-medium text-muted-foreground">+ More</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>View all integrations</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}
