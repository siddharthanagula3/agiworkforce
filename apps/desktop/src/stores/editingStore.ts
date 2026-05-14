// TODO(task-1.3): migrate to packages/runtime/state (see AppStateStore.ts domain mapping)
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { devtools } from 'zustand/middleware';
import { invoke } from '../utils/ipc';
import {
  generateImage as mediaGenerateImage,
  generateVideo as mediaGenerateVideo,
} from '../api/media';
import type {
  GeneratedImageResult,
  ImageGenerationPayload,
  ImageProviderId,
  VideoGenerationPayload,
  VideoGenerationResult,
} from '../types/media';

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
  pendingChanges: Map<string, FileDiff>;
  selectedFile: string | null;

  history: FileDiff[][];
  historyIndex: number;

  previewMode: 'diff' | 'preview';
  inlineMode: boolean;

  conflicts: Map<string, ConflictMarker[]>;

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

  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  generateDiff: (
    filePath: string,
    originalContent: string,
    modifiedContent: string,
  ) => Promise<FileDiff>;

  detectConflicts: (filePath: string, content: string) => ConflictMarker[];
  resolveConflict: (
    filePath: string,
    conflictIndex: number,
    resolution: 'ours' | 'theirs' | 'both',
  ) => void;

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
        let finalContent = change.originalContent;
        const acceptedHunks = change.hunks.filter((h) => h.accepted && !h.rejected);

        if (acceptedHunks.length > 0) {
          for (const hunk of acceptedHunks.reverse()) {
            const lines = finalContent.split('\n');
            const deletions = hunk.changes.filter((c) => c.type === 'delete');
            const additions = hunk.changes.filter((c) => c.type === 'add');

            for (const del of deletions.reverse()) {
              if (del.oldLineNumber !== undefined) {
                const index = del.oldLineNumber - 1;
                lines.splice(index, 1);
              }
            }

            const sortedAdditions = additions.sort(
              (a, b) => (a.newLineNumber || 0) - (b.newLineNumber || 0),
            );

            for (const add of sortedAdditions) {
              if (add.newLineNumber !== undefined) {
                const index = add.newLineNumber - 1;
                lines.splice(index, 0, add.content);
              }
            }

            finalContent = lines.join('\n');
          }
        } else {
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
          change.hunks[hunkIndex]!.accepted = true;
          change.hunks[hunkIndex]!.rejected = false;
          change.status = 'partial';
        }
      });
    },

    rejectHunk: (filePath: string, hunkIndex: number) => {
      set((state) => {
        const change = state.pendingChanges.get(filePath);
        if (change && change.hunks[hunkIndex]) {
          change.hunks[hunkIndex]!.accepted = false;
          change.hunks[hunkIndex]!.rejected = true;
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
          state.pendingChanges = new Map((previousState || []).map((c) => [c.filePath, c]));
          state.historyIndex = historyIndex - 1;
        });
      }
    },

    redo: () => {
      const { history, historyIndex } = get();
      if (historyIndex < history.length - 1) {
        const nextState = history[historyIndex + 1];
        set((state) => {
          state.pendingChanges = new Map((nextState || []).map((c) => [c.filePath, c]));
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
          hunks: result.hunks.map((h) => ({
            oldStart: h.old_start,
            oldLines: h.old_lines,
            newStart: h.new_start,
            newLines: h.new_lines,
            changes: h.changes.map((c) => ({
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
      } catch {
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
          hunks: [
            {
              oldStart: 1,
              oldLines: originalLines.length,
              newStart: 1,
              newLines: modifiedLines.length,
              changes,
            },
          ],
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

          for (let j = i + 1; j < lines.length; j++) {
            if (lines[j]?.startsWith('=======')) {
              middleLine = j;
              break;
            }
          }

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

    resolveConflict: (
      filePath: string,
      conflictIndex: number,
      resolution: 'ours' | 'theirs' | 'both',
    ) => {
      const change = get().pendingChanges.get(filePath);
      if (!change) return;

      const conflicts = get().conflicts.get(filePath);
      if (!conflicts || !conflicts[conflictIndex]) return;

      const conflict = conflicts[conflictIndex]!;
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

      lines.splice(
        conflict.startLine,
        conflict.endLine - conflict.startLine + 1,
        ...resolvedContent.split('\n'),
      );

      set((state) => {
        const updatedChange = state.pendingChanges.get(filePath);
        if (updatedChange) {
          updatedChange.modifiedContent = lines.join('\n');
        }

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
        { additions: 0, deletions: 0, changes: 0, filesChanged: 0 },
      );
      return totalStats;
    },

    getChangedFiles: () => {
      return Array.from(get().pendingChanges.values()).map((change) => ({
        path: change.filePath,
        type:
          change.stats.additions > 0 && change.stats.deletions === 0
            ? ('added' as const)
            : change.stats.deletions > 0 && change.stats.additions === 0
              ? ('deleted' as const)
              : ('modified' as const),
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
  })),
);

// ============================================================================
// Document Store (absorbed from documentStore.ts — task-w58)
// ============================================================================

import { toast as docToast } from 'sonner';
import { invoke as docInvoke } from '../lib/tauri-mock';
import {
  DocumentType,
  type DocumentContent,
  type DocumentMetadata,
  type SearchResult,
} from '../types/document';

interface GeneratedDocument {
  path: string;
  format: 'pdf' | 'word' | 'excel' | 'powerpoint';
  title: string;
}

interface DocumentState {
  currentDocument: DocumentContent | null;
  searchResults: SearchResult[];
  docLoading: boolean;
  isGenerating: boolean;
  lastGenerated: GeneratedDocument | null;
  docError: string | null;
  readDocument: (filePath: string) => Promise<void>;
  extractText: (filePath: string) => Promise<string>;
  getMetadata: (filePath: string) => Promise<DocumentMetadata>;
  search: (filePath: string, query: string) => Promise<SearchResult[]>;
  detectType: (filePath: string) => Promise<DocumentType>;
  generatePdf: (
    outputPath: string,
    title: string,
    content: string,
    options?: { author?: string },
  ) => Promise<string>;
  generateWord: (
    outputPath: string,
    title: string,
    content: string,
    options?: { author?: string },
  ) => Promise<string>;
  generateExcel: (
    outputPath: string,
    sheetName: string,
    headers: string[],
    rows: string[][],
  ) => Promise<string>;
  generateExcelNumbers: (
    outputPath: string,
    sheetName: string,
    headers: string[],
    rows: number[][],
  ) => Promise<string>;
  generatePowerpoint: (
    outputPath: string,
    title: string,
    author: string,
    slides: Array<[string, string[]]>,
  ) => Promise<string>;
  clearDocError: () => void;
  resetDocument: () => void;
}

export const useDocumentStore = create<DocumentState>((set) => ({
  currentDocument: null,
  searchResults: [],
  docLoading: false,
  isGenerating: false,
  lastGenerated: null,
  docError: null,

  readDocument: async (filePath) => {
    set({ docLoading: true, docError: null, searchResults: [] });
    try {
      const content = await docInvoke<DocumentContent>('document_read', { filePath });
      set({ currentDocument: content, docLoading: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ docError: msg, docLoading: false });
      throw err;
    }
  },
  extractText: async (filePath) => {
    set({ docLoading: true, docError: null });
    try {
      const text = await docInvoke<string>('document_extract_text', { filePath });
      set({ docLoading: false });
      return text;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ docError: msg, docLoading: false });
      throw err;
    }
  },
  getMetadata: async (filePath) => {
    set({ docLoading: true, docError: null });
    try {
      const m = await docInvoke<DocumentMetadata>('document_get_metadata', { filePath });
      set({ docLoading: false });
      return m;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ docError: msg, docLoading: false });
      throw err;
    }
  },
  search: async (filePath, query) => {
    set({ docLoading: true, docError: null, searchResults: [] });
    try {
      const r = await docInvoke<SearchResult[]>('document_search', { filePath, query });
      set({ searchResults: r, docLoading: false });
      return r;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ docError: msg, docLoading: false });
      throw err;
    }
  },
  detectType: async (filePath) => {
    try {
      const typeStr = await docInvoke<string>('document_detect_type', { filePath });
      const tm: Record<string, DocumentType> = {
        word: DocumentType.Word,
        excel: DocumentType.Excel,
        pdf: DocumentType.Pdf,
      };
      const d = tm[typeStr.trim().toLowerCase()];
      if (!d) throw new Error(`Unsupported document type: ${typeStr}`);
      return d;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ docError: msg });
      throw err;
    }
  },
  generatePdf: async (outputPath, title, content, options) => {
    set({ isGenerating: true, docError: null });
    try {
      const r = await docInvoke<string>('document_create_pdf_simple', {
        outputPath,
        title,
        author: options?.author ?? null,
        paragraphs: content.split('\n').filter((p) => p.trim()),
      });
      set({ isGenerating: false, lastGenerated: { path: r, format: 'pdf', title } });
      docToast.success(`PDF created: ${title}`);
      return r;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ docError: msg, isGenerating: false });
      docToast.error(`Failed to create PDF: ${msg}`);
      throw err;
    }
  },
  generateWord: async (outputPath, title, content, options) => {
    set({ isGenerating: true, docError: null });
    try {
      const r = await docInvoke<string>('document_create_word_simple', {
        outputPath,
        title,
        author: options?.author ?? null,
        paragraphs: content.split('\n').filter((p) => p.trim()),
      });
      set({ isGenerating: false, lastGenerated: { path: r, format: 'word', title } });
      docToast.success(`Word document created: ${title}`);
      return r;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ docError: msg, isGenerating: false });
      docToast.error(`Failed to create Word document: ${msg}`);
      throw err;
    }
  },
  generateExcel: async (outputPath, sheetName, headers, rows) => {
    set({ isGenerating: true, docError: null });
    try {
      const r = await docInvoke<string>('document_create_excel_simple', {
        outputPath,
        sheetName,
        headers,
        rows,
      });
      set({ isGenerating: false, lastGenerated: { path: r, format: 'excel', title: sheetName } });
      docToast.success(`Excel spreadsheet created: ${sheetName}`);
      return r;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ docError: msg, isGenerating: false });
      docToast.error(`Failed to create Excel spreadsheet: ${msg}`);
      throw err;
    }
  },
  generateExcelNumbers: async (outputPath, sheetName, headers, rows) => {
    set({ isGenerating: true, docError: null });
    try {
      const r = await docInvoke<string>('document_create_excel_numbers', {
        outputPath,
        sheetName,
        headers,
        rows,
      });
      set({ isGenerating: false, lastGenerated: { path: r, format: 'excel', title: sheetName } });
      docToast.success(`Excel spreadsheet created: ${sheetName}`);
      return r;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ docError: msg, isGenerating: false });
      docToast.error(`Failed to create Excel spreadsheet: ${msg}`);
      throw err;
    }
  },
  generatePowerpoint: async (outputPath, title, author, slides) => {
    set({ isGenerating: true, docError: null });
    try {
      const r = await docInvoke<string>('document_create_powerpoint_simple', {
        outputPath,
        title,
        author,
        slides,
      });
      set({ isGenerating: false, lastGenerated: { path: r, format: 'powerpoint', title } });
      docToast.success(`PowerPoint created: ${title}`);
      return r;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ docError: msg, isGenerating: false });
      docToast.error(`Failed to create PowerPoint: ${msg}`);
      throw err;
    }
  },
  clearDocError: () => set({ docError: null }),
  resetDocument: () =>
    set({
      currentDocument: null,
      searchResults: [],
      docLoading: false,
      isGenerating: false,
      lastGenerated: null,
      docError: null,
    }),
}));

