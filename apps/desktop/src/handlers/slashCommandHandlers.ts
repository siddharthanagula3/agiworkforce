/**
 * Slash Command Handlers
 *
 * Central hub for executing slash commands and returning inline panel data.
 * Each handler returns an InlinePanel with the command results.
 */

import { invoke } from '../lib/tauri-mock';
import { InlinePanel } from '../stores/unifiedChatStore';

/**
 * Execute a terminal command and return results as inline panel
 */
export async function executeTerminalCommand(command: string): Promise<InlinePanel> {
  const panelId = `terminal-${Date.now()}`;

  const panel: InlinePanel = {
    id: panelId,
    type: 'terminal',
    content: {
      terminal: {
        command,
        status: 'running',
        cwd: undefined,
        stdout: 'Executing command...',
        stderr: undefined,
        exitCode: undefined,
        duration: undefined,
      },
    },
    isCollapsed: false,
    timestamp: new Date(),
    metadata: {
      status: 'running',
    },
  };

  try {
    // Invoke Tauri command to execute terminal command
    const response = await invoke<{
      stdout: string;
      stderr: string;
      exitCode: number | null;
      durationMs: number;
    }>('execute_terminal_command', { command, cwd: null, shell: null });

    const isSuccess = (response.exitCode ?? 0) === 0;

    panel.content.terminal = {
      command,
      cwd: undefined,
      stdout: response.stdout,
      stderr: response.stderr,
      exitCode: response.exitCode ?? 0,
      duration: response.durationMs,
      status: isSuccess ? 'success' : 'error',
    };

    panel.metadata = {
      status: isSuccess ? 'success' : 'error',
      duration: response.durationMs,
    };
  } catch (error) {
    panel.content.terminal = {
      command,
      status: 'error',
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: 1,
    };

    panel.metadata = {
      status: 'error',
    };
  }

  return panel;
}

/**
 * Execute browser automation and return results as inline panel
 */
export async function executeBrowserCommand(url: string): Promise<InlinePanel> {
  const panelId = `browser-${Date.now()}`;

  const panel: InlinePanel = {
    id: panelId,
    type: 'browser',
    content: {
      browser: {
        url,
        title: undefined,
        screenshot: undefined,
        status: 'loading',
        actions: [],
      },
    },
    isCollapsed: false,
    timestamp: new Date(),
    metadata: {
      status: 'loading',
    },
  };

  try {
    // Launch browser, navigate to URL, get title and screenshot using individual commands
    const browserId = await invoke<string>('browser_launch', {
      options: { headless: false },
    });

    // Navigate to the URL
    await invoke<void>('browser_navigate', { url });

    // Get page title
    const title = await invoke<string>('browser_get_title', {});

    // Take screenshot
    const screenshot = await invoke<string>('browser_screenshot', { selector: null });

    panel.content.browser = {
      url,
      title,
      screenshot,
      status: 'success',
      actions: [{ type: 'navigate', timestamp: new Date() }],
    };

    panel.metadata = {
      status: 'success',
      browserId,
    };
  } catch (error) {
    panel.content.browser = {
      url,
      status: 'error',
    };

    panel.metadata = {
      status: 'error',
      error: error instanceof Error ? error.message : String(error),
    };
  }

  return panel;
}

/**
 * Read and display a code file as inline panel
 */
export async function executeCodeCommand(filePath: string): Promise<InlinePanel> {
  const panelId = `code-${Date.now()}`;

  const panel: InlinePanel = {
    id: panelId,
    type: 'code',
    content: {
      code: {
        filePath,
        language: undefined,
        content: 'Loading file...',
        diff: undefined,
        isModified: false,
      },
    },
    isCollapsed: false,
    timestamp: new Date(),
    metadata: {
      status: 'loading',
    },
  };

  try {
    // Invoke Tauri command to read file
    const response = await invoke<{
      content: string;
      language?: string;
    }>('file_read', { path: filePath });

    // Detect language from file extension
    const ext = filePath.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      rs: 'rust',
      go: 'go',
      rb: 'ruby',
      php: 'php',
      java: 'java',
      cpp: 'cpp',
      c: 'c',
      cs: 'csharp',
      sh: 'bash',
      json: 'json',
      yaml: 'yaml',
      yml: 'yaml',
      html: 'html',
      css: 'css',
      sql: 'sql',
    };

    panel.content.code = {
      filePath,
      language: response.language || languageMap[ext || ''] || ext || 'text',
      content: response.content,
      diff: undefined,
      isModified: false,
    };

    panel.metadata = {
      status: 'success',
    };
  } catch (error) {
    panel.content.code = {
      filePath,
      content: `Error reading file: ${error instanceof Error ? error.message : String(error)}`,
      isModified: false,
    };

    panel.metadata = {
      status: 'error',
    };
  }

  return panel;
}

