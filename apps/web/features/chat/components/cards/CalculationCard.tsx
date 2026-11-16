'use client';

import { useState, useMemo, useCallback } from 'react';
import { Calculator, Copy, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { Badge, Card, CardContent, CardHeader, Button, useUiTranslation } from '@agiworkforce/ui';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@agiworkforce/ui';
import { cn } from '@shared/lib/utils';
import DOMPurify from 'dompurify';
import katex from 'katex';
import { toast } from 'sonner';
import { CardExtraSections } from './CardExtras';
import { parseCalculation } from '@agiworkforce/unified-chat/message-format-cards';
import 'katex/dist/katex.min.css';

function FormulaDisplay({
  expression,
  isLatex,
  displayMode = true,
}: {
  expression: string;
  isLatex: boolean;
  displayMode?: boolean;
}) {
  const rendered = useMemo(() => {
    if (!isLatex) return null;
    try {
      return katex.renderToString(expression, {
        throwOnError: false,
        displayMode,
      });
    } catch {
      return null;
    }
  }, [expression, isLatex, displayMode]);

  if (rendered) {
    return (
      <div
        className={cn('formula-katex overflow-x-auto', displayMode && 'py-2 text-center')}
        // llm-guardrail-allow: KaTeX emits markup, so the string cannot be text-rendered; it is
        // sanitized on the line below before it reaches the DOM.
        dangerouslySetInnerHTML={{
          __html: DOMPurify.sanitize(rendered, { USE_PROFILES: { html: true } }),
        }}
        role="math"
        aria-label={expression}
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-md bg-muted/50 px-4 py-3 text-center">
      <code className="text-sm font-mono whitespace-pre-wrap">{expression}</code>
    </div>
  );
}

interface CalculationCardProps {
  content: string;
}

export function CalculationCard({ content }: CalculationCardProps) {
  const { plural } = useUiTranslation('chat');
  const calc = useMemo(() => parseCalculation(content), [content]);
  const [copied, setCopied] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  const handleCopyResult = useCallback(async () => {
    if (!calc.result) return;
    // Unguarded before this: an insecure context, a denied permission, or an
    // unfocused document rejects `writeText`, which threw past the toast and
    // the "Copied" state and left the button giving no feedback at all.
    try {
      await navigator.clipboard.writeText(calc.result);
    } catch {
      toast.error('Could not copy the result');
      return;
    }
    setCopied(true);
    toast.success('Result copied');
    setTimeout(() => setCopied(false), 2000);
  }, [calc.result]);

  return (
    <Card className="calculation-card overflow-hidden border-[var(--chat-border)]">
      <CardHeader className="border-b border-[var(--chat-border-subtle)] bg-[var(--chat-surface-hover)] pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--chat-surface-elevated)]">
            <Calculator className="h-5 w-5 text-blue-700 dark:text-blue-400" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-h3">{calc.title}</h3>
            {calc.description && (
              <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">
                {calc.description}
              </p>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-5">
        {/* Formula display */}
        {calc.formulas.length > 0 && (
          <div className="space-y-2">
            {calc.formulas.map((formula, fi) => (
              <div key={`formula-${fi}`}>
                {formula.label && (
                  <p className="mb-1 text-xs font-medium text-muted-foreground">{formula.label}</p>
                )}
                <FormulaDisplay expression={formula.expression} isLatex={formula.isLatex} />
              </div>
            ))}
          </div>
        )}

        {/* Intermediate steps (collapsible) */}
        {calc.steps.length > 0 && (
          <Collapsible open={showSteps} onOpenChange={setShowSteps}>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                aria-expanded={showSteps}
                aria-label="Toggle calculation steps"
              >
                {showSteps ? (
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {plural('counts.intermediateSteps', calc.steps.length, {
                  one: '{{count}} intermediate step',
                  other: '{{count}} intermediate steps',
                })}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 space-y-1.5 rounded-lg bg-muted/30 p-3">
                {calc.steps.map((step, si) => (
                  <div
                    key={`step-${si}`}
                    className="flex items-center justify-between gap-4 text-sm"
                  >
                    <span className="text-muted-foreground">{step.label}</span>
                    <span className="font-mono font-medium">{step.value}</span>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Result */}
        {calc.result && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--chat-border-strong)] bg-[var(--chat-surface-hover)] p-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {calc.resultLabel}
              </p>
              <div className="mt-1 text-2xl font-bold tracking-tight">
                {calc.resultIsLatex ? (
                  <FormulaDisplay expression={calc.result} isLatex displayMode={false} />
                ) : (
                  calc.result
                )}
              </div>
              {calc.unit && (
                <Badge variant="secondary" className="mt-1.5 text-xs font-normal">
                  {calc.unit}
                </Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyResult}
              className={cn(
                'h-8 gap-1.5 text-xs shrink-0',
                copied ? 'text-success-text' : 'text-muted-foreground hover:text-foreground',
              )}
              aria-label={copied ? 'Result copied' : 'Copy result'}
            >
              {copied ? (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        )}

        <CardExtraSections sections={calc.extraSections} />
      </CardContent>
    </Card>
  );
}
