import type { AbsolutePathBuf } from './AbsolutePathBuf';
import type { FileSystemSpecialPath } from './FileSystemSpecialPath';

export type FileSystemPath =
  | { type: 'path'; path: AbsolutePathBuf }
  | { type: 'glob_pattern'; pattern: string }
  | { type: 'special'; value: FileSystemSpecialPath };
