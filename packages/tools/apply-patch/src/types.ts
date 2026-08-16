
export interface AddFileHunk {
  kind: 'add';
  path: string;
  contents: string;
}

export interface DeleteFileHunk {
  kind: 'delete';
  path: string;
}

export interface UpdateFileChunk {
  changeContext?: string;
  oldLines: string[];
  newLines: string[];
  isEndOfFile: boolean;
}

export interface UpdateFileHunk {
  kind: 'update';
  path: string;
  movePath?: string;
  chunks: UpdateFileChunk[];
}

export type Hunk = AddFileHunk | DeleteFileHunk | UpdateFileHunk;

export interface ApplyPatchSummary {
  added: string[];
  modified: string[];
  deleted: string[];
}

export interface ApplyPatchResult {
  summary: ApplyPatchSummary;
  text: string;
}

export interface FSBridge {
  readFile(path: string): Promise<string>;
  writeFile(path: string, contents: string): Promise<void>;
  remove(path: string): Promise<void>;
  mkdirp(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

export interface ApplyPatchOptions {
  cwd?: string;
  fs?: FSBridge;
  workspaceOnly?: boolean;
  signal?: AbortSignal;
}
