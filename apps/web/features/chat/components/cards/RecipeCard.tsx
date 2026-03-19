/**
 * RecipeCard - Structured recipe display
 *
 * Parses markdown-formatted recipe content and displays it as a rich card with:
 * - Title, prep/cook time, servings metadata badges
 * - Ingredient checklist with interactive checkboxes
 * - Numbered instruction steps
 * - Print-friendly layout via CSS media query
 */

'use client';

import { useState, useMemo } from 'react';
import { Clock, Users, ChefHat, Printer, Timer, UtensilsCrossed } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@shared/ui/card';
import { Badge } from '@shared/ui/badge';
import { Button } from '@shared/ui/button';
import { Checkbox } from '@shared/ui/checkbox';
import { cn } from '@shared/lib/utils';

interface ParsedRecipe {
  title: string;
  prepTime: string;
  cookTime: string;
  totalTime: string;
  servings: string;
  description: string;
  ingredients: string[];
  instructions: string[];
}

function parseRecipe(content: string): ParsedRecipe {
  const lines = content.split('\n');

  let title = '';
  const prepTime: string[] = [];
  const cookTime: string[] = [];
  const totalTime: string[] = [];
  const servings: string[] = [];
  let description = '';
  const ingredients: string[] = [];
  const instructions: string[] = [];

  type Section = 'preamble' | 'ingredients' | 'instructions' | 'other';
  let currentSection: Section = 'preamble';
  const descLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Extract title from first H1/H2
    if (!title && /^#{1,2}\s+/.test(trimmed)) {
      title = trimmed.replace(/^#{1,2}\s+/, '').replace(/\*\*/g, '');
      continue;
    }

    // Extract metadata from inline patterns
    const prepMatch = trimmed.match(/\*?\*?prep(?:\s+time)?\*?\*?\s*[:]\s*(.+)/i);
    if (prepMatch) {
      prepTime.push((prepMatch[1] ?? '').replace(/\*\*/g, '').trim());
      continue;
    }
    const cookMatch = trimmed.match(/\*?\*?cook(?:\s+time)?\*?\*?\s*[:]\s*(.+)/i);
    if (cookMatch) {
      cookTime.push((cookMatch[1] ?? '').replace(/\*\*/g, '').trim());
      continue;
    }
    const totalMatch = trimmed.match(/\*?\*?total(?:\s+time)?\*?\*?\s*[:]\s*(.+)/i);
    if (totalMatch) {
      totalTime.push((totalMatch[1] ?? '').replace(/\*\*/g, '').trim());
      continue;
    }
    const servingsMatch = trimmed.match(/\*?\*?servings?\*?\*?\s*[:]\s*(.+)/i);
    if (servingsMatch) {
      servings.push((servingsMatch[1] ?? '').replace(/\*\*/g, '').trim());
      continue;
    }
    const yieldsMatch = trimmed.match(/\*?\*?yields?\*?\*?\s*[:]\s*(.+)/i);
    if (yieldsMatch) {
      servings.push((yieldsMatch[1] ?? '').replace(/\*\*/g, '').trim());
      continue;
    }

    // Section headers
    if (
      /^#{1,4}\s*\*?\*?ingredients\*?\*?/i.test(trimmed) ||
      /^\*\*ingredients\*\*/i.test(trimmed)
    ) {
      currentSection = 'ingredients';
      continue;
    }
    if (
      /^#{1,4}\s*\*?\*?(instructions|directions|steps|method|preparation)\*?\*?/i.test(trimmed) ||
      /^\*\*(instructions|directions|steps|method|preparation)\*\*/i.test(trimmed)
    ) {
      currentSection = 'instructions';
      continue;
    }
    if (/^#{1,4}\s/.test(trimmed) && currentSection !== 'preamble') {
      // Some other header section (e.g. "Notes") -- stop parsing instructions
      currentSection = 'other';
      continue;
    }

    // Collect content per section
    if (currentSection === 'preamble') {
      descLines.push(trimmed);
    } else if (currentSection === 'ingredients') {
      // Strip list markers: -, *, or numbered
      const cleaned = trimmed.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '');
      if (cleaned) ingredients.push(cleaned);
    } else if (currentSection === 'instructions') {
      // Strip numbered prefixes and bold step labels
      const cleaned = trimmed
        .replace(/^\d+\.\s+/, '')
        .replace(/^\*\*step\s+\d+[:.]\*\*\s*/i, '')
        .replace(/^step\s+\d+[:.]\s*/i, '');
      if (cleaned) instructions.push(cleaned);
    }
  }

  description = descLines
    .filter((l) => !l.startsWith('#'))
    .join(' ')
    .replace(/\*\*/g, '')
    .trim();

  return {
    title: title || 'Recipe',
    prepTime: prepTime[0] || '',
    cookTime: cookTime[0] || '',
    totalTime: totalTime[0] || '',
    servings: servings[0] || '',
    description,
    ingredients,
    instructions,
  };
}