// =============================================================================
// Media Generation Store (absorbed from mediaGenerationStore.ts — task-w58)
// =============================================================================

export type GenerationStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface ImageJob {
  id: string;
  prompt: string;
  provider: ImageProviderId;
  model?: string;
  status: GenerationStatus;
  createdAt: number;
  costEstimate?: number;
  latencyMs?: number;
  images: GeneratedImageResult[];
  error?: string;
}

export interface VideoJob {
  id: string;
  prompt: string;
  model?: string;
  status: GenerationStatus;
  provider: string;
  createdAt: number;
  durationSecs?: number;
  costEstimate?: number;
  latencyMs?: number;
  videoUrl?: string;
  thumbnailUrl?: string;
  error?: string;
}

interface MediaGenerationState {
  imageJobs: ImageJob[];
  videoJobs: VideoJob[];
  loadingImage: boolean;
  loadingVideo: boolean;
  error?: string;
  generateImage: (payload: ImageGenerationPayload) => Promise<ImageJob | null>;
  generateVideo: (payload: VideoGenerationPayload) => Promise<VideoJob | null>;
  clearError: () => void;
  reset: () => void;
}

export const useMediaGenerationStore = create<MediaGenerationState>()(
  devtools((set) => ({
    imageJobs: [],
    videoJobs: [],
    loadingImage: false,
    loadingVideo: false,
    error: undefined,
    clearError: () => set({ error: undefined }),
    reset: () =>
      set({
        imageJobs: [],
        videoJobs: [],
        loadingImage: false,
        loadingVideo: false,
        error: undefined,
      }),

    generateImage: async (payload) => {
      const jobId = crypto.randomUUID();
      const startedAt = Date.now();
      set((state) => ({
        loadingImage: true,
        error: undefined,
        imageJobs: [
          {
            id: jobId,
            prompt: payload.prompt,
            provider: payload.provider,
            model: payload.model,
            status: 'running',
            createdAt: startedAt,
            images: [],
          },
          ...state.imageJobs,
        ],
      }));
      try {
        const results = await mediaGenerateImage(payload);
        const job: ImageJob = {
          id: jobId,
          prompt: payload.prompt,
          provider: payload.provider,
          model: payload.model,
          status: 'completed',
          createdAt: startedAt,
          costEstimate: results[0]?.costEstimate,
          latencyMs: results[0]?.latencyMs,
          images: results,
        };
        set((state) => ({
          loadingImage: false,
          imageJobs: state.imageJobs.map((j) => (j.id === jobId ? job : j)),
        }));
        return job;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to generate image';
        set((state) => ({
          loadingImage: false,
          error: message,
          imageJobs: state.imageJobs.map((j) =>
            j.id === jobId ? { ...j, status: 'failed', error: message } : j,
          ),
        }));
        return null;
      }
    },

    generateVideo: async (payload) => {
      const jobId = crypto.randomUUID();
      const startedAt = Date.now();
      set((state) => ({
        loadingVideo: true,
        error: undefined,
        videoJobs: [
          {
            id: jobId,
            prompt: payload.prompt,
            provider: 'veo-3.1',
            model: payload.model,
            status: 'running',
            createdAt: startedAt,
            durationSecs: payload.durationSecs,
          },
          ...state.videoJobs,
        ],
      }));
      try {
        const response: VideoGenerationResult = await mediaGenerateVideo(payload);
        const job: VideoJob = {
          id: jobId,
          prompt: payload.prompt,
          provider: response.provider,
          model: response.model,
          status: response.status === 'completed' ? 'completed' : 'running',
          createdAt: startedAt,
          durationSecs: response.durationSecs,
          costEstimate: response.costEstimate,
          latencyMs: response.latencyMs,
          videoUrl: response.videoUrl,
          thumbnailUrl: response.thumbnailUrl,
        };
        set((state) => ({
          loadingVideo: false,
          videoJobs: state.videoJobs.map((j) => (j.id === jobId ? job : j)),
        }));
        return job;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to generate video';
        set((state) => ({
          loadingVideo: false,
          error: message,
          videoJobs: state.videoJobs.map((j) =>
            j.id === jobId ? { ...j, status: 'failed', error: message } : j,
          ),
        }));
        return null;
      }
    },
  })),
);

