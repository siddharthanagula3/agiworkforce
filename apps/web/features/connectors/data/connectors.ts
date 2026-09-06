import {
  allowsPresentTenseCopy,
  getConnectorActionSource,
  getConnectorCapability,
  getDeclaredConnectorActions,
  type ConnectorActionSource,
  type ConnectorRiskClass,
} from '@/lib/connectors/catalog';
import { isSelfServiceConnector } from '@/lib/connectors/mcp-endpoints';

export type ConnectorCategory =
  | 'Productivity'
  | 'Developer'
  | 'CRM'
  | 'Marketing'
  | 'Finance'
  | 'Social'
  | 'AI'
  | 'Communication'
  | 'Cloud'
  | 'Data'
  | 'Design'
  | 'Storage'
  | 'Healthcare'
  | 'Exclusive';
export type AuthType = 'oauth' | 'api_key' | 'connection_string' | 'pat';
export type Phase = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface Connector {
  id: string;
  name: string;
  description: string;
  capabilitySummary: string;
  category: ConnectorCategory;
  authType: AuthType;
  /**
   * @deprecated Nothing renders this. It is derived from the capability record
   * rather than hand-written, 3 for `github`, 0 for everything else, and a 0
   * means "nothing declared up front", not "does nothing"; ask
   * `getConnectorActionSource` for that distinction instead. It survives only
   * because `packages/ui/ui/src/settings-modal/types.ts` still requires the
   * field on the shared settings row shape.
   */
  actionCount: number;
  phase: Phase;
  iconBg: string;
  iconText: string;
  iconEmoji?: string;
  exclusive?: boolean;
  riskClass: ConnectorRiskClass;
}

/**
 * A ceiling, not an inventory: what a remote-MCP provider actually exposes is
 * unknown until its server is asked, so no sentence here may say a connector
 * *does* something, and none may promise an approval the tool loop does not
 * enforce, `tool-loop.ts` auto-allows any tool with no saved permission row
 * whenever the run's approval mode is 'auto' (every scheduled agent run).
 */
export const RISK_CLASS_COPY: Record<ConnectorRiskClass, string> = {
  'read-only': 'Reading, at most. Nothing here can create, change, or delete anything.',
  'read-write':
    'Up to reading and changing data in this account. What the provider actually offers may be ' +
    'narrower.',
  'high-impact':
    'High impact, a credential for this provider can reach money, infrastructure, regulated ' +
    'records, outbound messaging, or your own machine. Connect it only if you intend that.',
};

/**
 * What to show where a static tool list would otherwise be. The
 * `runtime-discovered` line is the one that matters: an empty list used to read
 * as "this connector has no tools" when it meant "nobody has asked the server".
 */
export const ACTION_SOURCE_COPY: Record<ConnectorActionSource, string> = {
  declared: 'These tools ship with the product, so this list is complete before you connect.',
  'runtime-discovered':
    'This provider runs its own MCP server, so its tools are discovered when you connect, they ' +
    'cannot be listed here beforehand. Once connected, set a permission on each discovered tool: ' +
    'one you leave unset can run without asking you first.',
  'device-local':
    'Desktop Local runs these tools on your own machine. The web app neither lists nor runs them.',
};

export function describeConnectorActions(connectorId: string): string {
  return ACTION_SOURCE_COPY[getConnectorActionSource(connectorId)];
}

type ConnectorSeed = Omit<Connector, 'description' | 'riskClass' | 'actionCount'>;

const FIRST_PARTY_DESCRIPTIONS: Readonly<Record<string, string>> = {
  github: 'Read PR diffs, comment on issues and PRs, and post PR reviews via the GitHub App.',
};

export function buildConnectorDescription(seed: ConnectorSeed): string {
  if (allowsPresentTenseCopy(seed.id)) {
    const sentence = FIRST_PARTY_DESCRIPTIONS[seed.id];
    if (sentence) return sentence;
  }
  if (getConnectorCapability(seed.id)?.implementation === 'device-local') {
    return `Desktop Local only, ${seed.capabilitySummary}.`;
  }
  if (isSelfServiceConnector(seed.id)) {
    // Self-service connectors register with the vendor's own authorization server
    // (CIMD or dynamic registration), so no operator credential stands between the
    // user and connecting. Saying "an operator can connect this" was false for
    // these, and read as an outright contradiction on a connector already showing
    // Connected. Still not a present-tense capability claim: the tool list is
    // discovered from the server, never asserted here.
    return `You can connect ${seed.name} yourself for ${seed.capabilitySummary}. Its tools are discovered from ${seed.name}'s own MCP server when you authorize.`;
  }
  return `Not available by default. An operator can connect ${seed.name} for ${seed.capabilitySummary}.`;
}

