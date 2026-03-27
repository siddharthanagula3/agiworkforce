import Link from 'next/link';
import { Sparkles, ExternalLink } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select';
import { getCoreManualModelOptions } from '@agiworkforce/types';
import { useVibeChatStore } from '../stores/vibe-chat-store';

const VIBE_MODEL_IDS = new Set(['claude-sonnet-4.6', 'gpt-5.4', 'gemini-3.1-flash-lite']);
const VIBE_MODEL_OPTIONS = getCoreManualModelOptions().filter((model) =>
  VIBE_MODEL_IDS.has(model.id),
);

export function VibeTopNav() {
  const { selectedModel, setSelectedModel } = useVibeChatStore();

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-background px-6 dark:border-gray-800">
      {/* Left: Title + Dashboard Link */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h1 className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-xl font-bold text-transparent">
            VIBE
          </h1>
        </div>

        <Link
          href="/chat"
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <span>Dashboard</span>
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Right: Model Selector */}
      <div className="flex items-center gap-4">
        <Select value={selectedModel} onValueChange={setSelectedModel}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select model" />
          </SelectTrigger>
          <SelectContent>
            {VIBE_MODEL_OPTIONS.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{model.label}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </header>
  );
}