import { persist as galleryPersist } from 'zustand/middleware';

export interface ImageEntry {
  id: string;
  url: string;
  prompt: string;
  style: string;
  timestamp: number;
  width?: number;
  height?: number;
}
export type ImageStyleId =
  | 'photorealistic'
  | 'illustration'
  | 'watercolor'
  | 'pixel-art'
  | 'anime'
  | 'oil-painting'
  | 'minimalist'
  | '3d-render';

interface ImageGalleryState {
  images: ImageEntry[];
  selectedStyle: ImageStyleId;
  isGeneratingGallery: boolean;
  addImage: (entry: ImageEntry) => void;
  removeImage: (id: string) => void;
  setStyle: (style: ImageStyleId) => void;
  setGenerating: (generating: boolean) => void;
  clearAll: () => void;
}

export const useImageGalleryStore = create<ImageGalleryState>()(
  devtools(
    galleryPersist(
      (set) => ({
        images: [],
        selectedStyle: 'photorealistic',
        isGeneratingGallery: false,
        addImage: (entry) => set((state) => ({ images: [entry, ...state.images] })),
        removeImage: (id) =>
          set((state) => ({ images: state.images.filter((img) => img.id !== id) })),
        setStyle: (style) => set({ selectedStyle: style }),
        setGenerating: (generating) => set({ isGeneratingGallery: generating }),
        clearAll: () => set({ images: [] }),
      }),
      {
        name: 'image-gallery-store',
        version: 1,
        partialize: (state) => ({ images: state.images, selectedStyle: state.selectedStyle }),
      },
    ),
    { name: 'ImageGalleryStore', enabled: import.meta.env.DEV },
  ),
);

