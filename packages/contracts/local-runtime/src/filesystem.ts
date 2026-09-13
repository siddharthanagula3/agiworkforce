export interface FileEntry {
  name: string;
  /** Path relative to the workspace root, POSIX-separated. */
  path: string;
  kind: 'file' | 'directory' | 'symlink';
  sizeBytes: number;
  modifiedAtMs: number;
}

export interface FileStat extends FileEntry {
  binary: boolean;
  readOnly: boolean;
}

export interface FileTextContent {
  path: string;
  text: string;
  sizeBytes: number;
  modifiedAtMs: number;
  truncated: boolean;
}

export interface FileBinaryContent {
  path: string;
  /** Base64, because the runtime response crosses IPC as structured JSON. */
  base64: string;
  sizeBytes: number;
  modifiedAtMs: number;
}

export interface FileSearchMatch {
  path: string;
  line: number;
  column: number;
  preview: string;
}

export const FILESYSTEM_COMMANDS = [
  'file_list',
  'file_stat',
  'file_read_text',
  'file_read_bytes',
  'file_write_text',
  'file_create_directory',
  'file_rename',
  'file_delete',
  'file_glob',
  'file_grep',
  'file_watch',
  'file_unwatch',
] as const;

export type FilesystemCommand = (typeof FILESYSTEM_COMMANDS)[number];

/** Refused outright: reading one of these would hand over credentials wholesale. */
export const ALWAYS_DENIED_BASENAMES: readonly string[] = [
  '.env',
  '.env.local',
  '.env.production',
  '.npmrc',
  '.netrc',
  'id_rsa',
  'id_ed25519',
  'credentials',
];

export const MAX_TEXT_READ_BYTES = 2_000_000;
/** Above any consumer's own attachment cap, so the refusal a user sees is the consumer's. */
export const MAX_BINARY_READ_BYTES = 16 * 1024 * 1024;
export const MAX_LIST_ENTRIES = 5_000;
export const MAX_GREP_MATCHES = 500;
