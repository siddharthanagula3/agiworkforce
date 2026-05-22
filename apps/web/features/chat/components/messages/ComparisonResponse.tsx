'use client';

import { useState } from 'react';
import { Check, Columns2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
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
  const [hovered, setHovered] = useState<'a' | 'b' | null>(null);

  const chosen = choice ?? null;

  function handleChoose(side: 'a' | 'b') {
    if (!chosen && onChoose) onChoose(side);
  }

  return (
    <div className="mt-3 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Columns2 className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="font-medium">Two approaches for you:</span>
      </div>

      {/* Side-by-side panels */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(['a', 'b'] as const).map((side) => {
          const opt = side === 'a' ? optionA : optionB;
          const label = opt.label ?? (side === 'a' ? 'Builder-focused' : 'Vision-forward');
          const isChosen = chosen === side;
          const isDimmed = chosen !== null && chosen !== side;

          return (
            <div
              key={side}
              data-testid={`comparison-option-${side}`}
              className={cn(
                'relative rounded-xl border p-4 transition-all duration-200',
                isChosen
                  ? 'border-primary/60 bg-primary/5 ring-1 ring-primary/40'
                  : isDimmed
                    ? 'border-border/40 bg-muted/20 opacity-50'
                    : hovered === side
                      ? 'border-primary/30 bg-muted/30'
                      : 'border-border/50 bg-muted/10',
              )}
              onMouseEnter={() => !chosen && setHovered(side)}
              onMouseLeave={() => setHovered(null)}
            >
              {/* Option label pill */}
              <div className="mb-2 flex items-center justify-between">
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
                    isChosen ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {label}
                </span>
                {isChosen && (
                  <Check
                    className="h-4 w-4 text-primary"
                    aria-label={`Option ${side.toUpperCase()} chosen`}
                  />
                )}
              </div>

              {/* Content */}
              <div
                className={cn(
                  'prose dark:prose-invert max-w-none text-sm leading-relaxed',
                  isDimmed && 'select-none',
                )}
              >
                {isStreaming && !opt.content.trim() ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
                    <span className="text-xs">Generating...</span>
                  </div>
                ) : (
                  <MarkdownContent content={opt.content} isStreaming={isStreaming && !isChosen} />
                )}
              </div>

              {/* Choose CTA */}
              {!chosen && (
                <div className="mt-3">
                  <Button
                    size="sm"
                    variant={hovered === side ? 'default' : 'outline'}
                    className="h-7 w-full text-xs font-medium transition-all"
                    onClick={() => handleChoose(side)}
                    aria-label={`Choose option ${side.toUpperCase()}`}
                  >
                    Choose {side.toUpperCase()}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {chosen && (
        <p className="text-xs text-muted-foreground">
          You chose option {chosen.toUpperCase()}. The other response has been dimmed.
        </p>
      )}
    </div>
  );
}
