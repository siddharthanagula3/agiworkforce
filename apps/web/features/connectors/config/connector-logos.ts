/**
 * Official connector logos mapping
 * Uses official SVG/PNG logos from brand repositories and CDNs
 * Fallback to placeholder if logo unavailable
 */

export const CONNECTOR_LOGOS: Record<
  string,
  {
    url: string;
    width?: number;
    height?: number;
    bgColor?: string;
  }
> = {
  // Productivity
  gmail: {
    url: 'https://www.gstatic.com/images/icons/material/system/1x/mail_outline_black_20dp.svg',
    bgColor: '#EA4335',
  },
  'google-drive': {
    url: 'https://upload.wikimedia.org/wikipedia/commons/1/12/Google_Drive_icon_%282020%29.svg',
    width: 32,
    height: 32,
  },
  notion: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/e/e9/Notion-logo.svg',
    width: 32,
    height: 32,
  },
  slack: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/7/76/Slack_icon.svg',
    width: 32,
    height: 32,
  },
  github: {
    url: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.svg',
    width: 32,
    height: 32,
  },
  'google-sheets': {
    url: 'https://www.gstatic.com/images/icons/material/system/1x/description_black_20dp.svg',
    bgColor: '#0F9D58',
  },
  outlook: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/d/df/Microsoft_Office_Outlook_%282018–present%29.svg',
    width: 32,
    height: 32,
  },
  onedrive: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/5/5f/OneDrive_icon.svg',
    width: 32,
    height: 32,
  },
  linear: {
    url: 'https://cdn-icons-png.flaticon.com/128/3669/3669999.png',
    width: 32,
    height: 32,
  },
  jira: {
    url: 'https://wac-cdn.atlassian.com/dam/jcr:e348b945-e926-4847-9ba4-65e2a4b9a454/Jira-Icon-gradient-blue.svg',
    width: 32,
    height: 32,
  },

  // Collaboration
  teams: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/c/c9/Microsoft_Office_Teams_%282018%E2%80%93present%29.svg',
    width: 32,
    height: 32,
  },
  confluence: {
    url: 'https://wac-cdn.atlassian.com/dam/jcr:4f38bc64-eed0-4e78-8e90-f5c9db62f87d/Confluence-Icon-gradient-blue.svg',
    width: 32,
    height: 32,
  },
  asana: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/e/e1/Asana_logo.svg',
    width: 32,
    height: 32,
  },
  zoom: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/7/7b/Zoom_Communications_Logo.svg',
    width: 32,
    height: 32,
  },

  // CRM
  hubspot: {
    url: 'https://www.hubspot.com/hubfs/assets/hubspot.com/style-guide/brand-guidelines/logos/HubSpot-Inversed-Logo.svg',
    width: 32,
    height: 32,
  },
  salesforce: {
    url: 'https://www.salesforce.com/content/dam/web/en_us/www/images/icons/logo-salesforce.svg',
    width: 32,
    height: 32,
  },
  calendly: {
    url: 'https://assets.calendly.com/assets/frontend/media/calendly-logo.svg',
    width: 32,
    height: 32,
  },
  intercom: {
    url: 'https://www.intercom.com/favicon-32x32.png',
    width: 32,
    height: 32,
  },

  // Marketing
  'google-analytics': {
    url: 'https://www.gstatic.com/images/branding/product/1x/googleg_120.png',
    width: 32,
    height: 32,
  },
  mailchimp: {
    url: 'https://eep.io/mc-cdn-images/template_images/mailchimp-icon.png',
    width: 32,
    height: 32,
  },

  // Finance
  stripe: {
    url: 'https://www.stripe.com/favicon.ico',
    width: 32,
    height: 32,
  },
  shopify: {
    url: 'https://www.shopify.com/favicon.ico',
    width: 32,
    height: 32,
  },

  // Social
  linkedin: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/c/ca/LinkedIn_logo_initials.png',
    width: 32,
    height: 32,
  },
  twitter: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/6/6f/Logo_of_Twitter.svg',
    width: 32,
    height: 32,
  },
  discord: {
    url: 'https://discord.com/assets/f8389ca1a741a115313bede9f531b3da.png',
    width: 32,
    height: 32,
  },

  // AI
  openai: {
    url: 'https://cdn.openai.com/API/favicon.png',
    width: 32,
    height: 32,
  },
  elevenlabs: {
    url: 'https://cdn.11labs.ai/favicon.ico',
    width: 32,
    height: 32,
  },

  // Exclusive
  'local-filesystem': {
    url: '/icons/filesystem.svg',
    width: 32,
    height: 32,
  },
  terminal: {
    url: '/icons/terminal.svg',
    width: 32,
    height: 32,
  },
  'browser-automation': {
    url: '/icons/browser.svg',
    width: 32,
    height: 32,
  },
  'screen-vision': {
    url: '/icons/vision.svg',
    width: 32,
    height: 32,
  },
  ollama: {
    url: '/icons/ollama.svg',
    width: 32,
    height: 32,
  },
};

