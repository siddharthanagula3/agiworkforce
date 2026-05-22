/**
 * MemoryImport Component
 *
 * Modal dialog that lets users import memories from other AI platforms:
 * - ChatGPT: upload memories.json export
 * - Claude: upload memory export
 * - Custom: paste plain text (one memory per line)
 *
 * Parses incoming data, shows a preview table, then bulk-imports via
 * the memory store's importJsonString / storeMemory actions.
 */
import { useCallback, useRef, useState } from 'react';
import { AlertCircle, Check, ChevronDown, FileJson, Import, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/Dialog';
import { cn } from '@/lib/utils';
import { useShallow } from 'zustand/react/shallow';
import type { MemoryCategory, MemoryEntry } from '@/stores/memoryStore';
import { useMemoryStore } from '@/stores/memoryStore';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImportSource = 'chatgpt' | 'claude' | 'custom';

interface ParsedMemory {
  topic: string;
  content: string;
  category: MemoryCategory;
  importance: number;
  source: string;
}

interface ImportStep {
  step: 'select-source' | 'upload' | 'preview' | 'success';
}

export interface MemoryImportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// ChatGPT export format parsers
// ---------------------------------------------------------------------------

/**
 * ChatGPT memory export produces a JSON array like:
 * [{ "title": "...", "content": "..." }, ...]
 * or the full conversations export with a "memories" key.
 */
function parseChatGptJson(raw: string): ParsedMemory[] {
  const parsed: unknown = JSON.parse(raw);

  // Direct array of memory objects
  if (Array.isArray(parsed)) {
    return parsed
      .filter(
        (item): item is { title?: string; content?: string; text?: string; value?: string } =>
          typeof item === 'object' && item !== null,
      )
      .map((item) => {
        const topic = String(item.title ?? 'Imported memory').slice(0, 120);
        const content = String(item.content ?? item.text ?? item.value ?? '').trim();
        return {
          topic,
          content,
          category: 'fact' as MemoryCategory,
          importance: 5,
          source: 'ChatGPT',
        };
      })
      .filter((m) => m.content.length > 0);
  }

  // Object with a "memories" key (newer ChatGPT export format)
  if (typeof parsed === 'object' && parsed !== null) {
    const obj = parsed as Record<string, unknown>;
    const items = obj['memories'] ?? obj['data'] ?? obj['items'];
    if (Array.isArray(items)) {
      return items
        .filter(
          (item): item is Record<string, unknown> => item !== null && typeof item === 'object',
        )
        .map((item) => ({
          topic: String(item['title'] ?? item['name'] ?? 'Imported memory').slice(0, 120),
          content: String(item['content'] ?? item['text'] ?? item['value'] ?? JSON.stringify(item)),
          category: String(item['category'] ?? item['type'] ?? 'fact') as MemoryCategory,
          importance: 5,
          source: 'ChatGPT',
        }))
        .filter((m) => m.content.length > 0);
    }
  }

  return [];
}

/**
 * Claude memory export — tries the same AGI Workforce JSON shape first,
 * then falls back to ChatGPT-style parsing.
 */
function parseClaudeJson(raw: string): ParsedMemory[] {
  const parsed: unknown = JSON.parse(raw);

  // AGI Workforce own export shape: { memories: MemoryEntry[] }
  if (typeof parsed === 'object' && parsed !== null) {
    const obj = parsed as Record<string, unknown>;
    const items = obj['memories'];
    if (Array.isArray(items)) {
      return (items as Partial<MemoryEntry>[])
        .map((item) => ({
          topic: String(item.topic ?? 'Imported memory').slice(0, 120),
          content: String(item.content ?? '').trim(),
          category: (item.category as MemoryCategory) ?? 'fact',
          importance: typeof item.importance === 'number' ? item.importance : 5,
          source: 'Claude',
        }))
        .filter((m) => m.content.length > 0);
    }
  }

  // Fallback — treat like ChatGPT
  return parseChatGptJson(raw).map((m) => ({ ...m, source: 'Claude' }));
}

/**
 * Plain-text format: one memory per non-empty line.
 */
function parsePlainText(text: string): ParsedMemory[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      // Support "Topic: content" format if the line contains ": "
      const colonIdx = line.indexOf(': ');
      if (colonIdx > 0 && colonIdx < 60) {
        return {
          topic: line.slice(0, colonIdx).trim(),
          content: line.slice(colonIdx + 2).trim(),
          category: 'fact' as MemoryCategory,
          importance: 5,
          source: 'Custom',
        };
      }
      // Fallback: whole line is the content, generate a short topic
      const words = line.split(' ').slice(0, 5).join(' ');
      return {
        topic: words.slice(0, 80),
        content: line,
        category: 'fact' as MemoryCategory,
        importance: 5,
        source: 'Custom',
      };
    });
}

