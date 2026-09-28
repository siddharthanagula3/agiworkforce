const SLACK_ID_RE = /^[A-Z0-9]{2,32}$/;
const SLACK_TS_RE = /^[0-9]{1,20}\.[0-9]{1,10}$/;
const VERIFICATION_CODE_ONLY_RE = /^(?:<@[A-Z0-9]+>\s*)?[0-9a-f]{12}$/i;
const READABLE_SUBTYPES = new Set(['file_share', 'thread_broadcast']);
const MAX_TEXT_CHARS = 12_000;
const MAX_FILES = 10;

export type SlackAssistantSurface = 'direct_message' | 'channel';

export interface SlackMessageEvent {
  kind: 'message';
  surface: SlackAssistantSurface;
  teamId: string;
  eventId: string;
  channelId: string;
  userId: string;
  text: string;
  ts: string;
  threadTs: string | null;
  fileNames: string[];
}

export type SlackAssistantEvent =
  | SlackMessageEvent
  | { kind: 'uninstalled'; teamId: string }
  | { kind: 'bot_tokens_revoked'; teamId: string; botUserIds: string[] };

function slackId(value: unknown): string | null {
  return typeof value === 'string' && SLACK_ID_RE.test(value) ? value : null;
}

function slackTs(value: unknown): string | null {
  return typeof value === 'string' && SLACK_TS_RE.test(value) ? value : null;
}

function fileNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((file) => {
      const name = (file as Record<string, unknown> | null)?.['name'];
      return typeof name === 'string' && name.trim() ? [name.trim().slice(0, 200)] : [];
    })
    .slice(0, MAX_FILES);
}

export function readSlackAssistantEvent(
  event: Record<string, unknown>,
  envelope: { teamId: string; eventId: string },
): SlackAssistantEvent | null {
  const type = event['type'];
  if (type === 'app_uninstalled') return { kind: 'uninstalled', teamId: envelope.teamId };
  if (type === 'tokens_revoked') {
    const tokens = event['tokens'];
    const bots =
      tokens && typeof tokens === 'object' ? (tokens as Record<string, unknown>)['bot'] : null;
    const botUserIds = Array.isArray(bots)
      ? bots.flatMap((id) => {
          const parsed = slackId(id);
          return parsed ? [parsed] : [];
        })
      : [];
    return botUserIds.length > 0
      ? { kind: 'bot_tokens_revoked', teamId: envelope.teamId, botUserIds }
      : null;
  }

  const direct = type === 'message' && event['channel_type'] === 'im';
  const mention = type === 'app_mention';
  if (!direct && !mention) return null;
  if (event['bot_id'] !== undefined) return null;
  const subtype = event['subtype'];
  if (subtype !== undefined && !(typeof subtype === 'string' && READABLE_SUBTYPES.has(subtype))) {
    return null;
  }

  const channelId = slackId(event['channel']);
  const userId = slackId(event['user']);
  const ts = slackTs(event['ts']);
  if (!channelId || !userId || !ts) return null;
  if (mention && channelId.startsWith('D')) return null;

  const text = typeof event['text'] === 'string' ? event['text'].slice(0, MAX_TEXT_CHARS) : '';
  const files = fileNames(event['files']);
  if (!text.trim() && files.length === 0) return null;
  if (VERIFICATION_CODE_ONLY_RE.test(text.trim())) return null;

  return {
    kind: 'message',
    surface: direct ? 'direct_message' : 'channel',
    teamId: envelope.teamId,
    eventId: envelope.eventId,
    channelId,
    userId,
    text,
    ts,
    threadTs: slackTs(event['thread_ts']),
    fileNames: files,
  };
}
