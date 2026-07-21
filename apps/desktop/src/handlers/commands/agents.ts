import { invoke } from '../../lib/tauri-mock';
import { useAppModeStore, selectPrivacyMode } from '../../stores/appModeStore';
import type { EnhancedMessage, InlinePanel } from '../../stores/chat/types';

const RECENT_CONVERSATION_SNAPSHOT_LIMIT = 40;
const MAX_SNAPSHOT_MESSAGE_CHARS = 12_000;

type BackgroundAgentCommandContext = {
  conversationId?: string | null;
  messages?: EnhancedMessage[];
  workingDirectory?: string | null;
  customInstructions?: string | null;
};

type BackgroundAgentMessageInput = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
};

function safeIsoTimestamp(value: Date): string {
  const time = value.getTime();
  return Number.isFinite(time) ? value.toISOString() : new Date().toISOString();
}

function buildConversationHistory(messages: EnhancedMessage[] = []): BackgroundAgentMessageInput[] {
  return messages
    .filter((message) => ['user', 'assistant', 'system'].includes(message.role))
    .filter((message) => message.content.trim().length > 0)
    .slice(-RECENT_CONVERSATION_SNAPSHOT_LIMIT)
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, MAX_SNAPSHOT_MESSAGE_CHARS),
      timestamp: safeIsoTimestamp(message.timestamp),
    }));
}

function parseAgentArgs(args: string): { command: string; rest: string } {
  const trimmed = args.trim();
  if (!trimmed) {
    return { command: 'list', rest: '' };
  }

  if (trimmed.startsWith('&')) {
    return { command: 'push', rest: trimmed.slice(1).trim() };
  }

  const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(trimmed);
  if (!match) {
    return { command: 'list', rest: '' };
  }

  return {
    command: match[1]!.toLowerCase(),
    rest: match[2]?.trim() ?? '',
  };
}

function requireAgentId(command: string, rest: string): string {
  const agentId = rest.split(/\s+/)[0]?.trim();
  if (!agentId) {
    throw new Error(`Usage: /agents ${command} <agent-id>`);
  }
  return agentId;
}

function createAgentPanel(status: 'loading' | 'success' | 'error', data: Record<string, unknown>) {
  return {
    id: `agent-${crypto.randomUUID()}`,
    type: 'agent',
    content: {
      data,
    },
    isCollapsed: false,
    timestamp: new Date(),
    metadata: {
      status,
    },
  } satisfies InlinePanel;
}

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
    // TRUST BOUNDARY (desktop-trust-boundary-01): swarm goals carry the
    // workspace's execution boundary; omitting it fails closed to Local.
    // The bare `{ goal }` payload this used to send did not even match the
    // command's `request: SwarmGoalRequest` argument.
    const response = await invoke<Record<string, unknown>>('swarm_execute_goal', {
      request: {
        goal,
        priority: null,
        trustMode: selectPrivacyMode(useAppModeStore.getState()),
      },
    });

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

export async function executeAgentsCommand(
  args: string,
  context: BackgroundAgentCommandContext = {},
): Promise<InlinePanel> {
  const panel = createAgentPanel('loading', { status: 'loading' });

  try {
    const { command, rest } = parseAgentArgs(args);
    let response: Record<string, unknown>;

    switch (command) {
      case 'list':
        response = await invoke<Record<string, unknown>>('background_agent_list');
        break;
      case 'active':
        response = {
          agents: await invoke<unknown[]>('background_agent_list_active'),
        };
        break;
      case 'stats':
        response = await invoke<Record<string, unknown>>('background_agent_stats');
        break;
      case 'cleanup':
        response = {
          cleanedUp: await invoke<number>('background_agent_cleanup'),
        };
        break;
      case 'get':
      case 'status':
      case 'show':
      case 'output': {
        const agentId = requireAgentId(command, rest);
        const agent = await invoke<unknown>('background_agent_get', { agentId });
        response = { agentId, agent };
        break;
      }
      case 'pause':
      case 'resume':
      case 'cancel': {
        const agentId = requireAgentId(command, rest);
        await invoke(`background_agent_${command}`, { agentId });
        response = { action: command, agentId, status: 'requested' };
        break;
      }
      case 'takeover':
      case 'take-over':
      case 'take_over': {
        const agentId = requireAgentId(command, rest);
        response = await invoke<Record<string, unknown>>('background_agent_take_over', { agentId });
        break;
      }
      case 'push':
      case 'start': {
        const goal = rest.trim();
        if (!goal) {
          throw new Error('Usage: /agents push <goal>');
        }
        if (!context.conversationId) {
          throw new Error('Cannot start a background agent without an active conversation.');
        }

        response = await invoke<Record<string, unknown>>('background_agent_push', {
          input: {
            conversationId: context.conversationId,
            goal,
            workingDirectory: context.workingDirectory ?? null,
            conversationHistory: buildConversationHistory(context.messages),
            activeMcpServers: [],
            customInstructions: context.customInstructions ?? null,
            priority: null,
            timeoutSecs: null,
          },
        });
        break;
      }
      default:
        throw new Error(
          'Usage: /agents [list|active|stats|push <goal>|status <agent-id>|output <agent-id>|pause <agent-id>|resume <agent-id>|cancel <agent-id>|takeover <agent-id>]',
        );
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
