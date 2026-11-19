import { TOOL_APPROVAL_ACTION_LABELS } from '@agiworkforce/types';
import type {
  ToolApprovalReview,
  ToolApprovalRiskTier,
  ToolApprovalScope,
} from './tool-approval-resume';

export const UNREVIEWED_TOOL_APPROVAL: Readonly<ToolApprovalReview> =
  Object.freeze<ToolApprovalReview>({
    riskTier: 'high',
    destructive: true,
    scopes: ['once'],
  });

export const TOOL_APPROVAL_RISK_LABELS: Readonly<Record<ToolApprovalRiskTier, string>> = {
  low: 'Low risk',
  medium: 'Medium risk',
  high: 'High risk',
  critical: 'Critical risk',
};

export const TOOL_APPROVAL_DESTRUCTIVE_NOTICE =
  'This tool can change or delete data, and its effect may not be reversible.';

export const TOOL_APPROVAL_SCOPE_LABELS: Readonly<Record<ToolApprovalScope, string>> = {
  once: TOOL_APPROVAL_ACTION_LABELS.allowOnce,
  session: TOOL_APPROVAL_ACTION_LABELS.allowForConversation,
  always: TOOL_APPROVAL_ACTION_LABELS.alwaysAllow,
};

export const TOOL_APPROVAL_SESSION_SCOPE_NOTE =
  'Conversation approvals last until you delete this chat or reset the tool in Settings, Connectors for this workspace.';

export const TOOL_APPROVAL_NO_PARAMETERS = 'No parameters.';

const MAX_PARAMETER_VALUE_CHARS = 280;
const MAX_RAW_PARAMETER_CHARS = 20_000;

export function effectiveToolApprovalReview(
  review: ToolApprovalReview | undefined,
): ToolApprovalReview {
  return review ?? UNREVIEWED_TOOL_APPROVAL;
}

export interface ToolApprovalParameterRow {
  key: string;
  value: string;
}

export function toolApprovalParameterValue(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text === undefined) return String(value);
  return text.length > MAX_PARAMETER_VALUE_CHARS
    ? `${text.slice(0, MAX_PARAMETER_VALUE_CHARS)}…`
    : text;
}

export function toolApprovalParameterRows(
  parameters: Record<string, unknown> | undefined,
): ToolApprovalParameterRow[] {
  return Object.entries(parameters ?? {}).map(([key, value]) => ({
    key,
    value: toolApprovalParameterValue(value),
  }));
}

export function toolApprovalRawParameters(
  parameters: Record<string, unknown> | undefined,
): string | null {
  if (!parameters || Object.keys(parameters).length === 0) return null;
  const text = JSON.stringify(parameters, null, 2);
  return text.length > MAX_RAW_PARAMETER_CHARS
    ? `${text.slice(0, MAX_RAW_PARAMETER_CHARS)}\n…`
    : text;
}

export interface ToolApprovalScopeConfirmation {
  title: string;
  message: string;
  confirmLabel: string;
}

export interface ToolApprovalSubjectNames {
  connectorName?: string;
  toolLabel?: string;
}

export function toolApprovalScopeConfirmation(
  scope: Exclude<ToolApprovalScope, 'once'>,
  label: string,
  names: ToolApprovalSubjectNames = {},
): ToolApprovalScopeConfirmation {
  if (scope === 'session') {
    return {
      title: `Allow ${label} for the rest of this chat?`,
      message:
        `Every later call to ${label} in this conversation will run without asking. It can ` +
        'change or delete data that cannot be recovered, and nothing it does can be undone ' +
        'from here. The permission lasts until this chat is deleted or you reset the tool in Settings, Connectors for this workspace.',
      confirmLabel: TOOL_APPROVAL_ACTION_LABELS.allowForConversation,
    };
  }
  const subject =
    names.connectorName && names.toolLabel ? `${names.toolLabel} on ${names.connectorName}` : label;
  return {
    title: `Always allow ${subject}?`,
    message:
      `${subject} will run without asking, including writes that cannot be undone. ` +
      'This applies to every chat until you change it in Settings, Connectors.',
    confirmLabel: TOOL_APPROVAL_ACTION_LABELS.alwaysAllow,
  };
}
