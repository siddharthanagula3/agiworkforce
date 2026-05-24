'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import MarkdownContent from './MarkdownContent';

export interface ComparisonOption {
  label?: string;
  content: string;
}

export interface ComparisonResponseProps {
  optionA: ComparisonOption;
  optionB: ComparisonOption;
  choice?: 'a' | 'b';
  onChoose?: (choice: 'a' | 'b') => void;
  isStreaming?: boolean;
}

export function ComparisonResponse({
  optionA,
  optionB,
  choice,
  onChoose,
  isStreaming,
}: ComparisonResponseProps) {
  const [activeTab, setActiveTab] = useState<'a' | 'b'>(choice ?? 'a');

  const labelA = optionA.label ?? 'Builder-focused';
  const labelB = optionB.label ?? 'Vision-forward';

  const chosen = choice ?? null;
  const currentOpt = activeTab === 'a' ? optionA : optionB;

  function handleTabClick(tab: 'a' | 'b') {
    setActiveTab(tab);
  }

  function handleChoose() {
    if (!chosen && onChoose) onChoose(activeTab);
  }

  return (
    <div className="mt-3 space-y-3">
      {/* Tab toggle header */}
      <div className="flex items-center gap-1 rounded-lg border border-border/40 bg-muted/20 p-1 w-fit">
        {(['a', 'b'] as const).map((tab) => {
          const label = tab === 'a' ? labelA : labelB;
          const isActive = activeTab === tab;
          const isChosen = chosen === tab;

          return (
            <button
              key={tab}
              type="button"
              onClick={() => handleTabClick(tab)}
              data-testid={`comparison-tab-${tab}`}
              aria-selected={isActive}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150',
                isActive
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {isChosen && <Check className="h-3 w-3 text-primary" aria-hidden="true" />}
              {label}
            </button>
          );
        })}
      </div>

      {/* Single content area showing active tab */}
      <div
        data-testid={`comparison-option-${activeTab}`}
        className="rounded-xl border border-border/50 bg-muted/10 p-4"
      >
        {/* Option label pill */}
        <div className="mb-2 flex items-center justify-between">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
              chosen === activeTab
                ? 'bg-primary/15 text-primary'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {chosen === activeTab && (
              <Check className="h-3 w-3" aria-label={`Option ${activeTab.toUpperCase()} chosen`} />
            )}
            {activeTab === 'a' ? labelA : labelB}
          </span>
        </div>

        {/* Content */}
        <div className="prose dark:prose-invert max-w-none text-sm leading-relaxed">
          {isStreaming && !currentOpt.content.trim() ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
              <span className="text-xs">Generating...</span>
            </div>
          ) : (
            <MarkdownContent
              content={currentOpt.content}
              isStreaming={isStreaming && chosen !== activeTab}
            />
          )}
        </div>

        {/* Choose CTA */}
        {!chosen && (
          <div className="mt-3">
            <button
              type="button"
              onClick={handleChoose}
              aria-label={`Choose option ${activeTab.toUpperCase()}`}
              className="h-7 w-full rounded-md border border-border/50 bg-transparent text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              Choose {activeTab.toUpperCase()}
            </button>
          </div>
        )}
      </div>

      {chosen && (
        <p className="text-xs text-muted-foreground">
          You chose option {chosen.toUpperCase()}. The other response has been dimmed.
        </p>
      )}
    </div>
  );
}
