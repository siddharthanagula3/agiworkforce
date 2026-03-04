export enum DocumentType {
  Word = 'Word',
  Excel = 'Excel',
  Pdf = 'Pdf',
}

export interface DocumentMetadata {
  file_path: string;
  file_name: string;
  file_size: number;
  document_type: DocumentType;
  created_at?: string;
  modified_at?: string;
  author?: string;
  title?: string;
  page_count?: number;
  word_count?: number;
}

export interface WordContent {
  paragraphs: string[];
  tables?: Array<string[][]>;
}

export interface WordDocumentConfig {
  file_path: string;
  metadata: DocumentMetadata;
}

export interface ExcelSheet {
  name: string;
  rows: Array<Record<string, unknown>>;
}

export interface ExcelDocumentConfig {
  file_path: string;
  sheets: ExcelSheet[];
  metadata: DocumentMetadata;
}

export interface PdfContent {
  pages: Array<{
    page_number: number;
    text: string;
  }>;
}

export interface PdfDocumentConfig {
  file_path: string;
  metadata: DocumentMetadata;
}

export interface DocumentContent {
  text: string;
  metadata: DocumentMetadata;
}

export interface SearchResult {
  page?: number;
  line?: number;
  context: string;
  match_text: string;
}

export interface DocumentState {
  currentDocument: DocumentContent | null;
  searchResults: SearchResult[];
  loading: boolean;
  error: string | null;
}
