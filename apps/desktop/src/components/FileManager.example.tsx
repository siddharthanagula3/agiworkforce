import { invoke } from '@/lib/tauri-mock';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';

/**
 * File metadata interface matching Rust FileMetadata struct
 */
interface FileMetadata {
  size: number;
  is_file: boolean;
  is_dir: boolean;
  created: number;
  modified: number;
  readonly: boolean;
}

/**
 * Directory entry interface matching Rust DirEntry struct
 */
interface DirEntry {
  name: string;
  path: string;
  is_file: boolean;
  is_dir: boolean;
  size: number;
  modified: number;
}

/**
 * File event from watcher
 */
interface FileEvent {
  type: 'Created' | 'Modified' | 'Deleted' | 'Renamed';
  paths?: string[];
  from?: string;
  to?: string;
}

/**
 * Example File Manager component demonstrating all file operations
 */
export function FileManagerExample() {
  const [currentPath, setCurrentPath] = useState<string>('C:\\Users');
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [watching, setWatching] = useState<boolean>(false);
  const [events, setEvents] = useState<FileEvent[]>([]);

  // ============================================================================
  // FILE OPERATIONS
  // ============================================================================

  /**
   * Read a file's contents
   */
  const handleReadFile = async (path: string) => {
    try {
      const content = await invoke<string>('file_read', { path });
      setFileContent(content);
      setSelectedFile(path);
    } catch (error) {
      console.error('Failed to read file:', error);
      alert(`Error reading file: ${error}`);
    }
  };

  /**
   * Write content to a file
   */
  const handleWriteFile = async (path: string, content: string) => {
    try {
      await invoke('file_write', { path, content });
      alert('File saved successfully!');
    } catch (error) {
      console.error('Failed to write file:', error);
      alert(`Error writing file: ${error}`);
    }
  };

  /**
   * Delete a file
   */
  const handleDeleteFile = async (path: string) => {
    if (!confirm(`Are you sure you want to delete ${path}?`)) {
      return;
    }

    try {
      await invoke('file_delete', { path });
      alert('File deleted successfully!');
      await loadDirectory(currentPath); // Refresh
    } catch (error) {
      console.error('Failed to delete file:', error);
      alert(`Error deleting file: ${error}`);
    }
  };

  /**
   * Get file metadata
   */
  const handleGetMetadata = async (path: string) => {
    try {
      const metadata = await invoke<FileMetadata>('file_metadata', { path });
      console.log('File metadata:', metadata);
      alert(JSON.stringify(metadata, null, 2));
    } catch (error) {
      console.error('Failed to get metadata:', error);
      alert(`Error getting metadata: ${error}`);
    }
  };

  // ============================================================================
  // DIRECTORY OPERATIONS
  // ============================================================================

  /**
   * Load directory contents
   */
  const loadDirectory = async (path: string) => {
    try {
      const dirEntries = await invoke<DirEntry[]>('dir_list', { path });
      setEntries(dirEntries);
      setCurrentPath(path);
    } catch (error) {
      console.error('Failed to list directory:', error);
      alert(`Error listing directory: ${error}`);
    }
  };

  /**
   * Search files using glob pattern
   */
  const handleSearchFiles = async (path: string, pattern: string) => {
    try {
      const results = await invoke<string[]>('dir_traverse', { path, globPattern: pattern });
      console.log('Search results:', results);
      alert(`Found ${results.length} files:\n${results.slice(0, 10).join('\n')}`);
    } catch (error) {
      console.error('Failed to search files:', error);
      alert(`Error searching files: ${error}`);
    }
  };

  // ============================================================================
  // FILE WATCHING
  // ============================================================================

  /**
   * Start watching a directory for changes
   */
  const handleStartWatching = async (path: string, recursive: boolean = true) => {
    try {
      await invoke('file_watch_start', { path, recursive });
      setWatching(true);
      alert(`Started watching ${path}`);
    } catch (error) {
      console.error('Failed to start watching:', error);
      alert(`Error starting watch: ${error}`);
    }
  };

  /**
   * Stop watching a directory
   */
  const handleStopWatching = async (path: string) => {
    try {
      await invoke('file_watch_stop', { path });
      setWatching(false);
      alert(`Stopped watching ${path}`);
    } catch (error) {
      console.error('Failed to stop watching:', error);
      alert(`Error stopping watch: ${error}`);
    }
  };

  /**
   * Listen for file events from watcher
   */
  useEffect(() => {
    const unlisten = listen<FileEvent>('file-event', (event) => {
      console.log('File event:', event.payload);
      setEvents((prev) => [...prev.slice(-9), event.payload]); // Keep last 10 events
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Load initial directory on mount
  useEffect(() => {
    void loadDirectory(currentPath);
  }, [currentPath]);

  // ============================================================================
  // UI RENDERING
  // ============================================================================

  return (
    <div className="file-manager p-4">
      <h2 className="text-2xl font-bold mb-4">File Manager Example</h2>

      {/* Current Path */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">Current Path:</label>
        <input
          type="text"
          value={currentPath}
          onChange={(e) => setCurrentPath(e.target.value)}
          className="w-full px-3 py-2 border rounded"
        />
        <button
          onClick={() => loadDirectory(currentPath)}
          className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Load Directory
        </button>
      </div>

      {/* Directory Entries */}
      <div className="mb-4">
        <h3 className="text-xl font-semibold mb-2">Directory Contents:</h3>
        <div className="border rounded max-h-96 overflow-y-auto">
          {entries.map((entry) => (
            <div
              key={entry.path}
              className="p-2 border-b hover:bg-gray-100 cursor-pointer flex justify-between items-center"
              onClick={() => {
                if (entry.is_dir) {
                  loadDirectory(entry.path);
                } else {
                  handleReadFile(entry.path);
                }
              }}
            >
              <div>
                <span className="font-medium">
                  {entry.is_dir ? '📁' : '📄'} {entry.name}
                </span>
                <span className="text-sm text-gray-500 ml-2">
                  {entry.is_file && `(${(entry.size / 1024).toFixed(2)} KB)`}
                </span>
              </div>
              <div className="flex gap-2">
                {entry.is_file && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleGetMetadata(entry.path);
                      }}
                      className="text-sm px-2 py-1 bg-gray-200 rounded hover:bg-gray-300"
                    >
                      Info
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteFile(entry.path);
                      }}
                      className="text-sm px-2 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* File Content Editor */}
      {selectedFile && (
        <div className="mb-4">
          <h3 className="text-xl font-semibold mb-2">File Content: {selectedFile}</h3>
          <textarea
            value={fileContent}
            onChange={(e) => setFileContent(e.target.value)}
            className="w-full h-48 p-2 border rounded font-mono text-sm"
          />
          <button
            onClick={() => handleWriteFile(selectedFile, fileContent)}
            className="mt-2 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          >
            Save File
          </button>
        </div>
      )}

      {/* File Operations */}
      <div className="mb-4 grid grid-cols-2 gap-4">
        <div>
          <h3 className="text-lg font-semibold mb-2">Search Files:</h3>
          <input
            type="text"
            placeholder="e.g., **/*.ts"
            id="search-pattern"
            className="w-full px-3 py-2 border rounded mb-2"
          />
          <button
            onClick={() => {
              const pattern = (document.getElementById('search-pattern') as HTMLInputElement).value;
              handleSearchFiles(currentPath, pattern);
            }}
            className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
          >
            Search
          </button>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-2">File Watching:</h3>
          <button
            onClick={() => handleStartWatching(currentPath)}
            disabled={watching}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 mr-2"
          >
            Start Watching
          </button>
          <button
            onClick={() => handleStopWatching(currentPath)}
            disabled={!watching}
            className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50"
          >
            Stop Watching
          </button>
        </div>
      </div>

      {/* File Events Log */}
      {events.length > 0 && (
        <div className="mt-4">
          <h3 className="text-lg font-semibold mb-2">Recent File Events:</h3>
          <div className="border rounded p-2 max-h-48 overflow-y-auto bg-gray-50">
            {events.map((event, index) => (
              <div key={index} className="text-sm font-mono mb-1">
                <span className="font-bold">{event.type}:</span>{' '}
                {event.paths?.join(', ') || `${event.from} → ${event.to}`}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Example usage patterns for file operations
 */
export const FileOperationsExamples = {
  // Read a file
  readFile: async (path: string) => {
    const content = await invoke<string>('file_read', { path });
    return content;
  },

  // Write to a file
  writeFile: async (path: string, content: string) => {
    await invoke('file_write', { path, content });
  },

  // Delete a file
  deleteFile: async (path: string) => {
    await invoke('file_delete', { path });
  },

  // Copy a file
  copyFile: async (src: string, dest: string) => {
    await invoke('file_copy', { src, dest });
  },

  // Move a file
  moveFile: async (src: string, dest: string) => {
    await invoke('file_move', { src, dest });
  },

  // Check if file exists
  fileExists: async (path: string) => {
    const exists = await invoke<boolean>('file_exists', { path });
    return exists;
  },

  // Get file metadata
  getMetadata: async (path: string) => {
    const metadata = await invoke<FileMetadata>('file_metadata', { path });
    return metadata;
  },

  // List directory
  listDirectory: async (path: string) => {
    const entries = await invoke<DirEntry[]>('dir_list', { path });
    return entries;
  },

  // Create directory
  createDirectory: async (path: string) => {
    await invoke('dir_create', { path });
  },

  // Delete directory
  deleteDirectory: async (path: string, recursive: boolean = false) => {
    await invoke('dir_delete', { path, recursive });
  },

  // Search files with glob pattern
  searchFiles: async (path: string, pattern: string) => {
    const results = await invoke<string[]>('dir_traverse', {
      path,
      globPattern: pattern,
    });
    return results;
  },

  // Start file watching
  startWatching: async (path: string, recursive: boolean = true) => {
    await invoke('file_watch_start', { path, recursive });
  },

  // Stop file watching
  stopWatching: async (path: string) => {
    await invoke('file_watch_stop', { path });
  },

  // Get watched paths
  getWatchedPaths: async () => {
    const paths = await invoke<string[]>('file_watch_list');
    return paths;
  },

  // Stop all watches
  stopAllWatches: async () => {
    await invoke('file_watch_stop_all');
  },
};
