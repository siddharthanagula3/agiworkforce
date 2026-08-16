
import { invoke } from '../lib/tauri-mock';

export interface FileMetadata {
  size: number;
  is_file: boolean;
  is_dir: boolean;
  created: number;
  modified: number;
  readonly: boolean;
}

export interface DirEntry {
  name: string;
  path: string;
  is_file: boolean;
  is_dir: boolean;
  size: number;
  modified: number;
}

export interface FileReadRangeResult {
  content: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  hasMore: boolean;
}

export interface FileContextContent {
  content: string;
  size: number;
  line_count: number;
  language: string | null;
  excerpt: string;
}

export interface WorkspaceFile {
  path: string;
  name: string;
  size: number;
  is_file: boolean;
  is_dir: boolean;
  extension: string | null;
  language: string | null;
}

export async function fileRead(path: string): Promise<string> {
  try {
    return await invoke<string>('file_read', { path });
  } catch (error) {
    throw new Error(`fileRead failed: ${error}`);
  }
}

export async function fileReadText(filePath: string): Promise<string> {
  try {
    return await invoke<string>('file_read_text', { filePath });
  } catch (error) {
    throw new Error(`fileReadText failed: ${error}`);
  }
}

export async function fileReadBinary(filePath: string): Promise<string> {
  try {
    return await invoke<string>('file_read_binary', { filePath });
  } catch (error) {
    throw new Error(`fileReadBinary failed: ${error}`);
  }
}

export async function fileReadRange(
  path: string,
  offset?: number | null,
  limit?: number | null,
): Promise<FileReadRangeResult> {
  try {
    return await invoke<FileReadRangeResult>('file_read_range', {
      path,
      offset: offset ?? null,
      limit: limit ?? null,
    });
  } catch (error) {
    throw new Error(`fileReadRange failed: ${error}`);
  }
}

export async function fsReadFileContent(filePath: string): Promise<FileContextContent> {
  try {
    return await invoke<FileContextContent>('fs_read_file_content', { filePath });
  } catch (error) {
    throw new Error(`fsReadFileContent failed: ${error}`);
  }
}

export async function fileWrite(path: string, content: string): Promise<void> {
  try {
    await invoke('file_write', { path, content });
  } catch (error) {
    throw new Error(`fileWrite failed: ${error}`);
  }
}

export async function fileWriteText(filePath: string, content: string): Promise<void> {
  try {
    await invoke('file_write_text', { filePath, content });
  } catch (error) {
    throw new Error(`fileWriteText failed: ${error}`);
  }
}

export async function fileWriteBinary(filePath: string, base64Content: string): Promise<void> {
  try {
    await invoke('file_write_binary', { filePath, base64Content });
  } catch (error) {
    throw new Error(`fileWriteBinary failed: ${error}`);
  }
}

export async function fileDelete(path: string): Promise<void> {
  try {
    await invoke('file_delete', { path });
  } catch (error) {
    throw new Error(`fileDelete failed: ${error}`);
  }
}

export async function fileRename(oldPath: string, newPath: string): Promise<void> {
  try {
    await invoke('file_rename', { oldPath, newPath });
  } catch (error) {
    throw new Error(`fileRename failed: ${error}`);
  }
}

export async function fileCopy(src: string, dest: string): Promise<void> {
  try {
    await invoke('file_copy', { src, dest });
  } catch (error) {
    throw new Error(`fileCopy failed: ${error}`);
  }
}

export async function fileMove(src: string, dest: string): Promise<void> {
  try {
    await invoke('file_move', { src, dest });
  } catch (error) {
    throw new Error(`fileMove failed: ${error}`);
  }
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    return await invoke<boolean>('file_exists', { path });
  } catch (error) {
    throw new Error(`fileExists failed: ${error}`);
  }
}

export async function fileMetadata(path: string): Promise<FileMetadata> {
  try {
    return await invoke<FileMetadata>('file_metadata', { path });
  } catch (error) {
    throw new Error(`fileMetadata failed: ${error}`);
  }
}

export async function fileGetMetadata(filePath: string): Promise<FileMetadata> {
  try {
    return await invoke<FileMetadata>('file_get_metadata', { filePath });
  } catch (error) {
    throw new Error(`fileGetMetadata failed: ${error}`);
  }
}

export async function fileOpenWithDefaultApp(path: string): Promise<void> {
  try {
    await invoke('file_open_with_default_app', { path });
  } catch (error) {
    throw new Error(`fileOpenWithDefaultApp failed: ${error}`);
  }
}

export async function dirCreate(path: string): Promise<void> {
  try {
    await invoke('dir_create', { path });
  } catch (error) {
    throw new Error(`dirCreate failed: ${error}`);
  }
}

export async function dirList(path: string): Promise<DirEntry[]> {
  try {
    return await invoke<DirEntry[]>('dir_list', { path });
  } catch (error) {
    throw new Error(`dirList failed: ${error}`);
  }
}

export async function dirDelete(path: string, recursive: boolean): Promise<void> {
  try {
    await invoke('dir_delete', { path, recursive });
  } catch (error) {
    throw new Error(`dirDelete failed: ${error}`);
  }
}

export async function dirTraverse(path: string, globPattern: string): Promise<string[]> {
  try {
    return await invoke<string[]>('dir_traverse', { path, globPattern });
  } catch (error) {
    throw new Error(`dirTraverse failed: ${error}`);
  }
}

export async function fsGetWorkspaceFiles(workspacePath: string): Promise<WorkspaceFile[]> {
  try {
    return await invoke<WorkspaceFile[]>('fs_get_workspace_files', { workspacePath });
  } catch (error) {
    throw new Error(`fsGetWorkspaceFiles failed: ${error}`);
  }
}

export async function undoFileOperation(
  operation: string,
  path: string,
  content?: string | null,
): Promise<void> {
  try {
    await invoke('undo_file_operation', {
      operation,
      path,
      content: content ?? null,
    });
  } catch (error) {
    throw new Error(`undoFileOperation failed: ${error}`);
  }
}
