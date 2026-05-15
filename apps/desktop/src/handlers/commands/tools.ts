import { invoke, listen } from '../../lib/tauri-mock';
import type { InlinePanel } from '../../stores/chat/types';
import { useChatStore } from '../../stores/chat/chatStore';

export async function executeTerminalCommand(
  command: string,
  messageId?: string,
): Promise<InlinePanel> {
  const panelId = `terminal-${crypto.randomUUID()}`;
  const streamId = panelId;

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
      streamId,
    },
  };

  if (!messageId) {
    try {
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

  let stdoutBuffer = panel.content.terminal?.stdout ?? '';
  let stderrBuffer = panel.content.terminal?.stderr ?? '';

  const updatePanel = (updates: Partial<InlinePanel['content']>) => {
    useChatStore.getState().updateInlinePanel(messageId, panelId, updates);
  };

  const outputEvent = `terminal-output-${streamId}`;
  const exitEvent = `terminal-exit-${streamId}`;

  const outputUnlisten = await listen<{ stream?: string; data?: string }>(outputEvent, (event) => {
    const payload = event.payload;
    const chunk = typeof payload === 'string' ? payload : (payload?.data ?? '');
    const stream = typeof payload === 'string' ? 'stdout' : (payload?.stream ?? 'stdout');

    if (stream === 'stderr') {
      stderrBuffer += chunk;
    } else {
      stdoutBuffer += chunk;
    }

    updatePanel({
      terminal: {
        command,
        cwd: undefined,
        stdout: stdoutBuffer,
        stderr: stderrBuffer,
        status: 'running',
      },
    });
  });

  const exitUnlisten = await listen(exitEvent, () => {
    outputUnlisten?.();
    exitUnlisten?.();
  });

  void invoke<{
    stdout: string;
    stderr: string;
    exitCode: number | null;
    durationMs: number;
  }>('execute_terminal_command', {
    command,
    cwd: null,
    shell: null,
    streamId,
    emitEvents: true,
  })
    .then((response) => {
      const isSuccess = (response.exitCode ?? 0) === 0;
      stdoutBuffer = response.stdout;
      stderrBuffer = response.stderr;
      updatePanel({
        terminal: {
          command,
          cwd: undefined,
          stdout: stdoutBuffer,
          stderr: stderrBuffer,
          exitCode: response.exitCode ?? 0,
          duration: response.durationMs,
          status: isSuccess ? 'success' : 'error',
        },
      });
    })
    .catch((error) => {
      updatePanel({
        terminal: {
          command,
          cwd: undefined,
          stdout: stdoutBuffer,
          stderr: error instanceof Error ? error.message : String(error),
          exitCode: 1,
          status: 'error',
        },
      });
    })
    .finally(() => {
      outputUnlisten?.();
      exitUnlisten?.();
    });

  return panel;
}

export async function executeBrowserCommand(url: string): Promise<InlinePanel> {
  const panelId = `browser-${crypto.randomUUID()}`;

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

  let browserId: string | undefined;
  let tabId: string | undefined;
  try {
    browserId = await invoke<string>('browser_launch', {
      options: { headless: false },
    });
    tabId = await invoke<string>('browser_open_tab', { url });

    const title = await invoke<string>('browser_get_title', { tabId: tabId ?? '' });
    const screenshot = await invoke<string>('browser_screenshot', {
      tabId: tabId ?? '',
      selector: null,
    });

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
      tabId,
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
  } finally {
    if (tabId) {
      try {
        await invoke('browser_close_tab', { tabId });
      } catch {
        /* cleanup best-effort */
      }
    }
    if (browserId) {
      try {
        await invoke('browser_close', { browserId });
      } catch {
        /* cleanup best-effort */
      }
    }
  }

  return panel;
}

export async function executeCodeCommand(filePath: string): Promise<InlinePanel> {
  const panelId = `code-${crypto.randomUUID()}`;

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
    const response = await invoke<{
      content: string;
      language?: string;
    }>('file_read', { path: filePath });

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

export async function executeDatabaseCommand(query: string): Promise<InlinePanel> {
  const panelId = `database-${crypto.randomUUID()}`;

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
    const startTime = Date.now();
    const response = await invoke<{
      columns: string[];
      rows: unknown[][];
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
