/**
 * CalculationCard - Math expression and result display
 *
 * Renders structured calculation content with:
 * - Formula rendering via KaTeX (when available)
 * - Clear result display with copy button
 * - Breakdown of intermediate steps
 * - Fallback to styled monospace when KaTeX unavailable
 */

'use client';

import { useState, useMemo, useCallback } from 'react';
import { Calculator, Copy, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@shared/ui/card';
import { Badge } from '@shared/ui/badge';
import { Button } from '@shared/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@shared/ui/collapsible';
import { cn } from '@shared/lib/utils';
import DOMPurify from 'dompurify';
import { toast } from 'sonner';

interface ParsedCalculation {
  title: string;
  description: string;
  formulas: Array<{ label: string; expression: string; isLatex: boolean }>;
  result: string;
  resultLabel: string;
  steps: Array<{ label: string; value: string }>;
  unit: string;
}

function parseCalculation(content: string): ParsedCalculation {
  const lines = content.split('\n');

  let title = '';
  let description = '';
  let result = '';
  let resultLabel = 'Result';
  let unit = '';
  const formulas: ParsedCalculation['formulas'] = [];
  const steps: ParsedCalculation['steps'] = [];
  const descLines: string[] = [];

  // Extract LaTeX blocks
  const latexBlocks = content.match(/\$\$([\s\S]+?)\$\$/g) || [];
  for (const block of latexBlocks) {
    const expr = block.replace(/^\$\$/, '').replace(/\$\$$/, '').trim();
    formulas.push({ label: '', expression: expr, isLatex: true });
  }

  // Extract display math \[ ... \]
  const displayMathBlocks = content.match(/\\\[([\s\S]+?)\\\]/g) || [];
  for (const block of displayMathBlocks) {
    const expr = block.replace(/^\\\[/, '').replace(/\\\]$/, '').trim();
    formulas.push({ label: '', expression: expr, isLatex: true });
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Title
    if (!title && /^#{1,2}\s+/.test(trimmed)) {
      title = trimmed.replace(/^#{1,2}\s+/, '').replace(/\*\*/g, '');
      continue;
    }

    // Result extraction: "Result: 42", "Answer = 42", "Total: $1,234.56"
    const resultMatch = trimmed.match(
      /\*?\*?(result|answer|total|sum|difference|product|quotient|output|value)\*?\*?\s*[:=]\s*(.+)/i,
    );
    if (resultMatch) {
      resultLabel =
        (resultMatch[1] ?? '').charAt(0).toUpperCase() + (resultMatch[1] ?? '').slice(1);
      result = (resultMatch[2] ?? '').replace(/\*\*/g, '').trim();

      // Try to extract unit
      const unitMatch = result.match(/^([-\d.,]+)\s*(.+)$/);
      if (unitMatch && unitMatch[2] && !/^\d/.test(unitMatch[2])) {
        unit = unitMatch[2];
      }
      continue;
    }

    // Step extraction: "Step N: label = value" or "1. label = value"
    const stepMatch = trimmed.match(
      /^(?:(?:#{2,4}\s+)?step\s+\d+[.:]\s*|^\d+\.\s+)\*?\*?(.+?)\*?\*?\s*[:=]\s*(.+)/i,
    );
    if (stepMatch) {
      steps.push({
        label: (stepMatch[1] ?? '').replace(/\*\*/g, '').trim(),
        value: (stepMatch[2] ?? '').replace(/\*\*/g, '').trim(),
      });
      continue;
    }

    // Inline code formulas: `expression = result`
    const inlineCodeMatch = trimmed.match(/`([^`]+[=+\-*/^][^`]+)`/);
    if (inlineCodeMatch && !formulas.some((f) => f.expression === inlineCodeMatch[1])) {
      formulas.push({ label: '', expression: inlineCodeMatch[1] ?? '', isLatex: false });
      continue;
    }

    // Description (preamble before formulas/results)
    if (!result && formulas.length === 0 && steps.length === 0 && !trimmed.startsWith('#')) {
      descLines.push(trimmed);
    }
  }

  description = descLines
    .filter((l) => !l.startsWith('#') && !l.startsWith('$'))
    .join(' ')
    .replace(/\*\*/g, '')
    .trim();

  // If no explicit result found, try to find one from the last formula
  if (!result && formulas.length > 0) {
    const lastFormula = formulas[formulas.length - 1];
    if (lastFormula) {
      const eqParts = lastFormula.expression.split('=');
      if (eqParts.length >= 2) {
        result = (eqParts[eqParts.length - 1] ?? '').trim();
      }
    }
  }

  return {
    title: title || 'Calculation',
    description,
    formulas,
    result,
    resultLabel,
    steps,
    unit,
  };
}

/**
 * Renders a LaTeX expression using KaTeX.
 * Falls back to styled monospace code if KaTeX is not loaded.
 */
function FormulaDisplay({ expression, isLatex }: { expression: string; isLatex: boolean }) {
  const rendered = useMemo(() => {
    if (!isLatex) return null;
    try {
      // Dynamic import to avoid SSR issues -- katex is available in the project
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const katex = require('katex');
      return katex.renderToString(expression, {
        throwOnError: false,
        displayMode: true,
      });
    } catch {
      return null;
    }
  }, [expression, isLatex]);

  if (rendered) {
    return (
      <div
        className="formula-katex overflow-x-auto py-2 text-center"
        dangerouslySetInnerHTML={{
          __html: DOMPurify.sanitize(rendered, { USE_PROFILES: { html: true } }),
        }}
        role="math"
        aria-label={expression}
      />
    );
  }

  // Fallback: styled monospace
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
  const calc = useMemo(() => parseCalculation(content), [content]);
  const [copied, setCopied] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  const handleCopyResult = useCallback(async () => {
    if (!calc.result) return;
    await navigator.clipboard.writeText(calc.result);
    setCopied(true);
    toast.success('Result copied');
    setTimeout(() => setCopied(false), 2000);
  }, [calc.result]);

  return (
    <Card className="calculation-card overflow-hidden border-blue-200/50 dark:border-blue-800/30">
      <CardHeader className="bg-gradient-to-r from-blue-50 to-sky-50 dark:from-blue-950/20 dark:to-sky-950/20 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/40">
            <Calculator className="h-5 w-5 text-blue-700 dark:text-blue-400" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-lg font-semibold leading-tight">{calc.title}</h3>
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
                {calc.steps.length} intermediate step{calc.steps.length !== 1 ? 's' : ''}
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
          <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800/40 dark:bg-blue-950/20 p-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {calc.resultLabel}
              </p>
              <p className="mt-1 text-2xl font-bold tracking-tight">{calc.result}</p>
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
                copied ? 'text-emerald-600' : 'text-muted-foreground hover:text-foreground',
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
      </CardContent>
    </Card>
  );
}
