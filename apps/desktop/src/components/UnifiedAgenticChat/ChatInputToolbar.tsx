import { useCallback, useEffect } from 'react';
import { Brain, EyeOff, Hand, Zap } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '../../lib/utils';
import { useUnifiedChatStore, type ConversationMode } from '../../stores/unifiedChatStore';
import { useChatStore } from '../../stores/chat/chatStore';
import {
  useThinkingStore,
  selectIsThinkingEnabled,
  selectThinkingBudget,
} from '../../stores/thinkingStore';
import { Button } from '../ui/Button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip';
import { QuickModelSelector } from './QuickModelSelector';
import { SpeedQualitySelector } from './SpeedQualitySelector';

export const ChatInputToolbar = () => {
  const { conversationMode, setConversationMode, activeConversationId } = useUnifiedChatStore(
    useShallow((s) => ({
      conversationMode: s.conversationMode,
      setConversationMode: s.setConversationMode,
      activeConversationId: s.activeConversationId,
    })),
  );

  // BUG-346: Read incognito from useChatStore directly (same store the toggle writes to)
  // to avoid dual-store read/write split that caused UI not updating.
  const isIncognito = useChatStore(
    (s) => s.conversations.find((c) => c.id === activeConversationId)?.incognito ?? false,
  );

  const toggleMode = useCallback(() => {
    const newMode: ConversationMode = conversationMode === 'auto' ? 'manual' : 'auto';
    setConversationMode(newMode);
  }, [conversationMode, setConversationMode]);

  // BUG-CIT-01 fix: toggle incognito on the current conversation instead of
  const handleIncognitoToggle = useCallback(() => {
    if (!activeConversationId) return;
    useChatStore.setState((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === activeConversationId
          ? { ...c, incognito: !c.incognito, updatedAt: new Date() }
          : c,
      ),
    }));
  }, [activeConversationId]);

  const isAutoMode = conversationMode === 'auto';

  // Thinking mode state from thinkingStore
  const thinkingEnabled = useThinkingStore(selectIsThinkingEnabled);
  const thinkingBudget = useThinkingStore(selectThinkingBudget);
  const thinkingToggle = useThinkingStore((s) => s.toggle);
  const thinkingInitialize = useThinkingStore((s) => s.initialize);

  // Initialize thinking store on mount
  useEffect(() => {
    void thinkingInitialize();
  }, [thinkingInitialize]);

  const handleThinkingToggle = useCallback(() => {
    void thinkingToggle();
  }, [thinkingToggle]);

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-border/50 bg-background/80 backdrop-blur-xs">
      {/* Model selector and speed/quality selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Model:</span>
        <QuickModelSelector className="shrink-0" />
        <SpeedQualitySelector />
      </div>

      <div className="flex items-center gap-2">
        {/* Thinking mode toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={thinkingEnabled ? 'default' : 'ghost'}
              size="sm"
              onClick={handleThinkingToggle}
              className={cn(
                'gap-1.5 transition-colors h-7 px-2',
                thinkingEnabled && 'bg-purple-600 hover:bg-purple-700 text-white',
              )}
              aria-label={
                thinkingEnabled ? 'Disable extended thinking' : 'Enable extended thinking'
              }
              aria-pressed={thinkingEnabled}
            >
              <Brain className="h-3.5 w-3.5" />
              {thinkingEnabled && <span className="text-xs font-medium">{thinkingBudget}</span>}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {thinkingEnabled
              ? `Extended thinking enabled (${thinkingBudget} budget). Click to disable.`
              : 'Enable extended thinking for deeper reasoning'}
          </TooltipContent>
        </Tooltip>

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