interface RecipeCardProps {
  content: string;
}

export function RecipeCard({ content }: RecipeCardProps) {
  const recipe = useMemo(() => parseRecipe(content), [content]);
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(new Set());

  const toggleIngredient = (index: number) => {
    setCheckedIngredients((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const metaBadges = [
    { icon: Timer, label: 'Prep', value: recipe.prepTime },
    { icon: Clock, label: 'Cook', value: recipe.cookTime },
    { icon: Clock, label: 'Total', value: recipe.totalTime },
    { icon: Users, label: 'Servings', value: recipe.servings },
  ].filter((b) => b.value);

  return (
    <Card className="recipe-card overflow-hidden border-amber-200/50 dark:border-amber-800/30 print:border print:shadow-none">
      <CardHeader className="space-y-3 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40">
              <ChefHat className="h-5 w-5 text-amber-700 dark:text-amber-400" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-lg font-semibold leading-tight">{recipe.title}</h3>
              {recipe.description && (
                <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">
                  {recipe.description}
                </p>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handlePrint}
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground print:hidden"
            aria-label="Print recipe"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
            Print
          </Button>
        </div>

        {metaBadges.length > 0 && (
          <div className="flex flex-wrap gap-2" role="list" aria-label="Recipe details">
            {metaBadges.map((badge) => (
              <Badge
                key={badge.label}
                variant="secondary"
                className="gap-1.5 bg-white/70 dark:bg-white/10 text-xs font-normal"
              >
                <badge.icon className="h-3 w-3" aria-hidden="true" />
                <span className="font-medium">{badge.label}:</span> {badge.value}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-6 pt-5">
        {/* Ingredients */}
        {recipe.ingredients.length > 0 && (
          <section aria-labelledby="recipe-ingredients-heading">
            <h4
              id="recipe-ingredients-heading"
              className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
            >
              <UtensilsCrossed className="h-3.5 w-3.5" aria-hidden="true" />
              Ingredients
              <span className="text-xs font-normal normal-case">
                ({checkedIngredients.size}/{recipe.ingredients.length})
              </span>
            </h4>
            <ul className="space-y-2" role="list">
              {recipe.ingredients.map((ingredient, i) => {
                const isChecked = checkedIngredients.has(i);
                return (
                  <li key={`ingredient-${i}`} className="flex items-start gap-2.5">
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => toggleIngredient(i)}
                      aria-label={`Mark ${ingredient} as gathered`}
                      className="mt-0.5"
                    />
                    <span
                      className={cn(
                        'text-sm leading-relaxed transition-colors',
                        isChecked && 'line-through text-muted-foreground',
                      )}
                    >
                      {ingredient}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Instructions */}
        {recipe.instructions.length > 0 && (
          <section aria-labelledby="recipe-instructions-heading">
            <h4
              id="recipe-instructions-heading"
              className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Instructions
            </h4>
            <ol className="space-y-3" role="list">
              {recipe.instructions.map((step, i) => (
                <li key={`step-${i}`} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40 text-xs font-semibold text-amber-700 dark:text-amber-400">
                    {i + 1}
                  </span>
                  <p className="text-sm leading-relaxed pt-0.5">{step}</p>
                </li>
              ))}
            </ol>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