/**
 * Execute database query and return results as inline panel
 */
export async function executeDatabaseCommand(query: string): Promise<InlinePanel> {
  const panelId = `database-${Date.now()}`;

  const panel: InlinePanel = {
    id: panelId,
    type: 'database',
    content: {
      database: {
        query,
        results: undefined,
        executionTime: undefined,
        error: undefined,
      },
    },
    isCollapsed: false,
    timestamp: new Date(),
    metadata: {
      status: 'running',
    },
  };

  try {
    // Invoke Tauri command to execute database query
    const startTime = Date.now();
    const response = await invoke<{
      columns: string[];
      rows: any[][];
      rowCount: number;
    }>('db_execute_query', { sql: query });

    const executionTime = Date.now() - startTime;

    panel.content.database = {
      query,
      results: {
        columns: response.columns,
        rows: response.rows,
        rowCount: response.rowCount,
      },
      executionTime,
      error: undefined,
    };

    panel.metadata = {
      status: 'success',
      duration: executionTime,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    panel.content.database = {
      query,
      results: undefined,
      error: errorMessage,
    };

    panel.metadata = {
      status: 'error',
    };
  }

  return panel;
}

/**
 * Execute undo command and return results as inline panel
 *
 * @param args - Optional arguments:
 *   - empty: undo last change
 *   - "last": undo last change
 *   - "all": show list of all undoable changes
 *   - change_id: undo specific change by ID
 */
export async function executeUndoCommand(args: string): Promise<InlinePanel> {
  const panelId = `undo-${Date.now()}`;

  const panel: InlinePanel = {
    id: panelId,
    type: 'terminal', // Use terminal panel to display undo results
    content: {
      terminal: {
        command: `/undo ${args}`.trim(),
        status: 'running',
        stdout: 'Processing undo request...',
        stderr: undefined,
        exitCode: undefined,
        duration: undefined,
      },
    },
    isCollapsed: false,
    timestamp: new Date(),
    metadata: {
      status: 'running',
    },
  };

  try {
    const startTime = Date.now();
    const trimmedArgs = args.trim().toLowerCase();

    let result: string;

    if (trimmedArgs === '' || trimmedArgs === 'last') {
      // Undo the most recent change
      const undoResult = await invoke<{
        success: boolean;
        change_id: string;
        change_type: string;
        path: string | null;
        message: string;
      }>('undo_last', { taskId: null });

      if (undoResult.success) {
        result = `Successfully undone: ${undoResult.message}`;
      } else {
        result = `Undo failed: ${undoResult.message}`;
      }
    } else if (trimmedArgs === 'all' || trimmedArgs === 'list') {
      // Show list of undoable changes
      const summary = await invoke<{
        total_changes: number;
        revertible_changes: number;
        changes_by_type: Record<string, number>;
        recent_changes: Array<{
          id: string;
          change_type: string;
          path: string | null;
          timestamp: string;
          task_id: string;
          description: string;
        }>;
      }>('undo_get_summary', { taskId: null });

      if (summary.revertible_changes === 0) {
        result = 'No changes available to undo.';
      } else {
        const lines = [
          `Found ${summary.revertible_changes} undoable change(s):`,
          '',
          ...summary.recent_changes
            .slice(0, 10)
            .map((change, i) => `  ${i + 1}. ${change.description}`),
          '',
          'Use /undo to undo the most recent change.',
        ];
        result = lines.join('\n');
      }
    } else {
      // Treat args as a change ID to undo specific change
      const undoResult = await invoke<{
        success: boolean;
        change_id: string;
        change_type: string;
        path: string | null;
        message: string;
      }>('undo_change', { changeId: trimmedArgs });

      if (undoResult.success) {
        result = `Successfully undone: ${undoResult.message}`;
      } else {
        result = `Undo failed: ${undoResult.message}`;
      }
    }

    const duration = Date.now() - startTime;

    panel.content.terminal = {
      command: `/undo ${args}`.trim(),
      status: 'success',
      stdout: result,
      stderr: undefined,
      exitCode: 0,
      duration,
    };

    panel.metadata = {
      status: 'success',
      duration,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    panel.content.terminal = {
      command: `/undo ${args}`.trim(),
      status: 'error',
      stdout: '',
      stderr: `Undo error: ${errorMessage}`,
      exitCode: 1,
    };

    panel.metadata = {
      status: 'error',
    };
  }

  return panel;
}
