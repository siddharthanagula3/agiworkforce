'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@shared/ui/popover';
import { Command, CommandList, CommandItem, CommandGroup, CommandInput } from '@shared/ui/command';
import { useModelStore, AVAILABLE_MODELS, type AIModel } from '@shared/stores/model-store';
import { BudgetTrackerDisplay } from '@/components/UnifiedAgenticChat/BudgetTrackerDisplay';
import { AgentModeSwitcher } from './AgentModeSwitcher';
import { StyleSelector } from './StyleSelector';
import type { ChatMode } from '@features/chat/types';

const PROVIDER_COLORS: Record<string, string> = {
  OpenAI: 'bg-emerald-500',
  Anthropic: 'bg-orange-400',
  Google: 'bg-blue-500',
  DeepSeek: 'bg-indigo-500',
  Perplexity: 'bg-teal-500',
  xAI: 'bg-zinc-400',
  Mistral: 'bg-violet-500',
};

function groupByProvider(models: AIModel[]): Record<string, AIModel[]> {
  return models.reduce<Record<string, AIModel[]>>((acc, model) => {
    if (!acc[model.provider]) acc[model.provider] = [];
    acc[model.provider]!.push(model);
    return acc;
  }, {});
}

interface ComposerFooterProps {
  hint?: string;
  showModelSelector?: boolean;
}

export function ComposerFooter({
  hint = 'Enter to send · Shift+Enter for newline',
  showModelSelector = true,
}: ComposerFooterProps) {
  const [open, setOpen] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode>('solo');
  const selectedModelId = useModelStore((s) => s.selectedModelId);
  const setSelectedModelId = useModelStore((s) => s.setSelectedModelId);
  const getSelectedModel = useModelStore((s) => s.getSelectedModel);

  const selectedModel = getSelectedModel();
  const grouped = groupByProvider(AVAILABLE_MODELS);
  const dotColor = PROVIDER_COLORS[selectedModel.provider] ?? 'bg-muted-foreground';

  return (
    <div className="mt-2 space-y-2">
      {/* Budget display — renders only when tokens have been used */}
      <BudgetTrackerDisplay className="mx-1" />

      <div className="flex items-center justify-between gap-2 px-1">
        {/* Left: keyboard hint */}
        <span className="text-xs text-muted-foreground">{hint}</span>

        <div className="flex items-center gap-2">
          {/* Response style selector */}
          <StyleSelector />

          {/* Agent mode switcher */}
          <AgentModeSwitcher mode={chatMode} onChange={setChatMode} />

          {/* Model selector */}
          {showModelSelector && (
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <button
                  id="model-selector"
                  className="flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                  aria-label="Change model"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
                  <span className="max-w-[140px] truncate">{selectedModel.name}</span>
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" sideOffset={6} className="w-64 p-0">
                <Command>
                  <CommandInput placeholder="Search models..." className="h-9" />
                  <CommandList className="max-h-[280px]">
                    {Object.entries(grouped).map(([provider, models]) => (
                      <CommandGroup key={provider} heading={provider}>
                        {models.map((model) => {
                          const isSelected = model.id === selectedModelId;
                          const dot = PROVIDER_COLORS[model.provider] ?? 'bg-muted-foreground';
                          return (
                            <CommandItem
                              key={model.id}
                              value={`${model.provider} ${model.name} ${model.id}`}
                              onSelect={() => {
                                setSelectedModelId(model.id);
                                setOpen(false);
                              }}
                              className="flex cursor-pointer items-center gap-2"
                            >
                              <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
                              <span className={isSelected ? 'font-medium' : ''}>{model.name}</span>
                              {isSelected && (
                                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
                              )}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    ))}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
    </div>
  );
}
