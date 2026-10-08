export type ConnectorStepPhase =
  'running' | 'waiting' | 'finished' | 'failed' | 'declined' | 'stopped';

export interface QualifiedConnectorTool {
  serverId: string;
  toolName: string;
}

const QUALIFIED_CONNECTOR_TOOL_RE = /^mcp__([^_][^_]*)__(.+)$/;
const OPAQUE_SERVER_ID_RE = /^custom-/i;

export function parseQualifiedConnectorTool(name: string): QualifiedConnectorTool | null {
  const match = QUALIFIED_CONNECTOR_TOOL_RE.exec(name);
  if (!match?.[1] || !match[2]) return null;
  return { serverId: match[1], toolName: match[2] };
}

const SUMMARY_VERBS = new Set(['using', 'review']);
const SUMMARY_NOUNS = new Set(['connector', 'tool', 'action']);
const GENERIC_CONNECTOR_NAMES = new Set(['connector', 'mcp', 'tool', 'action']);

/**
 * A custom connector's server id is opaque, so its display name reaches the
 * client only inside the sentence the tool loop writes ("Using <Name>
 * connector", "Review <Name> action").
 */
export function connectorNameFromSummary(summary: string): string | undefined {
  const words = summary.trim().split(/\s+/);
  if (words.length < 3) return undefined;
  if (!SUMMARY_VERBS.has(words[0]!.toLowerCase())) return undefined;
  if (!SUMMARY_NOUNS.has(words[words.length - 1]!.toLowerCase())) return undefined;
  const name = words.slice(1, -1).join(' ');
  return GENERIC_CONNECTOR_NAMES.has(name.toLowerCase()) ? undefined : name;
}

function capitalizeWords(tokens: string[]): string {
  return tokens.map((token) => token.charAt(0).toUpperCase() + token.slice(1)).join(' ');
}

function nameTokens(value: string): string[] {
  return value
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((token) => token.toLowerCase());
}

export function connectorDisplayName(
  name: string,
  summary: string,
  verifiedName?: string,
): string | undefined {
  const fromSummary = connectorNameFromSummary(summary);
  if (verifiedName ?? fromSummary) return verifiedName ?? fromSummary;
  const parsed = parseQualifiedConnectorTool(name);
  if (!parsed || OPAQUE_SERVER_ID_RE.test(parsed.serverId)) return undefined;
  return capitalizeWords(nameTokens(parsed.serverId));
}

type VerbForms = readonly [running: string, finished: string, plain: string];
type SentencePhase = 'running' | 'finished' | 'failed' | 'stopped';

const READ_FORMS: VerbForms = ['Reading from', 'Read from', 'read from'];
const CREATE_FORMS: VerbForms = ['Creating an item in', 'Created an item in', 'create an item in'];
const UPDATE_FORMS: VerbForms = ['Updating an item in', 'Updated an item in', 'update an item in'];
const GENERIC_FORMS: VerbForms = ['Using', 'Used', 'use'];

// The leading verbs of the connector tool names in the first-party directory.
const VERB_FORMS: ReadonlyMap<string, VerbForms> = new Map([
  ['search', ['Searching', 'Searched', 'search']],
  ['query', ['Querying', 'Queried', 'query']],
  ['get', READ_FORMS],
  ['read', READ_FORMS],
  ['fetch', READ_FORMS],
  ['download', ['Downloading from', 'Downloaded from', 'download from']],
  ['list', ['Listing items in', 'Listed items in', 'list items in']],
  ['create', CREATE_FORMS],
  ['generate', CREATE_FORMS],
  ['add', ['Adding to', 'Added to', 'add to']],
  ['upload', ['Uploading to', 'Uploaded to', 'upload to']],
  ['write', ['Writing to', 'Wrote to', 'write to']],
  ['post', ['Posting to', 'Posted to', 'post to']],
  ['send', ['Sending with', 'Sent with', 'send with']],
  ['reply', ['Replying in', 'Replied in', 'reply in']],
  ['update', UPDATE_FORMS],
  ['edit', UPDATE_FORMS],
  ['set', UPDATE_FORMS],
  ['label', UPDATE_FORMS],
  ['unlabel', UPDATE_FORMS],
  ['copy', ['Copying in', 'Copied in', 'copy in']],
  ['move', ['Moving in', 'Moved in', 'move in']],
  ['delete', ['Deleting from', 'Deleted from', 'delete from']],
  ['cancel', ['Cancelling in', 'Cancelled in', 'cancel in']],
]);

// A name that chains two actions ("get_and_archive") is described by neither verb alone.
const COMPOUND_ACTION_TOKENS = new Set(['and', 'then']);
const UNNAMED_CONNECTOR = 'the connector';
const MAX_TOOL_LABEL_CHARS = 48;

const SENTENCE_PHASES: Readonly<Record<ConnectorStepPhase, SentencePhase | undefined>> = {
  running: 'running',
  finished: 'finished',
  failed: 'failed',
  stopped: 'stopped',
  waiting: undefined,
  declined: undefined,
};

function withoutServerPrefix(tokens: string[], serverId: string): string[] {
  const prefix = nameTokens(serverId);
  if (prefix.length === 0 || tokens.length <= prefix.length) return tokens;
  return prefix.every((token, index) => tokens[index] === token)
    ? tokens.slice(prefix.length)
    : tokens;
}

function boundedToolLabel(tokens: string[]): string {
  const label = capitalizeWords(tokens);
  return label.length <= MAX_TOOL_LABEL_CHARS
    ? label
    : `${label.slice(0, MAX_TOOL_LABEL_CHARS).trimEnd()}…`;
}

export interface ConnectorStepSentenceInput {
  name: string;
  summary: string;
  phase: ConnectorStepPhase;
  verifiedConnectorName?: string;
}

/**
 * The step as a plain sentence in the tense of its phase. An approval prompt or
 * a declined call has none and keeps the tool loop's own wording.
 */
export function connectorStepSentence({
  name,
  summary,
  phase,
  verifiedConnectorName,
}: ConnectorStepSentenceInput): string | undefined {
  const sentencePhase = SENTENCE_PHASES[phase];
  const parsed = parseQualifiedConnectorTool(name);
  if (!sentencePhase || !parsed) return undefined;
  const connector = connectorDisplayName(name, summary, verifiedConnectorName) ?? UNNAMED_CONNECTOR;
  const tokens = withoutServerPrefix(nameTokens(parsed.toolName), parsed.serverId);
  const known = tokens.some((token) => COMPOUND_ACTION_TOKENS.has(token))
    ? undefined
    : VERB_FORMS.get(tokens[0] ?? '');
  const [running, finished, plain] = known ?? GENERIC_FORMS;
  const toolLabel = known ? '' : boundedToolLabel(tokens);
  const object = toolLabel ? `${connector}: ${toolLabel}` : connector;
  switch (sentencePhase) {
    case 'running':
      return `${running} ${object}`;
    case 'finished':
      return `${finished} ${object}`;
    case 'failed':
      return `Could not ${plain} ${object}`;
    case 'stopped':
      return `Stopped ${running.charAt(0).toLowerCase()}${running.slice(1)} ${object}`;
  }
}
