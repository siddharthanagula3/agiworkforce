/**
 * File Operations Hook for AGI Workforce.
 *
 * Provides a comprehensive interface to file system operations via Tauri commands.
 * Handles loading states, error handling, and provides user-friendly feedback.
 *
 * @module useFileOperations
 */

import { invoke, listen, type UnlistenFn } from '../lib/tauri-mock';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

/**
 * File metadata information.
 */
export interface FileMetadata {
  size: number;
  is_file: boolean;
  is_dir: boolean;
  created: number;
  modified: number;
  readonly: boolean;
}

/**
 * Directory entry information.
 */
export interface DirEntry {
  name: string;
  path: string;
  is_file: boolean;
  is_dir: boolean;
  size: number;
  modified: number;
}

/**
 * File change event from the file watcher.
 */
export interface FileChangeEvent {
  kind: 'create' | 'modify' | 'remove' | 'rename' | 'any';
  paths: string[];
}

/**
 * Search options for file search.
 */
export interface SearchOptions {
  pattern: string;
  maxResults?: number;
}

/**
 * Hook state and operations for file management.
 */
export interface UseFileOperationsReturn {
  /** Whether a file operation is in progress */
  loading: boolean;
  /** Last error message */
  error: string | null;
  /** Currently watched paths */
  watchedPaths: string[];

  // File Operations
  /** Read file content as text */
  read: (path: string) => Promise<string>;
  /** Read file content as binary (base64 encoded) */
  readBinary: (path: string) => Promise<string>;
  /** Write text content to file */
  write: (path: string, content: string) => Promise<void>;
  /** Write binary content to file (base64 encoded) */
  writeBinary: (path: string, base64Content: string) => Promise<void>;
  /** Delete a file */
  deleteFile: (path: string) => Promise<void>;
  /** Copy a file to a new location */
  copy: (src: string, dest: string) => Promise<void>;
  /** Move a file to a new location */
  move: (src: string, dest: string) => Promise<void>;
  /** Rename a file */
  rename: (oldPath: string, newPath: string) => Promise<void>;
  /** Check if a file exists */
  exists: (path: string) => Promise<boolean>;
  /** Get file metadata */
  getMetadata: (path: string) => Promise<FileMetadata>;

  // Directory Operations
  /** List directory contents */
  listDirectory: (path: string) => Promise<DirEntry[]>;
  /** Create a new directory */
  createDirectory: (path: string) => Promise<void>;
  /** Delete a directory */
  deleteDirectory: (path: string, recursive?: boolean) => Promise<void>;
  /** Search for files matching a glob pattern */
  search: (path: string, pattern: string) => Promise<string[]>;

  // Watch Operations
  /** Start watching a path for changes */
  watch: (path: string, recursive?: boolean) => Promise<void>;
  /** Stop watching a path */
  unwatch: (path: string) => Promise<void>;
  /** Stop watching all paths */
  unwatchAll: () => Promise<void>;
  /** Get list of watched paths */
  getWatchedPaths: () => Promise<string[]>;

  // Utility
  /** Clear the current error */
  clearError: () => void;
}

/**
 * Hook for managing file system operations.
 *
 * Provides a complete interface to the Tauri file operations backend,
 * including file reading, writing, copying, moving, and watching for changes.
 *
 * @param onFileChange - Optional callback for file change events
 * @returns File operations and state
 *
 * @example
 * ```tsx
 * const { read, write, watch, loading, error } = useFileOperations({
 *   onFileChange: (event) => console.log('File changed:', event)
 * });
 *
 * // Read a file
 * const content = await read('/path/to/file.txt');
 *
 * // Write to a file
 * await write('/path/to/file.txt', 'Hello, World!');
 *
 * // Watch for changes
 * await watch('/path/to/directory', true);
 * ```
 */
