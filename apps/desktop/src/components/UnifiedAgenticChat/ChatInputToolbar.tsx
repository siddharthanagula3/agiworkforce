import { Shield, ShieldAlert, ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useUnifiedChatStore } from '../../stores/unifiedChatStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { Button } from '../ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '../ui/DropdownMenu';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip';
import { Badge } from '../ui/Badge';

/**
 * ChatInputToolbar - Model selector and safety controls
 *
 * Provides:
 * - Model selector dropdown (defaults to Ollama)
 * - Shield icon toggle (safe mode vs full control)
 *
 * This toolbar sits above the chat input area, similar to Cursor's interface
 */
export function ChatInputToolbar() {
  const { selectedModel, setSelectedModel, conversationMode, setConversationMode } =
    useUnifiedChatStore();
  const favoriteModels = useSettingsStore((s) => s.llmConfig.favoriteModels);

  // Default to first Ollama model if none selected
  const currentModel = selectedModel || favoriteModels.find((m) => m.startsWith('ollama/')) || favoriteModels[0] || 'ollama/llama3';

  // Parse model into provider and name
  const [provider, modelName] = currentModel.split('/');
  const displayProvider = provider?.toUpperCase() || 'OLLAMA';
  const displayModel = modelName || 'llama3';

  // Determine if we're in safe mode
  const isSafeMode = conversationMode === 'safe';

  const toggleSafeMode = () => {
    setConversationMode(isSafeMode ? 'full_control' : 'safe');
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-background/95 backdrop-blur-sm">
      {/* Left side: Model Selector */}
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-2 text-sm font-medium hover:bg-accent/50"
            >
              <Badge variant="outline" className="text-xs">
                {displayProvider}
              </Badge>
              <span className="text-muted-foreground">{displayModel}</span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Select Model
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            {/* Ollama Models (Local) */}
            <DropdownMenuLabel className="text-xs font-medium">
              Local (Ollama)
            </DropdownMenuLabel>
            {favoriteModels
              .filter((m) => m.startsWith('ollama/'))
              .map((model) => {
                const [prov, name] = model.split('/');
                return (
                  <DropdownMenuItem
                    key={model}
                    onClick={() => setSelectedModel(model)}
                    className={cn(
                      'cursor-pointer',
                      currentModel === model && 'bg-accent',
                    )}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span>{name}</span>
                      {currentModel === model && (
                        <Badge variant="secondary" className="text-xs ml-2">
                          Active
                        </Badge>
                      )}
                    </div>
                  </DropdownMenuItem>
                );
              })}

            <DropdownMenuSeparator />

            {/* Cloud Models */}
            <DropdownMenuLabel className="text-xs font-medium">
              Cloud Providers
            </DropdownMenuLabel>
            {favoriteModels
              .filter((m) => !m.startsWith('ollama/'))
              .map((model) => {
                const [prov, name] = model.split('/');
                return (
                  <DropdownMenuItem
                    key={model}
                    onClick={() => setSelectedModel(model)}
                    className={cn(
                      'cursor-pointer',
                      currentModel === model && 'bg-accent',
                    )}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {prov?.toUpperCase()}
                        </Badge>
                        <span>{name}</span>
                      </div>
                      {currentModel === model && (
                        <Badge variant="secondary" className="text-xs ml-2">
                          Active
                        </Badge>
                      )}
                    </div>
                  </DropdownMenuItem>
                );
              })}

            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-xs text-muted-foreground cursor-pointer"
              onClick={() => {
                // TODO: Open settings to manage favorite models
                console.log('Open settings to manage models');
              }}
            >
              Manage favorite models...
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Model info badge */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant={provider === 'ollama' ? 'secondary' : 'default'}
              className="text-xs"
            >
              {provider === 'ollama' ? 'Free (Local)' : 'Cloud'}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            {provider === 'ollama'
              ? 'Running locally via Ollama - no API costs'
              : 'Cloud model - incurs API costs'}
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Right side: Safety Controls */}
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={isSafeMode ? 'outline' : 'default'}
              size="sm"
              className={cn(
                'h-8 gap-2',
                isSafeMode
                  ? 'text-green-600 dark:text-green-400 border-green-600/50 hover:bg-green-50 dark:hover:bg-green-950/30'
                  : 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 hover:bg-orange-100 dark:hover:bg-orange-950/50',
              )}
              onClick={toggleSafeMode}
            >
              {isSafeMode ? (
                <>
                  <Shield className="h-4 w-4" />
                  <span className="text-xs font-medium">Safe Mode</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="h-4 w-4" />
                  <span className="text-xs font-medium">Full Control</span>
                </>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            {isSafeMode ? (
              <div className="space-y-1">
                <p className="font-semibold">Safe Mode (Recommended)</p>
                <p className="text-xs">
                  Agent asks for permission before taking actions like editing files,
                  clicking UI elements, or executing code.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="font-semibold text-orange-500">Full Control Mode</p>
                <p className="text-xs">
                  Agent acts autonomously without asking for permission. Use with caution.
                </p>
              </div>
            )}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
