import { invoke } from '../../lib/tauri-mock';
import type { InlinePanel } from '../../stores/chat/types';

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
      response = await invoke<Record<string, unknown>>('scheduler_add_job', {
        name: args.trim(),
        schedule: '0 0 9 * * *',
        actionType: 'agiTask',
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
