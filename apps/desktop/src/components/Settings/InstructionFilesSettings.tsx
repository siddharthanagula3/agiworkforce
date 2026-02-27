/**
 * InstructionFilesSettings
 *
 * Shows a list of well-known instruction file patterns (CLAUDE.md, AGENTS.md, etc.),
 * their status (Found/Not found), and lets users view/edit or create them.
 */

import { AlertCircle, Check, Circle, Edit2, FileText, Loader2, Plus, Save, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { homeDir as getHomeDir } from '@tauri-apps/api/path';
import { invoke, isTauriContext } from '../../lib/tauri-mock';
import { Button } from '../ui/Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/Dialog';
import { Textarea } from '../ui/Textarea';

interface InstructionFilePattern {
  pattern: string;
  source: string;
  priority: number;
}

const INSTRUCTION_FILE_PATTERNS: InstructionFilePattern[] = [
  { pattern: 'CLAUDE.md', source: 'Claude Code', priority: 1 },
  { pattern: 'AGENTS.md', source: 'Generic', priority: 2 },
  { pattern: '.claude/CLAUDE.md', source: 'Claude Code', priority: 3 },
  { pattern: 'GEMINI.md', source: 'Gemini', priority: 4 },
  { pattern: '.cursorrules', source: 'Cursor', priority: 5 },
  { pattern: '.windsurfrules', source: 'Windsurf', priority: 6 },
  { pattern: '.github/copilot-instructions.md', source: 'GitHub Copilot', priority: 7 },
];

interface FileStatus {
  pattern: string;
  found: boolean;
  checking: boolean;
  error: string | null;
}

interface EditState {
  pattern: string;
  content: string;
  saving: boolean;
  error: string | null;
}

function resolveHomePath(pattern: string, home: string): string {
  return `${home}/${pattern}`;
}

export function InstructionFilesSettings() {
  const [homeDir, setHomeDir] = useState<string>('~');
  const [fileStatuses, setFileStatuses] = useState<FileStatus[]>(
    INSTRUCTION_FILE_PATTERNS.map((p) => ({
      pattern: p.pattern,
      found: false,
      checking: true,
      error: null,
    })),
  );
  const [editState, setEditState] = useState<EditState | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Resolve home directory and check file existence
  useEffect(() => {
    if (!isTauriContext()) {
      // In web/test mode, mark as not checking and not found
      setFileStatuses((prev) => prev.map((s) => ({ ...s, checking: false, found: false })));
      return;
    }

    const init = async () => {
      // Resolve home directory via @tauri-apps/api/path
      let home = '~';
      try {
        home = await getHomeDir();
      } catch {
        // Fallback — use get_user_preference for a known path
        try {
          const prefResult = await invoke<{ value: string } | null>('get_user_preference', {
            key: 'home_directory',
          });
          if (prefResult?.value) home = prefResult.value;
        } catch {
          // Keep default ~
        }
      }
      setHomeDir(home);

      // Check each file
      const updated: FileStatus[] = [];
      for (const p of INSTRUCTION_FILE_PATTERNS) {
        const fullPath = resolveHomePath(p.pattern, home);
        try {
          const found = await invoke<boolean>('file_exists', { path: fullPath });
          updated.push({ pattern: p.pattern, found, checking: false, error: null });
        } catch (e) {
          updated.push({
            pattern: p.pattern,
            found: false,
            checking: false,
            error: e instanceof Error ? e.message : null,
          });
        }
      }
      setFileStatuses(updated);
    };

    void init();
  }, []);

  const handleView = useCallback(
    async (pattern: string) => {
      const fullPath = resolveHomePath(pattern, homeDir);
      try {
        const content = await invoke<string>('file_read', { path: fullPath });
        setEditState({ pattern, content, saving: false, error: null });
        setEditDialogOpen(true);
      } catch (e) {
        setEditState({
          pattern,
          content: '',
          saving: false,
          error: e instanceof Error ? e.message : 'Failed to read file',
        });
        setEditDialogOpen(true);
      }
    },
    [homeDir],
  );

  const handleCreate = useCallback((pattern: string) => {
    setEditState({ pattern, content: '', saving: false, error: null });
    setEditDialogOpen(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!editState) return;
    const fullPath = resolveHomePath(editState.pattern, homeDir);
    setEditState((prev) => (prev ? { ...prev, saving: true, error: null } : null));

    try {
      await invoke('file_write', { path: fullPath, content: editState.content });

      // Refresh status for this file
      setFileStatuses((prev) =>
        prev.map((s) => (s.pattern === editState.pattern ? { ...s, found: true } : s)),
      );

      setEditDialogOpen(false);
      setEditState(null);
    } catch (e) {
      setEditState((prev) =>
        prev
          ? {
              ...prev,
              saving: false,
              error: e instanceof Error ? e.message : 'Failed to save file',
            }
          : null,
      );
    }
  }, [editState, homeDir]);

  const getPatternInfo = (pattern: string): InstructionFilePattern | undefined =>
    INSTRUCTION_FILE_PATTERNS.find((p) => p.pattern === pattern);

  const isNonTauri = !isTauriContext();

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-1">Instruction Files</h3>
        <p className="text-sm text-muted-foreground">
          Instruction files (CLAUDE.md, AGENTS.md, etc.) are automatically loaded by AI coding
          tools. Manage them here.
        </p>
      </div>

      {isNonTauri && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
          <AlertCircle className="h-4 w-4 shrink-0" />
          File detection requires the desktop app. Shown for preview only.
        </div>
      )}

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground border-b grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center">
          <span>File</span>
          <span>Source</span>
          <span>Status</span>
          <span>Actions</span>
        </div>

        <div className="divide-y divide-border">
          {INSTRUCTION_FILE_PATTERNS.map((p) => {
            const status = fileStatuses.find((s) => s.pattern === p.pattern);
            const isChecking = status?.checking ?? true;
            const isFound = status?.found ?? false;

            return (
              <div
                key={p.pattern}
                className="px-4 py-3 grid grid-cols-[1fr_auto_auto_auto] gap-4 items-center hover:bg-muted/30 transition-colors"
              >
                {/* File name */}
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-mono truncate">{p.pattern}</span>
                </div>

                {/* Source */}
                <span className="text-xs text-muted-foreground whitespace-nowrap">{p.source}</span>

                {/* Status */}
                <span className="flex items-center gap-1 text-xs whitespace-nowrap">
                  {isChecking ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  ) : isFound ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-green-500" />
                      <span className="text-green-600 dark:text-green-400">Found</span>
                    </>
                  ) : (
                    <>
                      <Circle className="h-3.5 w-3.5 text-muted-foreground/50" />
                      <span className="text-muted-foreground">Not found</span>
                    </>
                  )}
                </span>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  {isFound ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => void handleView(p.pattern)}
                      disabled={isChecking || isNonTauri}
                    >
                      <Edit2 className="h-3.5 w-3.5 mr-1" />
                      View / Edit
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => handleCreate(p.pattern)}
                      disabled={isChecking || isNonTauri}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Create
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Files are resolved relative to your home directory:{' '}
        <code className="rounded bg-muted px-1 py-0.5">{homeDir}</code>
      </p>

      {/* Edit / Create Dialog */}
      <Dialog
        open={editDialogOpen}
        onOpenChange={(v) => {
          if (!v) {
            setEditDialogOpen(false);
            setEditState(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {editState?.pattern ?? ''}
            </DialogTitle>
          </DialogHeader>

          {editState && (
            <div className="space-y-4 pt-2">
              {editState.error && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md p-3">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {editState.error}
                </div>
              )}

              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {resolveHomePath(editState.pattern, homeDir)}
                </p>
                {getPatternInfo(editState.pattern) && (
                  <p className="text-xs text-muted-foreground">
                    Used by: {getPatternInfo(editState.pattern)?.source}
                  </p>
                )}
              </div>

              <Textarea
                className="font-mono text-xs min-h-[400px] resize-y"
                value={editState.content}
                onChange={(e) =>
                  setEditState((prev) => (prev ? { ...prev, content: e.target.value } : null))
                }
                placeholder={`# Instruction file for ${editState.pattern}\n\nAdd your instructions here...`}
                spellCheck={false}
              />

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditDialogOpen(false);
                    setEditState(null);
                  }}
                >
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
                <Button onClick={() => void handleSave()} disabled={editState.saving}>
                  {editState.saving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-1" />
                      Save File
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default InstructionFilesSettings;
