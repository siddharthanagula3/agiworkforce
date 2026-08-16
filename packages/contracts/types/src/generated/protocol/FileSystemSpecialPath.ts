
export type FileSystemSpecialPath =
  | { kind: 'root' }
  | { kind: 'minimal' }
  | { kind: 'project_roots'; subpath?: string }
  | { kind: 'tmpdir' }
  | { kind: 'slash_tmp' }
  | { kind: 'unknown'; path: string; subpath?: string };
