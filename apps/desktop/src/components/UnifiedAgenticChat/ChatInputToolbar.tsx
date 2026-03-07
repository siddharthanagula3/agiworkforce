import { useCallback } from 'react';
import { EyeOff, Hand, Zap } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '../../lib/utils';
import { useUnifiedChatStore, type ConversationMode } from '../../stores/unifiedChatStore';
import { useChatStore } from '../../stores/chat/chatStore';
import { Button } from '../ui/Button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip';
import { QuickModelSelector } from './QuickModelSelector';

export const ChatInputToolbar = () => {
  const { conversationMode, setConversationMode, activeConversationId, conversations } =
    useUnifiedChatStore(
      useShallow((s) => ({
        conversationMode: s.conversationMode,
        setConversationMode: s.setConversationMode,
        activeConversationId: s.activeConversationId,
        conversations: s.conversations,
      })),
    );

  const activeConvo = conversations.find((c) => c.id === activeConversationId);
  const isIncognito = activeConvo?.incognito ?? false;

  const toggleMode = useCallback(() => {
    const newMode: ConversationMode = conversationMode === 'auto' ? 'manual' : 'auto';
    setConversationMode(newMode);
  }, [conversationMode, setConversationMode]);

  // BUG-CIT-01 fix: toggle incognito on the current conversation instead of
  // creating a new one. Uses useChatStore.setState directly since there is no
  // generic updateConversation action on the store.
  const handleIncognitoToggle = useCallback(() => {
    if (!activeConversationId) return;
    useChatStore.setState((state) => {
      const convo = state.conversations.find((c) => c.id === activeConversationId);
      if (convo) {
        convo.incognito = !convo.incognito;
        convo.updatedAt = new Date();
      }
    });
  }, [activeConversationId]);

  const isAutoMode = conversationMode === 'auto';

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-border/50 bg-background/80 backdrop-blur-xs">
      {/* Model selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Model:</span>
        <QuickModelSelector className="shrink-0" />
      </div>

      <div className="flex items-center gap-2">
        {/* Incognito toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isIncognito ? 'default' : 'ghost'}
              size="sm"
              onClick={handleIncognitoToggle}
              className={cn(
                'gap-1.5 transition-colors h-7 px-2',
                isIncognito && 'bg-violet-600 hover:bg-violet-700 text-white',
              )}
              aria-label={isIncognito ? 'Disable incognito mode' : 'Enable incognito mode'}
            >
              <EyeOff className="h-3.5 w-3.5" />
              {isIncognito && <span className="text-xs font-medium">Incognito</span>}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isIncognito
              ? 'Incognito mode: messages not saved to disk. Click to disable.'
              : 'Start an incognito conversation (not saved to disk)'}
          </TooltipContent>
        </Tooltip>

        {/* Auto/Manual mode toggle */}
        <Button
          variant={isAutoMode ? 'default' : 'outline'}
          size="sm"
          onClick={toggleMode}
          className={cn(
            'gap-2 transition-colors',
            isAutoMode && 'bg-emerald-500 hover:bg-emerald-600 text-white',
          )}
          title={isAutoMode ? 'Auto: Agent acts autonomously' : 'Manual: Agent asks permission'}
          aria-label="Toggle auto mode"
          aria-pressed={isAutoMode}
        >
          {isAutoMode ? (
            <>
              <Zap className="h-4 w-4" />
              <span className="text-xs font-medium">Auto</span>
            </>
          ) : (
            <>
              <Hand className="h-4 w-4" />
              <span className="text-xs font-medium">Manual</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
};
