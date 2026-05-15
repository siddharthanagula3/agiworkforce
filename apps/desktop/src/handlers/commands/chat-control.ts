import { invoke } from '../../lib/tauri-mock';
import type { InlinePanel } from '../../stores/chat/types';

export async function executeCompactCommand(
  args: string,
  conversationId: number | null,
  userId: string | null,
): Promise<InlinePanel> {
  const panelId = `compact-${crypto.randomUUID()}`;

  const panel: InlinePanel = {
    id: panelId,
    type: 'terminal',
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

export async function executeUndoCommand(args: string): Promise<InlinePanel> {
  const panelId = `undo-${crypto.randomUUID()}`;

  const panel: InlinePanel = {
    id: panelId,
    type: 'terminal',
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
      text: lastMessage,
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

export async function executePlanCommand(description: string): Promise<InlinePanel> {
  const panelId = `plan-${crypto.randomUUID()}`;

  const { usePlanningStore } = await import('../../stores/planningStore');
  usePlanningStore.getState().openPanel(description || undefined);

  const panel: InlinePanel = {
    id: panelId,
    type: 'plan',
    content: {
      data: {
        title: 'Interactive Plan',
        description: description
          ? `Generating execution plan for: "${description.slice(0, 100)}${description.length > 100 ? '...' : ''}"`
          : 'Plan panel opened — enter a task description to generate steps.',
      },
    },
    isCollapsed: false,
    timestamp: new Date(),
    metadata: {
      status: description ? 'running' : 'completed',
    },
  };

  return panel;
}
