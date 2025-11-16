import { Shield, ShieldOff } from 'lucide-react';
import { useUnifiedChatStore, type ConversationMode } from '../../stores/unifiedChatStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useModelStore } from '../../stores/modelStore';
import { QuickModelSelector } from '../chat/QuickModelSelector';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

export const ChatInputToolbar = () => {
  const conversationMode = useUnifiedChatStore((s) => s.conversationMode);
  const setConversationMode = useUnifiedChatStore((s) => s.setConversationMode);
  const llmConfig = useSettingsStore((s) => s.llmConfig);
  const { selectedModel, selectModel } = useModelStore();

  const toggleSafetyMode = () => {
    const newMode: ConversationMode = conversationMode === 'safe' ? 'full_control' : 'safe';
    setConversationMode(newMode);
  };

  const isSafeMode = conversationMode === 'safe';

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-border/50 bg-background/80 backdrop-blur-sm">
      {/* Model Selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Model:</span>
        <QuickModelSelector className="flex-shrink-0" />
      </div>

      {/* Safety Toggle */}
      <Button
        variant={isSafeMode ? "outline" : "default"}
        size="sm"
        onClick={toggleSafetyMode}
        className={cn(
          "gap-2 transition-colors",
          !isSafeMode && "bg-orange-500 hover:bg-orange-600 text-white"
        )}
        title={isSafeMode ? "Safe Mode: Agent asks permission" : "Full Control: Agent acts freely"}
      >
        {isSafeMode ? (
          <>
            <Shield className="h-4 w-4" />
            <span className="text-xs font-medium">Safe Mode</span>
          </>
        ) : (
          <>
            <ShieldOff className="h-4 w-4" />
            <span className="text-xs font-medium">Full Control</span>
          </>
        )}
      </Button>
    </div>
  );
};
