import { invoke } from '../../lib/tauri-mock';
import type { InlinePanel } from '../../stores/chat/types';

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
