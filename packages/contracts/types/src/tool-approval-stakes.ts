import { isPhoneStepTool, phoneStepStakes } from './phone-steps';

export interface ToolApprovalStake {
  kind: 'recipient' | 'amount' | 'item';
  label: string;
  value: string;
}

const SEND_TOOL_NAME =
  /send|post|reply|forward|mail|message|invite|share|notify|publish|comment|sms|dm\b/i;
const PAYMENT_TOOL_NAME =
  /pay|charge|purchase|buy|order|checkout|refund|invoice|transfer|payout|subscri|donat|tip\b/i;

const RECIPIENT_KEYS: readonly string[] = [
  'to',
  'cc',
  'bcc',
  'recipient',
  'recipients',
  'recipient_email',
  'recipient_emails',
  'to_email',
  'to_emails',
  'toRecipients',
  'ccRecipients',
  'bccRecipients',
  'to_number',
  'phone_number',
  'channel',
  'channel_id',
  'channel_name',
  'attendees',
  'invitees',
  'participants',
];

const AMOUNT_KEYS: readonly string[] = [
  'amount',
  'amount_cents',
  'unit_amount',
  'total',
  'total_amount',
  'price',
  'cost',
  'currency',
  'currency_code',
];

const ITEM_KEYS: readonly string[] = [
  'item',
  'items',
  'line_items',
  'product',
  'product_id',
  'product_name',
  'price_id',
  'sku',
  'quantity',
];

const MAX_LISTED_VALUES = 6;
const MAX_VALUE_CHARS = 160;

function humanizeKey(key: string): string {
  const words = key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function scalarText(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return String(value);
  return null;
}

function entryText(value: unknown): string | null {
  const scalar = scalarText(value);
  if (scalar !== null) return scalar;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const nested = record['emailAddress'];
  if (typeof nested === 'object' && nested !== null) {
    const address = scalarText((nested as Record<string, unknown>)['address']);
    if (address) return address;
  }
  for (const key of ['email', 'address', 'name', 'id', 'price', 'quantity']) {
    const text = scalarText(record[key]);
    if (text) return text;
  }
  return null;
}

function valueText(value: unknown): string | null {
  const values = Array.isArray(value) ? value : [value];
  const texts = values.map(entryText).filter((text): text is string => text !== null);
  if (texts.length === 0) return null;
  const listed = texts.slice(0, MAX_LISTED_VALUES).join(', ');
  const more =
    texts.length > MAX_LISTED_VALUES ? ` and ${texts.length - MAX_LISTED_VALUES} more` : '';
  const text = `${listed}${more}`;
  return text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS - 1)}…` : text;
}

function collect(
  args: Record<string, unknown>,
  keys: readonly string[],
  kind: ToolApprovalStake['kind'],
): ToolApprovalStake[] {
  const stakes: ToolApprovalStake[] = [];
  for (const key of keys) {
    if (!(key in args)) continue;
    const value = valueText(args[key]);
    if (value) stakes.push({ kind, label: humanizeKey(key), value });
  }
  return stakes;
}

export function toolApprovalStakes(
  toolName: string,
  args: Record<string, unknown> | undefined,
): ToolApprovalStake[] {
  if (!args) return [];
  if (isPhoneStepTool(toolName)) return phoneStepStakes(toolName, args);
  const stakes: ToolApprovalStake[] = [];
  if (SEND_TOOL_NAME.test(toolName)) stakes.push(...collect(args, RECIPIENT_KEYS, 'recipient'));
  if (PAYMENT_TOOL_NAME.test(toolName)) {
    stakes.push(...collect(args, AMOUNT_KEYS, 'amount'), ...collect(args, ITEM_KEYS, 'item'));
  }
  return stakes;
}
