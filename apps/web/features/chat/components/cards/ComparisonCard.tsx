/**
 * ComparisonCard - Side-by-side comparison display
 *
 * Detects "vs" or comparison patterns and renders:
 * - Side-by-side comparison with headers
 * - Pros (green) / Cons (red) highlights
 * - Feature comparison rows
 * - Winner highlight badge
 */

'use client';

import { useMemo } from 'react';
import { Trophy, ThumbsUp, ThumbsDown, Scale } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@shared/ui/card';
import { Badge } from '@shared/ui/badge';
import { cn } from '@shared/lib/utils';

interface ComparisonItem {
  name: string;
  pros: string[];
  cons: string[];
  features: Record<string, string>;
}

interface ParsedComparison {
  title: string;
  items: [ComparisonItem, ComparisonItem];
  winner: string;
  winnerReason: string;
  featureKeys: string[];
}

function parseComparison(content: string): ParsedComparison {
  const lines = content.split('\n');

  let title = '';
  let winner = '';
  let winnerReason = '';
  const items: [ComparisonItem, ComparisonItem] = [
    { name: '', pros: [], cons: [], features: {} },
    { name: '', pros: [], cons: [], features: {} },
  ];

  // Extract title (first heading)
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^#{1,2}\s+/.test(trimmed)) {
      title = trimmed.replace(/^#{1,2}\s+/, '').replace(/\*\*/g, '');
      break;
    }
  }

  // Try to extract item names from "A vs B" in title
  const vsMatch = title.match(/^(.+?)\s+vs\.?\s+(.+?)$/i);
  if (vsMatch) {
    items[0].name = (vsMatch[1] ?? '').trim();
    items[1].name = (vsMatch[2] ?? '').trim();
  }

  // Parse sections
  type Section =
    | 'none'
    | 'item0'
    | 'item1'
    | 'pros0'
    | 'cons0'
    | 'pros1'
    | 'cons1'
    | 'winner'
    | 'table';
  let currentSection: Section = 'none';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const lower = trimmed
      .toLowerCase()
      .replace(/\*\*/g, '')
      .replace(/^#+\s*/, '');

    // Detect item-specific sections
    if (items[0].name && lower.startsWith(items[0].name.toLowerCase())) {
      currentSection = 'item0';
      continue;
    }
    if (items[1].name && lower.startsWith(items[1].name.toLowerCase())) {
      currentSection = 'item1';
      continue;
    }

    // Detect pros/cons sections
    if (/^#{2,4}\s*\*?\*?(pros|advantages|strengths)\*?\*?/i.test(trimmed)) {
      if (currentSection === 'item0' || currentSection === 'pros0' || currentSection === 'cons0') {
        currentSection = 'pros0';
      } else {
        currentSection = 'pros1';
      }
      continue;
    }
    if (/^#{2,4}\s*\*?\*?(cons|disadvantages|weaknesses)\*?\*?/i.test(trimmed)) {
      if (currentSection === 'item0' || currentSection === 'pros0' || currentSection === 'cons0') {
        currentSection = 'cons0';
      } else {
        currentSection = 'cons1';
      }
      continue;
    }

    // Winner detection
    if (/^#{2,4}\s*\*?\*?(winner|verdict|recommendation|conclusion)\*?\*?/i.test(trimmed)) {
      currentSection = 'winner';
      continue;
    }
    if (currentSection === 'winner') {
      // Try to detect which item is the winner
      if (!winner) {
        if (items[0].name && lower.includes(items[0].name.toLowerCase())) {
          winner = items[0].name;
          winnerReason = trimmed.replace(/\*\*/g, '').replace(/^[-*]\s+/, '');
        } else if (items[1].name && lower.includes(items[1].name.toLowerCase())) {
          winner = items[1].name;
          winnerReason = trimmed.replace(/\*\*/g, '').replace(/^[-*]\s+/, '');
        } else {
          winnerReason = trimmed.replace(/\*\*/g, '').replace(/^[-*]\s+/, '');
        }
      }
      continue;
    }

    // Collect pros/cons
    const isList = /^[-*]\s+/.test(trimmed);
    if (isList) {
      const text = trimmed.replace(/^[-*]\s+/, '').replace(/\*\*/g, '');
      if (currentSection === 'pros0') items[0].pros.push(text);
      else if (currentSection === 'cons0') items[0].cons.push(text);
      else if (currentSection === 'pros1') items[1].pros.push(text);
      else if (currentSection === 'cons1') items[1].cons.push(text);
    }

    // Parse table rows for feature comparison
    if (trimmed.startsWith('|') && !trimmed.match(/^\|[-\s|]+\|$/)) {
      const cells = trimmed
        .split('|')
        .map((c) => c.trim())
        .filter(Boolean);
      if (cells.length >= 3) {
        // First row might be headers
        if (!items[0].name && cells[1]) {
          items[0].name = cells[1].replace(/\*\*/g, '');
          items[1].name = cells[2]?.replace(/\*\*/g, '') || 'Option B';
        } else {
          const featureKey = (cells[0] ?? '').replace(/\*\*/g, '');
          items[0].features[featureKey] = cells[1]?.replace(/\*\*/g, '') || '';
          items[1].features[featureKey] = cells[2]?.replace(/\*\*/g, '') || '';
        }
      }
    }
  }

  // If names still not set, try to find them from subsection headings
  if (!items[0].name) items[0].name = 'Option A';
  if (!items[1].name) items[1].name = 'Option B';

  // If we detected pros/cons but assigned them all to item0, distribute
  // This handles cases where prose format puts both items' pros/cons under generic headers
  if (
    items[0].pros.length > 0 &&
    items[1].pros.length === 0 &&
    items[0].cons.length === 0 &&
    items[1].cons.length > 0
  ) {
    // Looks correct as-is
  }

  const featureKeys = [
    ...new Set([...Object.keys(items[0].features), ...Object.keys(items[1].features)]),
  ];

  return { title, items, winner, winnerReason, featureKeys };
}

