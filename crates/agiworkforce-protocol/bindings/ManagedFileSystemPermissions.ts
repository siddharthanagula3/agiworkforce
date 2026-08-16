import type { FileSystemSandboxEntry } from './FileSystemSandboxEntry';

export type ManagedFileSystemPermissions =
  | { type: 'restricted'; entries: Array<FileSystemSandboxEntry>; glob_scan_max_depth?: number }
  | { type: 'unrestricted' };
