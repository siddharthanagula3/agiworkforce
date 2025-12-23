import { describe, it, expect } from 'vitest';
import {
  isSupportedFileType,
  isValidFileSize,
  validateFile,
  validateFiles,
  formatFileSize,
  getFileExtension,
  isImageFile,
  isCodeFile,
  isDocumentFile,
  getFileTypeDescription,
  MAX_FILE_SIZE,
} from '../fileUtils';

describe('fileUtils', () => {
  describe('isSupportedFileType', () => {
    it('returns true for supported image types', () => {
      expect(isSupportedFileType('image/png')).toBe(true);
      expect(isSupportedFileType('image/jpeg')).toBe(true);
      expect(isSupportedFileType('image/gif')).toBe(true);
    });

    it('returns true for supported document types', () => {
      expect(isSupportedFileType('application/pdf')).toBe(true);
      expect(isSupportedFileType('text/plain')).toBe(true);
      expect(isSupportedFileType('text/markdown')).toBe(true);
    });

    it('returns true for supported code types', () => {
      expect(isSupportedFileType('text/javascript')).toBe(true);
      expect(isSupportedFileType('text/typescript')).toBe(true);
      expect(isSupportedFileType('application/json')).toBe(true);
    });

    it('returns false for unsupported types', () => {
      expect(isSupportedFileType('video/mp4')).toBe(false);
      expect(isSupportedFileType('application/zip')).toBe(false);
    });
  });

  describe('isValidFileSize', () => {
    it('returns true for valid file sizes', () => {
      expect(isValidFileSize(1024)).toBe(true);
      expect(isValidFileSize(MAX_FILE_SIZE)).toBe(true);
    });

    it('returns false for invalid file sizes', () => {
      expect(isValidFileSize(0)).toBe(false);
      expect(isValidFileSize(-1)).toBe(false);
      expect(isValidFileSize(MAX_FILE_SIZE + 1)).toBe(false);
    });
  });

  describe('validateFile', () => {
    it('validates a valid file', () => {
      const file = new File(['content'], 'test.png', { type: 'image/png' });
      const result = validateFile(file);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('rejects file that is too large', () => {
      const largeContent = new Array(MAX_FILE_SIZE + 1).fill('a').join('');
      const file = new File([largeContent], 'large.png', { type: 'image/png' });
      const result = validateFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('less than');
    });

    it('rejects unsupported file type', () => {
      const file = new File(['content'], 'test.zip', { type: 'application/zip' });
      const result = validateFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not supported');
    });
  });

  describe('validateFiles', () => {
    it('separates valid and invalid files', () => {
      const validFile = new File(['content'], 'test.png', { type: 'image/png' });
      const invalidFile = new File(['content'], 'test.zip', { type: 'application/zip' });

      const result = validateFiles([validFile, invalidFile]);

      expect(result.valid).toHaveLength(1);
      expect(result.valid[0]).toBe(validFile);
      expect(result.invalid).toHaveLength(1);
      expect(result.invalid[0]?.file).toBe(invalidFile);
      expect(result.invalid[0]?.error).toBeTruthy();
    });
  });

  describe('formatFileSize', () => {
    it('formats bytes correctly', () => {
      expect(formatFileSize(0)).toBe('0 Bytes');
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(1024 * 1024)).toBe('1 MB');
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
    });

    it('formats decimal values', () => {
      expect(formatFileSize(1536)).toBe('1.5 KB');
      expect(formatFileSize(1024 * 1024 * 2.5)).toBe('2.5 MB');
    });
  });

  describe('getFileExtension', () => {
    it('extracts file extension', () => {
      expect(getFileExtension('test.png')).toBe('png');
      expect(getFileExtension('document.pdf')).toBe('pdf');
      expect(getFileExtension('archive.tar.gz')).toBe('gz');
    });

    it('returns empty string for files without extension', () => {
      expect(getFileExtension('README')).toBe('');
      expect(getFileExtension('noextension')).toBe('');
    });

    it('returns lowercase extension', () => {
      expect(getFileExtension('Test.PNG')).toBe('png');
      expect(getFileExtension('Document.PDF')).toBe('pdf');
    });
  });

  describe('isImageFile', () => {
    it('identifies image files', () => {
      expect(isImageFile('image/png')).toBe(true);
      expect(isImageFile('image/jpeg')).toBe(true);
      expect(isImageFile('image/gif')).toBe(true);
    });

    it('identifies non-image files', () => {
      expect(isImageFile('application/pdf')).toBe(false);
      expect(isImageFile('text/plain')).toBe(false);
    });
  });

  describe('isCodeFile', () => {
    it('identifies code files', () => {
      expect(isCodeFile('text/javascript')).toBe(true);
      expect(isCodeFile('text/typescript')).toBe(true);
      expect(isCodeFile('application/json')).toBe(true);
    });

    it('identifies non-code files', () => {
      expect(isCodeFile('image/png')).toBe(false);
      expect(isCodeFile('application/pdf')).toBe(false);
    });
  });

  describe('isDocumentFile', () => {
    it('identifies document files', () => {
      expect(isDocumentFile('application/pdf')).toBe(true);
      expect(isDocumentFile('text/plain')).toBe(true);
      expect(isDocumentFile('text/markdown')).toBe(true);
    });

    it('identifies non-document files', () => {
      expect(isDocumentFile('image/png')).toBe(false);
      expect(isDocumentFile('text/javascript')).toBe(false);
    });
  });

  describe('getFileTypeDescription', () => {
    it('returns correct descriptions', () => {
      expect(getFileTypeDescription('image/png')).toBe('Image');
      expect(getFileTypeDescription('application/pdf')).toBe('PDF Document');
      expect(getFileTypeDescription('text/javascript')).toBe('Code File');
      expect(getFileTypeDescription('text/plain')).toBe('Text File');
      expect(getFileTypeDescription('text/markdown')).toBe('Markdown File');
      expect(getFileTypeDescription('text/csv')).toBe('CSV File');
      expect(getFileTypeDescription('unknown/type')).toBe('File');
    });
  });
});
