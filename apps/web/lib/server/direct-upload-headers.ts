import 'server-only';

const CONTENT_TYPE_HEADER = 'content-type';

export function directUploadHeaders(
  contentType: string,
  requiredHeaders: Readonly<Record<string, string>> | undefined,
): Record<string, string> {
  const required = Object.entries(requiredHeaders ?? {});
  if (required.some(([name]) => name.toLowerCase() === CONTENT_TYPE_HEADER)) {
    throw new Error('A signed upload may not take its content type from the storage host.');
  }
  return { 'Content-Type': contentType, ...Object.fromEntries(required) };
}
