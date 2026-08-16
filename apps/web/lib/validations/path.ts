import { z } from 'zod';
import path from 'path';

const DANGEROUS_PATH_CHARS = /[\0<>:"|?*]/g;

const PATH_TRAVERSAL_PATTERNS = [
  /\.\./, // Parent directory traversal
  /%2e%2e/i, // URL-encoded ..
  /%252e%252e/i, // Double URL-encoded ..
  /\.\.%2f/i, // Mixed encoding
  /%2f\.\./i, // Mixed encoding
  /\.\.\\/, // Windows backslash traversal
  /\\\.\.\\?/, // Windows path traversal variants
];

export const SafePathSchema = z
  .string()
  .min(1, 'Path cannot be empty')
  .max(4096, 'Path exceeds maximum length of 4096 characters')
  .refine((value) => !DANGEROUS_PATH_CHARS.test(value), 'Path contains invalid characters')
  .refine(
    (value) => !PATH_TRAVERSAL_PATTERNS.some((pattern) => pattern.test(value)),
    'Path traversal is not allowed',
  );

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

export function validatePathWithinBase(userPath: string, baseDirectory: string): string {
  const parseResult = SafePathSchema.safeParse(userPath);
  if (!parseResult.success) {
    throw new Error(parseResult.error.issues[0]!.message);
  }

  const normalizedBase = path.normalize(path.resolve(baseDirectory));
  const normalizedUserPath = path.normalize(path.resolve(baseDirectory, userPath));

  if (
    !normalizedUserPath.startsWith(normalizedBase + path.sep) &&
    normalizedUserPath !== normalizedBase
  ) {
    throw new Error('Path escapes the allowed directory');
  }

  return normalizedUserPath;
}

export function isPathSafe(userPath: string): boolean {
  const parseResult = SafePathSchema.safeParse(userPath);
  return parseResult.success;
}

export function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(DANGEROUS_PATH_CHARS, '')
    .replace(/\.\./g, '')
    .replace(/[/\\]/g, '')
    .slice(0, 255);
}

export function validateNoInjection(input: string): boolean {
  if (input.includes('\0')) {
    return false;
  }

  const segments = input.split(/[/\\]/);
  if (segments.length > 100) {
    return false;
  }

  return true;
}

export type SafePath = z.infer<typeof SafePathSchema>;
export type SafeFileName = z.infer<typeof SafeFileNameSchema>;
