'use client';

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

// ============================================================================
// Types
// ============================================================================

export interface Artifact {
  id: string;
  title: string;
  language: string;
  content: string;
  messageId: string;
  createdAt: Date;
}

interface ArtifactsState {
  artifacts: Artifact[];
  selectedArtifactId: string | null;
  panelOpen: boolean;
}

interface ArtifactsActions {
  addArtifact: (artifact: Omit<Artifact, 'id' | 'createdAt'>) => string;
  removeArtifact: (id: string) => void;
  selectArtifact: (id: string | null) => void;
  togglePanel: () => void;
  setPanelOpen: (open: boolean) => void;
  clearArtifacts: () => void;
  extractArtifactsFromContent: (content: string, messageId: string) => void;
}

// ============================================================================
// Helpers
// ============================================================================

/** Map language identifiers to human-readable labels */
function languageLabel(lang: string): string {
  const map: Record<string, string> = {
    ts: 'TypeScript',
    tsx: 'TypeScript React',
    typescript: 'TypeScript',
    js: 'JavaScript',
    jsx: 'JavaScript React',
    javascript: 'JavaScript',
    py: 'Python',
    python: 'Python',
    rust: 'Rust',
    rs: 'Rust',
    go: 'Go',
    java: 'Java',
    rb: 'Ruby',
    ruby: 'Ruby',
    css: 'CSS',
    scss: 'SCSS',
    html: 'HTML',
    json: 'JSON',
    yaml: 'YAML',
    yml: 'YAML',
    sql: 'SQL',
    sh: 'Shell',
    bash: 'Bash',
    zsh: 'Shell',
    swift: 'Swift',
    kotlin: 'Kotlin',
    dart: 'Dart',
    cpp: 'C++',
    c: 'C',
    csharp: 'C#',
    cs: 'C#',
    php: 'PHP',
    md: 'Markdown',
    markdown: 'Markdown',
    toml: 'TOML',
    xml: 'XML',
    graphql: 'GraphQL',
    dockerfile: 'Dockerfile',
    prisma: 'Prisma',
    svg: 'SVG',
    mermaid: 'Mermaid',
  };
  return map[lang.toLowerCase()] || lang.charAt(0).toUpperCase() + lang.slice(1);
}

/**
 * Try to extract a filename from the first line of a code block.
 * Supports patterns like:
 *   // filename.ts
 *   # filename.py
 *   filename.css (block comment style)
 *   -- filename.sql
 */
function extractFilename(content: string): string | null {
  const firstLine = content.split('\n')[0]!.trim();

  // // filename.ext  or  # filename.ext
  const singleLineComment = firstLine.match(/^(?:\/\/|#|--)\s+([\w./-]+\.\w+)\s*$/);
  if (singleLineComment) return singleLineComment[1];

  // /* filename.ext */
  const blockComment = firstLine.match(/^\/\*\s*([\w./-]+\.\w+)\s*\*\/\s*$/);
  if (blockComment) return blockComment[1];

  return null;
}

/**
 * Parse markdown code fences from content and return structured artifacts.
 * Matches ```language\n...\n``` patterns.
 */
function parseCodeBlocks(content: string, messageId: string): Omit<Artifact, 'id' | 'createdAt'>[] {
  const results: Omit<Artifact, 'id' | 'createdAt'>[] = [];
  const regex = /```(\w+)?\s*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const language = match[1] || 'text';
    const code = match[2]!.trim();

    // Skip very short code blocks (one-liners that are not meaningful artifacts)
    if (code.length < 10) continue;

    const filename = extractFilename(code);
    const title = filename || `${languageLabel(language)} Code`;

    results.push({
      title,
      language,
      content: code,
      messageId,
    });
  }

  return results;
}

// ============================================================================
// Store
// ============================================================================

export const useArtifactsStore = create<ArtifactsState & ArtifactsActions>()(
  immer((set, get) => ({
    // State
    artifacts: [],
    selectedArtifactId: null,
    panelOpen: false,

    // Actions
    addArtifact: (artifact) => {
      const id = crypto.randomUUID();
      set((state) => {
        state.artifacts.push({
          ...artifact,
          id,
          createdAt: new Date(),
        });
        // Auto-select the first artifact added
        if (!state.selectedArtifactId) {
          state.selectedArtifactId = id;
        }
      });
      return id;
    },

    removeArtifact: (id) => {
      set((state) => {
        state.artifacts = state.artifacts.filter((a) => a.id !== id);
        // Validate selectedArtifactId still exists after removal (covers stale selections too)
        if (!state.artifacts.some((a) => a.id === state.selectedArtifactId)) {
          state.selectedArtifactId = state.artifacts[0]?.id ?? null;
        }
        // Close panel if no artifacts remain
        if (state.artifacts.length === 0) {
          state.panelOpen = false;
        }
      });
    },

    selectArtifact: (id) => {
      set((state) => {
        state.selectedArtifactId = id;
      });
    },

    togglePanel: () => {
      set((state) => {
        state.panelOpen = !state.panelOpen;
      });
    },

    setPanelOpen: (open) => {
      set((state) => {
        state.panelOpen = open;
      });
    },

    clearArtifacts: () => {
      set((state) => {
        state.artifacts = [];
        state.selectedArtifactId = null;
        state.panelOpen = false;
      });
    },

    extractArtifactsFromContent: (content, messageId) => {
      const existing = get().artifacts;
      // Avoid re-extracting from the same message
      if (existing.some((a) => a.messageId === messageId)) return;

      const parsed = parseCodeBlocks(content, messageId);
      if (parsed.length === 0) return;

      set((state) => {
        for (const item of parsed) {
          const id = crypto.randomUUID();
          state.artifacts.push({
            ...item,
            id,
            createdAt: new Date(),
          });
          // Auto-select the first one if nothing is selected
          if (!state.selectedArtifactId) {
            state.selectedArtifactId = id;
          }
        }
      });
    },
  })),
);
