/**
 * ToolInvoker
 *
 * Renders a dynamic form for a given ToolCategory and submits
 * directly to the Tauri backend via invoke(). Shows the result
 * in a formatted output area below the form.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { Play, Loader2, CheckCircle2, AlertCircle, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import { Switch } from '@/components/ui/Switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { invoke } from '@/lib/tauri-mock';
import { getSimpleErrorMessage } from '@/lib/errorMessages';
import type { ToolCategory, ToolField } from './toolCategories';

interface ToolInvokerProps {
  tool: ToolCategory;
}

type FieldValues = Record<string, string | number | boolean>;

function buildDefaultValues(fields: ToolField[]): FieldValues {
  return Object.fromEntries(
    fields.map((f) => [f.key, f.defaultValue ?? (f.type === 'toggle' ? false : '')]),
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: ToolField;
  value: string | number | boolean;
  onChange: (val: string | number | boolean) => void;
}) {
  const baseInputClass =
    'w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm ' +
    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ' +
    'placeholder:text-muted-foreground';

  switch (field.type) {
    case 'textarea':
      return (
        <textarea
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={4}
          className={`${baseInputClass} resize-y font-mono`}
        />
      );

    case 'number':
      return (
        <input
          type="number"
          value={value as number}
          onChange={(e) => onChange(e.target.valueAsNumber)}
          placeholder={field.placeholder}
          min={field.min}
          max={field.max}
          className={baseInputClass}
        />
      );

    case 'select':
      return (
        <Select value={value as string} onValueChange={(v) => onChange(v)}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );

    case 'toggle':
      return <Switch checked={value as boolean} onCheckedChange={(checked) => onChange(checked)} />;

    default:
      return (
        <input
          type="text"
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={`${baseInputClass} h-9`}
        />
      );
  }
}

type RunStatus = 'idle' | 'running' | 'success' | 'error';

export function ToolInvoker({ tool }: ToolInvokerProps) {
  const [values, setValues] = useState<FieldValues>(() => buildDefaultValues(tool.fields));
  const [status, setStatus] = useState<RunStatus>('idle');
  const [output, setOutput] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  // Reset form when tool changes
  const handleFieldChange = useCallback((key: string, val: string | number | boolean) => {
    setValues((prev) => ({ ...prev, [key]: val }));
  }, []);

  const handleRun = useCallback(async () => {
    setStatus('running');
    setOutput('');
    setError('');
    setElapsed(null);

    // Build args — strip empty strings to keep payload clean
    const args: Record<string, unknown> = {};
    for (const field of tool.fields) {
      const val = values[field.key];
      if (val !== '' && val !== undefined && val !== null) {
        args[field.key] = val;
      }
    }

    const start = performance.now();
    try {
      const result = await invoke<unknown>(tool.invokeCommand, args);
      const ms = Math.round(performance.now() - start);
      setElapsed(ms);
      if (typeof result === 'string') {
        setOutput(result);
      } else {
        setOutput(JSON.stringify(result, null, 2));
      }
      setStatus('success');
    } catch (err) {
      const ms = Math.round(performance.now() - start);
      setElapsed(ms);
      setError(getSimpleErrorMessage(err));
      setStatus('error');
    }
  }, [tool, values]);

  const handleCopyOutput = useCallback(async () => {
    const text = status === 'error' ? error : output;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard access may be restricted
    }
  }, [output, error, status]);

  const hasRequiredFields = tool.fields
    .filter((f) => f.required)
    .every((f) => {
      const val = values[f.key];
      return val !== '' && val !== undefined && val !== null;
    });

  const hasOutput = status === 'success' || status === 'error';

  return (
    <div className="flex flex-col gap-4">
      {/* Form */}
      <div className="space-y-4">
        {tool.fields.map((field) => (
          <div key={field.key} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor={`field-${field.key}`} className="text-sm font-medium">
                {field.label}
                {field.required && <span className="ml-0.5 text-destructive">*</span>}
              </Label>
            </div>
            <FieldInput
              field={field}
              value={values[field.key] ?? ''}
              onChange={(val) => handleFieldChange(field.key, val)}
            />
            {field.description && (
              <p className="text-xs text-muted-foreground">{field.description}</p>
            )}
          </div>
        ))}
      </div>

      {/* Run button */}
      <Button
        onClick={() => void handleRun()}
        disabled={status === 'running' || !hasRequiredFields}
        className="self-start gap-2"
      >
        {status === 'running' ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Running…
          </>
        ) : (
          <>
            <Play className="h-4 w-4" />
            Run Tool
          </>
        )}
      </Button>

      {/* Output area */}
      {hasOutput && (
        <div className="rounded-lg border border-border bg-muted/30 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/50">
            <div className="flex items-center gap-2 text-xs">
              {status === 'success' ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  <span className="font-medium text-green-600">Success</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                  <span className="font-medium text-destructive">Error</span>
                </>
              )}
              {elapsed !== null && <span className="text-muted-foreground">({elapsed}ms)</span>}
            </div>
            <button
              type="button"
              onClick={() => void handleCopyOutput()}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <ScrollArea className="max-h-64">
            <pre className="px-3 py-3 text-xs font-mono leading-relaxed whitespace-pre-wrap break-words text-foreground">
              {status === 'error' ? error : output}
            </pre>
          </ScrollArea>
        </div>
      )}

      {/* Example output (shown when idle and available) */}
      {status === 'idle' && tool.exampleOutput && (
        <div className="rounded-lg border border-border/50 bg-muted/20 overflow-hidden">
          <div className="px-3 py-2 border-b border-border/50 bg-muted/30">
            <span className="text-xs text-muted-foreground font-medium">Example output</span>
          </div>
          <pre className="px-3 py-3 text-xs font-mono leading-relaxed whitespace-pre-wrap text-muted-foreground">
            {tool.exampleOutput}
          </pre>
        </div>
      )}
    </div>
  );
}