// =============================================================================
// Absorbed from canvasStore.ts
// =============================================================================

export type CanvasArtifactType = 'code' | 'html' | 'markdown' | 'document';

export type ExecutionState = 'idle' | 'running' | 'success' | 'error';

export interface CanvasArtifact {
  id: string;
  type: CanvasArtifactType;
  language?: string;
  title: string;
  content: string;
  previewContent?: string;
  executionState: ExecutionState;
  executionOutput?: string;
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
  messageId?: string;
}

export interface BackendCanvasElement {
  id: string;
  [key: string]: unknown;
}

export interface A2UICommand {
  action: string;
  [key: string]: unknown;
}

export interface A2UIResponse {
  success: boolean;
  message?: string;
  data?: unknown;
}

export interface CanvasElementStyle {
  fontSize?: number;
  fontWeight?: string;
  color?: string;
  backgroundColor?: string;
  [key: string]: unknown;
}

export interface CanvasSummary {
  id: string;
  name: string;
}

interface CanvasStoreState {
  artifacts: CanvasArtifact[];
  activeArtifactId: string | null;
  isPanelOpen: boolean;
  backendCanvases: CanvasSummary[];
  activeBackendCanvasId: string | null;
  loadingBackendCanvases: boolean;
  backendError: string | null;
  createArtifact: (
    type: CanvasArtifactType,
    content: string,
    language?: string,
    title?: string,
    messageId?: string,
  ) => string;
  updateArtifact: (id: string, updates: Partial<CanvasArtifact>) => void;
  executeArtifact: (id: string) => Promise<void>;
  deleteArtifact: (id: string) => void;
  openPanel: (artifactId?: string) => void;
  closePanel: () => void;
  createBackendCanvas: (name: string, width?: number, height?: number) => Promise<string | null>;
  getBackendCanvas: (id: string) => Promise<unknown | null>;
  listBackendCanvases: () => Promise<CanvasSummary[]>;
  destroyBackendCanvas: (id: string) => Promise<boolean>;
  setActiveBackendCanvas: (id: string | null) => Promise<boolean>;
  getActiveBackendCanvas: () => Promise<string | null>;
  addElement: (canvasId: string, element: BackendCanvasElement) => Promise<boolean>;
  removeElement: (canvasId: string, elementId: string) => Promise<boolean>;
  updateElement: (
    canvasId: string,
    elementId: string,
    updates: Record<string, unknown>,
  ) => Promise<boolean>;
  clearCanvas: (canvasId: string) => Promise<boolean>;
  exportCanvas: (canvasId: string) => Promise<string | null>;
  executeA2UI: (command: A2UICommand) => Promise<A2UIResponse | null>;
  addTextElement: (
    canvasId: string,
    text: string,
    x: number,
    y: number,
    width?: number,
    style?: CanvasElementStyle,
  ) => Promise<string | null>;
}

