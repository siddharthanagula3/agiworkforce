import { z } from 'zod';
import path from 'path';

/**
 * Path validation utilities to prevent path traversal attacks.
 * These validators ensure user-provided paths cannot escape intended directories.
 */

// Characters that are dangerous in file paths
const DANGEROUS_PATH_CHARS = /[\0<>:"|?*]/;

// Path traversal patterns
const PATH_TRAVERSAL_PATTERNS = [
  /\.\./, // Parent directory traversal
  /%2e%2e/i, // URL-encoded ..
  /%252e%252e/i, // Double URL-encoded ..
  /\.\.%2f/i, // Mixed encoding
  /%2f\.\./i, // Mixed encoding
  /\.\.\\/, // Windows backslash traversal
  /\\\.\.\\?/, // Windows path traversal variants
];

/**
 * Zod schema for validating file paths.
 * Rejects paths with traversal attempts and dangerous characters.
 */
export const SafePathSchema = z
  .string()
  .min(1, 'Path cannot be empty')
  .max(4096, 'Path exceeds maximum length of 4096 characters')
  .refine((value) => !DANGEROUS_PATH_CHARS.test(value), 'Path contains invalid characters')
  .refine(
    (value) => !PATH_TRAVERSAL_PATTERNS.some((pattern) => pattern.test(value)),
    'Path traversal is not allowed',
  );

/**
 * Zod schema for validating file names (no directory components).
 */
export const SafeFileNameSchema = z
  .string()
  .min(1, 'Filename cannot be empty')
  .max(255, 'Filename exceeds maximum length of 255 characters')
  .refine(
    (value) => !value.includes('/') && !value.includes('\\'),
    'Filename cannot contain directory separators',
  )
  .refine((value) => !DANGEROUS_PATH_CHARS.test(value), 'Filename contains invalid characters')
  .refine((value) => value !== '.' && value !== '..', 'Invalid filename');

/**
 * Validate and normalize a path, ensuring it stays within a base directory.
 * Returns the normalized absolute path if valid, throws otherwise.
 */
export function validatePathWithinBase(userPath: string, baseDirectory: string): string {
  // First validate the path format
  const parseResult = SafePathSchema.safeParse(userPath);
  if (!parseResult.success) {
    throw new Error(parseResult.error.issues[0].message);
  }

  // Normalize paths
  const normalizedBase = path.normalize(path.resolve(baseDirectory));
  const normalizedUserPath = path.normalize(path.resolve(baseDirectory, userPath));

  // Ensure the resolved path is within the base directory
  if (
    !normalizedUserPath.startsWith(normalizedBase + path.sep) &&
    normalizedUserPath !== normalizedBase
  ) {
    throw new Error('Path escapes the allowed directory');
  }

  return normalizedUserPath;
}

/**
 * Check if a path is attempting directory traversal.
 * Returns true if the path is safe, false if it contains traversal attempts.
 */
export function isPathSafe(userPath: string): boolean {
  const parseResult = SafePathSchema.safeParse(userPath);
  return parseResult.success;
}

/**
 * Sanitize a filename by removing dangerous characters.
 * Note: This is a fallback - prefer rejecting invalid filenames.
 */
export function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(DANGEROUS_PATH_CHARS, '')
    .replace(/\.\./g, '')
    .replace(/[/\\]/g, '')
    .slice(0, 255);
}

/**
 * Validate that a path does not contain null bytes or other injection attempts.
 */
export function validateNoInjection(input: string): boolean {
  // Check for null bytes (common in path injection attacks)
  if (input.includes('\0')) {
    return false;
  }

  // Check for excessive path segments (potential DoS)
  const segments = input.split(/[/\\]/);
  if (segments.length > 100) {
    return false;
  }

  return true;
}

export type SafePath = z.infer<typeof SafePathSchema>;
export type SafeFileName = z.infer<typeof SafeFileNameSchema>;
