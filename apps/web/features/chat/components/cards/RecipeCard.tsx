'use client';

import { useState, useMemo } from 'react';
import { Clock, Users, ChefHat, Printer, Timer, UtensilsCrossed } from 'lucide-react';
import { Badge, Card, CardContent, CardHeader, Button } from '@agiworkforce/ui';
import { Checkbox } from '@agiworkforce/ui';
import { cn } from '@shared/lib/utils';
import { CardExtraSections } from './CardExtras';
import { parseRecipe } from '@agiworkforce/unified-chat/message-format-cards';
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
    <Card className="recipe-card overflow-hidden border-[var(--chat-border)] print:border print:shadow-none">
      <CardHeader className="space-y-3 border-b border-[var(--chat-border-subtle)] bg-[var(--chat-surface-hover)] pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--chat-surface-elevated)]">
              <ChefHat className="h-5 w-5 text-amber-700 dark:text-amber-400" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-h3">{recipe.title}</h3>
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
                className="gap-1.5 bg-[var(--chat-surface-elevated)] text-xs font-normal"
              >
                <badge.icon className="h-3 w-3" aria-hidden="true" />
                <span className="font-medium">{badge.label}:</span> {badge.value}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-6 pt-5">
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
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--chat-surface-hover)] text-xs font-semibold text-[var(--chat-text-primary)]">
                    {i + 1}
                  </span>
                  <p className="text-sm leading-relaxed pt-0.5">{step}</p>
                </li>
              ))}
            </ol>
          </section>
        )}

        <CardExtraSections sections={recipe.extraSections} />
      </CardContent>
    </Card>
  );
}
