import {
  formatUsageRemaining,
  formatUsageResetIn,
  getBillingPlanPricing,
  isContractPricedPlan,
  isFreeBillingPlanTier,
  managedUsageBucketLabel,
  type ManagedUsageBucket,
  type ManagedUsageSummaryResponse,
} from '@agiworkforce/types';
import { readManagedUsageBuckets } from '@/lib/hooks/useManagedUsageSummary';

export type ChatSlashCommandId =
  'new' | 'rename' | 'archive' | 'pin' | 'share' | 'model' | 'status';

export interface ChatSlashCommandDefinition {
  id: ChatSlashCommandId;
  label: string;
  description: string;
  example?: string;
  /** Selecting from the menu writes `/<id> ` back so the argument can be typed. */
  takesArgument?: boolean;
}

const CHAT_SLASH_COMMAND_DEFINITIONS: ReadonlyArray<Omit<ChatSlashCommandDefinition, 'label'>> = [
  { id: 'new', description: 'Start a new chat' },
  { id: 'rename', description: 'Rename this chat', example: 'Trip plan', takesArgument: true },
  { id: 'archive', description: 'Archive this chat' },
  { id: 'pin', description: 'Pin this chat' },
  { id: 'share', description: 'Share this chat' },
  { id: 'model', description: 'Change the model' },
  { id: 'status', description: 'Show the model, plan and usage' },
];

export const CHAT_SLASH_COMMANDS: readonly ChatSlashCommandDefinition[] =
  CHAT_SLASH_COMMAND_DEFINITIONS.map(({ example, ...command }) => ({
    ...command,
    label: `/${command.id}`,
    ...(example === undefined ? {} : { example: `/${command.id} ${example}` }),
  }));

export interface ChatStatusLine {
  label: string;
  value: string;
}

export type ChatSlashOutcome =
  | { kind: 'done' }
  | { kind: 'notice'; message: string }
  | { kind: 'status'; lines: readonly ChatStatusLine[] };

export interface ChatSlashAction {
  run: (argument: string) => ChatSlashOutcome;
  /** Replaces the definition's description when the action's state changes it, e.g. Unpin. */
  description?: string;
}

/** A command is offered only when the host supplied its action. */
export type ChatSlashActions = Partial<Record<ChatSlashCommandId, ChatSlashAction>>;

export interface AvailableChatSlashCommand extends ChatSlashCommandDefinition {
  action: ChatSlashAction;
}

export function availableChatSlashCommands(
  actions: ChatSlashActions | undefined,
): AvailableChatSlashCommand[] {
  if (!actions) return [];
  return CHAT_SLASH_COMMANDS.flatMap((command) => {
    const action = actions[command.id];
    if (!action) return [];
    return [{ ...command, description: action.description ?? command.description, action }];
  });
}

export const CHAT_SLASH_DONE: ChatSlashOutcome = { kind: 'done' };

export interface ChatStatusInput {
  modelName: string | null;
  /** Null while the plan is not yet known, so nothing is guessed. */
  planTier: string | null;
  usage: ManagedUsageSummaryResponse | null;
}

const STATUS_USAGE_BUCKETS: readonly ManagedUsageBucket[] = ['session', 'weekly'];

export function chatStatusLines({ modelName, planTier, usage }: ChatStatusInput): ChatStatusLine[] {
  const lines: ChatStatusLine[] = [];
  if (modelName) lines.push({ label: 'Model', value: modelName });
  if (!planTier) return lines;
  lines.push({ label: 'Plan', value: getBillingPlanPricing(planTier).label });
  if (isFreeBillingPlanTier(planTier) || isContractPricedPlan(planTier)) return lines;
  if (!usage) {
    lines.push({ label: 'Usage', value: 'Not loaded yet' });
    return lines;
  }
  for (const reading of readManagedUsageBuckets(usage)) {
    if (!STATUS_USAGE_BUCKETS.includes(reading.bucket)) continue;
    const reset = formatUsageResetIn(reading.resetAt);
    lines.push({
      label: managedUsageBucketLabel(reading.bucket),
      value: [formatUsageRemaining(reading.percentRemaining), reset].filter(Boolean).join(' · '),
    });
  }
  return lines;
}
