import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { invoke } from '../utils/ipc';

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  changes: LineChange[];
  accepted?: boolean;
  rejected?: boolean;
}

export interface LineChange {
  type: 'add' | 'delete' | 'context';
  oldLineNumber?: number;
  newLineNumber?: number;
  content: string;
}

export interface FileDiff {
  filePath: string;
  originalContent: string;
  modifiedContent: string;
  hunks: DiffHunk[];
  stats: DiffStats;
  language: string;
  status: 'pending' | 'accepted' | 'rejected' | 'partial';
}

export interface DiffStats {
  additions: number;
  deletions: number;
  changes: number;
  filesChanged: number;
}

export interface FileChange {
  path: string;
  type: 'modified' | 'added' | 'deleted';
  status: 'pending' | 'accepted' | 'rejected' | 'partial';
}

interface EditingState {
  // Pending changes
  pendingChanges: Map<string, FileDiff>;
  selectedFile: string | null;

  // Undo/redo history
  history: FileDiff[][];
  historyIndex: number;

  // Preview mode
  previewMode: 'diff' | 'preview';
  inlineMode: boolean;

  // Conflict resolution
  conflicts: Map<string, ConflictMarker[]>;

  // Actions
  addPendingChange: (diff: FileDiff) => void;
  removePendingChange: (filePath: string) => void;
  acceptChange: (filePath: string) => Promise<void>;
  rejectChange: (filePath: string) => void;
  acceptHunk: (filePath: string, hunkIndex: number) => void;
  rejectHunk: (filePath: string, hunkIndex: number) => void;
  acceptAllChanges: () => Promise<void>;
  rejectAllChanges: () => void;

  setSelectedFile: (filePath: string | null) => void;
  setPreviewMode: (mode: 'diff' | 'preview') => void;
  toggleInlineMode: () => void;

  // Undo/redo
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Diff generation
  generateDiff: (filePath: string, originalContent: string, modifiedContent: string) => Promise<FileDiff>;

  // Conflict resolution
  detectConflicts: (filePath: string, content: string) => ConflictMarker[];
  resolveConflict: (filePath: string, conflictIndex: number, resolution: 'ours' | 'theirs' | 'both') => void;

  // Utility
  getChangesSummary: () => DiffStats;
  getChangedFiles: () => FileChange[];
  clearAll: () => void;
}

export interface ConflictMarker {
  startLine: number;
  endLine: number;
  ourContent: string;
  theirContent: string;
}

const detectLanguage = (filePath: string): string => {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    rs: 'rust',
    go: 'go',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    cs: 'csharp',
    php: 'php',
    rb: 'ruby',
    swift: 'swift',
    kt: 'kotlin',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    md: 'markdown',
    html: 'html',
    css: 'css',
  };
  return languageMap[ext || ''] || 'plaintext';
};

