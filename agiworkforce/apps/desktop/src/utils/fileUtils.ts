import type { SupportedFileType } from '../types/chat';

/**
 * Maximum file size in bytes (10MB)
 */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Supported file MIME types
 */
export const SUPPORTED_FILE_TYPES: SupportedFileType[] = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
  'text/javascript',
  'text/typescript',
  'text/html',
  'text/css',
  'text/markdown',
];

/**
 * File type categories for validation
 */
export const FILE_TYPE_CATEGORIES = {
  images: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'],
  documents: ['application/pdf', 'text/plain', 'text/markdown'],
  code: [
    'text/javascript',
    'text/typescript',
    'text/html',
    'text/css',
    'application/json',
  ],
  data: ['text/csv', 'application/json'],
} as const satisfies Record<string, readonly SupportedFileType[]>;

/**
 * File extensions to MIME type mapping
 */
export const FILE_EXTENSIONS: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  js: 'text/javascript',
  ts: 'text/typescript',
  tsx: 'text/typescript',
  jsx: 'text/javascript',
  html: 'text/html',
  css: 'text/css',
};

/**
 * Validates if a file type is supported
 */
export function isSupportedFileType(mimeType: string): boolean {
  return SUPPORTED_FILE_TYPES.includes(mimeType as SupportedFileType);
}

/**
 * Validates if a file size is within limits
 */
export function isValidFileSize(size: number): boolean {
  return size > 0 && size <= MAX_FILE_SIZE;
}

/**
 * Validates a file for upload
 */
export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

export function validateFile(file: File): FileValidationResult {
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  if (!isValidFileSize(file.size)) {
    const maxSizeMB = (MAX_FILE_SIZE / (1024 * 1024)).toFixed(0);
    return { valid: false, error: `File size must be less than ${maxSizeMB}MB` };
  }

  if (!isSupportedFileType(file.type)) {
    return { valid: false, error: 'File type not supported' };
  }

  return { valid: true };
}

/**
 * Validates multiple files for upload
 */
export function validateFiles(files: File[]): {
  valid: File[];
  invalid: Array<{ file: File; error: string }>;
} {
  const valid: File[] = [];
  const invalid: Array<{ file: File; error: string }> = [];

  for (const file of files) {
    const result = validateFile(file);
    if (result.valid) {
      valid.push(file);
    } else {
      invalid.push({ file, error: result.error || 'Unknown error' });
    }
  }

  return { valid, invalid };
}

/**
 * Formats file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Gets file extension from filename
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  const extension = parts.length > 1 ? parts[parts.length - 1] : '';
  return extension ? extension.toLowerCase() : '';
}

/**
 * Determines if a file is an image
 */
export function isImageFile(mimeType: string): boolean {
  const imageTypes = FILE_TYPE_CATEGORIES.images;
  return imageTypes.includes(mimeType as (typeof imageTypes)[number]);
}

/**
 * Determines if a file is a code file
 */
export function isCodeFile(mimeType: string): boolean {
  const codeTypes = FILE_TYPE_CATEGORIES.code;
  return codeTypes.includes(mimeType as (typeof codeTypes)[number]);
}

/**
 * Determines if a file is a document
 */
export function isDocumentFile(mimeType: string): boolean {
  const documentTypes = FILE_TYPE_CATEGORIES.documents;
  return documentTypes.includes(mimeType as (typeof documentTypes)[number]);
}

/**
 * Reads a file as base64 data URL
 */
export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Reads a text file's content
 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

/**
 * Creates a unique ID for files and artifacts
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Gets a human-readable file type description
 */
export function getFileTypeDescription(mimeType: string): string {
  if (isImageFile(mimeType)) return 'Image';
  if (mimeType === 'application/pdf') return 'PDF Document';
  if (isCodeFile(mimeType)) return 'Code File';
  if (mimeType === 'text/plain') return 'Text File';
  if (mimeType === 'text/markdown') return 'Markdown File';
  if (mimeType === 'text/csv') return 'CSV File';
  return 'File';
}
