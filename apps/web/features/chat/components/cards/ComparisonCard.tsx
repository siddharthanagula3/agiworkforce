'use client';

import { useMemo } from 'react';
import { Trophy, ThumbsUp, ThumbsDown, Scale } from 'lucide-react';
import { Badge, Card, CardContent, CardHeader } from '@agiworkforce/ui';
import { cn } from '@shared/lib/utils';
import { CardExtraSections } from './CardExtras';
import { parseComparison } from '@agiworkforce/unified-chat/message-format-cards';
interface ComparisonCardProps {
  content: string;
}

export function ComparisonCard({ content }: ComparisonCardProps) {
  const comparison = useMemo(() => parseComparison(content), [content]);
  const { items, winner, winnerReason, featureKeys } = comparison;

  const hasProsCons = items.some((item) => item.pros.length > 0 || item.cons.length > 0);
  const hasFeatures = featureKeys.length > 0;

  return (
    <Card className="comparison-card overflow-hidden border-[var(--chat-border)]">
      <CardHeader className="border-b border-[var(--chat-border-subtle)] bg-[var(--chat-surface-hover)] pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--chat-surface-elevated)]">
            <Scale className="h-5 w-5 text-indigo-700 dark:text-indigo-400" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-h3">
              {items[0].name} vs {items[1].name}
            </h3>
            {comparison.title && !comparison.title.toLowerCase().includes('vs') && (
              <p className="mt-0.5 text-sm text-muted-foreground">{comparison.title}</p>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-5">
        {hasProsCons && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {items.map((item, idx) => (
              <div
                key={`compare-${idx}`}
                className={cn(
                  'rounded-lg border p-4',
                  winner === item.name
                    ? 'border-[var(--chat-warning-border)] bg-[var(--chat-warning-bg)]'
                    : 'border-border',
                )}
              >
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="font-semibold text-sm">{item.name}</h4>
                  {winner === item.name && (
                    <Badge className="gap-1 border-0 bg-[var(--chat-warning-bg)] text-caption text-[var(--chat-warning-fg)]">
                      <Trophy className="h-3 w-3" aria-hidden="true" />
                      Winner
                    </Badge>
                  )}
                </div>

                {item.pros.length > 0 && (
                  <div className="mb-3">
                    <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-success-text">
                      <ThumbsUp className="h-3 w-3" aria-hidden="true" />
                      Pros
                    </div>
                    <ul className="space-y-1" role="list">
                      {item.pros.map((pro, pi) => (
                        <li key={`pro-${idx}-${pi}`} className="flex items-start gap-2 text-sm">
                          <span
                            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success-fill"
                            aria-hidden="true"
                          />
                          <span>{pro}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {item.cons.length > 0 && (
                  <div>
                    <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-danger-text">
                      <ThumbsDown className="h-3 w-3" aria-hidden="true" />
                      Cons
                    </div>
                    <ul className="space-y-1" role="list">
                      {item.cons.map((con, ci) => (
                        <li key={`con-${idx}-${ci}`} className="flex items-start gap-2 text-sm">
                          <span
                            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-danger-fill"
                            aria-hidden="true"
                          />
                          <span>{con}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {hasFeatures && (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm" role="table">
              <thead>
                <tr className="bg-muted/50">
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">
                    Feature
                  </th>
                  <th className="px-4 py-2.5 text-start font-medium">
                    {items[0].name}
                    {winner === items[0].name && (
                      <Trophy
                        className="ms-1.5 inline h-3 w-3 text-warning-text"
                        aria-label="Winner"
                      />
                    )}
                  </th>
                  <th className="px-4 py-2.5 text-start font-medium">
                    {items[1].name}
                    {winner === items[1].name && (
                      <Trophy
                        className="ms-1.5 inline h-3 w-3 text-warning-text"
                        aria-label="Winner"
                      />
                    )}
                  </th>
                </tr>
              </thead>
              <tbody>
                {featureKeys.map((key, ki) => (
                  <tr
                    key={`feature-${ki}`}
                    className={cn(
                      'border-t border-border',
                      ki % 2 === 0 ? 'bg-transparent' : 'bg-muted/20',
                    )}
                  >
                    <td className="px-4 py-2 font-medium text-muted-foreground">{key}</td>
                    <td className="px-4 py-2">{items[0].features[key] || '-'}</td>
                    <td className="px-4 py-2">{items[1].features[key] || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {winner && winnerReason && (
          <div className="flex items-start gap-3 rounded-lg border border-[var(--chat-warning-border)] bg-[var(--chat-warning-bg)] p-3">
            <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" aria-hidden="true" />
            <div className="text-sm">
              <span className="font-semibold">{winner}</span>{' '}
              <span className="text-muted-foreground">{winnerReason}</span>
            </div>
          </div>
        )}

        <CardExtraSections sections={comparison.extraSections} />
      </CardContent>
    </Card>
  );
}