export function useFileOperations(options?: {
  onFileChange?: (event: FileChangeEvent) => void;
}): UseFileOperationsReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [watchedPaths, setWatchedPaths] = useState<string[]>([]);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const onFileChangeRef = useRef(options?.onFileChange);

  // Keep the ref up to date
  useEffect(() => {
    onFileChangeRef.current = options?.onFileChange;
  }, [options?.onFileChange]);

  // Set up file change listener
  useEffect(() => {
    if (onFileChangeRef.current) {
      const setupListener = async () => {
        unlistenRef.current = await listen<FileChangeEvent>('file-event', (event) => {
          onFileChangeRef.current?.(event.payload);
        });
      };
      setupListener();
    }

    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, []);

  const handleError = useCallback((err: unknown, operation: string): never => {
    const message = err instanceof Error ? err.message : String(err);
    setError(message);
    toast.error(`File ${operation} failed: ${message}`);
    throw new Error(message);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // File Operations

  const read = useCallback(
    async (path: string): Promise<string> => {
      setLoading(true);
      setError(null);

      try {
        const content = await invoke<string>('file_read', { path });
        return content;
      } catch (err) {
        return handleError(err, 'read');
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const readBinary = useCallback(
    async (path: string): Promise<string> => {
      setLoading(true);
      setError(null);

      try {
        const content = await invoke<string>('file_read_binary', { filePath: path });
        return content;
      } catch (err) {
        return handleError(err, 'read binary');
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const write = useCallback(
    async (path: string, content: string): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        await invoke('file_write', { path, content });
        toast.success('File saved successfully');
      } catch (err) {
        handleError(err, 'write');
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const writeBinary = useCallback(
    async (path: string, base64Content: string): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        await invoke('file_write_binary', { filePath: path, base64Content });
        toast.success('File saved successfully');
      } catch (err) {
        handleError(err, 'write binary');
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const deleteFile = useCallback(
    async (path: string): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        await invoke('file_delete', { path });
        toast.success('File deleted');
      } catch (err) {
        handleError(err, 'delete');
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const copy = useCallback(
    async (src: string, dest: string): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        await invoke('file_copy', { src, dest });
        toast.success('File copied successfully');
      } catch (err) {
        handleError(err, 'copy');
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const move = useCallback(
    async (src: string, dest: string): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        await invoke('file_move', { src, dest });
        toast.success('File moved successfully');
      } catch (err) {
        handleError(err, 'move');
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const rename = useCallback(
    async (oldPath: string, newPath: string): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        await invoke('file_rename', { oldPath, newPath });
        toast.success('File renamed successfully');
      } catch (err) {
        handleError(err, 'rename');
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const exists = useCallback(async (path: string): Promise<boolean> => {
    try {
      return await invoke<boolean>('file_exists', { path });
    } catch {
      return false;
    }
  }, []);

  const getMetadata = useCallback(
    async (path: string): Promise<FileMetadata> => {
      setLoading(true);
      setError(null);

      try {
        const metadata = await invoke<FileMetadata>('file_metadata', { path });
        return metadata;
      } catch (err) {
        return handleError(err, 'get metadata');
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  // Directory Operations

  const listDirectory = useCallback(
    async (path: string): Promise<DirEntry[]> => {
      setLoading(true);
      setError(null);

      try {
        const entries = await invoke<DirEntry[]>('dir_list', { path });
        return entries;
      } catch (err) {
        return handleError(err, 'list directory');
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const createDirectory = useCallback(
    async (path: string): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        await invoke('dir_create', { path });
        toast.success('Folder created successfully');
      } catch (err) {
        handleError(err, 'create directory');
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const deleteDirectory = useCallback(
    async (path: string, recursive: boolean = false): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        await invoke('dir_delete', { path, recursive });
        toast.success('Folder deleted');
      } catch (err) {
        handleError(err, 'delete directory');
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const search = useCallback(
    async (path: string, pattern: string): Promise<string[]> => {
      setLoading(true);
      setError(null);

      try {
        const results = await invoke<string[]>('dir_traverse', {
          path,
          globPattern: pattern,
        });
        toast.success(`Found ${results.length} files`);
        return results;
      } catch (err) {
        return handleError(err, 'search');
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  // Watch Operations

  const watch = useCallback(
    async (path: string, recursive: boolean = false): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        await invoke('file_watch_start', { path, recursive });
        const paths = await invoke<string[]>('file_watch_list');
        setWatchedPaths(paths);
        toast.success(`Watching ${path}`);
      } catch (err) {
        handleError(err, 'watch');
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const unwatch = useCallback(
    async (path: string): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        await invoke('file_watch_stop', { path });
        const paths = await invoke<string[]>('file_watch_list');
        setWatchedPaths(paths);
        toast.success(`Stopped watching ${path}`);
      } catch (err) {
        handleError(err, 'unwatch');
      } finally {
        setLoading(false);
      }
    },
    [handleError],
  );

  const unwatchAll = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      await invoke('file_watch_stop_all');
      setWatchedPaths([]);
      toast.success('Stopped watching all paths');
    } catch (err) {
      handleError(err, 'unwatch all');
    } finally {
      setLoading(false);
    }
  }, [handleError]);

  const getWatchedPaths = useCallback(async (): Promise<string[]> => {
    try {
      const paths = await invoke<string[]>('file_watch_list');
      setWatchedPaths(paths);
      return paths;
    } catch {
      return [];
    }
  }, []);

  return {
    loading,
    error,
    watchedPaths,

    // File Operations
    read,
    readBinary,
    write,
    writeBinary,
    deleteFile,
    copy,
    move,
    rename,
    exists,
    getMetadata,

    // Directory Operations
    listDirectory,
    createDirectory,
    deleteDirectory,
    search,

    // Watch Operations
    watch,
    unwatch,
    unwatchAll,
    getWatchedPaths,

    // Utility
    clearError,
  };
}

export default useFileOperations;
