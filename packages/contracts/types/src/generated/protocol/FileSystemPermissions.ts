import type { FileSystemSandboxEntry } from './FileSystemSandboxEntry';

export type FileSystemPermissions = {
  entries: Array<FileSystemSandboxEntry>;
  glob_scan_max_depth: number | null;
};