// ---------------------------------------------------------------------------
// Source selection card
// ---------------------------------------------------------------------------

interface SourceCardProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}

function SourceCard({ icon, label, description, selected, onClick }: SourceCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition-colors w-full',
        selected
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10',
      )}
    >
      {selected && (
        <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-blue-500">
          <Check className="h-3 w-3 text-white" />
        </span>
      )}
      <span className="text-foreground">{icon}</span>
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <span className="text-xs text-muted-foreground leading-snug">{description}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Preview table row
// ---------------------------------------------------------------------------

interface PreviewRowProps {
  memory: ParsedMemory;
  index: number;
  onRemove: (index: number) => void;
}

function PreviewRow({ memory, index, onRemove }: PreviewRowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-0.5 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-foreground truncate">{memory.topic}</span>
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground capitalize flex-shrink-0">
              {memory.category}
            </span>
          </div>
          {!expanded && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{memory.content}</p>
          )}
          {expanded && (
            <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words">
              {memory.content}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => onRemove(index)}
          className="flex-shrink-0 text-muted-foreground hover:text-red-400 transition-colors"
          aria-label="Remove this memory"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MemoryImport({ open, onOpenChange }: MemoryImportProps) {
  const [currentStep, setCurrentStep] = useState<ImportStep['step']>('select-source');
  const [selectedSource, setSelectedSource] = useState<ImportSource>('chatgpt');
  const [parsedMemories, setParsedMemories] = useState<ParsedMemory[]>([]);
  const [importedCount, setImportedCount] = useState(0);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { importJsonString, storeMemory } = useMemoryStore(
    useShallow((s) => ({
      importJsonString: s.importJsonString,
      storeMemory: s.storeMemory,
    })),
  );

  // ------------------------------------------------------------------
  // Reset when dialog closes
  // ------------------------------------------------------------------
  const handleOpenChange = useCallback(
    (value: boolean) => {
      if (!value) {
        // Reset state on close
        setCurrentStep('select-source');
        setSelectedSource('chatgpt');
        setParsedMemories([]);
        setImportedCount(0);
        setParseError(null);
        setIsDragging(false);
        setIsImporting(false);
        setPasteText('');
      }
      onOpenChange(value);
    },
    [onOpenChange],
  );

  // ------------------------------------------------------------------
  // Parse file / text content
  // ------------------------------------------------------------------
  const processContent = useCallback(
    (content: string, isJson: boolean) => {
      setParseError(null);
      try {
        let memories: ParsedMemory[] = [];
        if (isJson) {
          if (selectedSource === 'chatgpt') {
            memories = parseChatGptJson(content);
          } else {
            memories = parseClaudeJson(content);
          }
        } else {
          memories = parsePlainText(content);
        }

        if (memories.length === 0) {
          setParseError(
            'No memories found in the provided content. Check the format and try again.',
          );
          return;
        }

        setParsedMemories(memories);
        setCurrentStep('preview');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setParseError(`Failed to parse content: ${msg}`);
      }
    },
    [selectedSource],
  );

  const readFile = useCallback(
    (file: File) => {
      const isJson = file.type === 'application/json' || file.name.endsWith('.json');
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result;
        if (typeof content === 'string') {
          processContent(content, isJson);
        }
      };
      reader.onerror = () => {
        setParseError('Failed to read file. Please try again.');
      };
      reader.readAsText(file);
    },
    [processContent],
  );

  // ------------------------------------------------------------------
  // Drag and drop handlers
  // ------------------------------------------------------------------
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        readFile(file);
      }
    },
    [readFile],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        readFile(file);
      }
      // Reset input so same file can be re-selected
      e.target.value = '';
    },
    [readFile],
  );

  const handlePasteImport = useCallback(() => {
    if (pasteText.trim().length === 0) {
      setParseError('Please paste some text to import.');
      return;
    }
    // Try JSON first, fall back to plain text
    const trimmed = pasteText.trim();
    const looksLikeJson = trimmed.startsWith('[') || trimmed.startsWith('{');
    processContent(trimmed, looksLikeJson);
  }, [pasteText, processContent]);

  // ------------------------------------------------------------------
  // Remove a single preview entry
  // ------------------------------------------------------------------
  const handleRemovePreview = useCallback((index: number) => {
    setParsedMemories((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ------------------------------------------------------------------
  // Perform the actual import
  // ------------------------------------------------------------------
  const handleImport = useCallback(async () => {
    if (parsedMemories.length === 0) return;
    setIsImporting(true);

    try {
      if (selectedSource === 'chatgpt' || selectedSource === 'claude') {
        // Use importJsonString which calls the Rust backend to bulk-import
        const jsonPayload = JSON.stringify({
          memories: parsedMemories.map((m) => ({
            category: m.category,
            topic: m.topic,
            content: m.content,
            importance: m.importance,
            source: m.source,
          })),
        });
        const result = await importJsonString(jsonPayload, 'merge');
        setImportedCount(result.memories_imported);
      } else {
        // Custom plain-text: store one at a time
        let count = 0;
        for (const m of parsedMemories) {
          await storeMemory(m.category, m.topic, m.content, m.importance, m.source);
          count++;
        }
        setImportedCount(count);
      }

      setCurrentStep('success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Import failed: ${msg}`);
    } finally {
      setIsImporting(false);
    }
  }, [parsedMemories, selectedSource, importJsonString, storeMemory]);

  // ------------------------------------------------------------------
  // Render helpers
  // ------------------------------------------------------------------

  const renderSelectSource = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <SourceCard
          icon={<FileJson className="h-5 w-5" />}
          label="ChatGPT"
          description="Upload your ChatGPT memory export (.json)"
          selected={selectedSource === 'chatgpt'}
          onClick={() => setSelectedSource('chatgpt')}
        />
        <SourceCard
          icon={<Import className="h-5 w-5" />}
          label="Claude"
          description="Upload a Claude or AGI Workforce memory export (.json)"
          selected={selectedSource === 'claude'}
          onClick={() => setSelectedSource('claude')}
        />
        <SourceCard
          icon={<Upload className="h-5 w-5" />}
          label="Custom"
          description="Paste plain text — one memory per line"
          selected={selectedSource === 'custom'}
          onClick={() => setSelectedSource('custom')}
        />
      </div>

      <Button
        className="w-full bg-blue-600 hover:bg-blue-700 text-white"
        onClick={() => {
          setParseError(null);
          setCurrentStep('upload');
        }}
      >
        Continue
      </Button>
    </div>
  );

  const renderUpload = () => (
    <div className="space-y-4">
      {selectedSource !== 'custom' ? (
        <>
          {/* File drop zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors',
              isDragging
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-white/20 bg-white/5 hover:border-white/30 hover:bg-white/10',
            )}
          >
            <div
              className={cn(
                'h-12 w-12 rounded-full flex items-center justify-center transition-colors',
                isDragging ? 'bg-blue-500/20' : 'bg-white/10',
              )}
            >
              <Upload
                className={cn('h-6 w-6', isDragging ? 'text-blue-400' : 'text-muted-foreground')}
              />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">
                {isDragging ? 'Drop your file here' : 'Drag & drop or click to upload'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {selectedSource === 'chatgpt'
                  ? 'ChatGPT memory export (.json)'
                  : 'Claude memory export (.json)'}
              </p>
            </div>
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleFileInput}
          />
        </>
      ) : (
        <>
          {/* Paste text area */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">
              Paste memories (one per line)
            </label>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              className="w-full h-40 rounded-xl border-2 border-white/20 bg-white/5 p-3 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:border-blue-500 focus:bg-blue-500/5 transition-colors"
              placeholder={`I prefer dark mode\nMy name is Alex\nI work at Acme Corp\n\nOr use "Topic: Content" format:\nPreference: I prefer concise responses`}
            />
          </div>

          <Button
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            onClick={handlePasteImport}
            disabled={pasteText.trim().length === 0}
          >
            Parse memories
          </Button>
        </>
      )}

      {/* Parse error */}
      {parseError && (
        <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 p-3">
          <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-400">{parseError}</p>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          variant="ghost"
          className="flex-1 text-muted-foreground hover:text-foreground"
          onClick={() => setCurrentStep('select-source')}
        >
          Back
        </Button>
      </div>
    </div>
  );

  const renderPreview = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Found <span className="font-semibold text-foreground">{parsedMemories.length}</span>{' '}
          {parsedMemories.length === 1 ? 'memory' : 'memories'} to import
        </p>
        <span className="text-xs text-muted-foreground">Remove any you don't want</span>
      </div>

      {/* Preview list */}
      <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
        {parsedMemories.map((memory, index) => (
          <PreviewRow
            key={`${memory.topic}-${memory.content.slice(0, 20)}-${index}`}
            memory={memory}
            index={index}
            onRemove={handleRemovePreview}
          />
        ))}

        {parsedMemories.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
            <p className="text-sm">All memories removed. Go back to start over.</p>
          </div>
        )}
      </div>

      <DialogFooter>
        <Button
          variant="ghost"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => setCurrentStep('upload')}
          disabled={isImporting}
        >
          Back
        </Button>
        <Button
          className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
          onClick={handleImport}
          disabled={parsedMemories.length === 0 || isImporting}
        >
          {isImporting ? (
            <>
              <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Importing...
            </>
          ) : (
            <>
              <Import className="h-4 w-4" />
              Import {parsedMemories.length} {parsedMemories.length === 1 ? 'memory' : 'memories'}
            </>
          )}
        </Button>
      </DialogFooter>
    </div>
  );

  const renderSuccess = () => (
    <div className="flex flex-col items-center justify-center py-6 text-center gap-4">
      <div className="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center">
        <Check className="h-8 w-8 text-green-400" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-foreground">Import complete</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Successfully imported{' '}
          <span className="font-semibold text-foreground">{importedCount}</span>{' '}
          {importedCount === 1 ? 'memory' : 'memories'}
        </p>
      </div>
      <Button
        className="bg-blue-600 hover:bg-blue-700 text-white"
        onClick={() => handleOpenChange(false)}
      >
        Done
      </Button>
    </div>
  );

  // ------------------------------------------------------------------
  // Step title helpers
  // ------------------------------------------------------------------
  const STEP_TITLES: Record<ImportStep['step'], string> = {
    'select-source': 'Import memories from another AI',
    upload: 'Upload your memory export',
    preview: 'Preview memories',
    success: 'Memories imported',
  };

  const STEP_DESCRIPTIONS: Partial<Record<ImportStep['step'], string>> = {
    'select-source': 'Choose the platform you want to import memories from.',
    upload:
      selectedSource === 'custom'
        ? 'Paste your memories as plain text below.'
        : `Upload your ${selectedSource === 'chatgpt' ? 'ChatGPT' : 'Claude'} memory export file.`,
    preview: "Review and remove any memories you don't want before importing.",
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl bg-background border-white/10">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Import className="h-5 w-5 text-blue-400" />
            {STEP_TITLES[currentStep]}
          </DialogTitle>
          {STEP_DESCRIPTIONS[currentStep] && (
            <DialogDescription>{STEP_DESCRIPTIONS[currentStep]}</DialogDescription>
          )}
        </DialogHeader>

        {currentStep === 'select-source' && renderSelectSource()}
        {currentStep === 'upload' && renderUpload()}
        {currentStep === 'preview' && renderPreview()}
        {currentStep === 'success' && renderSuccess()}
      </DialogContent>
    </Dialog>
  );
}