export type ConnectorAvailability = 'ready' | 'planned' | 'exclusive' | 'unavailable';

export function getConnectorAvailability(
  connector: Connector,
  availableIds?: ReadonlySet<string>,
): ConnectorAvailability {
  if (connector.exclusive) return 'exclusive';
  if (availableIds?.has(connector.id)) return 'ready';
  return connector.phase > 1 ? 'planned' : 'unavailable';
}

export function isConnectorReady(
  connector: Connector,
  availableIds?: ReadonlySet<string>,
): boolean {
  return getConnectorAvailability(connector, availableIds) === 'ready';
}

export function getConnectorAvailabilityLabelFor(
  connector: Connector,
  isAvailable: boolean,
): string {
  return getConnectorAvailabilityLabel(
    connector,
    isAvailable ? new Set([connector.id]) : new Set<string>(),
  );
}

export function getConnectorAvailabilityLabel(
  connector: Connector,
  availableIds?: ReadonlySet<string>,
): string {
  const availability = getConnectorAvailability(connector, availableIds);
  switch (availability) {
    case 'ready':
      return 'Ready';
    case 'planned':
      return `Phase ${connector.phase}`;
    case 'exclusive':
      return 'Exclusive';
    case 'unavailable':
      return 'Not available here';
  }
}

