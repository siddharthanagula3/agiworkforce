/**
 * Document API — typed wrappers for document_* Tauri commands (read, create Word/Excel/PDF/PPT).
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface DocumentContent {
  text: string;
  pages?: number;
  format: string;
}
export interface DocumentMetadata {
  title?: string;
  author?: string;
  pages?: number;
  wordCount?: number;
  format: string;
  size: number;
}
export interface SearchResult {
  page?: number;
  text: string;
  position: number;
}
export interface WordDocumentConfig {
  title?: string;
  author?: string;
  [key: string]: unknown;
}
export interface WordContent {
  type: string;
  text: string;
  [key: string]: unknown;
}
export interface ExcelDocumentConfig {
  [key: string]: unknown;
}
export interface ExcelSheet {
  name: string;
  headers: string[];
  rows: unknown[][];
}
export interface PdfDocumentConfig {
  title?: string;
  author?: string;
  [key: string]: unknown;
}
export interface PdfContent {
  type: string;
  text: string;
  [key: string]: unknown;
}
export interface PresentationConfig {
  title: string;
  author?: string;
  slides: { title: string; content: string[] }[];
  [key: string]: unknown;
}

// ---- Commands ----

export async function documentRead(filePath: string): Promise<DocumentContent> {
  return command<DocumentContent>('document_read', { filePath });
}
export async function documentExtractText(filePath: string): Promise<string> {
  return command<string>('document_extract_text', { filePath });
}
export async function documentGetMetadata(filePath: string): Promise<DocumentMetadata> {
  return command<DocumentMetadata>('document_get_metadata', { filePath });
}
export async function documentSearch(filePath: string, query: string): Promise<SearchResult[]> {
  return command<SearchResult[]>('document_search', { filePath, query });
}
export async function documentDetectType(filePath: string): Promise<string> {
  return command<string>('document_detect_type', { filePath });
}
export async function documentCreateWord(
  outputPath: string,
  config: WordDocumentConfig,
  contents: WordContent[],
): Promise<string> {
  return command<string>('document_create_word', { outputPath, config, contents });
}
export async function documentCreateWordSimple(
  outputPath: string,
  paragraphs: string[],
  title?: string,
  author?: string,
): Promise<string> {
  return command<string>('document_create_word_simple', { outputPath, title, author, paragraphs });
}
export async function documentCreateExcel(
  outputPath: string,
  config: ExcelDocumentConfig,
  sheets: ExcelSheet[],
): Promise<string> {
  return command<string>('document_create_excel', { outputPath, config, sheets });
}
export async function documentCreateExcelSimple(
  outputPath: string,
  sheetName: string,
  headers: string[],
  rows: string[][],
): Promise<string> {
  return command<string>('document_create_excel_simple', { outputPath, sheetName, headers, rows });
}
export async function documentCreateExcelNumbers(
  outputPath: string,
  sheetName: string,
  headers: string[],
  rows: number[][],
): Promise<string> {
  return command<string>('document_create_excel_numbers', { outputPath, sheetName, headers, rows });
}
export async function documentCreatePdf(
  outputPath: string,
  config: PdfDocumentConfig,
  contents: PdfContent[],
): Promise<string> {
  return command<string>('document_create_pdf', { outputPath, config, contents });
}
export async function documentCreatePdfSimple(
  outputPath: string,
  paragraphs: string[],
  title?: string,
  author?: string,
): Promise<string> {
  return command<string>('document_create_pdf_simple', { outputPath, title, author, paragraphs });
}
export async function documentCreatePowerpoint(
  outputPath: string,
  config: PresentationConfig,
): Promise<string> {
  return command<string>('document_create_powerpoint', { outputPath, config });
}
export async function documentCreatePowerpointSimple(
  outputPath: string,
  title: string,
  author: string,
  slides: [string, string[]][],
): Promise<string> {
  return command<string>('document_create_powerpoint_simple', {
    outputPath,
    title,
    author,
    slides,
  });
}
