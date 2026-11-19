const BYTES_PER_KB = 1024;
const BYTES_PER_MB = BYTES_PER_KB * BYTES_PER_KB;
const BYTES_PER_GB = BYTES_PER_MB * BYTES_PER_KB;

export function formatAttachmentSize(bytes: number): string {
  if (bytes < BYTES_PER_KB) return `${bytes} B`;
  const kilobytes = Math.round(bytes / BYTES_PER_KB);
  if (kilobytes < BYTES_PER_KB) return `${kilobytes} KB`;
  const megabytes = Number((bytes / BYTES_PER_MB).toFixed(1));
  if (megabytes < BYTES_PER_KB) return `${megabytes} MB`;
  return `${Number((bytes / BYTES_PER_GB).toFixed(1))} GB`;
}
