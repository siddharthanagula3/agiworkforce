/**
 * Official connector logo sources used when a local Simple Icons glyph is unavailable.
 * These are rendered with safe image attributes and are gated by the app CSP's img-src.
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
    // Official Slack brand mark (SVG from Slack's CDN)
    url: 'https://a.slack-edge.com/80588/marketing/img/icons/icon_slack_hash_colored.png',
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
    // Microsoft brand CDN — official Outlook icon. Special:FilePath (not the
    // hashed /wikipedia/commons/x/xx/ path) so this keeps resolving when
    // Commons renames/re-hashes the underlying file.
    url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Microsoft%20Office%20Outlook%20%282018%E2%80%93present%29.svg',
    width: 32,
    height: 32,
  },
  onedrive: {
    // Microsoft brand CDN — official OneDrive icon
    url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Microsoft%20Office%20OneDrive%20%282019%E2%80%93present%29.svg',
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
    // Microsoft brand CDN — official Teams icon
    url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Microsoft%20Office%20Teams%20%282025%E2%80%93present%29.svg',
    width: 32,
    height: 32,
  },
  confluence: {
    url: 'https://wac-cdn.atlassian.com/dam/jcr:4f38bc64-eed0-4e78-8e90-f5c9db62f87d/Confluence-Icon-gradient-blue.svg',
    width: 32,
    height: 32,
  },
  asana: {
    url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Asana%20logo.svg',
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
    // Official Salesforce cloud mark (SVG via Wikipedia — official logo)
    url: 'https://upload.wikimedia.org/wikipedia/commons/f/f9/Salesforce.com_logo.svg',
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
    // Official LinkedIn "in" mark (SVG)
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
    // OpenAI official logo mark (SVG via Wikipedia)
    url: 'https://upload.wikimedia.org/wikipedia/commons/4/4d/OpenAI_Logo.svg',
    width: 32,
    height: 32,
  },
  elevenlabs: {
    url: 'https://cdn.11labs.ai/favicon.ico',
    width: 32,
    height: 32,
  },

  // Productivity (additional)
  airtable: {
    url: 'https://www.google.com/s2/favicons?domain=airtable.com&sz=64',
    width: 32,
    height: 32,
  },
  monday: {
    // monday.com official mark (via Wikipedia SVG)
    url: 'https://upload.wikimedia.org/wikipedia/commons/c/c6/Monday_logo.svg',
    width: 32,
    height: 32,
  },
  clickup: {
    url: 'https://www.google.com/s2/favicons?domain=clickup.com&sz=64',
    width: 32,
    height: 32,
  },
  trello: {
    url: 'https://www.google.com/s2/favicons?domain=trello.com&sz=64',
    width: 32,
    height: 32,
  },
  todoist: {
    url: 'https://www.google.com/s2/favicons?domain=todoist.com&sz=64',
    width: 32,
    height: 32,
  },
  basecamp: {
    url: 'https://www.google.com/s2/favicons?domain=basecamp.com&sz=64',
    width: 32,
    height: 32,
  },
  evernote: {
    url: 'https://www.google.com/s2/favicons?domain=evernote.com&sz=64',
    width: 32,
    height: 32,
  },

  // Developer (additional)
  vercel: {
    url: 'https://www.google.com/s2/favicons?domain=vercel.com&sz=64',
    width: 32,
    height: 32,
  },
  sentry: {
    url: 'https://www.google.com/s2/favicons?domain=sentry.io&sz=64',
    width: 32,
    height: 32,
  },
  datadog: {
    url: 'https://www.google.com/s2/favicons?domain=datadoghq.com&sz=64',
    width: 32,
    height: 32,
  },
  pagerduty: {
    url: 'https://www.google.com/s2/favicons?domain=pagerduty.com&sz=64',
    width: 32,
    height: 32,
  },
  circleci: {
    url: 'https://www.google.com/s2/favicons?domain=circleci.com&sz=64',
    width: 32,
    height: 32,
  },
  gitlab: {
    url: 'https://www.google.com/s2/favicons?domain=gitlab.com&sz=64',
    width: 32,
    height: 32,
  },
  bitbucket: {
    url: 'https://www.google.com/s2/favicons?domain=bitbucket.org&sz=64',
    width: 32,
    height: 32,
  },

  // Communication
  telegram: {
    url: 'https://www.google.com/s2/favicons?domain=telegram.org&sz=64',
    width: 32,
    height: 32,
  },
  whatsapp: {
    url: 'https://www.google.com/s2/favicons?domain=whatsapp.com&sz=64',
    width: 32,
    height: 32,
  },
  twilio: {
    url: 'https://www.google.com/s2/favicons?domain=twilio.com&sz=64',
    width: 32,
    height: 32,
  },
  sendgrid: {
    url: 'https://www.google.com/s2/favicons?domain=sendgrid.com&sz=64',
    width: 32,
    height: 32,
  },

  // Cloud / Infra
  aws: {
    // AWS official smile mark (SVG via Wikipedia)
    url: 'https://upload.wikimedia.org/wikipedia/commons/9/93/Amazon_Web_Services_Logo.svg',
    width: 32,
    height: 32,
  },
  gcp: {
    // Google Cloud official mark (via Google's own CDN — covered by Simple Icons for gcp)
    url: 'https://www.gstatic.com/devrel-devsite/prod/v4a3800e32bb7ffae9f5e2f46d2ab96f0038f29dcb18e96d9ff7bb86b6b1d3c49/cloud/images/favicons/onecloud/super_cloud.png',
    width: 32,
    height: 32,
  },
  azure: {
    // Microsoft Azure official mark (SVG via Wikipedia)
    url: 'https://upload.wikimedia.org/wikipedia/commons/a/a8/Microsoft_Azure_Logo.svg',
    width: 32,
    height: 32,
  },
  cloudflare: {
    url: 'https://www.google.com/s2/favicons?domain=cloudflare.com&sz=64',
    width: 32,
    height: 32,
  },
  digitalocean: {
    url: 'https://www.google.com/s2/favicons?domain=digitalocean.com&sz=64',
    width: 32,
    height: 32,
  },

  // Data
  snowflake: {
    url: 'https://www.google.com/s2/favicons?domain=snowflake.com&sz=64',
    width: 32,
    height: 32,
  },
  bigquery: {
    url: 'https://www.google.com/s2/favicons?domain=cloud.google.com&sz=64',
    width: 32,
    height: 32,
  },
  databricks: {
    url: 'https://www.google.com/s2/favicons?domain=databricks.com&sz=64',
    width: 32,
    height: 32,
  },
  postgresql: {
    url: 'https://www.google.com/s2/favicons?domain=postgresql.org&sz=64',
    width: 32,
    height: 32,
  },
  mongodb: {
    url: 'https://www.google.com/s2/favicons?domain=mongodb.com&sz=64',
    width: 32,
    height: 32,
  },
  redis: {
    url: 'https://www.google.com/s2/favicons?domain=redis.io&sz=64',
    width: 32,
    height: 32,
  },
  elasticsearch: {
    url: 'https://www.google.com/s2/favicons?domain=elastic.co&sz=64',
    width: 32,
    height: 32,
  },

  // CRM (additional)
  pipedrive: {
    url: 'https://www.google.com/s2/favicons?domain=pipedrive.com&sz=64',
    width: 32,
    height: 32,
  },
  zendesk: {
    url: 'https://www.google.com/s2/favicons?domain=zendesk.com&sz=64',
    width: 32,
    height: 32,
  },
  freshdesk: {
    url: 'https://www.google.com/s2/favicons?domain=freshdesk.com&sz=64',
    width: 32,
    height: 32,
  },

  // Design
  figma: {
    url: 'https://www.google.com/s2/favicons?domain=figma.com&sz=64',
    width: 32,
    height: 32,
  },
  canva: {
    // No current Canva mark on Commons (file was removed); favicon service
    // resolves Canva's own site icon instead of falling back to a bare tile.
    url: 'https://www.google.com/s2/favicons?domain=canva.com&sz=64',
    width: 32,
    height: 32,
  },
  adobe: {
    // Adobe official mark (SVG via Wikipedia)
    url: 'https://upload.wikimedia.org/wikipedia/commons/8/8d/Adobe_Corporate_Logo.png',
    width: 48,
    height: 32,
  },

  // Finance (additional)
  quickbooks: {
    url: 'https://www.google.com/s2/favicons?domain=quickbooks.intuit.com&sz=64',
    width: 32,
    height: 32,
  },
  xero: {
    url: 'https://www.google.com/s2/favicons?domain=xero.com&sz=64',
    width: 32,
    height: 32,
  },
  paypal: {
    url: 'https://www.google.com/s2/favicons?domain=paypal.com&sz=64',
    width: 32,
    height: 32,
  },
  square: {
    url: 'https://www.google.com/s2/favicons?domain=squareup.com&sz=64',
    width: 32,
    height: 32,
  },
  plaid: {
    url: 'https://www.google.com/s2/favicons?domain=plaid.com&sz=64',
    width: 32,
    height: 32,
  },

  // Storage
  dropbox: {
    url: 'https://www.google.com/s2/favicons?domain=dropbox.com&sz=64',
    width: 32,
    height: 32,
  },
  box: {
    url: 'https://www.google.com/s2/favicons?domain=box.com&sz=64',
    width: 32,
    height: 32,
  },
  sharepoint: {
    // Microsoft SharePoint official mark (SVG via Wikipedia)
    url: 'https://commons.wikimedia.org/wiki/Special:FilePath/Microsoft%20Office%20SharePoint%20%282019%E2%80%93present%29.svg',
    width: 32,
    height: 32,
  },

  // Social (additional)
  instagram: {
    url: 'https://www.google.com/s2/favicons?domain=instagram.com&sz=64',
    width: 32,
    height: 32,
  },
  facebook: {
    url: 'https://www.google.com/s2/favicons?domain=facebook.com&sz=64',
    width: 32,
    height: 32,
  },
  youtube: {
    url: 'https://www.google.com/s2/favicons?domain=youtube.com&sz=64',
    width: 32,
    height: 32,
  },

  // Marketing (additional)
  posthog: {
    url: 'https://www.google.com/s2/favicons?domain=posthog.com&sz=64',
    width: 32,
    height: 32,
  },
  segment: {
    url: 'https://www.google.com/s2/favicons?domain=segment.com&sz=64',
    width: 32,
    height: 32,
  },
  mixpanel: {
    url: 'https://www.google.com/s2/favicons?domain=mixpanel.com&sz=64',
    width: 32,
    height: 32,
  },

  // AI / ML (additional)
  huggingface: {
    url: 'https://www.google.com/s2/favicons?domain=huggingface.co&sz=64',
    width: 32,
    height: 32,
  },
  wandb: {
    url: 'https://www.google.com/s2/favicons?domain=wandb.ai&sz=64',
    width: 32,
    height: 32,
  },
  'anthropic-api': {
    url: 'https://www.google.com/s2/favicons?domain=anthropic.com&sz=64',
    width: 32,
    height: 32,
  },
  replicate: {
    url: 'https://www.google.com/s2/favicons?domain=replicate.com&sz=64',
    width: 32,
    height: 32,
  },

  // Healthcare
  'epic-fhir': {
    url: 'https://www.google.com/s2/favicons?domain=epic.com&sz=64',
    width: 32,
    height: 32,
  },
  cerner: {
    url: 'https://www.google.com/s2/favicons?domain=cerner.com&sz=64',
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

/*
 * AUDIT-FIX CRIT-001 — `CONNECTOR_TOOLS` / `getConnectorTools()` deleted.
 *
 * That map listed five to ten friendly tool names for all 89 catalog entries
 * ("Read emails", "Send email", "Search inbox", …) while exactly one entry —
 * github — had tools that exist in a runtime path. Every consumer already had
 * to special-case github before rendering it, in three different ways, which is
 * how a fabricated list survives: nobody trusts it, everybody keeps it.
 *
 * The sanctioned static tool list is `supportedActions` in
 * `@/lib/connectors/catalog`, which is empty for every connector without a
 * shipped adapter. Tools a connected remote MCP server actually offers are
 * discovered at runtime by `catalogToConnectorToolDefs`
 * (lib/user-connector-tools.ts) and no static table can mirror them.
 */
