/**
 * PromptStash — Phase A Slice 5 (ported from UAC)
 *
 * A dropdown anchored to a Bookmark toolbar button that lets users:
 * - Save the current chat-input text as a stash entry (optionally labelled)
 * - Load a saved entry back into the input with one click
 * - Delete individual entries or clear all
 *
 * Uses usePromptStashStore (package store) instead of the desktop promptStashStore.
 * Toast feedback is optional via an `onToast` prop.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bookmark, Trash2, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '../lib/utils';
import { usePromptStashStore } from '../stores/promptStashStore';
import type { PromptStashEntry } from '../stores/promptStashStore';

// ============================================================================
// Types
// ============================================================================

export interface PromptStashProps {
  /** Current value of the chat input textarea */
  currentText: string;
  /** Called when the user clicks an entry to load it into the input */
  onLoad: (text: string) => void;
  /** Whether the trigger button should be disabled (e.g., while AI is responding) */
  disabled?: boolean;
  /** Optional toast callback. Receives (message, type). */
  onToast?: (message: string, type: 'success' | 'error') => void;
}

// ============================================================================
// Helpers
// ============================================================================

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function entryPreview(entry: PromptStashEntry): string {
  if (entry.label) return entry.label;
  return entry.text.length > 60 ? `${entry.text.slice(0, 60)}…` : entry.text;
}

// ============================================================================
// Sub-components
// ============================================================================

interface EntryRowProps {
  entry: PromptStashEntry;
  onSelect: (entry: PromptStashEntry) => void;
  onDelete: (id: string) => void;
}

function EntryRow({ entry, onSelect, onDelete }: EntryRowProps) {
  return (
    <div
      role="option"
      aria-selected={false}
      className="group flex items-start gap-2 rounded-md px-2 py-2 cursor-pointer hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      onClick={() => onSelect(entry)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(entry);
        }
      }}
      tabIndex={0}
    >
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate leading-snug">
          {entryPreview(entry)}
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(entry.createdAt)}</p>
      </div>
      <button
        type="button"
        aria-label="Delete prompt"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(entry.id);
        }}
        className="opacity-0 group-hover:opacity-100 shrink-0 mt-0.5 rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ============================================================================
// Main component
// ============================================================================

export function PromptStash({ currentText, onLoad, disabled = false, onToast }: PromptStashProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { entries, save, remove, clear } = usePromptStashStore(
    useShallow((s) => ({ entries: s.entries, save: s.save, remove: s.remove, clear: s.clear })),
  );

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handleOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleSave = useCallback(() => {
    const trimmed = currentText.trim();
    if (!trimmed) return;
    save(trimmed);
    onToast?.('Prompt saved to stash', 'success');
    setIsOpen(false);
  }, [currentText, save, onToast]);

  const handleSelect = useCallback(
    (entry: PromptStashEntry) => {
      onLoad(entry.text);
      setIsOpen(false);
      onToast?.('Prompt loaded', 'success');
    },
    [onLoad, onToast],
  );

  const handleDelete = useCallback(
    (id: string) => {
      remove(id);
      onToast?.('Prompt removed', 'success');
    },
    [remove, onToast],
  );

  const handleClearAll = useCallback(() => {
    clear();
    onToast?.('Stash cleared', 'success');
    setIsOpen(false);
  }, [clear, onToast]);

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        disabled={disabled}
        aria-label="Prompt stash"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        title="Prompt Stash — save &amp; restore prompts"
        onClick={() => setIsOpen((v) => !v)}
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-lg transition-colors',
          isOpen
            ? 'text-blue-400 bg-blue-500/10'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent',
          disabled && 'pointer-events-none opacity-40',
        )}
      >
        <Bookmark size={16} />
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div
          role="listbox"
          aria-label="Saved prompts"
          className="absolute bottom-full right-0 mb-2 z-50 w-80 rounded-xl border border-border bg-popover shadow-xl overflow-hidden"
        >
          {/* Save current prompt */}
          <div className="px-2 pt-2 pb-1.5 border-b border-border">
            <button
              type="button"
              disabled={!currentText.trim()}
              onClick={handleSave}
              className={cn(
                'w-full flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                currentText.trim()
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-muted text-muted-foreground cursor-not-allowed',
              )}
            >
              <Bookmark className="h-3.5 w-3.5" />
              Save current prompt
            </button>
          </div>

          {/* Entries list */}
          {entries.length === 0 ? (
            <div className="py-6 px-4 text-center">
              <Bookmark className="h-7 w-7 mx-auto mb-2 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">No saved prompts yet.</p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">
                Type a prompt and click &quot;Save current prompt&quot; above.
              </p>
            </div>
          ) : (
            <>
              <div className="max-h-64 overflow-y-auto p-1">
                {entries.map((entry) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    onSelect={handleSelect}
                    onDelete={handleDelete}
                  />
                ))}
              </div>

              {/* Clear all footer */}
              <div className="px-2 py-1.5 border-t border-border">
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="flex w-full items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[11px] text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear all
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