/**
 * Get logo URL for connector
 * Returns URL or fallback gradient bg color
 */
export function getConnectorLogo(connectorId: string) {
  return CONNECTOR_LOGOS[connectorId] || null;
}

/**
 * Check if connector has official logo
 */
export function hasOfficialLogo(connectorId: string): boolean {
  return !!CONNECTOR_LOGOS[connectorId];
}

// ─── Tool Inventory ────────────────────────────────────────────────────────────

/**
 * Representative tools exposed by each connector.
 * Used for per-tool permission controls in the UI.
 * Names are user-facing labels, not internal API identifiers.
 */
export const CONNECTOR_TOOLS: Record<string, string[]> = {
  // Productivity
  gmail: ['Read emails', 'Send email', 'Search inbox', 'Manage labels', 'Create draft'],
  'google-drive': ['List files', 'Read file', 'Upload file', 'Create folder', 'Share file'],
  notion: ['Read pages', 'Create page', 'Update page', 'Search', 'Delete page'],
  slack: ['Read messages', 'Send message', 'List channels', 'Upload file', 'Manage reactions'],
  'google-sheets': [
    'Read cells',
    'Write cells',
    'Create spreadsheet',
    'Run formula',
    'List sheets',
  ],
  outlook: ['Read emails', 'Send email', 'Search inbox', 'Manage calendar', 'Create event'],
  onedrive: ['List files', 'Read file', 'Upload file', 'Create folder', 'Delete file'],

  // Developer
  github: ['Read repos', 'Create PR', 'Read issues', 'Create issue', 'Push code'],
  linear: ['List issues', 'Create issue', 'Update issue', 'Manage cycles', 'List projects'],
  jira: ['List issues', 'Create issue', 'Update issue', 'Manage sprints', 'List projects'],

  // Collaboration
  teams: ['Read messages', 'Send message', 'List channels', 'Manage meetings', 'Search'],
  confluence: ['Read pages', 'Create page', 'Update page', 'Search spaces', 'Delete page'],
  asana: ['List tasks', 'Create task', 'Update task', 'Manage projects', 'List teams'],
  zoom: ['Schedule meeting', 'List meetings', 'Get recordings', 'Update meeting', 'Delete meeting'],

  // CRM
  hubspot: ['Read contacts', 'Create contact', 'Update contact', 'Manage deals', 'Log note'],
  salesforce: ['Read objects', 'Create record', 'Update record', 'Run query', 'Manage leads'],
  calendly: ['List event types', 'Get bookings', 'Create invite', 'Cancel booking'],
  intercom: ['Read conversations', 'Send message', 'Manage tickets', 'Search customers'],

  // Marketing
  'google-analytics': ['Run report', 'Get audience', 'Get conversions', 'Get traffic sources'],
  mailchimp: ['List audiences', 'Create campaign', 'Send campaign', 'Manage templates'],

  // Finance
  stripe: ['List payments', 'Create payment', 'Manage subscriptions', 'Get customers', 'Refund'],
  shopify: [
    'List products',
    'Create product',
    'Manage orders',
    'Get customers',
    'Update inventory',
  ],

  // Social
  linkedin: ['Post content', 'Read profile', 'Search network', 'Get analytics'],
  twitter: ['Post tweet', 'Read timeline', 'Search content', 'Manage account'],
  discord: ['Send message', 'Read messages', 'Manage channels', 'Manage roles', 'List servers'],

  // AI
  openai: ['Run completion', 'Manage assistants', 'Create embedding', 'List models'],
  elevenlabs: ['Generate speech', 'Clone voice', 'List voices', 'Create audio'],

  // Exclusive
  'local-filesystem': ['Read file', 'Write file', 'List directory', 'Delete file', 'Move file'],
  terminal: ['Run command', 'Run script', 'Manage processes', 'Stream output', 'Set env'],
  'browser-automation': [
    'Navigate URL',
    'Click element',
    'Fill form',
    'Scrape page',
    'Take screenshot',
  ],
  'screen-vision': ['Take screenshot', 'OCR text', 'Find element', 'Click on screen'],
  ollama: ['Run inference', 'List models', 'Pull model', 'Delete model'],
};

/**
 * Get the list of tools for a connector.
 * Returns an empty array if no tools are defined.
 */
export function getConnectorTools(connectorId: string): string[] {
  return CONNECTOR_TOOLS[connectorId] ?? [];
}
