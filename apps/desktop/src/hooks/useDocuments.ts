import { useCallback, useState } from 'react';
import { invoke } from '../lib/tauri-mock';
import {
  DocumentType,
  type DocumentContent,
  type DocumentMetadata,
  type SearchResult,
  type WordDocumentConfig,
  type WordContent,
  type ExcelDocumentConfig,
  type ExcelSheet,
  type PdfDocumentConfig,
  type PdfContent,
} from '../types/document';

/**
 * Hook for document operations with the Tauri backend.
 * Provides functions for reading, writing, and searching documents.
 */
export function useDocuments() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Read a document and get its content and metadata.
   * Supports PDF, Word (.docx), and Excel (.xlsx, .xls) files.
   */
  const readDocument = useCallback(async (filePath: string): Promise<DocumentContent> => {
    setLoading(true);
    setError(null);
    try {
      const content = await invoke<DocumentContent>('document_read', { filePath });
      return content;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Extract text content from a document.
   */
  const extractText = useCallback(async (filePath: string): Promise<string> => {
    setLoading(true);
    setError(null);
    try {
      const text = await invoke<string>('document_extract_text', { filePath });
      return text;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Get document metadata without reading full content.
   */
  const getMetadata = useCallback(async (filePath: string): Promise<DocumentMetadata> => {
    setLoading(true);
    setError(null);
    try {
      const metadata = await invoke<DocumentMetadata>('document_get_metadata', { filePath });
      return metadata;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Search for text within a document.
   */
  const searchDocument = useCallback(
    async (filePath: string, query: string): Promise<SearchResult[]> => {
      setLoading(true);
      setError(null);
      try {
        const results = await invoke<SearchResult[]>('document_search', { filePath, query });
        return results;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  /**
   * Detect the type of a document based on file extension.
   */
  const detectType = useCallback(async (filePath: string): Promise<DocumentType> => {
    setError(null);
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
      setError(message);
      throw err;
    }
  }, []);

  /**
   * Create a Word document with full configuration.
   */
  const createWordDocument = useCallback(
    async (
      outputPath: string,
      config: WordDocumentConfig,
      contents: WordContent[],
    ): Promise<string> => {
      setSaving(true);
      setError(null);
      try {
        const result = await invoke<string>('document_create_word', {
          outputPath,
          config,
          contents,
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  /**
   * Create a simple Word document with paragraphs.
   */
  const createWordDocumentSimple = useCallback(
    async (
      outputPath: string,
      title: string | null,
      author: string | null,
      paragraphs: string[],
    ): Promise<string> => {
      setSaving(true);
      setError(null);
      try {
        const result = await invoke<string>('document_create_word_simple', {
          outputPath,
          title,
          author,
          paragraphs,
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  /**
   * Create an Excel document with full configuration.
   */
  const createExcelDocument = useCallback(
    async (
      outputPath: string,
      config: ExcelDocumentConfig,
      sheets: ExcelSheet[],
    ): Promise<string> => {
      setSaving(true);
      setError(null);
      try {
        const result = await invoke<string>('document_create_excel', {
          outputPath,
          config,
          sheets,
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  /**
   * Create a simple Excel document with string data.
   */
  const createExcelDocumentSimple = useCallback(
    async (
      outputPath: string,
      sheetName: string,
      headers: string[],
      rows: string[][],
    ): Promise<string> => {
      setSaving(true);
      setError(null);
      try {
        const result = await invoke<string>('document_create_excel_simple', {
          outputPath,
          sheetName,
          headers,
          rows,
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  /**
   * Create an Excel document with numeric data.
   */
  const createExcelDocumentNumbers = useCallback(
    async (
      outputPath: string,
      sheetName: string,
      headers: string[],
      rows: number[][],
    ): Promise<string> => {
      setSaving(true);
      setError(null);
      try {
        const result = await invoke<string>('document_create_excel_numbers', {
          outputPath,
          sheetName,
          headers,
          rows,
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  /**
   * Create a PDF document with full configuration.
   */
  const createPdfDocument = useCallback(
    async (
      outputPath: string,
      config: PdfDocumentConfig,
      contents: PdfContent[],
    ): Promise<string> => {
      setSaving(true);
      setError(null);
      try {
        const result = await invoke<string>('document_create_pdf', {
          outputPath,
          config,
          contents,
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  /**
   * Create a simple PDF document with paragraphs.
   */
  const createPdfDocumentSimple = useCallback(
    async (
      outputPath: string,
      title: string | null,
      author: string | null,
      paragraphs: string[],
    ): Promise<string> => {
      setSaving(true);
      setError(null);
      try {
        const result = await invoke<string>('document_create_pdf_simple', {
          outputPath,
          title,
          author,
          paragraphs,
        });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  /**
   * Clear the current error state.
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    // State
    loading,
    saving,
    error,

    // Read operations
    readDocument,
    extractText,
    getMetadata,
    searchDocument,
    detectType,

    // Write operations - Word
    createWordDocument,
    createWordDocumentSimple,

    // Write operations - Excel
    createExcelDocument,
    createExcelDocumentSimple,
    createExcelDocumentNumbers,

    // Write operations - PDF
    createPdfDocument,
    createPdfDocumentSimple,

    // Utilities
    clearError,
  };
}

export type UseDocumentsReturn = ReturnType<typeof useDocuments>;
