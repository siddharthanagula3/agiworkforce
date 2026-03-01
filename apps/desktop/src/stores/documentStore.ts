import { create } from 'zustand';
import { toast } from 'sonner';
import { invoke } from '../lib/tauri-mock';
import {
  DocumentType,
  type DocumentContent,
  type DocumentMetadata,
  type SearchResult,
} from '../types/document';

interface GeneratedDocument {
  path: string;
  format: 'pdf' | 'word' | 'excel';
  title: string;
}

interface DocumentState {
  currentDocument: DocumentContent | null;
  searchResults: SearchResult[];
  loading: boolean;
  isGenerating: boolean;
  lastGenerated: GeneratedDocument | null;
  error: string | null;

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
  clearError: () => void;
  reset: () => void;
}

export const useDocumentStore = create<DocumentState>((set) => ({
  currentDocument: null,
  searchResults: [],
  loading: false,
  isGenerating: false,
  lastGenerated: null,
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

  generatePdf: async (
    outputPath: string,
    title: string,
    content: string,
    options?: { author?: string },
  ) => {
    set({ isGenerating: true, error: null });
    try {
      const paragraphs = content.split('\n').filter((p) => p.trim());
      const result = await invoke<string>('document_create_pdf_simple', {
        outputPath,
        title,
        author: options?.author ?? null,
        paragraphs,
      });
      set({
        isGenerating: false,
        lastGenerated: { path: result, format: 'pdf', title },
      });
      toast.success(`PDF created: ${title}`);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message, isGenerating: false });
      toast.error(`Failed to create PDF: ${message}`);
      throw err;
    }
  },

  generateWord: async (
    outputPath: string,
    title: string,
    content: string,
    options?: { author?: string },
  ) => {
    set({ isGenerating: true, error: null });
    try {
      const paragraphs = content.split('\n').filter((p) => p.trim());
      const result = await invoke<string>('document_create_word_simple', {
        outputPath,
        title,
        author: options?.author ?? null,
        paragraphs,
      });
      set({
        isGenerating: false,
        lastGenerated: { path: result, format: 'word', title },
      });
      toast.success(`Word document created: ${title}`);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message, isGenerating: false });
      toast.error(`Failed to create Word document: ${message}`);
      throw err;
    }
  },

  generateExcel: async (
    outputPath: string,
    sheetName: string,
    headers: string[],
    rows: string[][],
  ) => {
    set({ isGenerating: true, error: null });
    try {
      const result = await invoke<string>('document_create_excel_simple', {
        outputPath,
        sheetName,
        headers,
        rows,
      });
      set({
        isGenerating: false,
        lastGenerated: { path: result, format: 'excel', title: sheetName },
      });
      toast.success(`Excel spreadsheet created: ${sheetName}`);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set({ error: message, isGenerating: false });
      toast.error(`Failed to create Excel spreadsheet: ${message}`);
      throw err;
    }
  },

  clearError: () => set({ error: null }),

  reset: () =>
    set({
      currentDocument: null,
      searchResults: [],
      loading: false,
      isGenerating: false,
      lastGenerated: null,
      error: null,
    }),
}));
