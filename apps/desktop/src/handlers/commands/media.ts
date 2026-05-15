import { invoke } from '../../lib/tauri-mock';
import type { InlinePanel } from '../../stores/chat/types';

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
