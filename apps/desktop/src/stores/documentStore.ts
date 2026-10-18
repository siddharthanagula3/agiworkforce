import { create } from 'zustand';
import { invoke } from '../lib/tauri-mock';
import type { DocumentCreationResult } from '../types/document';

interface DocumentState {
  isGenerating: boolean;
  error: string | null;

  generatePdf: (
    outputPath: string,
    title: string,
    content: string,
    options?: { author?: string },
  ) => Promise<string>;
}

export const useDocumentStore = create<DocumentState>((set) => ({
  isGenerating: false,
  error: null,

  generatePdf: async (
    outputPath: string,
    title: string,
    content: string,
    options?: { author?: string },
  ) => {
    set({ isGenerating: true, error: null });
    try {
      const paragraphs = content.split('\n').filter((p) => p.trim());
      const result = await invoke<DocumentCreationResult>('document_create_pdf_simple_manifest', {
        outputPath,
        title,
        author: options?.author ?? null,
        paragraphs,
      });
      set({ isGenerating: false });
      return result.path;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message, isGenerating: false });
      throw err;
    }
  },
}));
