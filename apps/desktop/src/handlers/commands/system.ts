import { invoke } from '../../lib/tauri-mock';
import type { InlinePanel } from '../../stores/chat/types';
import { voiceTtsSpeak, speechStartRecording } from '../../api/voice';

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
      await voiceTtsSpeak(text);
      response = { status: 'speaking', text };
    } else {
      await speechStartRecording('cloud');
      response = { status: 'recording' };
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
      response = await invoke<Record<string, unknown>>('messaging_send', { channel, text });
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
