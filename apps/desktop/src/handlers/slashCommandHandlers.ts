/**
 * Slash Command Handlers
 *
 * Central hub for executing slash commands and returning inline panel data.
 * Each handler returns an InlinePanel with the command results.
 */

import { invoke, listen } from '../lib/tauri-mock';
import type { InlinePanel } from '../stores/chat/types';
import { useChatStore } from '../stores/chat/chatStore';

/**
 * Executes a shell command and returns results in an inline panel.
 * Handles the /run slash command in the chat interface.
 *
 * @param command - The shell command to execute (e.g., "ls -la", "npm install")
 * @returns An InlinePanel with terminal output, exit code, and execution duration
 *
 * @example
 * const panel = await executeTerminalCommand('git status');
 * // panel.content.terminal.stdout contains the command output
 */
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

/**
 * Launches a browser, navigates to a URL, and captures a screenshot.
 * Handles the /browse slash command for browser automation.
 *
 * @param url - The URL to navigate to (must be a valid URL)
 * @returns An InlinePanel with page title, screenshot, and navigation status
 *
 * @example
 * const panel = await executeBrowserCommand('https://example.com');
 * // panel.content.browser.screenshot contains base64 screenshot
 */
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

  try {
    // Launch browser, navigate to URL, get title and screenshot using individual commands
    const browserId = await invoke<string>('browser_launch', {
      options: { headless: false },
    });

    // Navigate to the URL
    await invoke<void>('browser_navigate', { browserId, url });

    // Get page title
    const title = await invoke<string>('browser_get_title', { browserId: browserId ?? '' });

    // Take screenshot
    const screenshot = await invoke<string>('browser_screenshot', {
      browserId: browserId ?? '',
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
 * Reads a source file and displays it with syntax highlighting.
 * Handles the /code slash command for viewing files in chat.
 *
 * @param filePath - Absolute path to the file to read
 * @returns An InlinePanel with file content, detected language, and modification status
 *
 * @example
 * const panel = await executeCodeCommand('/src/App.tsx');
 * // panel.content.code.language will be 'typescript'
 */
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
 * Executes a SQL query against the local database and displays results.
 * Handles the /db slash command for database operations.
 *
 * @param query - The SQL query to execute
 * @returns An InlinePanel with query results (columns, rows), execution time, or error
 *
 * @example
 * const panel = await executeDatabaseCommand('SELECT * FROM users LIMIT 10');
 * // panel.content.database.results.rows contains the query results
 */
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
    // Invoke Tauri command to execute database query
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

/**
 * Compacts conversation context to reduce token usage and improve performance.
 * Handles the /compact slash command for managing long conversations.
 *
 * @param args - Focus area for preservation: empty (default), "code", "decisions", or "errors"
 * @param conversationId - The database ID of the conversation to compact
 * @param userId - The authenticated user's ID for authorization
 * @returns An InlinePanel showing compaction results (tokens saved, messages compacted)
 *
 * @example
 * const panel = await executeCompactCommand('code', 123, 'user-uuid');
 * // panel.content.terminal.stdout shows "Savings: 45.2%"
 */
export async function executeCompactCommand(
  args: string,
  conversationId: number | null,
  userId: string | null,
): Promise<InlinePanel> {
  const panelId = `compact-${crypto.randomUUID()}`;

  const panel: InlinePanel = {
    id: panelId,
    type: 'terminal', // Use terminal panel to display results
    content: {
      terminal: {
        command: `/compact ${args}`.trim(),
        status: 'running',
        stdout: 'Analyzing context for compaction...',
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
    if (!conversationId || conversationId <= 0) {
      panel.content.terminal = {
        command: `/compact ${args}`.trim(),
        status: 'error',
        stdout: '',
        stderr: 'No active conversation. Start a conversation first.',
        exitCode: 1,
      };
      panel.metadata = { status: 'error' };
      return panel;
    }

    if (!userId) {
      panel.content.terminal = {
        command: `/compact ${args}`.trim(),
        status: 'error',
        stdout: '',
        stderr: 'Not signed in. Please sign in to use context compaction.',
        exitCode: 1,
      };
      panel.metadata = { status: 'error' };
      return panel;
    }

    const startTime = Date.now();
    const focus = args.trim().toLowerCase() || undefined;

    const response = await invoke<{
      messages_compacted: number;
      tokens_before: number;
      tokens_after: number;
      savings_percent: number;
      summary_created: boolean;
      focus: string | null;
      message: string;
    }>('chat_compact_context', {
      conversationId,
      focus,
      userId,
    });

    const duration = Date.now() - startTime;

    const lines = [
      response.message,
      '',
      `Messages compacted: ${response.messages_compacted}`,
      `Tokens before: ${response.tokens_before.toLocaleString()}`,
      `Tokens after: ${response.tokens_after.toLocaleString()}`,
      `Savings: ${response.savings_percent.toFixed(1)}%`,
    ];

    if (response.focus) {
      lines.push(`Focus area: ${response.focus}`);
    }

    if (response.summary_created) {
      lines.push('', 'A summary was created preserving key context.');
    }

    panel.content.terminal = {
      command: `/compact ${args}`.trim(),
      status: 'success',
      stdout: lines.join('\n'),
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
      command: `/compact ${args}`.trim(),
      status: 'error',
      stdout: '',
      stderr: `Context compaction failed: ${errorMessage}`,
      exitCode: 1,
    };

    panel.metadata = {
      status: 'error',
    };
  }

  return panel;
}

/**
 * Generates an image from a text prompt using the media_generate_image Tauri command.
 * Handles the /imagine slash command for AI image generation.
 *
 * @param prompt - The text description of the image to generate
 * @returns An InlinePanel with the generated image URL(s) or an error
 *
 * @example
 * const panel = await executeImagineCommand('a red fox in a snowy forest');
 * // panel.content.image.urls contains the generated image URLs
 */
export async function executeImagineCommand(prompt: string): Promise<InlinePanel> {
  const panelId = `image-${crypto.randomUUID()}`;

  const panel: InlinePanel = {
    id: panelId,
    type: 'image',
    content: {
      image: {
        prompt,
        status: 'loading',
        urls: undefined,
        provider: undefined,
        model: undefined,
      },
    },
    isCollapsed: false,
    timestamp: new Date(),
    metadata: {
      status: 'loading',
    },
  };

  if (!prompt.trim()) {
    panel.content.image = {
      prompt,
      status: 'error',
      error: 'Please provide a prompt after /imagine',
    };
    panel.metadata = { status: 'error' };
    return panel;
  }

  try {
    const startTime = Date.now();
    const response = await invoke<{
      images: Array<{ url?: string; b64_json?: string }>;
      provider: string;
      model?: string;
      latencyMs: number;
    }>('media_generate_image', {
      request: {
        prompt: prompt.trim(),
        n: 1,
      },
    });

    const latencyMs = Date.now() - startTime;
    const urls = response.images
      .map((img) => img.url ?? (img.b64_json ? `data:image/png;base64,${img.b64_json}` : undefined))
      .filter((u): u is string => Boolean(u));

    panel.content.image = {
      prompt,
      status: urls.length > 0 ? 'success' : 'error',
      urls,
      provider: response.provider,
      model: response.model,
      latencyMs,
      error: urls.length === 0 ? 'No images were returned' : undefined,
    };

    panel.metadata = {
      status: urls.length > 0 ? 'success' : 'error',
      duration: latencyMs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    panel.content.image = {
      prompt,
      status: 'error',
      error: errorMessage,
    };

    panel.metadata = {
      status: 'error',
    };
  }

  return panel;
}

/**
 * Reverts previous file or system changes made by the AI agent.
 * Handles the /undo slash command for safely reversing actions.
 *
 * @param args - What to undo: empty or "last" (most recent), "all" (list changes), or a change ID
 * @returns An InlinePanel with undo results or list of available changes
 *
 * @example
 * // Undo the last change
 * const panel = await executeUndoCommand('');
 *
 * // List all undoable changes
 * const panel = await executeUndoCommand('all');
 *
 * // Undo a specific change by ID
 * const panel = await executeUndoCommand('change-uuid-123');
 */
export async function executeUndoCommand(args: string): Promise<InlinePanel> {
  const panelId = `undo-${crypto.randomUUID()}`;

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

// ---------------------------------------------------------------------------
// New slash command handlers (swarm, vision, skills, memory, recall, agents,
// git, schedule, voice, think, docs, record, metrics, marketplace, desktop,
// ocr, notify, lsp, enhance, migrate, message, settings)
// ---------------------------------------------------------------------------

/**
 * Launches a swarm of parallel agents to achieve a high-level goal.
 * Handles the /swarm slash command for multi-agent task execution.
 *
 * @param goal - The high-level goal for the swarm to accomplish
 * @returns An InlinePanel with swarm execution status and results
 *
 * @example
 * const panel = await executeSwarmCommand('Refactor all components to use hooks');
 * // panel.content.data contains swarm status and agent results
 */
export async function executeSwarmCommand(goal: string): Promise<InlinePanel> {
  const panelId = `swarm-${crypto.randomUUID()}`;

  const panel: InlinePanel = {
    id: panelId,
    type: 'swarm',
    content: {
      data: { goal, status: 'running' },
    },
    isCollapsed: false,
    timestamp: new Date(),
    metadata: {
      status: 'running',
    },
  };

  try {
    const response = await invoke<Record<string, unknown>>('swarm_execute_goal', { goal });

    panel.content.data = { goal, ...response };
    panel.metadata = { status: 'success' };
  } catch (error) {
    panel.content.data = {
      goal,
      error: error instanceof Error ? error.message : String(error),
    };
    panel.metadata = { status: 'error' };
  }

  return panel;
}

/**
 * Captures or analyzes an image using computer vision.
 * Handles the /vision slash command for screen capture and image analysis.
 *
 * @param args - Empty to capture the screen, or a file path to analyze a specific image
 * @returns An InlinePanel with vision analysis results
 *
 * @example
 * // Capture and analyze the current screen
 * const panel = await executeVisionCommand('');
 *
 * // Analyze a specific image file
 * const panel = await executeVisionCommand('/path/to/image.png');
 */
export async function executeVisionCommand(args: string): Promise<InlinePanel> {
  const panelId = `vision-${crypto.randomUUID()}`;

  const panel: InlinePanel = {
    id: panelId,
    type: 'vision',
    content: {
      data: { status: 'running' },
    },
    isCollapsed: false,
    timestamp: new Date(),
    metadata: {
      status: 'running',
    },
  };

  try {
    let response: Record<string, unknown>;

    if (!args.trim()) {
      response = await invoke<Record<string, unknown>>('vision_analyze_screenshot');
    } else {
      response = await invoke<Record<string, unknown>>('vision_analyze_screenshot', {
        path: args.trim(),
      });
    }

    panel.content.data = { ...response };
    panel.metadata = { status: 'success' };
  } catch (error) {
    panel.content.data = {
      error: error instanceof Error ? error.message : String(error),
    };
    panel.metadata = { status: 'error' };
  }

  return panel;
}

/**
 * Lists all available AI skills or retrieves details for a specific skill.
 * Handles the /skills slash command for skill discovery and inspection.
 *
 * @param args - Empty to list all skills, or a skill name to get its details
 * @returns An InlinePanel with the skill list or individual skill data
 *
 * @example
 * // List all available skills
 * const panel = await executeSkillsCommand('');
 *
 * // Get details for a specific skill
 * const panel = await executeSkillsCommand('code-review');
 */
export async function executeSkillsCommand(args: string): Promise<InlinePanel> {
  const panelId = `skill-${crypto.randomUUID()}`;

  const panel: InlinePanel = {
    id: panelId,
    type: 'skill',
    content: {
      data: { status: 'loading' },
    },
    isCollapsed: false,
    timestamp: new Date(),
    metadata: {
      status: 'loading',
    },
  };

  try {
    let response: Record<string, unknown>;

    if (!args.trim()) {
      response = await invoke<Record<string, unknown>>('skill_list');
    } else {
      response = await invoke<Record<string, unknown>>('skill_get', { name: args.trim() });
    }

    panel.content.data = { ...response };
    panel.metadata = { status: 'success' };
  } catch (error) {
    panel.content.data = {
      error: error instanceof Error ? error.message : String(error),
    };
    panel.metadata = { status: 'error' };
  }

  return panel;
}

/**
 * Searches, saves, or retrieves entries from the project memory store.
 * Handles the /memory slash command for persistent context management.
 *
 * @param args - "search <query>", "save <context>", or empty to retrieve all contexts
 * @returns An InlinePanel with the matching or stored memory entries
 *
 * @example
 * const panel = await executeMemoryCommand('search authentication');
 * const panel = await executeMemoryCommand('save User prefers TypeScript strict mode');
 * const panel = await executeMemoryCommand('');
 */
export async function executeMemoryCommand(args: string): Promise<InlinePanel> {
  const panelId = `memory-${crypto.randomUUID()}`;

  const panel: InlinePanel = {
    id: panelId,
    type: 'memory',
    content: {
      data: { status: 'loading' },
    },
    isCollapsed: false,
    timestamp: new Date(),
    metadata: {
      status: 'loading',
    },
  };

  try {
    const trimmed = args.trim();
    let response: Record<string, unknown>;

    if (trimmed.toLowerCase().startsWith('search ')) {
      const query = trimmed.slice('search '.length).trim();
      response = await invoke<Record<string, unknown>>('search_project_memories', { query });
    } else if (trimmed.toLowerCase().startsWith('save ')) {
      const context = trimmed.slice('save '.length).trim();
      response = await invoke<Record<string, unknown>>('save_project_context', { context });
    } else {
      response = await invoke<Record<string, unknown>>('get_project_memories');
    }

    panel.content.data = { ...response };
    panel.metadata = { status: 'success' };
  } catch (error) {
    panel.content.data = {
      error: error instanceof Error ? error.message : String(error),
    };
    panel.metadata = { status: 'error' };
  }

  return panel;
}

/**
 * Searches chat history for memories related to a given topic.
 * Handles the /recall slash command for retrieving past context.
 *
 * @param topic - The topic or keywords to search for in memory
 * @returns An InlinePanel with up to 5 matching memory entries
 *
 * @example
 * const panel = await executeRecallCommand('database schema decisions');
 */
export async function executeRecallCommand(topic: string): Promise<InlinePanel> {
  const panelId = `memory-${crypto.randomUUID()}`;

  const panel: InlinePanel = {
    id: panelId,
    type: 'memory',
    content: {
      data: { topic, status: 'loading' },
    },
    isCollapsed: false,
    timestamp: new Date(),
    metadata: {
      status: 'loading',
    },
  };

  try {
    const response = await invoke<Record<string, unknown>>('chat_search_memories', {
      query: topic,
      limit: 5,
    });

    panel.content.data = { topic, ...response };
    panel.metadata = { status: 'success' };
  } catch (error) {
    panel.content.data = {
      topic,
      error: error instanceof Error ? error.message : String(error),
    };
    panel.metadata = { status: 'error' };
  }

  return panel;
}

/**
 * Lists background agents or pushes a new goal to a background agent.
 * Handles the /agents slash command for background agent management.
 *
 * @param args - "push <goal>" to start an agent, or empty to list active agents
 * @returns An InlinePanel with agent list or newly started agent data
 *
 * @example
 * const panel = await executeAgentsCommand('push Monitor logs and alert on errors');
 * const panel = await executeAgentsCommand('');
 */
export async function executeAgentsCommand(args: string): Promise<InlinePanel> {
  const panelId = `agent-${crypto.randomUUID()}`;

  const panel: InlinePanel = {
    id: panelId,
    type: 'agent',
    content: {
      data: { status: 'loading' },
    },
    isCollapsed: false,
    timestamp: new Date(),
    metadata: {
      status: 'loading',
    },
  };

  try {
    const trimmed = args.trim();
    let response: Record<string, unknown>;

    if (trimmed.toLowerCase().startsWith('push ')) {
      const goal = trimmed.slice('push '.length).trim();
      response = await invoke<Record<string, unknown>>('background_agent_push', { goal });
    } else {
      response = await invoke<Record<string, unknown>>('background_agent_list');
    }

    panel.content.data = { ...response };
    panel.metadata = { status: 'success' };
  } catch (error) {
    panel.content.data = {
      error: error instanceof Error ? error.message : String(error),
    };
    panel.metadata = { status: 'error' };
  }

  return panel;
}

/**
 * Runs git operations (status, diff, commit, log) via the Tauri backend.
 * Handles the /git slash command for repository management in chat.
 *
 * @param args - "status", "diff", "commit <msg>", "log", or empty (defaults to status)
 * @returns An InlinePanel with the git command output
 *
 * @example
 * const panel = await executeGitCommand('status');
 * const panel = await executeGitCommand('commit fix: resolve typo in README');
 * const panel = await executeGitCommand('log');
 */
export async function executeGitCommand(args: string): Promise<InlinePanel> {
  const panelId = `git-${crypto.randomUUID()}`;

  const panel: InlinePanel = {
    id: panelId,
    type: 'git',
    content: {
      data: { status: 'loading' },
    },
    isCollapsed: false,
    timestamp: new Date(),
    metadata: {
      status: 'loading',
    },
  };

  try {
    const trimmed = args.trim().toLowerCase();
    let response: Record<string, unknown>;

    if (trimmed === 'diff') {
      response = await invoke<Record<string, unknown>>('git_diff');
    } else if (trimmed.startsWith('commit ')) {
      const msg = args.trim().slice('commit '.length).trim();
      response = await invoke<Record<string, unknown>>('git_commit', { message: msg, path: '.' });
    } else if (trimmed === 'log') {
      response = await invoke<Record<string, unknown>>('git_log', { path: '.' });
    } else {
      // Default: "status" or empty
      response = await invoke<Record<string, unknown>>('git_status', { path: '.' });
    }

    panel.content.data = { ...response };
    panel.metadata = { status: 'success' };
  } catch (error) {
    panel.content.data = {
      error: error instanceof Error ? error.message : String(error),
    };
    panel.metadata = { status: 'error' };
  }

  return panel;
}

/**
 * Lists or creates scheduled tasks via the proactive scheduler.
 * Handles the /schedule slash command for task automation.
 *
 * @param args - Empty to list current tasks, or a description to create a new task
 * @returns An InlinePanel with the task list or the newly created task
 *
 * @example
 * const panel = await executeScheduleCommand('');
 * const panel = await executeScheduleCommand('Run daily test suite at 9 AM');
 */
export async function executeScheduleCommand(args: string): Promise<InlinePanel> {
  const panelId = `schedule-${crypto.randomUUID()}`;

  const panel: InlinePanel = {
    id: panelId,
    type: 'schedule',
    content: {
      data: { status: 'loading' },
    },
    isCollapsed: false,
    timestamp: new Date(),
    metadata: {
      status: 'loading',
    },
  };

  try {
    let response: Record<string, unknown>;

    if (!args.trim()) {
      response = await invoke<Record<string, unknown>>('scheduler_list_jobs');
    } else {
      // Rust expects: name (String), schedule (Value), actionType (Option<String>), prompt (Option<String>)
      response = await invoke<Record<string, unknown>>('scheduler_add_job', {
        name: args.trim(),
        schedule: '0 0 9 * * *', // default: daily at 9 AM
        actionType: 'agi_task',
        prompt: args.trim(),
      });
    }

    panel.content.data = { ...response };
    panel.metadata = { status: 'success' };
  } catch (error) {
    panel.content.data = {
      error: error instanceof Error ? error.message : String(error),
    };
    panel.metadata = { status: 'error' };
  }

  return panel;
}

/**
 * Synthesizes speech from text or starts voice input recording.
 * Handles the /voice slash command for audio interactions.
 *
 * @param args - "tts <text>" to synthesize speech, or empty to start voice input
 * @returns An InlinePanel with voice synthesis or recording status
 *
 * @example
 * const panel = await executeVoiceCommand('tts Hello, how can I help you today?');
 * const panel = await executeVoiceCommand('');
 */
export async function executeVoiceCommand(args: string): Promise<InlinePanel> {
  const panelId = `voice-${crypto.randomUUID()}`;

  const panel: InlinePanel = {
    id: panelId,
    type: 'voice',
    content: {
      data: { status: 'loading' },
    },
    isCollapsed: false,
    timestamp: new Date(),
    metadata: {
      status: 'loading',
    },
  };

  try {
    const trimmed = args.trim();
    let response: Record<string, unknown>;

    if (trimmed.toLowerCase().startsWith('tts ')) {
      const text = trimmed.slice('tts '.length).trim();
      response = await invoke<Record<string, unknown>>('voice_tts_speak', { text });
    } else {
      // No args — trigger voice input recording
      response = await invoke<Record<string, unknown>>('speech_start_recording');
    }

    panel.content.data = { ...response };
    panel.metadata = { status: 'success' };
  } catch (error) {
    panel.content.data = {
      error: error instanceof Error ? error.message : String(error),
    };
    panel.metadata = { status: 'error' };
  }

  return panel;
}

/**
 * Toggles extended thinking mode or sets a thinking token budget.
 * Handles the /think slash command for controlling reasoning depth.
 *
 * @param args - "budget <n>" to set the token budget, or empty to toggle extended thinking
 * @returns An InlinePanel (terminal style) with the updated thinking configuration
 *
 * @example
 * const panel = await executeThinkCommand('budget 10000');
 * const panel = await executeThinkCommand('');
 */
export async function executeThinkCommand(args: string): Promise<InlinePanel> {
  const panelId = `think-${crypto.randomUUID()}`;
  const command = `/think ${args}`.trim();

  const panel: InlinePanel = {
    id: panelId,
    type: 'terminal',
    content: {
      terminal: {
        command,
        status: 'running',
        stdout: 'Updating thinking configuration...',
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
    const trimmed = args.trim().toLowerCase();
    let result: string;

    if (trimmed.startsWith('budget ')) {
      const budgetStr = trimmed.slice('budget '.length).trim();
      const budget = parseInt(budgetStr, 10);

      if (isNaN(budget) || budget < 0) {
        throw new Error(`Invalid budget value: "${budgetStr}". Must be a non-negative integer.`);
      }

      await invoke<void>('settings_v2_set', {
        key: 'thinking_budget',
        value: String(budget),
      });

      result = `Thinking budget set to ${budget.toLocaleString()} tokens.`;
    } else {
      // Toggle extended thinking on/off
      const currentRaw = await invoke<string | boolean>('settings_v2_get', {
        key: 'extended_thinking',
      });

      const current =
        typeof currentRaw === 'boolean' ? currentRaw : String(currentRaw).toLowerCase() === 'true';
      const next = !current;

      await invoke<void>('settings_v2_set', {
        key: 'extended_thinking',
        value: String(next),
      });

      result = `Extended thinking ${next ? 'enabled' : 'disabled'}.`;
    }

    const duration = Date.now() - startTime;

    panel.content.terminal = {
      command,
      status: 'success',
      stdout: result,
      stderr: undefined,
      exitCode: 0,
      duration,
    };

    panel.metadata = { status: 'success', duration };
  } catch (error) {
    panel.content.terminal = {
      command,
      status: 'error',
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: 1,
    };

    panel.metadata = { status: 'error' };
  }

  return panel;
}

/**
 * Generates a document (PDF, DOCX, or XLSX) from the current conversation context.
 * Handles the /docs slash command for document export.
 *
 * @param args - The content or filename; format is detected from extension (.pdf/.docx/.xlsx)
 * @returns An InlinePanel (terminal style) with the generated document path
 *
 * @example
 * const panel = await executeDocsCommand('report.pdf');
 * const panel = await executeDocsCommand('summary.docx');
 * const panel = await executeDocsCommand('data.xlsx');
 */
export async function executeDocsCommand(args: string): Promise<InlinePanel> {
  const panelId = `docs-${crypto.randomUUID()}`;
  const command = `/docs ${args}`.trim();

  const panel: InlinePanel = {
    id: panelId,
    type: 'terminal',
    content: {
      terminal: {
        command,
        status: 'running',
        stdout: 'Generating document...',
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
    let response: Record<string, unknown>;
    let format: string;

    if (trimmedArgs.endsWith('.docx') || trimmedArgs.includes('docx')) {
      response = await invoke<Record<string, unknown>>('document_create_word', {
        content: args.trim(),
      });
      format = 'DOCX';
    } else if (trimmedArgs.endsWith('.xlsx') || trimmedArgs.includes('xlsx')) {
      response = await invoke<Record<string, unknown>>('document_create_excel', {
        content: args.trim(),
      });
      format = 'XLSX';
    } else {
      // Default: PDF
      response = await invoke<Record<string, unknown>>('document_create_pdf', {
        content: args.trim(),
      });
      format = 'PDF';
    }

    const duration = Date.now() - startTime;
    const outputPath = (response['path'] as string | undefined) ?? 'document';

    panel.content.terminal = {
      command,
      status: 'success',
      stdout: `${format} generated successfully.\nOutput: ${outputPath}`,
      stderr: undefined,
      exitCode: 0,
      duration,
    };

    panel.metadata = { status: 'success', duration };
  } catch (error) {
    panel.content.terminal = {
      command,
      status: 'error',
      stdout: '',
      stderr: `Document generation failed: ${error instanceof Error ? error.message : String(error)}`,
      exitCode: 1,
    };

    panel.metadata = { status: 'error' };
  }

  return panel;
}

/**
 * Starts or stops desktop automation recording.
 * Handles the /record slash command for capturing UI action sequences.
 *
 * @param args - "stop" to end the current recording, or empty to start a new one
 * @returns An InlinePanel (terminal style) with the recording status
 *
 * @example
 * const panel = await executeRecordCommand('');    // start
 * const panel = await executeRecordCommand('stop'); // stop
 */
export async function executeRecordCommand(args: string): Promise<InlinePanel> {
  const panelId = `record-${crypto.randomUUID()}`;
  const command = `/record ${args}`.trim();

  const panel: InlinePanel = {
    id: panelId,
    type: 'terminal',
    content: {
      terminal: {
        command,
        status: 'running',
        stdout: 'Processing recording request...',
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
    const trimmed = args.trim().toLowerCase();
    let response: Record<string, unknown>;
    let resultText: string;

    if (trimmed === 'stop') {
      response = await invoke<Record<string, unknown>>('automation_record_stop');
      resultText =
        `Recording stopped.\n${(response['message'] as string | undefined) ?? ''}`.trim();
    } else {
      response = await invoke<Record<string, unknown>>('automation_record_start');
      resultText =
        `Recording started.\n${(response['message'] as string | undefined) ?? ''}`.trim();
    }

    const duration = Date.now() - startTime;

    panel.content.terminal = {
      command,
      status: 'success',
      stdout: resultText,
      stderr: undefined,
      exitCode: 0,
      duration,
    };

    panel.metadata = { status: 'success', duration };
  } catch (error) {
    panel.content.terminal = {
      command,
      status: 'error',
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: 1,
    };

    panel.metadata = { status: 'error' };
  }

  return panel;
}

/**
 * Fetches aggregated usage metrics (tokens, cost, requests) from the backend.
 * Handles the /metrics slash command for monitoring resource consumption.
 *
 * @returns An InlinePanel (terminal style) with formatted usage statistics
 *
 * @example
 * const panel = await executeMetricsCommand();
 * // panel.content.terminal.stdout contains formatted usage stats
 */
export async function executeMetricsCommand(): Promise<InlinePanel> {
  const panelId = `metrics-${crypto.randomUUID()}`;

  const panel: InlinePanel = {
    id: panelId,
    type: 'terminal',
    content: {
      terminal: {
        command: '/metrics',
        status: 'running',
        stdout: 'Fetching usage metrics...',
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
    const response = await invoke<Record<string, unknown>>('metrics_get_system');
    const duration = Date.now() - startTime;

    const lines: string[] = ['=== Usage Metrics ===', ''];

    for (const [key, value] of Object.entries(response)) {
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      lines.push(`${label}: ${String(value)}`);
    }

    panel.content.terminal = {
      command: '/metrics',
      status: 'success',
      stdout: lines.join('\n'),
      stderr: undefined,
      exitCode: 0,
      duration,
    };

    panel.metadata = { status: 'success', duration };
  } catch (error) {
    panel.content.terminal = {
      command: '/metrics',
      status: 'error',
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: 1,
    };

    panel.metadata = { status: 'error' };
  }

  return panel;
}

/**
 * Browses or installs workflow templates from the AGI Workforce marketplace.
 * Handles the /marketplace slash command for workflow discovery and installation.
 *
 * @param args - "install <id>" to install a workflow, or empty to list featured workflows
 * @returns An InlinePanel with marketplace listings or installation result
 *
 * @example
 * const panel = await executeMarketplaceCommand('');
 * const panel = await executeMarketplaceCommand('install daily-standup-bot');
 */
export async function executeMarketplaceCommand(args: string): Promise<InlinePanel> {
  const panelId = `marketplace-${crypto.randomUUID()}`;

  const panel: InlinePanel = {
    id: panelId,
    type: 'marketplace',
    content: {
      data: { status: 'loading' },
    },
    isCollapsed: false,
    timestamp: new Date(),
    metadata: {
      status: 'loading',
    },
  };

  try {
    const trimmed = args.trim();
    let response: Record<string, unknown>;

    if (trimmed.toLowerCase().startsWith('install ')) {
      const workflowId = trimmed.slice('install '.length).trim();
      response = await invoke<Record<string, unknown>>('clone_marketplace_workflow', {
        id: workflowId,
      });
    } else {
      response = await invoke<Record<string, unknown>>('search_marketplace_workflows');
    }

    panel.content.data = { ...response };
    panel.metadata = { status: 'success' };
  } catch (error) {
    panel.content.data = {
      error: error instanceof Error ? error.message : String(error),
    };
    panel.metadata = { status: 'error' };
  }

  return panel;
}

/**
 * Opens the computer-use (desktop automation) sidecar panel.
 * Handles the /desktop slash command for autonomous desktop control.
 *
 * @returns An InlinePanel (terminal style) indicating the sidecar is opening
 *
 * @example
 * const panel = await executeDesktopCommand();
 */
export async function executeDesktopCommand(): Promise<InlinePanel> {
  const panelId = `desktop-${crypto.randomUUID()}`;

  const panel: InlinePanel = {
    id: panelId,
    type: 'terminal',
    content: {
      terminal: {
        command: '/desktop',
        status: 'success',
        stdout: 'Opening computer use panel...',
        stderr: undefined,
        exitCode: 0,
        duration: 0,
      },
    },
    isCollapsed: false,
    timestamp: new Date(),
    metadata: {
      status: 'success',
    },
  };

  return panel;
}

/**
 * Captures the screen and extracts text using OCR.
 * Handles the /ocr slash command for text recognition from screen or image.
 *
 * @param args - An optional file path; when empty the full screen is captured
 * @returns An InlinePanel with the extracted text from the OCR operation
 *
 * @example
 * const panel = await executeOCRCommand('');
 * // panel.content.data.text contains extracted text
 */
export async function executeOCRCommand(args: string): Promise<InlinePanel> {
  const panelId = `vision-${crypto.randomUUID()}`;

  const panel: InlinePanel = {
    id: panelId,
    type: 'vision',
    content: {
      data: { status: 'running' },
    },
    isCollapsed: false,
    timestamp: new Date(),
    metadata: {
      status: 'running',
    },
  };

  try {
    const response = await invoke<Record<string, unknown>>('ocr_process_image', {
      path: args.trim() || null,
    });

    panel.content.data = { ...response };
    panel.metadata = { status: 'success' };
  } catch (error) {
    panel.content.data = {
      error: error instanceof Error ? error.message : String(error),
    };
    panel.metadata = { status: 'error' };
  }

  return panel;
}

/**
 * Lists recent notifications or clears them all.
 * Handles the /notify slash command for notification management.
 *
 * @param args - "clear" to dismiss all notifications, or empty to list recent ones
 * @returns An InlinePanel (terminal style) with notification data
 *
 * @example
 * const panel = await executeNotifyCommand('');
 * const panel = await executeNotifyCommand('clear');
 */
export async function executeNotifyCommand(args: string): Promise<InlinePanel> {
  const panelId = `notify-${crypto.randomUUID()}`;
  const command = `/notify ${args}`.trim();

  const panel: InlinePanel = {
    id: panelId,
    type: 'terminal',
    content: {
      terminal: {
        command,
        status: 'running',
        stdout: 'Processing notification request...',
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
    const trimmed = args.trim().toLowerCase();
    let response: Record<string, unknown>;
    let resultText: string;

    if (trimmed === 'clear') {
      response = await invoke<Record<string, unknown>>('notification_cancel_all');
      resultText =
        `All notifications cleared.\n${(response['message'] as string | undefined) ?? ''}`.trim();
    } else {
      response = await invoke<Record<string, unknown>>('notification_list');
      const items = response['notifications'] as unknown[] | undefined;

      if (Array.isArray(items) && items.length > 0) {
        resultText = `Recent notifications (${items.length}):\n\n${items.map((n) => String(n)).join('\n')}`;
      } else {
        resultText = 'No recent notifications.';
      }
    }

    const duration = Date.now() - startTime;

    panel.content.terminal = {
      command,
      status: 'success',
      stdout: resultText,
      stderr: undefined,
      exitCode: 0,
      duration,
    };

    panel.metadata = { status: 'success', duration };
  } catch (error) {
    panel.content.terminal = {
      command,
      status: 'error',
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: 1,
    };

    panel.metadata = { status: 'error' };
  }

  return panel;
}

/**
 * Queries the Language Server Protocol for symbol search or diagnostics.
 * Handles the /lsp slash command for IDE-like code intelligence in chat.
 *
 * @param args - "symbols <query>" to search symbols, or "diagnostics" to list errors/warnings
 * @returns An InlinePanel with LSP query results
 *
 * @example
 * const panel = await executeLSPCommand('symbols InlinePanel');
 * const panel = await executeLSPCommand('diagnostics');
 */
export async function executeLSPCommand(args: string): Promise<InlinePanel> {
  const panelId = `lsp-${crypto.randomUUID()}`;

  const panel: InlinePanel = {
    id: panelId,
    type: 'lsp',
    content: {
      data: { status: 'loading' },
    },
    isCollapsed: false,
    timestamp: new Date(),
    metadata: {
      status: 'loading',
    },
  };

  try {
    const trimmed = args.trim();
    let response: Record<string, unknown>;

    if (trimmed.toLowerCase().startsWith('symbols ')) {
      const query = trimmed.slice('symbols '.length).trim();
      response = await invoke<Record<string, unknown>>('lsp_workspace_symbol', { query });
    } else {
      // "diagnostics" subcommand, or default when no recognised subcommand
      response = await invoke<Record<string, unknown>>('lsp_get_diagnostics');
    }

    panel.content.data = { ...response };
    panel.metadata = { status: 'success' };
  } catch (error) {
    panel.content.data = {
      error: error instanceof Error ? error.message : String(error),
    };
    panel.metadata = { status: 'error' };
  }

  return panel;
}

/**
 * Enhances a prompt using AI rewriting for better clarity and specificity.
 * Handles the /enhance slash command for improving the last user message.
 *
 * @param lastMessage - The raw prompt text to enhance
 * @returns An InlinePanel (terminal style) with the enhanced prompt text
 *
 * @example
 * const panel = await executeEnhanceCommand('make a login form');
 * // panel.content.terminal.stdout contains the improved prompt
 */
export async function executeEnhanceCommand(lastMessage: string): Promise<InlinePanel> {
  const panelId = `enhance-${crypto.randomUUID()}`;
  const command = '/enhance';

  const panel: InlinePanel = {
    id: panelId,
    type: 'terminal',
    content: {
      terminal: {
        command,
        status: 'running',
        stdout: 'Enhancing prompt...',
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
    const response = await invoke<Record<string, unknown>>('enhance_prompt', {
      prompt: lastMessage,
    });

    const duration = Date.now() - startTime;
    const enhanced =
      (response['enhanced_prompt'] as string | undefined) ??
      String(Object.values(response)[0] ?? '');

    panel.content.terminal = {
      command,
      status: 'success',
      stdout: `Enhanced prompt:\n\n${enhanced}`,
      stderr: undefined,
      exitCode: 0,
      duration,
    };

    panel.metadata = { status: 'success', duration };
  } catch (error) {
    panel.content.terminal = {
      command,
      status: 'error',
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: 1,
    };

    panel.metadata = { status: 'error' };
  }

  return panel;
}

/**
 * Opens the data migration wizard sidecar.
 * Handles the /migrate slash command to guide users through schema migration flows.
 *
 * @returns An InlinePanel (terminal style) indicating the wizard is opening
 *
 * @example
 * const panel = await executeMigrateCommand();
 */
export async function executeMigrateCommand(): Promise<InlinePanel> {
  const panelId = `migrate-${crypto.randomUUID()}`;

  const panel: InlinePanel = {
    id: panelId,
    type: 'terminal',
    content: {
      terminal: {
        command: '/migrate',
        status: 'success',
        stdout: 'Opening migration wizard...',
        stderr: undefined,
        exitCode: 0,
        duration: 0,
      },
    },
    isCollapsed: false,
    timestamp: new Date(),
    metadata: {
      status: 'success',
    },
  };

  return panel;
}

/**
 * Sends a message via Slack (to a channel) or email (to an address).
 * Handles the /message slash command for cross-platform messaging.
 *
 * @param args - "slack #channel <text>" or "email user@example.com <text>"
 * @returns An InlinePanel (terminal style) with the delivery status
 *
 * @example
 * const panel = await executeMessageCommand('slack #general Hello team!');
 * const panel = await executeMessageCommand('email alice@example.com Subject line here');
 */
export async function executeMessageCommand(args: string): Promise<InlinePanel> {
  const panelId = `message-${crypto.randomUUID()}`;
  const command = `/message ${args}`.trim();

  const panel: InlinePanel = {
    id: panelId,
    type: 'terminal',
    content: {
      terminal: {
        command,
        status: 'running',
        stdout: 'Sending message...',
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
    const trimmed = args.trim();
    let response: Record<string, unknown>;
    let resultText: string;

    const slackMatch = /^slack\s+(#[\w-]+)\s+(.+)$/i.exec(trimmed);
    const emailMatch = /^email\s+([\w.+-]+@[\w.-]+\.\w+)\s+(.+)$/i.exec(trimmed);

    if (slackMatch) {
      const [, channel, text] = slackMatch;
      // TODO: Verify 'slack_send_message' exists on the Rust side before renaming
      response = await invoke<Record<string, unknown>>('slack_send_message', { channel, text });
      resultText =
        `Message sent to ${channel ?? 'channel'}.\n${(response['message'] as string | undefined) ?? ''}`.trim();
    } else if (emailMatch) {
      const [, to, subject] = emailMatch;
      response = await invoke<Record<string, unknown>>('email_send_message', { to, subject });
      resultText =
        `Email sent to ${to ?? 'recipient'}.\n${(response['message'] as string | undefined) ?? ''}`.trim();
    } else {
      throw new Error(
        'Invalid format. Use "slack #channel <text>" or "email user@example.com <text>".',
      );
    }

    const duration = Date.now() - startTime;

    panel.content.terminal = {
      command,
      status: 'success',
      stdout: resultText,
      stderr: undefined,
      exitCode: 0,
      duration,
    };

    panel.metadata = { status: 'success', duration };
  } catch (error) {
    panel.content.terminal = {
      command,
      status: 'error',
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: 1,
    };

    panel.metadata = { status: 'error' };
  }

  return panel;
}

/**
 * Updates a single settings key-value pair in the application configuration.
 * Handles the /settings slash command for in-chat configuration changes.
 *
 * @param args - A string in the form "key value" (first token is the key, rest is the value)
 * @returns An InlinePanel (terminal style) confirming the settings update
 *
 * @example
 * const panel = await executeSettingsCommand('theme dark');
 * const panel = await executeSettingsCommand('max_tokens 4096');
 */
export async function executeSettingsCommand(args: string): Promise<InlinePanel> {
  const panelId = `settings-${crypto.randomUUID()}`;
  const command = `/settings ${args}`.trim();

  const panel: InlinePanel = {
    id: panelId,
    type: 'terminal',
    content: {
      terminal: {
        command,
        status: 'running',
        stdout: 'Updating settings...',
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
    const trimmed = args.trim();

    if (!trimmed) {
      throw new Error('Usage: /settings <key> <value>');
    }

    const spaceIdx = trimmed.indexOf(' ');

    if (spaceIdx === -1) {
      throw new Error('Usage: /settings <key> <value>  (value is required)');
    }

    const key = trimmed.slice(0, spaceIdx).trim();
    const value = trimmed.slice(spaceIdx + 1).trim();

    await invoke<void>('settings_v2_set', { key, value });

    const duration = Date.now() - startTime;

    panel.content.terminal = {
      command,
      status: 'success',
      stdout: `Setting updated: ${key} = ${value}`,
      stderr: undefined,
      exitCode: 0,
      duration,
    };

    panel.metadata = { status: 'success', duration };
  } catch (error) {
    panel.content.terminal = {
      command,
      status: 'error',
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      exitCode: 1,
    };

    panel.metadata = { status: 'error' };
  }

  return panel;
}

/**
 * Attempts to redo the last undone action.
 * Handles the /redo slash command for re-applying a previously undone change.
 *
 * @returns An InlinePanel (terminal style) with a "not yet available" notice
 *
 * @example
 * const panel = await executeRedoCommand();
 */
export async function executeRedoCommand(): Promise<InlinePanel> {
  const panelId = `redo-${crypto.randomUUID()}`;

  const panel: InlinePanel = {
    id: panelId,
    type: 'terminal',
    content: {
      terminal: {
        command: '/redo',
        status: 'error',
        stdout: '',
        stderr: 'Redo is not yet available. The undo system does not maintain a redo stack.',
        exitCode: 1,
      },
    },
    isCollapsed: false,
    timestamp: new Date(),
    metadata: {
      status: 'error',
    },
  };

  return panel;
}
