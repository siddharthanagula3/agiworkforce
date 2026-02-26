import { Zap, Hand } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUnifiedChatStore, type ConversationMode } from '@/stores/unified/unifiedChatStore';
import { Button } from '../ui/Button';
import { QuickModelSelector } from './QuickModelSelector';

export const ChatInputToolbar = () => {
  const conversationMode = useUnifiedChatStore((s) => s.conversationMode);
  const setConversationMode = useUnifiedChatStore((s) => s.setConversationMode);
  const toggleMode = () => {
    const newMode: ConversationMode = conversationMode === 'auto' ? 'manual' : 'auto';
    setConversationMode(newMode);
  };

  const isAutoMode = conversationMode === 'auto';

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-border/50 bg-background/80 backdrop-blur-xs">
      {}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Model:</span>
        <QuickModelSelector className="shrink-0" />
      </div>

      {}
      <Button
        variant={isAutoMode ? 'default' : 'outline'}
        size="sm"
        onClick={toggleMode}
        className={cn(
          'gap-2 transition-colors',
          isAutoMode && 'bg-emerald-500 hover:bg-emerald-600 text-white',
        )}
        title={isAutoMode ? 'Auto: Agent acts autonomously' : 'Manual: Agent asks permission'}
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
  );
};