export const useEditingStore = create<EditingState>()(
  immer((set, get) => ({
    pendingChanges: new Map(),
    selectedFile: null,
    history: [],
    historyIndex: -1,
    previewMode: 'diff',
    inlineMode: false,
    conflicts: new Map(),

    addPendingChange: (diff: FileDiff) => {
      set((state) => {
        state.pendingChanges.set(diff.filePath, diff);

        // Add to history
        const currentChanges = Array.from(state.pendingChanges.values());
        state.history = state.history.slice(0, state.historyIndex + 1);
        state.history.push(currentChanges);
        state.historyIndex = state.history.length - 1;
      });
    },

    removePendingChange: (filePath: string) => {
      set((state) => {
        state.pendingChanges.delete(filePath);
        if (state.selectedFile === filePath) {
          state.selectedFile = null;
        }

        // Add to history
        const currentChanges = Array.from(state.pendingChanges.values());
        state.history = state.history.slice(0, state.historyIndex + 1);
        state.history.push(currentChanges);
        state.historyIndex = state.history.length - 1;
      });
    },

    acceptChange: async (filePath: string) => {
      const change = get().pendingChanges.get(filePath);
      if (!change) return;

      try {
        // Apply accepted hunks only
        let finalContent = change.originalContent;
        const acceptedHunks = change.hunks.filter(h => h.accepted && !h.rejected);

        if (acceptedHunks.length > 0) {
          // Apply hunks in reverse order to maintain line numbers
          for (const hunk of acceptedHunks.reverse()) {
            const lines = finalContent.split('\n');
            const deletions = hunk.changes.filter(c => c.type === 'delete');
            const additions = hunk.changes.filter(c => c.type === 'add');

            // Remove deleted lines
            for (const del of deletions.reverse()) {
              if (del.oldLineNumber !== undefined) {
                lines.splice(del.oldLineNumber - 1, 1);
              }
            }

            // Add new lines
            for (const add of additions) {
              if (add.newLineNumber !== undefined) {
                lines.splice(add.newLineNumber - 1, 0, add.content);
              }
            }

            finalContent = lines.join('\n');
          }
        } else {
          // Accept all changes if no specific hunks accepted
          finalContent = change.modifiedContent;
        }

        await invoke('file_write', { path: filePath, content: finalContent });

        set((state) => {
          state.pendingChanges.delete(filePath);
          if (state.selectedFile === filePath) {
            state.selectedFile = null;
          }
        });
      } catch (error) {
        console.error('Failed to accept change:', error);
        throw error;
      }
    },

    rejectChange: (filePath: string) => {
      get().removePendingChange(filePath);
    },

    acceptHunk: (filePath: string, hunkIndex: number) => {
      set((state) => {
        const change = state.pendingChanges.get(filePath);
        if (change && change.hunks[hunkIndex]) {
          change.hunks[hunkIndex].accepted = true;
          change.hunks[hunkIndex].rejected = false;
          change.status = 'partial';
        }
      });
    },

    rejectHunk: (filePath: string, hunkIndex: number) => {
      set((state) => {
        const change = state.pendingChanges.get(filePath);
        if (change && change.hunks[hunkIndex]) {
          change.hunks[hunkIndex].accepted = false;
          change.hunks[hunkIndex].rejected = true;
          change.status = 'partial';
        }
      });
    },

    acceptAllChanges: async () => {
      const changes = Array.from(get().pendingChanges.values());
      for (const change of changes) {
        try {
          await get().acceptChange(change.filePath);
        } catch (error) {
          console.error(`Failed to accept ${change.filePath}:`, error);
        }
      }
    },

    rejectAllChanges: () => {
      set((state) => {
        state.pendingChanges.clear();
        state.selectedFile = null;
      });
    },

    setSelectedFile: (filePath: string | null) => {
      set({ selectedFile: filePath });
    },

    setPreviewMode: (mode: 'diff' | 'preview') => {
      set({ previewMode: mode });
    },

    toggleInlineMode: () => {
      set((state) => {
        state.inlineMode = !state.inlineMode;
      });
    },

    undo: () => {
      const { history, historyIndex } = get();
      if (historyIndex > 0) {
        const previousState = history[historyIndex - 1];
        set((state) => {
          state.pendingChanges = new Map((previousState || []).map(c => [c.filePath, c]));
          state.historyIndex = historyIndex - 1;
        });
      }
    },

    redo: () => {
      const { history, historyIndex } = get();
      if (historyIndex < history.length - 1) {
        const nextState = history[historyIndex + 1];
        set((state) => {
          state.pendingChanges = new Map((nextState || []).map(c => [c.filePath, c]));
          state.historyIndex = historyIndex + 1;
        });
      }
    },

    canUndo: () => get().historyIndex > 0,
    canRedo: () => get().historyIndex < get().history.length - 1,

    generateDiff: async (filePath: string, originalContent: string, modifiedContent: string) => {
      try {
        const result = await invoke<{
          file_path: string;
          hunks: Array<{
            old_start: number;
            old_lines: number;
            new_start: number;
            new_lines: number;
            changes: Array<{
              type: 'add' | 'delete' | 'context';
              old_line_number?: number;
              new_line_number?: number;
              content: string;
            }>;
          }>;
          stats: {
            additions: number;
            deletions: number;
            changes: number;
          };
        }>('get_file_diff', {
          filePath,
          original: originalContent,
          modified: modifiedContent,
        });

        const diff: FileDiff = {
          filePath: result.file_path,
          originalContent,
          modifiedContent,
          hunks: result.hunks.map(h => ({
            oldStart: h.old_start,
            oldLines: h.old_lines,
            newStart: h.new_start,
            newLines: h.new_lines,
            changes: h.changes.map(c => ({
              type: c.type,
              oldLineNumber: c.old_line_number,
              newLineNumber: c.new_line_number,
              content: c.content,
            })),
          })),
          stats: {
            ...result.stats,
            filesChanged: 1,
          },
          language: detectLanguage(filePath),
          status: 'pending',
        };

        return diff;
      } catch (error) {
        // Fallback to simple line-based diff
        const originalLines = originalContent.split('\n');
        const modifiedLines = modifiedContent.split('\n');

        const changes: LineChange[] = [];
        let additions = 0;
        let deletions = 0;

        const maxLength = Math.max(originalLines.length, modifiedLines.length);
        for (let i = 0; i < maxLength; i++) {
          const origLine = originalLines[i];
          const modLine = modifiedLines[i];

          if (origLine === undefined && modLine !== undefined) {
            changes.push({
              type: 'add',
              newLineNumber: i + 1,
              content: modLine || '',
            });
            additions++;
          } else if (origLine !== undefined && modLine === undefined) {
            changes.push({
              type: 'delete',
              oldLineNumber: i + 1,
              content: origLine || '',
            });
            deletions++;
          } else if (origLine !== modLine) {
            changes.push({
              type: 'delete',
              oldLineNumber: i + 1,
              content: origLine || '',
            });
            changes.push({
              type: 'add',
              newLineNumber: i + 1,
              content: modLine || '',
            });
            deletions++;
            additions++;
          } else {
            changes.push({
              type: 'context',
              oldLineNumber: i + 1,
              newLineNumber: i + 1,
              content: origLine || '',
            });
          }
        }

        return {
          filePath,
          originalContent,
          modifiedContent,
          hunks: [{
            oldStart: 1,
            oldLines: originalLines.length,
            newStart: 1,
            newLines: modifiedLines.length,
            changes,
          }],
          stats: {
            additions,
            deletions,
            changes: additions + deletions,
            filesChanged: 1,
          },
          language: detectLanguage(filePath),
          status: 'pending',
        };
      }
    },

    detectConflicts: (filePath: string, content: string) => {
      const lines = content.split('\n');
      const conflicts: ConflictMarker[] = [];

      let i = 0;
      while (i < lines.length) {
        if (lines[i]?.startsWith('<<<<<<<')) {
          const startLine = i;
          let middleLine = -1;
          let endLine = -1;

          // Find middle marker
          for (let j = i + 1; j < lines.length; j++) {
            if (lines[j]?.startsWith('=======')) {
              middleLine = j;
              break;
            }
          }

          // Find end marker
          if (middleLine !== -1) {
            for (let j = middleLine + 1; j < lines.length; j++) {
              if (lines[j]?.startsWith('>>>>>>>')) {
                endLine = j;
                break;
              }
            }
          }

          if (middleLine !== -1 && endLine !== -1) {
            const ourContent = lines.slice(startLine + 1, middleLine).join('\n');
            const theirContent = lines.slice(middleLine + 1, endLine).join('\n');

            conflicts.push({
              startLine,
              endLine,
              ourContent,
              theirContent,
            });

            i = endLine + 1;
            continue;
          }
        }
        i++;
      }

      set((state) => {
        state.conflicts.set(filePath, conflicts);
      });

      return conflicts;
    },

    resolveConflict: (filePath: string, conflictIndex: number, resolution: 'ours' | 'theirs' | 'both') => {
      const change = get().pendingChanges.get(filePath);
      if (!change) return;

      const conflicts = get().conflicts.get(filePath);
      if (!conflicts || !conflicts[conflictIndex]) return;

      const conflict = conflicts[conflictIndex];
      const lines = change.modifiedContent.split('\n');

      let resolvedContent = '';
      switch (resolution) {
        case 'ours':
          resolvedContent = conflict.ourContent;
          break;
        case 'theirs':
          resolvedContent = conflict.theirContent;
          break;
        case 'both':
          resolvedContent = `${conflict.ourContent}\n${conflict.theirContent}`;
          break;
      }

      // Replace conflict markers with resolved content
      lines.splice(
        conflict.startLine,
        conflict.endLine - conflict.startLine + 1,
        ...resolvedContent.split('\n')
      );

      set((state) => {
        const updatedChange = state.pendingChanges.get(filePath);
        if (updatedChange) {
          updatedChange.modifiedContent = lines.join('\n');
        }

        // Remove resolved conflict
        const updatedConflicts = state.conflicts.get(filePath);
        if (updatedConflicts) {
          updatedConflicts.splice(conflictIndex, 1);
        }
      });
    },

    getChangesSummary: () => {
      const changes = Array.from(get().pendingChanges.values());
      const totalStats = changes.reduce(
        (acc, change) => ({
          additions: acc.additions + change.stats.additions,
          deletions: acc.deletions + change.stats.deletions,
          changes: acc.changes + change.stats.changes,
          filesChanged: acc.filesChanged + 1,
        }),
        { additions: 0, deletions: 0, changes: 0, filesChanged: 0 }
      );
      return totalStats;
    },

    getChangedFiles: () => {
      return Array.from(get().pendingChanges.values()).map(change => ({
        path: change.filePath,
        type: change.stats.additions > 0 && change.stats.deletions === 0
          ? 'added' as const
          : change.stats.deletions > 0 && change.stats.additions === 0
          ? 'deleted' as const
          : 'modified' as const,
        status: change.status,
      }));
    },

    clearAll: () => {
      set({
        pendingChanges: new Map(),
        selectedFile: null,
        history: [],
        historyIndex: -1,
        conflicts: new Map(),
      });
    },
  }))
);
