/**
 * File Operations API — typed wrappers for file_*, dir_*, and fs_* Tauri commands.
 */

import { command } from '@agiworkforce/runtime';

// ---- Types ----

export interface FileMetadata {
  size: number;
  isFile: boolean;
  isDir: boolean;
  created: number;
  modified: number;
  readonly: boolean;
}

export interface DirEntry {
  name: string;
  path: string;
  isFile: boolean;
  isDir: boolean;
  size: number;
  modified: number;
}

export interface FileReadRangeResult {
  content: string;
  totalLines: number;
  startLine: number;
  endLine: number;
}

export interface FileContextContent {
  content: string;
  language: string;
  lineCount: number;
}

export interface WorkspaceFile {
  path: string;
  name: string;
  size: number;
  language: string;
}

// ---- File Commands ----

export async function fileRead(path: string): Promise<string> {
  return command<string>('file_read', { path });
}

export async function fileWrite(path: string, content: string): Promise<void> {
  return command<void>('file_write', { path, content });
}

export async function fileDelete(path: string): Promise<void> {
  return command<void>('file_delete', { path });
}

export async function fileRename(oldPath: string, newPath: string): Promise<void> {
  return command<void>('file_rename', { oldPath, newPath });
}

export async function fileCopy(src: string, dest: string): Promise<void> {
  return command<void>('file_copy', { src, dest });
}

export async function fileMove(src: string, dest: string): Promise<void> {
  return command<void>('file_move', { src, dest });
}

export async function fileExists(path: string): Promise<boolean> {
  return command<boolean>('file_exists', { path });
}

export async function fileOpenWithDefaultApp(path: string): Promise<void> {
  return command<void>('file_open_with_default_app', { path });
}

export async function fileMetadata(path: string): Promise<FileMetadata> {
  return command<FileMetadata>('file_metadata', { path });
}

export async function fileReadRange(
  path: string,
  offset?: number,
  limit?: number,
): Promise<FileReadRangeResult> {
  return command<FileReadRangeResult>('file_read_range', { path, offset, limit });
}

export async function fsReadFileContent(filePath: string): Promise<FileContextContent> {
  return command<FileContextContent>('fs_read_file_content', { filePath });
}

export async function fsGetWorkspaceFiles(workspacePath: string): Promise<WorkspaceFile[]> {
  return command<WorkspaceFile[]>('fs_get_workspace_files', { workspacePath });
}

export async function fileReadText(filePath: string): Promise<string> {
  return command<string>('file_read_text', { filePath });
}

export async function fileWriteText(filePath: string, content: string): Promise<void> {
  return command<void>('file_write_text', { filePath, content });
}

export async function fileReadBinary(filePath: string): Promise<string> {
  return command<string>('file_read_binary', { filePath });
}

export async function fileWriteBinary(filePath: string, base64Content: string): Promise<void> {
  return command<void>('file_write_binary', { filePath, base64Content });
}

export async function fileGetMetadata(filePath: string): Promise<FileMetadata> {
  return command<FileMetadata>('file_get_metadata', { filePath });
}

export async function undoFileOperation(
  operation: string,
  path: string,
  content?: string,
): Promise<void> {
  return command<void>('undo_file_operation', { operation, path, content });
}

// ---- Directory Commands ----

export async function dirCreate(path: string): Promise<void> {
  return command<void>('dir_create', { path });
}

export async function dirList(path: string): Promise<DirEntry[]> {
  return command<DirEntry[]>('dir_list', { path });
}

export async function dirDelete(path: string, recursive: boolean): Promise<void> {
  return command<void>('dir_delete', { path, recursive });
}

export async function dirTraverse(path: string, globPattern: string): Promise<string[]> {
  return command<string[]>('dir_traverse', { path, globPattern });
}

// ---- File Watcher ----

export async function fileWatchStart(path: string, recursive: boolean): Promise<void> {
  return command<void>('file_watch_start', { path, recursive });
}

export async function fileWatchStop(path: string): Promise<void> {
  return command<void>('file_watch_stop', { path });
}

export async function fileWatchList(): Promise<string[]> {
  return command<string[]>('file_watch_list');
}

export async function fileWatchStopAll(): Promise<void> {
  return command<void>('file_watch_stop_all');
}
