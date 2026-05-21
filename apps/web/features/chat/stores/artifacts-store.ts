'use client';

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { ArtifactData } from '../components/artifacts/ArtifactPreview';

// ============================================================================
// Types
// ============================================================================

export interface Artifact extends ArtifactData {
  id: string;
  title: string;
  language: string;
  content: string;
  messageId: string;
  createdAt: Date;
}

type ArtifactInput = Omit<Artifact, 'createdAt'> & { createdAt?: Date };

interface ArtifactsState {
  artifacts: Artifact[];
  selectedArtifactId: string | null;
  panelOpen: boolean;
}

interface ArtifactsActions {
  addArtifact: (artifact: Omit<Artifact, 'createdAt'> & { createdAt?: Date }) => string;
  upsertArtifact: (artifact: ArtifactInput) => void;
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
  if (singleLineComment) return singleLineComment[1] ?? null;

  // /* filename.ext */
  const blockComment = firstLine.match(/^\/\*\s*([\w./-]+\.\w+)\s*\*\/\s*$/);
  if (blockComment) return blockComment[1] ?? null;

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
      type: artifactTypeForLanguage(language),
      content: code,
      messageId,
    });
  }

  return results;
}

function artifactTypeForLanguage(language: string): ArtifactData['type'] {
  const normalized = language.toLowerCase();
  if (normalized === 'html' || normalized === 'htm') return 'html';
  if (normalized === 'jsx' || normalized === 'tsx' || normalized === 'react') return 'react';
  if (normalized === 'svg') return 'svg';
  if (normalized === 'mermaid') return 'mermaid';
  return normalized === 'markdown' || normalized === 'md' ? 'document' : 'code';
}

function normalizeArtifact(artifact: Omit<Artifact, 'createdAt'> & { createdAt?: Date }): Artifact {
  return {
    ...artifact,
    title: artifact.title || 'Untitled',
    language: artifact.language || artifact.type,
    createdAt: artifact.createdAt ?? new Date(),
  };
}

function artifactsEqual(a: Artifact, b: Artifact): boolean {
  return (
    a.title === b.title &&
    a.language === b.language &&
    a.type === b.type &&
    a.content === b.content &&
    a.messageId === b.messageId &&
    a.computeSession === b.computeSession &&
    a.generatedFile === b.generatedFile &&
    a.artifactManifest === b.artifactManifest
  );
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
      const id = artifact.id || crypto.randomUUID();
      set((state) => {
        state.artifacts.push(normalizeArtifact({ ...artifact, id }));
        // Auto-select the first artifact added
        if (!state.selectedArtifactId) {
          state.selectedArtifactId = id;
        }
      });
      return id;
    },

    upsertArtifact: (artifact) => {
      set((state) => {
        const normalized = normalizeArtifact(artifact);
        const index = state.artifacts.findIndex((item) => item.id === normalized.id);
        if (index === -1) {
          state.artifacts.push(normalized);
          if (!state.selectedArtifactId) {
            state.selectedArtifactId = normalized.id;
          }
          return;
        }
        const existing = state.artifacts[index]!;
        if (!artifactsEqual(existing, normalized)) {
          state.artifacts[index] = { ...existing, ...normalized, createdAt: existing.createdAt };
        }
      });
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
