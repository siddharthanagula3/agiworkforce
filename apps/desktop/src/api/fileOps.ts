/**
 * File Operations API
 *
 * TypeScript API wrappers for all file_ops Tauri commands.
 * 22 commands covering file CRUD, directory management, binary I/O,
 * ranged reads, workspace listing, and undo support.
 *
 * Rust param names are snake_case; invoke() params are camelCase.
 */

import { invoke } from '../lib/tauri-mock';

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// File Read Operations
// ============================================================================

/** Read a text file by path. Rust: file_read(path) */
export async function fileRead(path: string): Promise<string> {
  try {
    return await invoke<string>('file_read', { path });
  } catch (error) {
    throw new Error(`fileRead failed: ${error}`);
  }
}

/** Read a text file by filePath. Rust: file_read_text(file_path) */
export async function fileReadText(filePath: string): Promise<string> {
  try {
    return await invoke<string>('file_read_text', { filePath });
  } catch (error) {
    throw new Error(`fileReadText failed: ${error}`);
  }
}

/** Read a binary file, returned as base64. Rust: file_read_binary(file_path) */
export async function fileReadBinary(filePath: string): Promise<string> {
  try {
    return await invoke<string>('file_read_binary', { filePath });
  } catch (error) {
    throw new Error(`fileReadBinary failed: ${error}`);
  }
}

/**
 * Read a file with line-number offset and limit (OpenCode parity).
 * Rust: file_read_range(path, offset?, limit?)
 */
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

/**
 * Read file content with metadata (size, line count, language, excerpt).
 * Rust: fs_read_file_content(file_path)
 */
export async function fsReadFileContent(filePath: string): Promise<FileContextContent> {
  try {
    return await invoke<FileContextContent>('fs_read_file_content', { filePath });
  } catch (error) {
    throw new Error(`fsReadFileContent failed: ${error}`);
  }
}

// ============================================================================
// File Write Operations
// ============================================================================

/** Write text content to a file. Rust: file_write(path, content) */
export async function fileWrite(path: string, content: string): Promise<void> {
  try {
    await invoke('file_write', { path, content });
  } catch (error) {
    throw new Error(`fileWrite failed: ${error}`);
  }
}

/** Write text content to a file by filePath. Rust: file_write_text(file_path, content) */
export async function fileWriteText(filePath: string, content: string): Promise<void> {
  try {
    await invoke('file_write_text', { filePath, content });
  } catch (error) {
    throw new Error(`fileWriteText failed: ${error}`);
  }
}

/** Write binary (base64-encoded) content to a file. Rust: file_write_binary(file_path, base64_content) */
export async function fileWriteBinary(filePath: string, base64Content: string): Promise<void> {
  try {
    await invoke('file_write_binary', { filePath, base64Content });
  } catch (error) {
    throw new Error(`fileWriteBinary failed: ${error}`);
  }
}

// ============================================================================
// File Mutation Operations
// ============================================================================

/** Delete a file. Rust: file_delete(path) */
export async function fileDelete(path: string): Promise<void> {
  try {
    await invoke('file_delete', { path });
  } catch (error) {
    throw new Error(`fileDelete failed: ${error}`);
  }
}

/** Rename / move a file. Rust: file_rename(old_path, new_path) */
export async function fileRename(oldPath: string, newPath: string): Promise<void> {
  try {
    await invoke('file_rename', { oldPath, newPath });
  } catch (error) {
    throw new Error(`fileRename failed: ${error}`);
  }
}

/** Copy a file. Rust: file_copy(src, dest) */
export async function fileCopy(src: string, dest: string): Promise<void> {
  try {
    await invoke('file_copy', { src, dest });
  } catch (error) {
    throw new Error(`fileCopy failed: ${error}`);
  }
}

/** Move a file (rename with fallback to copy+delete). Rust: file_move(src, dest) */
export async function fileMove(src: string, dest: string): Promise<void> {
  try {
    await invoke('file_move', { src, dest });
  } catch (error) {
    throw new Error(`fileMove failed: ${error}`);
  }
}

// ============================================================================
// File Query Operations
// ============================================================================

/** Check whether a path exists. Rust: file_exists(path) */
export async function fileExists(path: string): Promise<boolean> {
  try {
    return await invoke<boolean>('file_exists', { path });
  } catch (error) {
    throw new Error(`fileExists failed: ${error}`);
  }
}

/** Get metadata for a path (by path). Rust: file_metadata(path) */
export async function fileMetadata(path: string): Promise<FileMetadata> {
  try {
    return await invoke<FileMetadata>('file_metadata', { path });
  } catch (error) {
    throw new Error(`fileMetadata failed: ${error}`);
  }
}

/** Get metadata for a path (by filePath). Rust: file_get_metadata(file_path) */
export async function fileGetMetadata(filePath: string): Promise<FileMetadata> {
  try {
    return await invoke<FileMetadata>('file_get_metadata', { filePath });
  } catch (error) {
    throw new Error(`fileGetMetadata failed: ${error}`);
  }
}

/** Open a file or directory with the OS default application. Rust: file_open_with_default_app(path) */
export async function fileOpenWithDefaultApp(path: string): Promise<void> {
  try {
    await invoke('file_open_with_default_app', { path });
  } catch (error) {
    throw new Error(`fileOpenWithDefaultApp failed: ${error}`);
  }
}

// ============================================================================
// Directory Operations
// ============================================================================

/** Create a directory (recursive). Rust: dir_create(path) */
export async function dirCreate(path: string): Promise<void> {
  try {
    await invoke('dir_create', { path });
  } catch (error) {
    throw new Error(`dirCreate failed: ${error}`);
  }
}

/** List directory entries. Rust: dir_list(path) */
export async function dirList(path: string): Promise<DirEntry[]> {
  try {
    return await invoke<DirEntry[]>('dir_list', { path });
  } catch (error) {
    throw new Error(`dirList failed: ${error}`);
  }
}

/** Delete a directory. Rust: dir_delete(path, recursive) */
export async function dirDelete(path: string, recursive: boolean): Promise<void> {
  try {
    await invoke('dir_delete', { path, recursive });
  } catch (error) {
    throw new Error(`dirDelete failed: ${error}`);
  }
}

/**
 * Traverse a directory with a glob pattern. Returns matching paths (max 10,000).
 * Rust: dir_traverse(path, glob_pattern)
 */
export async function dirTraverse(path: string, globPattern: string): Promise<string[]> {
  try {
    return await invoke<string[]>('dir_traverse', { path, globPattern });
  } catch (error) {
    throw new Error(`dirTraverse failed: ${error}`);
  }
}

/** Get workspace files (filtered, sorted). Rust: fs_get_workspace_files(workspace_path) */
export async function fsGetWorkspaceFiles(workspacePath: string): Promise<WorkspaceFile[]> {
  try {
    return await invoke<WorkspaceFile[]>('fs_get_workspace_files', { workspacePath });
  } catch (error) {
    throw new Error(`fsGetWorkspaceFiles failed: ${error}`);
  }
}

// ============================================================================
// Undo Operations
// ============================================================================

/**
 * Undo a file operation (restore, delete, or create).
 * Rust: undo_file_operation(operation, path, content?)
 */
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
