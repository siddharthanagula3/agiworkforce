'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@shared/ui/card';
import { Button } from '@shared/ui/button';
import { Textarea } from '@shared/ui/textarea';
import { Badge } from '@shared/ui/badge';
import { Bot, Copy, Check, ArrowLeft, ArrowRight, Upload, Brain } from 'lucide-react';
import { toast } from 'sonner';

// ── Auth helpers (mirrored from memory/page.tsx) ──────────────────────────────

function getCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  return (
    document.cookie
      .split('; ')
      .find((row) => row.startsWith('csrf-token='))
      ?.split('=')[1] ?? ''
  );
}

function getAuthHeaders(): Record<string, string> {
  // Auth is managed via Supabase SSR cookies (set by middleware) — no manual token needed.
  // The API route falls back to cookie-based auth when no Authorization header is present.
  return {
    'Content-Type': 'application/json',
    'x-csrf-token': getCsrfToken(),
  };
}

// ── Source definitions ────────────────────────────────────────────────────────

type SourceId = 'claude' | 'chatgpt' | 'gemini';

interface Source {
  id: SourceId;
  label: string;
  color: string;
  dotColor: string;
  prompt: string;
}

const SOURCES: Source[] = [
  {
    id: 'claude',
    label: 'Claude.ai',
    color: 'text-orange-400',
    dotColor: 'bg-orange-400',
    prompt:
      "List all the things you remember about me, my preferences, and my projects. Format each as a separate line starting with '- '.",
  },
  {
    id: 'chatgpt',
    label: 'ChatGPT',
    color: 'text-green-400',
    dotColor: 'bg-green-400',
    prompt:
      "What do you know about me from our conversations? List every memory you have about my preferences, work, and interests. Format each as a line starting with '- '.",
  },
  {
    id: 'gemini',
    label: 'Gemini',
    color: 'text-blue-400',
    dotColor: 'bg-blue-400',
    prompt:
      "What information do you recall about me? List all personalization data, preferences, and context you've stored. Format each on its own line starting with '- '.",
  },
];

// ── Step indicator ────────────────────────────────────────────────────────────

interface StepIndicatorProps {
  current: number;
  total: number;
}