const CONNECTOR_SEEDS: ConnectorSeed[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    capabilitySummary: 'email search, reading, sending, and drafts',
    category: 'Productivity',
    authType: 'oauth',
    phase: 1,
    iconBg: 'from-red-500 to-red-600',
    iconText: 'G',
    iconEmoji: '📧',
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    capabilitySummary: 'event creation, availability lookups, and invite management',
    category: 'Productivity',
    authType: 'oauth',
    phase: 1,
    iconBg: 'from-blue-500 to-sky-600',
    iconText: '31',
    iconEmoji: '📅',
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    capabilitySummary: 'file reads, writes, search, and uploads',
    category: 'Productivity',
    authType: 'oauth',
    phase: 1,
    iconBg: 'from-yellow-500 to-green-500',
    iconText: '▲',
    iconEmoji: '📁',
  },
  {
    id: 'notion',
    name: 'Notion',
    capabilitySummary: 'page search, content edits, and database management',
    category: 'Productivity',
    authType: 'oauth',
    phase: 1,
    iconBg: 'from-gray-800 to-gray-900',
    iconText: 'N',
    iconEmoji: '📝',
  },
  {
    id: 'slack',
    name: 'Slack',
    capabilitySummary: 'message posting, conversation search, and channel reads',
    category: 'Productivity',
    authType: 'oauth',
    phase: 1,
    iconBg: 'from-purple-500 to-purple-700',
    iconText: 'S',
    iconEmoji: '💬',
  },
  {
    id: 'github',
    name: 'GitHub',
    capabilitySummary: 'pull request diffs, issue comments, and PR reviews',
    category: 'Developer',
    authType: 'oauth',
    phase: 1,
    iconBg: 'from-gray-700 to-gray-900',
    iconText: 'GH',
    iconEmoji: '🐙',
  },
  {
    id: 'google-sheets',
    name: 'Google Sheets',
    capabilitySummary: 'cell reads and writes, sheet creation, and formulas',
    category: 'Productivity',
    authType: 'oauth',
    phase: 1,
    iconBg: 'from-green-500 to-green-700',
    iconText: '▦',
    iconEmoji: '📊',
  },
  {
    id: 'outlook',
    name: 'Outlook',
    capabilitySummary: 'email search, calendar events, and message sending',
    category: 'Productivity',
    authType: 'oauth',
    phase: 1,
    iconBg: 'from-blue-500 to-blue-700',
    iconText: 'O',
    iconEmoji: '📮',
  },
  {
    id: 'onedrive',
    name: 'OneDrive',
    capabilitySummary: 'file reads, writes, and search',
    category: 'Productivity',
    authType: 'oauth',
    phase: 1,
    iconBg: 'from-sky-400 to-blue-600',
    iconText: '☁',
    iconEmoji: '☁️',
  },
  {
    id: 'linear',
    name: 'Linear',
    capabilitySummary: 'issue, project, and cycle management',
    category: 'Developer',
    authType: 'oauth',
    phase: 1,
    iconBg: 'from-violet-500 to-indigo-600',
    iconText: 'L',
    iconEmoji: '⚡',
  },
  {
    id: 'jira',
    name: 'Jira',
    capabilitySummary: 'issue, sprint, epic, and board management',
    category: 'Developer',
    authType: 'oauth',
    phase: 1,
    iconBg: 'from-blue-500 to-indigo-600',
    iconText: 'J',
    iconEmoji: '🎯',
  },

  {
    id: 'teams',
    name: 'Microsoft Teams',
    capabilitySummary: 'message sending, channel management, and conversation search',
    category: 'Productivity',
    authType: 'oauth',
    phase: 2,
    iconBg: 'from-indigo-500 to-purple-600',
    iconText: 'T',
    iconEmoji: '👥',
  },
  {
    id: 'confluence',
    name: 'Confluence',
    capabilitySummary: 'page search and creation, and space management',
    category: 'Productivity',
    authType: 'oauth',
    phase: 2,
    iconBg: 'from-blue-600 to-indigo-700',
    iconText: 'C',
    iconEmoji: '📚',
  },
  {
    id: 'asana',
    name: 'Asana',
    capabilitySummary: 'task, project, and workflow management',
    category: 'Productivity',
    authType: 'oauth',
    phase: 2,
    iconBg: 'from-pink-500 to-red-500',
    iconText: 'A',
    iconEmoji: '✅',
  },
  {
    id: 'zoom',
    name: 'Zoom',
    capabilitySummary: 'meeting scheduling, recording retrieval, and participant management',
    category: 'Productivity',
    authType: 'oauth',
    phase: 2,
    iconBg: 'from-blue-500 to-blue-600',
    iconText: 'Z',
    iconEmoji: '📹',
  },

  {
    id: 'hubspot',
    name: 'HubSpot',
    capabilitySummary: 'contact, company, deal, and note management',
    category: 'CRM',
    authType: 'oauth',
    phase: 3,
    iconBg: 'from-orange-500 to-orange-600',
    iconText: 'H',
    iconEmoji: '🎯',
  },
  {
    id: 'salesforce',
    name: 'Salesforce',
    capabilitySummary: 'CRM object reads and writes across leads, opportunities, and accounts',
    category: 'CRM',
    authType: 'oauth',
    phase: 3,
    iconBg: 'from-cyan-500 to-blue-600',
    iconText: 'SF',
    iconEmoji: '☁️',
  },
  {
    id: 'calendly',
    name: 'Calendly',
    capabilitySummary: 'meeting scheduling, event types, and booking history',
    category: 'CRM',
    authType: 'oauth',
    phase: 3,
    iconBg: 'from-teal-500 to-cyan-600',
    iconText: 'CL',
    iconEmoji: '📅',
  },
  {
    id: 'intercom',
    name: 'Intercom',
    capabilitySummary: 'conversation, customer, and ticket management',
    category: 'CRM',
    authType: 'oauth',
    phase: 3,
    iconBg: 'from-blue-600 to-indigo-700',
    iconText: 'IC',
    iconEmoji: '💬',
  },

  {
    id: 'google-analytics',
    name: 'Google Analytics',
    capabilitySummary: 'report, audience, conversion, and traffic queries',
    category: 'Marketing',
    authType: 'oauth',
    phase: 5,
    iconBg: 'from-orange-500 to-amber-600',
    iconText: 'GA',
    iconEmoji: '📈',
  },
  {
    id: 'mailchimp',
    name: 'Mailchimp',
    capabilitySummary: 'audience, campaign, template, and analytics management',
    category: 'Marketing',
    authType: 'oauth',
    phase: 5,
    iconBg: 'from-yellow-500 to-amber-600',
    iconText: 'MC',
    iconEmoji: '🐒',
  },

  {
    id: 'stripe',
    name: 'Stripe',
    capabilitySummary: 'payment, subscription, customer, and report management',
    category: 'Finance',
    authType: 'oauth',
    phase: 6,
    iconBg: 'from-violet-500 to-indigo-600',
    iconText: 'S',
    iconEmoji: '💳',
  },
  {
    id: 'shopify',
    name: 'Shopify',
    capabilitySummary: 'product, order, customer, and inventory management',
    category: 'Finance',
    authType: 'oauth',
    phase: 6,
    iconBg: 'from-green-500 to-emerald-600',
    iconText: 'SH',
    iconEmoji: '🛍️',
  },

  {
    id: 'linkedin',
    name: 'LinkedIn',
    capabilitySummary: 'content posting, profile management, and network engagement',
    category: 'Social',
    authType: 'oauth',
    phase: 7,
    iconBg: 'from-blue-600 to-blue-800',
    iconText: 'in',
    iconEmoji: '💼',
  },
  {
    id: 'twitter',
    name: 'Twitter / X',
    capabilitySummary: 'post publishing, content search, and account management',
    category: 'Social',
    authType: 'oauth',
    phase: 7,
    iconBg: 'from-gray-800 to-black',
    iconText: 'X',
    iconEmoji: '🐦',
  },
  {
    id: 'discord',
    name: 'Discord',
    capabilitySummary: 'message posting and server, channel, and community management',
    category: 'Social',
    authType: 'oauth',
    phase: 7,
    iconBg: 'from-indigo-500 to-violet-600',
    iconText: 'DC',
    iconEmoji: '🎮',
  },

  {
    id: 'openai',
    name: 'OpenAI',
    capabilitySummary: 'completions, assistant management, and model access',
    category: 'AI',
    authType: 'api_key',
    phase: 8,
    iconBg: 'from-emerald-500 to-teal-600',
    iconText: 'AI',
    iconEmoji: '🤖',
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    capabilitySummary: 'speech generation, voice cloning, and audio production',
    category: 'AI',
    authType: 'api_key',
    phase: 8,
    iconBg: 'from-violet-500 to-purple-700',
    iconText: '11',
    iconEmoji: '🎙️',
  },

  {
    id: 'local-filesystem',
    name: 'Local Filesystem',
    capabilitySummary: 'file reads and writes on your own computer',
    category: 'Exclusive',
    authType: 'pat',
    phase: 1,
    iconBg: 'from-amber-500 to-orange-600',
    iconText: 'FS',
    iconEmoji: '💾',
    exclusive: true,
  },
  {
    id: 'terminal',
    name: 'Terminal / Shell',
    capabilitySummary: 'command execution, scripts, and process management',
    category: 'Exclusive',
    authType: 'pat',
    phase: 1,
    iconBg: 'from-gray-700 to-gray-900',
    iconText: '>_',
    iconEmoji: '⚡',
    exclusive: true,
  },
  {
    id: 'browser-automation',
    name: 'Browser Automation',
    capabilitySummary:
      'Chrome, Firefox, and Safari control over CDP for form fill, scraping, and navigation',
    category: 'Exclusive',
    authType: 'pat',
    phase: 1,
    iconBg: 'from-blue-500 to-cyan-600',
    iconText: '◎',
    iconEmoji: '🌐',
    exclusive: true,
  },
  {
    id: 'screen-vision',
    name: 'Screen Vision',
    capabilitySummary: 'OCR, screenshots, and computer use on your own screen',
    category: 'Exclusive',
    authType: 'pat',
    phase: 1,
    iconBg: 'from-pink-500 to-rose-600',
    iconText: '👁',
    iconEmoji: '👁️',
    exclusive: true,
  },
  {
    id: 'ollama',
    name: 'Local LLMs (Ollama)',
    capabilitySummary: 'local model routing across Llama, Mistral, Qwen, and more',
    category: 'Exclusive',
    authType: 'pat',
    phase: 1,
    iconBg: 'from-teal-500 to-emerald-600',
    iconText: '🦙',
    iconEmoji: '🦙',
    exclusive: true,
  },

  {
    id: 'airtable',
    name: 'Airtable',
    capabilitySummary: 'table, record, and view management',
    category: 'Productivity',
    authType: 'oauth',
    phase: 2,
    iconBg: 'from-yellow-400 to-orange-500',
    iconText: 'AT',
    iconEmoji: '🗂️',
  },
  {
    id: 'monday',
    name: 'Monday.com',
    capabilitySummary: 'board, item, and automation management',
    category: 'Productivity',
    authType: 'oauth',
    phase: 2,
    iconBg: 'from-rose-500 to-pink-600',
    iconText: 'M',
    iconEmoji: '📋',
  },
  {
    id: 'clickup',
    name: 'ClickUp',
    capabilitySummary: 'task, doc, goal, and workspace management',
    category: 'Productivity',
    authType: 'oauth',
    phase: 2,
    iconBg: 'from-purple-500 to-pink-500',
    iconText: 'CU',
    iconEmoji: '✅',
  },
  {
    id: 'trello',
    name: 'Trello',
    capabilitySummary: 'card, board, and list management',
    category: 'Productivity',
    authType: 'api_key',
    phase: 2,
    iconBg: 'from-blue-500 to-cyan-500',
    iconText: 'TR',
    iconEmoji: '📌',
  },
  {
    id: 'todoist',
    name: 'Todoist',
    capabilitySummary: 'task creation, project management, and inbox sync',
    category: 'Productivity',
    authType: 'oauth',
    phase: 2,
    iconBg: 'from-red-500 to-rose-600',
    iconText: 'TD',
    iconEmoji: '✅',
  },
  {
    id: 'basecamp',
    name: 'Basecamp',
    capabilitySummary: 'project, to-do, message, and schedule access',
    category: 'Productivity',
    authType: 'oauth',
    phase: 3,
    iconBg: 'from-green-600 to-emerald-700',
    iconText: 'BC',
    iconEmoji: '⛺',
  },
  {
    id: 'evernote',
    name: 'Evernote',
    capabilitySummary: 'note and notebook search, creation, and management',
    category: 'Productivity',
    authType: 'oauth',
    phase: 3,
    iconBg: 'from-green-500 to-green-700',
    iconText: 'EN',
    iconEmoji: '🐘',
  },

  {
    id: 'vercel',
    name: 'Vercel',
    capabilitySummary: 'deployment triggers, log inspection, and project management',
    category: 'Developer',
    authType: 'oauth',
    phase: 2,
    iconBg: 'from-gray-700 to-black',
    iconText: 'VL',
    iconEmoji: '▲',
  },
  {
    id: 'sentry',
    name: 'Sentry',
    capabilitySummary: 'error queries, issue management, and stack-trace inspection',
    category: 'Developer',
    authType: 'oauth',
    phase: 2,
    iconBg: 'from-violet-600 to-purple-800',
    iconText: 'SN',
    iconEmoji: '🐛',
  },
  {
    id: 'datadog',
    name: 'Datadog',
    capabilitySummary: 'metric, log, and trace queries plus monitor and dashboard management',
    category: 'Developer',
    authType: 'oauth',
    phase: 3,
    iconBg: 'from-purple-500 to-violet-700',
    iconText: 'DD',
    iconEmoji: '📊',
  },
  {
    id: 'pagerduty',
    name: 'PagerDuty',
    capabilitySummary: 'incident acknowledgement, on-call schedules, and alert history',
    category: 'Developer',
    authType: 'oauth',
    phase: 3,
    iconBg: 'from-green-500 to-emerald-700',
    iconText: 'PD',
    iconEmoji: '🚨',
  },
  {
    id: 'circleci',
    name: 'CircleCI',
    capabilitySummary: 'pipeline triggers, job results, and workflow management',
    category: 'Developer',
    authType: 'api_key',
    phase: 3,
    iconBg: 'from-gray-700 to-gray-900',
    iconText: 'CI',
    iconEmoji: '🔄',
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    capabilitySummary: 'repository, merge request, pipeline, and issue management',
    category: 'Developer',
    authType: 'oauth',
    phase: 2,
    iconBg: 'from-orange-500 to-red-600',
    iconText: 'GL',
    iconEmoji: '🦊',
  },
  {
    id: 'bitbucket',
    name: 'Bitbucket',
    capabilitySummary: 'pull request, pipeline, and repository management',
    category: 'Developer',
    authType: 'oauth',
    phase: 3,
    iconBg: 'from-blue-500 to-indigo-700',
    iconText: 'BB',
    iconEmoji: '🪣',
  },

  {
    id: 'telegram',
    name: 'Telegram',
    capabilitySummary: 'message sending, bot management, and channel interaction',
    category: 'Communication',
    authType: 'api_key',
    phase: 3,
    iconBg: 'from-sky-400 to-blue-600',
    iconText: 'TG',
    iconEmoji: '✈️',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp Business',
    capabilitySummary: 'message and notification sending over the WhatsApp Business API',
    category: 'Communication',
    authType: 'api_key',
    phase: 4,
    iconBg: 'from-green-500 to-emerald-600',
    iconText: 'WA',
    iconEmoji: '💬',
  },
  {
    id: 'twilio',
    name: 'Twilio',
    capabilitySummary: 'SMS, WhatsApp messages, and voice calls',
    category: 'Communication',
    authType: 'api_key',
    phase: 3,
    iconBg: 'from-red-600 to-rose-700',
    iconText: 'TW',
    iconEmoji: '📱',
  },
  {
    id: 'sendgrid',
    name: 'SendGrid',
    capabilitySummary: 'transactional and marketing email delivery',
    category: 'Communication',
    authType: 'api_key',
    phase: 3,
    iconBg: 'from-blue-500 to-cyan-600',
    iconText: 'SG',
    iconEmoji: '📧',
  },

  {
    id: 'aws',
    name: 'Amazon Web Services',
    capabilitySummary: 'S3, Lambda, EC2, and other AWS API operations',
    category: 'Cloud',
    authType: 'api_key',
    phase: 4,
    iconBg: 'from-orange-400 to-amber-600',
    iconText: 'AWS',
    iconEmoji: '☁️',
  },
  {
    id: 'gcp',
    name: 'Google Cloud',
    capabilitySummary: 'Cloud Storage, Pub/Sub, BigQuery, and Cloud Run operations',
    category: 'Cloud',
    authType: 'oauth',
    phase: 4,
    iconBg: 'from-blue-400 to-green-500',
    iconText: 'GCP',
    iconEmoji: '☁️',
  },
  {
    id: 'azure',
    name: 'Microsoft Azure',
    capabilitySummary: 'Blob Storage, Functions, VM, and other Azure service operations',
    category: 'Cloud',
    authType: 'oauth',
    phase: 4,
    iconBg: 'from-blue-500 to-cyan-600',
    iconText: 'AZ',
    iconEmoji: '☁️',
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    capabilitySummary: 'DNS, Workers, Pages, KV, and CDN rule management',
    category: 'Cloud',
    authType: 'oauth',
    phase: 4,
    iconBg: 'from-orange-500 to-amber-500',
    iconText: 'CF',
    iconEmoji: '🔥',
  },
  {
    id: 'digitalocean',
    name: 'DigitalOcean',
    capabilitySummary: 'Droplet, Spaces, database, and app management',
    category: 'Cloud',
    authType: 'api_key',
    phase: 4,
    iconBg: 'from-blue-500 to-indigo-600',
    iconText: 'DO',
    iconEmoji: '🌊',
  },

  {
    id: 'snowflake',
    name: 'Snowflake',
    capabilitySummary: 'query execution, warehouse management, and data access',
    category: 'Data',
    authType: 'connection_string',
    phase: 4,
    iconBg: 'from-sky-400 to-blue-600',
    iconText: 'SF',
    iconEmoji: '❄️',
  },
  {
    id: 'bigquery',
    name: 'BigQuery',
    capabilitySummary: 'SQL queries and dataset management',
    category: 'Data',
    authType: 'oauth',
    phase: 4,
    iconBg: 'from-blue-400 to-indigo-500',
    iconText: 'BQ',
    iconEmoji: '📊',
  },
  {
    id: 'databricks',
    name: 'Databricks',
    capabilitySummary: 'notebook runs, cluster management, and Delta table queries',
    category: 'Data',
    authType: 'api_key',
    phase: 5,
    iconBg: 'from-red-500 to-orange-600',
    iconText: 'DB',
    iconEmoji: '🧱',
  },
  {
    id: 'postgresql',
    name: 'PostgreSQL',
    capabilitySummary: 'direct SQL queries against a PostgreSQL database',
    category: 'Data',
    authType: 'connection_string',
    phase: 3,
    iconBg: 'from-blue-600 to-indigo-800',
    iconText: 'PG',
    iconEmoji: '🐘',
  },
  {
    id: 'mongodb',
    name: 'MongoDB',
    capabilitySummary: 'collection queries, document inserts, and index management',
    category: 'Data',
    authType: 'connection_string',
    phase: 3,
    iconBg: 'from-green-500 to-emerald-700',
    iconText: 'MG',
    iconEmoji: '🍃',
  },
  {
    id: 'redis',
    name: 'Redis',
    capabilitySummary: 'key reads, writes, and management in Redis or Upstash',
    category: 'Data',
    authType: 'connection_string',
    phase: 3,
    iconBg: 'from-red-500 to-rose-700',
    iconText: 'RD',
    iconEmoji: '⚡',
  },
  {
    id: 'elasticsearch',
    name: 'Elasticsearch',
    capabilitySummary: 'document indexing, full-text queries, and cluster management',
    category: 'Data',
    authType: 'api_key',
    phase: 4,
    iconBg: 'from-yellow-400 to-amber-600',
    iconText: 'ES',
    iconEmoji: '🔍',
  },

  {
    id: 'pipedrive',
    name: 'Pipedrive',
    capabilitySummary: 'deal, contact, and pipeline management',
    category: 'CRM',
    authType: 'oauth',
    phase: 3,
    iconBg: 'from-green-500 to-teal-600',
    iconText: 'PD',
    iconEmoji: '🎯',
  },
  {
    id: 'zendesk',
    name: 'Zendesk',
    capabilitySummary: 'ticket, user, and support workflow management',
    category: 'CRM',
    authType: 'api_key',
    phase: 3,
    iconBg: 'from-green-600 to-teal-700',
    iconText: 'ZD',
    iconEmoji: '💬',
  },
  {
    id: 'freshdesk',
    name: 'Freshdesk',
    capabilitySummary: 'ticket, contact, and agent management',
    category: 'CRM',
    authType: 'api_key',
    phase: 4,
    iconBg: 'from-teal-500 to-cyan-600',
    iconText: 'FD',
    iconEmoji: '🎧',
  },

  {
    id: 'figma',
    name: 'Figma',
    capabilitySummary: 'file reads, component inspection, and asset export',
    category: 'Design',
    authType: 'oauth',
    phase: 5,
    iconBg: 'from-purple-500 to-pink-500',
    iconText: 'FG',
    iconEmoji: '🎨',
  },
  {
    id: 'canva',
    name: 'Canva',
    capabilitySummary: 'design creation, brand asset access, and template management',
    category: 'Design',
    authType: 'oauth',
    phase: 5,
    iconBg: 'from-cyan-400 to-blue-500',
    iconText: 'CV',
    iconEmoji: '🖼️',
  },
  {
    id: 'adobe',
    name: 'Adobe Creative Cloud',
    capabilitySummary: 'Creative Cloud asset and font access',
    category: 'Design',
    authType: 'oauth',
    phase: 5,
    iconBg: 'from-red-600 to-rose-800',
    iconText: 'Ae',
    iconEmoji: '🎨',
  },

  {
    id: 'quickbooks',
    name: 'QuickBooks',
    capabilitySummary: 'invoice, expense, and financial report management',
    category: 'Finance',
    authType: 'oauth',
    phase: 6,
    iconBg: 'from-green-600 to-emerald-700',
    iconText: 'QB',
    iconEmoji: '💰',
  },
  {
    id: 'xero',
    name: 'Xero',
    capabilitySummary: 'account, invoice, and payroll management',
    category: 'Finance',
    authType: 'oauth',
    phase: 6,
    iconBg: 'from-sky-400 to-blue-600',
    iconText: 'XR',
    iconEmoji: '💵',
  },
  {
    id: 'paypal',
    name: 'PayPal',
    capabilitySummary: 'payment sending, invoice management, and transaction queries',
    category: 'Finance',
    authType: 'oauth',
    phase: 6,
    iconBg: 'from-blue-600 to-indigo-700',
    iconText: 'PP',
    iconEmoji: '💳',
  },
  {
    id: 'square',
    name: 'Square',
    capabilitySummary: 'payment, inventory, and customer management',
    category: 'Finance',
    authType: 'oauth',
    phase: 6,
    iconBg: 'from-gray-700 to-gray-900',
    iconText: 'SQ',
    iconEmoji: '⬛',
  },
  {
    id: 'plaid',
    name: 'Plaid',
    capabilitySummary: 'bank account linking and financial data access',
    category: 'Finance',
    authType: 'oauth',
    phase: 7,
    iconBg: 'from-indigo-500 to-blue-700',
    iconText: 'PL',
    iconEmoji: '🏦',
  },

  {
    id: 'dropbox',
    name: 'Dropbox',
    capabilitySummary: 'file uploads, downloads, and management',
    category: 'Storage',
    authType: 'oauth',
    phase: 3,
    iconBg: 'from-blue-500 to-indigo-600',
    iconText: 'DX',
    iconEmoji: '📦',
  },
  {
    id: 'box',
    name: 'Box',
    capabilitySummary: 'file, folder, and collaboration management',
    category: 'Storage',
    authType: 'oauth',
    phase: 4,
    iconBg: 'from-blue-600 to-blue-800',
    iconText: 'BX',
    iconEmoji: '📦',
  },
  {
    id: 'sharepoint',
    name: 'SharePoint',
    capabilitySummary: 'file and site reads, writes, and management',
    category: 'Storage',
    authType: 'oauth',
    phase: 4,
    iconBg: 'from-blue-500 to-indigo-700',
    iconText: 'SP',
    iconEmoji: '📁',
  },

  {
    id: 'instagram',
    name: 'Instagram',
    capabilitySummary: 'content posting, media management, and insights over the Graph API',
    category: 'Social',
    authType: 'oauth',
    phase: 7,
    iconBg: 'from-purple-500 to-pink-500',
    iconText: 'IG',
    iconEmoji: '📸',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    capabilitySummary: 'page, post, ad, and audience insight management',
    category: 'Social',
    authType: 'oauth',
    phase: 7,
    iconBg: 'from-blue-600 to-blue-800',
    iconText: 'FB',
    iconEmoji: '👤',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    capabilitySummary: 'video search, playlist management, and channel analytics',
    category: 'Social',
    authType: 'oauth',
    phase: 7,
    iconBg: 'from-red-500 to-red-700',
    iconText: 'YT',
    iconEmoji: '▶️',
  },

  {
    id: 'posthog',
    name: 'PostHog',
    capabilitySummary: 'event, funnel, feature flag, and analytics queries',
    category: 'Marketing',
    authType: 'oauth',
    phase: 5,
    iconBg: 'from-orange-500 to-red-600',
    iconText: 'PH',
    iconEmoji: '🦔',
  },
  {
    id: 'segment',
    name: 'Segment',
    capabilitySummary: 'event tracking, audience management, and destination configuration',
    category: 'Marketing',
    authType: 'api_key',
    phase: 5,
    iconBg: 'from-green-500 to-teal-600',
    iconText: 'SG',
    iconEmoji: '📡',
  },
  {
    id: 'mixpanel',
    name: 'Mixpanel',
    capabilitySummary: 'event, funnel, and retention queries',
    category: 'Marketing',
    authType: 'api_key',
    phase: 5,
    iconBg: 'from-purple-500 to-indigo-600',
    iconText: 'MX',
    iconEmoji: '📊',
  },

  {
    id: 'huggingface',
    name: 'Hugging Face',
    capabilitySummary: 'hosted model inference and Hub browsing',
    category: 'AI',
    authType: 'oauth',
    phase: 8,
    iconBg: 'from-yellow-400 to-amber-600',
    iconText: 'HF',
    iconEmoji: '🤗',
  },
  {
    id: 'wandb',
    name: 'Weights and Biases',
    capabilitySummary: 'experiment logging, run comparison, and artifact management',
    category: 'AI',
    authType: 'api_key',
    phase: 8,
    iconBg: 'from-amber-500 to-yellow-600',
    iconText: 'WB',
    iconEmoji: '📈',
  },
  {
    id: 'anthropic-api',
    name: 'Anthropic',
    capabilitySummary: 'Claude model calls and API usage reporting',
    category: 'AI',
    authType: 'api_key',
    phase: 8,
    iconBg: 'from-orange-400 to-amber-600',
    iconText: 'AN',
    iconEmoji: '🤖',
  },
  {
    id: 'replicate',
    name: 'Replicate',
    capabilitySummary: 'hosted open-source model runs',
    category: 'AI',
    authType: 'api_key',
    phase: 8,
    iconBg: 'from-gray-700 to-gray-900',
    iconText: 'RC',
    iconEmoji: '🔁',
  },

  {
    id: 'epic-fhir',
    name: 'Epic FHIR',
    capabilitySummary: 'patient record, appointment, and clinical data access over FHIR R4',
    category: 'Healthcare',
    authType: 'oauth',
    phase: 9,
    iconBg: 'from-red-500 to-rose-700',
    iconText: 'EP',
    iconEmoji: '🏥',
  },
  {
    id: 'cerner',
    name: 'Cerner',
    capabilitySummary: 'patient data, clinical event, and care plan queries over FHIR',
    category: 'Healthcare',
    authType: 'oauth',
    phase: 9,
    iconBg: 'from-blue-600 to-indigo-800',
    iconText: 'CN',
    iconEmoji: '🏥',
  },
];

export const CONNECTORS: Connector[] = CONNECTOR_SEEDS.map((seed) => ({
  ...seed,
  description: buildConnectorDescription(seed),
  riskClass: getConnectorCapability(seed.id)?.riskClass ?? 'high-impact',
  actionCount: getDeclaredConnectorActions(seed.id).length,
}));

export const CATEGORIES: { label: string; value: ConnectorCategory | 'All' }[] = [
  { label: 'All', value: 'All' },
  { label: 'Productivity', value: 'Productivity' },
  { label: 'Developer', value: 'Developer' },
  { label: 'Communication', value: 'Communication' },
  { label: 'CRM', value: 'CRM' },
  { label: 'Marketing', value: 'Marketing' },
  { label: 'Finance', value: 'Finance' },
  { label: 'Social', value: 'Social' },
  { label: 'Cloud', value: 'Cloud' },
  { label: 'Data', value: 'Data' },
  { label: 'Design', value: 'Design' },
  { label: 'Storage', value: 'Storage' },
  { label: 'AI', value: 'AI' },
  { label: 'Healthcare', value: 'Healthcare' },
];