interface ComparisonCardProps {
  content: string;
}

export function ComparisonCard({ content }: ComparisonCardProps) {
  const comparison = useMemo(() => parseComparison(content), [content]);
  const { items, winner, winnerReason, featureKeys } = comparison;

  const hasProsCons = items.some((item) => item.pros.length > 0 || item.cons.length > 0);
  const hasFeatures = featureKeys.length > 0;

  return (
    <Card className="comparison-card overflow-hidden border-indigo-200/50 dark:border-indigo-800/30">
      <CardHeader className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/20 dark:to-purple-950/20 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/40">
            <Scale className="h-5 w-5 text-indigo-700 dark:text-indigo-400" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-lg font-semibold leading-tight">
              {items[0].name} vs {items[1].name}
            </h3>
            {comparison.title && !comparison.title.toLowerCase().includes('vs') && (
              <p className="mt-0.5 text-sm text-muted-foreground">{comparison.title}</p>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-5">
        {/* Pros / Cons side-by-side */}
        {hasProsCons && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {items.map((item, idx) => (
              <div
                key={`compare-${idx}`}
                className={cn(
                  'rounded-lg border p-4',
                  winner === item.name
                    ? 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20'
                    : 'border-border',
                )}
              >
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="font-semibold text-sm">{item.name}</h4>
                  {winner === item.name && (
                    <Badge className="gap-1 bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 border-0 text-[10px]">
                      <Trophy className="h-3 w-3" aria-hidden="true" />
                      Winner
                    </Badge>
                  )}
                </div>

                {item.pros.length > 0 && (
                  <div className="mb-3">
                    <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                      <ThumbsUp className="h-3 w-3" aria-hidden="true" />
                      Pros
                    </div>
                    <ul className="space-y-1" role="list">
                      {item.pros.map((pro, pi) => (
                        <li key={`pro-${idx}-${pi}`} className="flex items-start gap-2 text-sm">
                          <span
                            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
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
                    <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-rose-700 dark:text-rose-400">
                      <ThumbsDown className="h-3 w-3" aria-hidden="true" />
                      Cons
                    </div>
                    <ul className="space-y-1" role="list">
                      {item.cons.map((con, ci) => (
                        <li key={`con-${idx}-${ci}`} className="flex items-start gap-2 text-sm">
                          <span
                            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500"
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

        {/* Feature comparison table */}
        {hasFeatures && (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm" role="table">
              <thead>
                <tr className="bg-muted/50">
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                    Feature
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium">
                    {items[0].name}
                    {winner === items[0].name && (
                      <Trophy
                        className="ml-1.5 inline h-3 w-3 text-amber-500"
                        aria-label="Winner"
                      />
                    )}
                  </th>
                  <th className="px-4 py-2.5 text-left font-medium">
                    {items[1].name}
                    {winner === items[1].name && (
                      <Trophy
                        className="ml-1.5 inline h-3 w-3 text-amber-500"
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

        {/* Winner callout */}
        {winner && winnerReason && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-950/20 p-3">
            <Trophy
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
              aria-hidden="true"
            />
            <div className="text-sm">
              <span className="font-semibold">{winner}</span>{' '}
              <span className="text-muted-foreground">{winnerReason}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