function StepIndicator({ current, total }: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={[
              'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors',
              i + 1 === current
                ? 'bg-primary text-primary-foreground'
                : i + 1 < current
                  ? 'bg-primary/30 text-primary'
                  : 'bg-zinc-800 text-zinc-500',
            ].join(' ')}
          >
            {i + 1}
          </div>
          {i < total - 1 && (
            <div
              className={[
                'h-px w-8 transition-colors',
                i + 1 < current ? 'bg-primary/40' : 'bg-zinc-800',
              ].join(' ')}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ImportMemoryPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedSource, setSelectedSource] = useState<SourceId | null>(null);
  const [copied, setCopied] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [parsedMemories, setParsedMemories] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [done, setDone] = useState(false);

  const activeSource = SOURCES.find((s) => s.id === selectedSource);

  // ── Step 1 helpers ──────────────────────────────────────────────────────────

  const handleSelectSource = (id: SourceId) => {
    setSelectedSource(id);
  };

  const handleStep1Next = () => {
    if (!selectedSource) return;
    setStep(2);
  };

  // ── Step 2 helpers ──────────────────────────────────────────────────────────

  const handleCopyPrompt = async () => {
    if (!activeSource) return;
    try {
      await navigator.clipboard.writeText(activeSource.prompt);
      setCopied(true);
      toast.success('Prompt copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy — please copy manually');
    }
  };

  const handleStep2Next = () => {
    setStep(3);
  };

  // ── Step 3 helpers ──────────────────────────────────────────────────────────

  const parseMemories = (text: string): string[] => {
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- '))
      .map((line) => line.slice(2).trim())
      .filter((line) => line.length > 0);
  };

  const handlePasteChange = (value: string) => {
    setPastedText(value);
    setParsedMemories(parseMemories(value));
  };

  const handleImport = async () => {
    if (parsedMemories.length === 0) return;
    setImporting(true);
    setImportedCount(0);

    let successCount = 0;
    let failCount = 0;

    for (const content of parsedMemories) {
      try {
        const res = await fetch('/api/memory', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            content,
            category: selectedSource ?? 'imported',
            source: `import:${selectedSource ?? 'unknown'}`,
          }),
        });
        if (!res.ok) throw new Error('Failed');
        successCount++;
        setImportedCount(successCount);
      } catch {
        failCount++;
      }
    }

    setImporting(false);

    if (failCount === 0) {
      toast.success(`Imported ${successCount} memories`);
      setDone(true);
    } else if (successCount > 0) {
      toast.warning(`Imported ${successCount} memories, ${failCount} failed`);
      setDone(true);
    } else {
      toast.error('Import failed — please try again');
    }
  };

  // ── Done state ──────────────────────────────────────────────────────────────

  if (done) {
    return (
      <div className="space-y-6 py-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/settings/memory">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
          </Link>
        </div>
        <Card className="border-zinc-800 bg-zinc-900">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Brain className="h-8 w-8 text-primary" />
            </div>
            <h2 className="mb-2 text-2xl font-bold">Import Complete</h2>
            <p className="mb-6 max-w-sm text-zinc-400">
              Successfully imported {importedCount} memories from{' '}
              <span className={activeSource?.color ?? ''}>{activeSource?.label}</span>.
            </p>
            <div className="flex gap-3">
              <Link href="/dashboard/settings/memory">
                <Button>View Memories</Button>
              </Link>
              <Button
                variant="outline"
                onClick={() => {
                  setDone(false);
                  setStep(1);
                  setSelectedSource(null);
                  setPastedText('');
                  setParsedMemories([]);
                  setImportedCount(0);
                }}
              >
                Import More
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/settings/memory">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Import Memories</h1>
            <p className="mt-1 text-zinc-400">
              Bring your memories from Claude.ai, ChatGPT, or Gemini into AGI Workforce.
            </p>
          </div>
        </div>
        <StepIndicator current={step} total={3} />
      </div>

      {/* Step 1 — Choose source */}
      {step === 1 && (
        <div className="space-y-4">
          <Card className="border-zinc-800 bg-zinc-900">
            <CardHeader>
              <CardTitle className="text-lg">Step 1: Choose your source</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {SOURCES.map((source) => (
                <button
                  key={source.id}
                  onClick={() => handleSelectSource(source.id)}
                  className={[
                    'flex w-full items-center gap-4 rounded-xl border px-5 py-4 text-left transition-all',
                    selectedSource === source.id
                      ? 'border-primary/60 bg-primary/5 ring-1 ring-primary/30'
                      : 'border-zinc-800 bg-zinc-800/40 hover:border-zinc-700 hover:bg-zinc-800',
                  ].join(' ')}
                >
                  <div
                    className={[
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                      selectedSource === source.id ? 'bg-primary/15' : 'bg-zinc-700',
                    ].join(' ')}
                  >
                    <Bot className={['h-5 w-5', source.color].join(' ')} />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-zinc-100">{source.label}</p>
                    <p className="mt-0.5 text-xs text-zinc-500 leading-snug line-clamp-2">
                      {source.prompt.slice(0, 80)}…
                    </p>
                  </div>
                  <div
                    className={[
                      'h-4 w-4 shrink-0 rounded-full border-2 transition-colors',
                      selectedSource === source.id
                        ? 'border-primary bg-primary'
                        : 'border-zinc-600 bg-transparent',
                    ].join(' ')}
                  />
                </button>
              ))}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={handleStep1Next} disabled={!selectedSource}>
              Continue
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2 — Copy extraction prompt */}
      {step === 2 && activeSource && (
        <div className="space-y-4">
          <Card className="border-zinc-800 bg-zinc-900">
            <CardHeader>
              <CardTitle className="text-lg">
                Step 2: Ask {activeSource.label} for your memories
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-zinc-400">
                Copy the prompt below and paste it into a new conversation with{' '}
                <span className={activeSource.color}>{activeSource.label}</span>. Then come back and
                paste the response in the next step.
              </p>

              {/* Prompt display box */}
              <div className="relative rounded-xl border border-zinc-700 bg-zinc-800 p-4">
                <p className="pr-10 text-sm leading-relaxed text-zinc-200">{activeSource.prompt}</p>
                <button
                  onClick={() => void handleCopyPrompt()}
                  className="absolute right-3 top-3 rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
                  aria-label="Copy prompt"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-400" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>

              <Button variant="outline" className="w-full" onClick={() => void handleCopyPrompt()}>
                {copied ? (
                  <>
                    <Check className="mr-2 h-4 w-4 text-green-400" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Prompt
                  </>
                )}
              </Button>

              <p className="text-xs text-zinc-500">
                Tip: paste this into a fresh conversation so {activeSource.label} retrieves all of
                its stored memory about you.
              </p>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button onClick={handleStep2Next}>
              I&apos;ve got the response
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3 — Paste, preview, import */}
      {step === 3 && activeSource && (
        <div className="space-y-4">
          <Card className="border-zinc-800 bg-zinc-900">
            <CardHeader>
              <CardTitle className="text-lg">Step 3: Paste the response</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-zinc-400">
                Paste {activeSource.label}&apos;s full response below. Lines starting with{' '}
                <code className="rounded bg-zinc-800 px-1 py-0.5 text-xs text-zinc-300">- </code>{' '}
                will be imported as individual memories.
              </p>

              <Textarea
                value={pastedText}
                onChange={(e) => handlePasteChange(e.target.value)}
                placeholder={`Paste ${activeSource.label}'s response here…\n\nExample:\n- I prefer dark mode interfaces\n- I work as a software engineer\n- I'm learning Rust`}
                className="min-h-[200px] border-zinc-700 bg-zinc-800 font-mono text-sm text-zinc-200 placeholder:text-zinc-600 focus-visible:ring-primary/30"
              />

              {/* Parsed preview */}
              {parsedMemories.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-zinc-300">Preview</p>
                    <Badge variant="outline" className="text-xs">
                      {parsedMemories.length} {parsedMemories.length === 1 ? 'memory' : 'memories'}{' '}
                      detected
                    </Badge>
                  </div>
                  <div className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-800/50 p-3">
                    {parsedMemories.map((mem, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2"
                      >
                        <Brain className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" />
                        <p className="text-sm text-zinc-200">{mem}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {pastedText.length > 0 && parsedMemories.length === 0 && (
                <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-4 py-3">
                  <p className="text-sm text-yellow-400">
                    No lines starting with{' '}
                    <code className="rounded bg-yellow-500/10 px-1 text-xs">- </code> were found.
                    Make sure the AI formatted its response with bullet lines.
                  </p>
                </div>
              )}

              {/* Progress bar during import */}
              {importing && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-zinc-400">
                    <span>Importing…</span>
                    <span>
                      {importedCount} / {parsedMemories.length}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{
                        width: `${parsedMemories.length > 0 ? (importedCount / parsedMemories.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)} disabled={importing}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button
              onClick={() => void handleImport()}
              disabled={parsedMemories.length === 0 || importing}
            >
              {importing ? (
                <>
                  <Upload className="mr-2 h-4 w-4 animate-pulse" />
                  Importing…
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Import {parsedMemories.length > 0 ? `${parsedMemories.length} ` : ''}
                  {parsedMemories.length === 1 ? 'Memory' : 'Memories'}
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