function canvasGenerateId(): string {
  return `canvas_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function canvasDeriveTitle(type: CanvasArtifactType, language?: string): string {
  if (type === 'html') return 'HTML Preview';
  if (type === 'markdown') return 'Markdown Document';
  if (type === 'document') return 'Document';
  if (language) {
    const langMap: Record<string, string> = {
      python: 'Python Script',
      javascript: 'JavaScript',
      typescript: 'TypeScript',
      bash: 'Shell Script',
      sh: 'Shell Script',
      sql: 'SQL Query',
      rust: 'Rust Code',
      go: 'Go Code',
      java: 'Java Code',
    };
    return langMap[language.toLowerCase()] ?? `${language} Code`;
  }
  return 'Code Snippet';
}

async function canvasRunCodeViaTauri(
  language: string,
  code: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const result = await docInvoke<{ stdout: string; stderr: string; exit_code: number }>(
      'execute_code',
      { language, code },
    );
    return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exit_code };
  } catch {
    /* fall through */
  }
  try {
    const escaped = code.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
    let command: string;
    switch (language.toLowerCase()) {
      case 'python':
      case 'python3':
        command = `python3 -c "${escaped}"`;
        break;
      case 'javascript':
      case 'js':
        command = `node -e "${escaped}"`;
        break;
      case 'bash':
      case 'sh':
        command = `bash -c "${escaped}"`;
        break;
      default:
        throw new Error(`Unsupported language for execution: ${language}`);
    }
    const result = await docInvoke<{ stdout: string; stderr: string; exit_code: number }>(
      'terminal_execute',
      { command, workingDir: null },
    );
    return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exit_code };
  } catch (err) {
    throw err;
  }
}

export const useCanvasStore = create<CanvasStoreState>()(
  devtools(
    (set, get) => ({
      artifacts: [],
      activeArtifactId: null,
      isPanelOpen: false,
      backendCanvases: [],
      activeBackendCanvasId: null,
      loadingBackendCanvases: false,
      backendError: null,

      createArtifact: (type, content, language, title, messageId) => {
        const id = canvasGenerateId();
        const now = Date.now();
        const artifact: CanvasArtifact = {
          id,
          type,
          language,
          title: title ?? canvasDeriveTitle(type, language),
          content,
          executionState: 'idle',
          createdAt: now,
          updatedAt: now,
          messageId,
        };
        set((state) => ({ artifacts: [...state.artifacts, artifact] }));
        return id;
      },

      updateArtifact: (id, updates) => {
        set((state) => ({
          artifacts: state.artifacts.map((a) =>
            a.id === id ? { ...a, ...updates, updatedAt: Date.now() } : a,
          ),
        }));
      },

      executeArtifact: async (id) => {
        const artifact = get().artifacts.find((a) => a.id === id);
        if (!artifact) return;
        const executableLanguages = ['python', 'python3', 'javascript', 'js', 'bash', 'sh'];
        const lang = (artifact.language ?? '').toLowerCase();
        if (artifact.type !== 'code' || !executableLanguages.includes(lang)) {
          docToast.info('Execution is only available for Python, JavaScript, and Bash code.');
          return;
        }
        get().updateArtifact(id, {
          executionState: 'running',
          executionOutput: undefined,
          errorMessage: undefined,
        });
        try {
          const result = await canvasRunCodeViaTauri(lang, artifact.content);
          const output = result.stdout || result.stderr;
          const hasError = result.exitCode !== 0 || (result.stderr.length > 0 && !result.stdout);
          get().updateArtifact(id, {
            executionState: hasError ? 'error' : 'success',
            executionOutput: output,
            errorMessage: hasError ? result.stderr || 'Non-zero exit code' : undefined,
          });
          if (hasError) {
            docToast.error('Code execution failed');
          } else {
            docToast.success('Code executed successfully');
          }
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Code execution requires the desktop application';
          get().updateArtifact(id, { executionState: 'error', errorMessage: message });
          docToast.error(message.includes('desktop') ? message : 'Execution failed: ' + message);
        }
      },

      deleteArtifact: (id) => {
        set((state) => {
          const remaining = state.artifacts.filter((a) => a.id !== id);
          const newActive =
            state.activeArtifactId === id
              ? (remaining[remaining.length - 1]?.id ?? null)
              : state.activeArtifactId;
          return {
            artifacts: remaining,
            activeArtifactId: newActive,
            isPanelOpen: remaining.length > 0 ? state.isPanelOpen : false,
          };
        });
      },

      openPanel: (artifactId) => {
        set((state) => ({
          isPanelOpen: true,
          activeArtifactId: artifactId ?? state.activeArtifactId,
        }));
      },
      closePanel: () => {
        set({ isPanelOpen: false });
      },

      createBackendCanvas: async (name, width, height) => {
        set({ backendError: null });
        try {
          const id = await docInvoke<string>('canvas_create', { name, width, height });
          set((state) => ({ backendCanvases: [...state.backendCanvases, { id, name }] }));
          return id;
        } catch (error) {
          set({ backendError: String(error) });
          return null;
        }
      },

      getBackendCanvas: async (id) => {
        try {
          return await docInvoke<unknown>('canvas_get', { id });
        } catch (error) {
          set({ backendError: String(error) });
          return null;
        }
      },

      listBackendCanvases: async () => {
        set({ loadingBackendCanvases: true, backendError: null });
        try {
          const entries = await docInvoke<[string, string][]>('canvas_list');
          const canvases = entries.map(([id, name]) => ({ id, name }));
          set({ backendCanvases: canvases, loadingBackendCanvases: false });
          return canvases;
        } catch (error) {
          set({ backendError: String(error), loadingBackendCanvases: false });
          return [];
        }
      },

      destroyBackendCanvas: async (id) => {
        try {
          await docInvoke<boolean>('canvas_destroy', { id });
          set((state) => ({
            backendCanvases: state.backendCanvases.filter((c) => c.id !== id),
            activeBackendCanvasId:
              state.activeBackendCanvasId === id ? null : state.activeBackendCanvasId,
          }));
          return true;
        } catch (error) {
          set({ backendError: String(error) });
          return false;
        }
      },

      setActiveBackendCanvas: async (id) => {
        try {
          await docInvoke('canvas_set_active', { id });
          set({ activeBackendCanvasId: id });
          return true;
        } catch (error) {
          set({ backendError: String(error) });
          return false;
        }
      },

      getActiveBackendCanvas: async () => {
        try {
          const id = await docInvoke<string | null>('canvas_get_active');
          set({ activeBackendCanvasId: id });
          return id;
        } catch {
          return null;
        }
      },

      addElement: async (canvasId, element) => {
        try {
          await docInvoke('canvas_add_element', { canvasId, element });
          return true;
        } catch (error) {
          set({ backendError: String(error) });
          return false;
        }
      },

      removeElement: async (canvasId, elementId) => {
        try {
          await docInvoke<boolean>('canvas_remove_element', { canvasId, elementId });
          return true;
        } catch (error) {
          set({ backendError: String(error) });
          return false;
        }
      },

      updateElement: async (canvasId, elementId, updates) => {
        try {
          await docInvoke<boolean>('canvas_update_element', { canvasId, elementId, updates });
          return true;
        } catch (error) {
          set({ backendError: String(error) });
          return false;
        }
      },

      clearCanvas: async (canvasId) => {
        try {
          await docInvoke('canvas_clear', { canvasId });
          return true;
        } catch (error) {
          set({ backendError: String(error) });
          return false;
        }
      },

      exportCanvas: async (canvasId) => {
        try {
          return await docInvoke<string>('canvas_export', { canvasId });
        } catch (error) {
          set({ backendError: String(error) });
          return null;
        }
      },

      executeA2UI: async (command) => {
        try {
          return await docInvoke<A2UIResponse>('canvas_a2ui_execute', { command });
        } catch (error) {
          set({ backendError: String(error) });
          return null;
        }
      },

      addTextElement: async (canvasId, text, x, y, width, style) => {
        try {
          return await docInvoke<string>('canvas_add_text', { canvasId, text, x, y, width, style });
        } catch (error) {
          set({ backendError: String(error) });
          return null;
        }
      },
    }),
    { name: 'CanvasStore', enabled: import.meta.env.DEV },
  ),
);
