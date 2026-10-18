import { AGENT_EVENT_SCHEMA_VERSION } from '@agiworkforce/types';
import type { AgentEvent, AgentEventEnvelope } from '@agiworkforce/types/protocol';
import type { AgentActivityState } from '@agiworkforce/client-runtime';
import type { AgentLoopStep } from './agentLoop';
import { t } from '../../i18n';

const MAX_STEP_OUTPUT_CHARS = 160;

const READ_ONLY_STEP_TOOLS: ReadonlySet<string> = new Set([
  'read_dom',
  'find',
  'screenshot',
  'read_console',
  'read_network',
  'list_tabs',
  'discover_site_tools',
]);

export type BrowserRunState = 'running' | 'paused' | 'completed' | 'cancelled' | 'failed';

export function browserActivityTurnId(messageId: string): string {
  return `browser:${messageId}`;
}

export function browserActivityEnvelope(
  activity: AgentActivityState | undefined,
  messageId: string,
  event: AgentEvent,
  emittedAtMs = Date.now(),
): AgentEventEnvelope {
  const turnId = browserActivityTurnId(messageId);
  const continues = activity?.sessionId === turnId && activity.turnId === turnId;
  return {
    schemaVersion: AGENT_EVENT_SCHEMA_VERSION,
    sessionId: turnId,
    turnId,
    sequence: continues ? activity.lastSequence + 1 : 0,
    emittedAtMs,
    event,
  };
}

function hostOf(url: unknown): string {
  if (typeof url !== 'string') return '';
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

export function describeBrowserStep(toolName: string, args: Record<string, unknown> = {}): string {
  switch (toolName) {
    case 'read_dom':
    case 'find':
      return t('spBrowserStepReading');
    case 'screenshot':
      return t('spBrowserStepScreenshot');
    case 'click':
      return t('spBrowserStepClicking');
    case 'type':
      return t('spBrowserStepTyping');
    case 'select_option':
      return t('spBrowserStepChoosing');
    case 'press_key':
      return t('spBrowserStepPressing', [String(args['key'] ?? '').slice(0, 30)]);
    case 'scroll':
      return t('spBrowserStepScrolling');
    case 'hover':
    case 'drag':
    case 'swipe':
      return t('spBrowserStepPointing');
    case 'navigate':
    case 'open_tab':
      return t('spBrowserStepOpening', [hostOf(args['url']) || t('spBrowserStepAPage')]);
    case 'switch_tab':
    case 'close_tab':
    case 'list_tabs':
      return t('spBrowserStepTabs');
    case 'go_back':
    case 'go_forward':
    case 'reload':
      return t('spBrowserStepHistory');
    case 'download_file':
      return t('spBrowserStepDownloading');
    case 'upload_file':
      return t('spBrowserStepUploading');
    case 'ask_user_to_take_over':
      return t('spBrowserStepHandingOver');
    default:
      return t('spBrowserStepWorking');
  }
}

function boundedOutput(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > MAX_STEP_OUTPUT_CHARS
    ? `${collapsed.slice(0, MAX_STEP_OUTPUT_CHARS - 1)}…`
    : collapsed;
}

/**
 * Turns one run's loop steps into activity events. Step arguments and page
 * content stay out of the events: they are persisted with the chat, and a
 * typed value or a page's text has no place in its history.
 */
export class BrowserRunActivityTranslator {
  private callCount = 0;
  private readonly pending = new Map<string, string[]>();

  constructor(private readonly runId: string) {}

  step(step: AgentLoopStep): AgentEvent[] {
    const name = step.toolName ?? 'action';
    if (step.kind === 'tool_call') {
      const toolCallId = `${this.runId}:${(this.callCount += 1)}`;
      this.pending.set(name, [...(this.pending.get(name) ?? []), toolCallId]);
      return [
        {
          type: 'tool-execution-start',
          toolCallId,
          name,
          category: 'computer-use',
          summary: describeBrowserStep(name, step.toolArgs),
          input: null,
        },
      ];
    }
    if (step.kind !== 'tool_result' && step.kind !== 'error' && step.kind !== 'injection_blocked')
      return [];
    const queue = this.pending.get(name) ?? [];
    const toolCallId = queue.shift() ?? `${this.runId}:${(this.callCount += 1)}`;
    this.pending.set(name, queue);
    const outcome = step.actionOutcome?.status;
    const failed = step.kind !== 'tool_result' || outcome === 'refused' || outcome === 'failed';
    const output =
      step.kind === 'injection_blocked'
        ? t('spBrowserStepInjectionBlocked')
        : step.kind === 'error'
          ? boundedOutput(step.errorMessage ?? '')
          : READ_ONLY_STEP_TOOLS.has(name)
            ? t('spBrowserStepDone')
            : boundedOutput(step.toolResult ?? '');
    return [{ type: 'tool-execution-end', toolCallId, name, output, isError: failed }];
  }

  state(state: BrowserRunState, summary?: string): AgentEvent {
    return {
      type: 'task-state-changed',
      taskId: this.runId,
      state:
        state === 'running'
          ? 'running'
          : state === 'paused'
            ? 'paused'
            : state === 'completed'
              ? 'completed'
              : state === 'cancelled'
                ? 'cancelled'
                : 'failed',
      ...(summary ? { summary } : {}),
    };
  }
}
