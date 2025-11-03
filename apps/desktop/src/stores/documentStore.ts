import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import {
  DocumentType,
  type DocumentContent,
  type DocumentMetadata,
  type SearchResult,
} from '../types/document';

interface DocumentState {
  currentDocument: DocumentContent | null;
  searchResults: SearchResult[];
  loading: boolean;
  error: string | null;

  readDocument: (filePath: string) => Promise<void>;
  extractText: (filePath: string) => Promise<string>;
  getMetadata: (filePath: string) => Promise<DocumentMetadata>;
  search: (filePath: string, query: string) => Promise<SearchResult[]>;
  detectType: (filePath: string) => Promise<DocumentType>;
  clearError: () => void;
  reset: () => void;
}

export const useDocumentStore = create<DocumentState>((set) => ({
  currentDocument: null,
  searchResults: [],
  loading: false,
  error: null,

  readDocument: async (filePath: string) => {
    set({ loading: true, error: null, searchResults: [] });
    try {
      const content = await invoke<DocumentContent>('document_read', { filePath });
      set({ currentDocument: content, loading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message, loading: false });
      throw err;
    }
  },

  extractText: async (filePath: string) => {
    set({ loading: true, error: null });
    try {
      const text = await invoke<string>('document_extract_text', { filePath });
      set({ loading: false });
      return text;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message, loading: false });
      throw err;
    }
  },

  getMetadata: async (filePath: string) => {
    set({ loading: true, error: null });
    try {
      const metadata = await invoke<DocumentMetadata>('document_get_metadata', { filePath });
      set({ loading: false });
      return metadata;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message, loading: false });
      throw err;
    }
  },

  search: async (filePath: string, query: string) => {
    set({ loading: true, error: null, searchResults: [] });
    try {
      const results = await invoke<SearchResult[]>('document_search', { filePath, query });
      set({ searchResults: results, loading: false });
      return results;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message, loading: false });
      throw err;
    }
  },

  detectType: async (filePath: string) => {
    try {
      const typeStr = await invoke<string>('document_detect_type', { filePath });
      // Parse the debug format string "Word" | "Excel" | "Pdf"
      const normalized = typeStr.trim().toLowerCase();
      const typeMap: Record<string, DocumentType> = {
        word: DocumentType.Word,
        excel: DocumentType.Excel,
        pdf: DocumentType.Pdf,
      };

      const detected = typeMap[normalized];
      if (!detected) {
        throw new Error(`Unsupported document type: ${typeStr}`);
      }

      return detected;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message });
      throw err;
    }
  },

  clearError: () => set({ error: null }),

  reset: () => set({
    currentDocument: null,
    searchResults: [],
    loading: false,
    error: null,
  }),
}));
