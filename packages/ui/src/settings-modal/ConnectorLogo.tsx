'use client';

/**
 * ConnectorLogo — shared brand-logo component for Settings panels.
 *
 * Resolution order (no tiles, zero mock initials):
 *   1. simple-icons glyph — brand SVG path in brand hex, if present in v16
 *   2. Official brand asset URL — <img> rendered with the real brand mark
 *   3. Gradient tile + initials — LAST RESORT only when neither above matches
 *
 * All simple-icons imports are confirmed present in simple-icons v16.18.1.
 * Brands absent from v16 (Slack, OpenAI, Salesforce, Microsoft, LinkedIn,
 * Canva, Adobe, AWS, Azure, Monday, Twilio, SendGrid, Pipedrive, Freshdesk,
 * SharePoint, Segment, Plaid, Cerner) resolve via CONNECTOR_LOGO_URLS below.
 *
 * packages/ui cannot import from apps/web, so the URL map is self-contained here.
 * It mirrors the authoritative entries in
 * apps/web/features/connectors/config/connector-logos.ts.
 */

import { useState } from 'react';
import {
  siAirtable,
  siAnthropic,
  siAsana,
  siAtlassian,
  siBasecamp,
  siBitbucket,
  siBox,
  siCalendly,
  siCircleci,
  siClickup,
  siCloudflare,
  siConfluence,
  siDatabricks,
  siDatadog,
  siDigitalocean,
  siDiscord,
  siDropbox,
  siElasticsearch,
  siElevenlabs,
  siEvernote,
  siFacebook,
  siFigma,
  siGithub,
  siGitlab,
  siGmail,
  siGoogleanalytics,
  siGooglebigquery,
  siGooglecalendar,
  siGooglecloud,
  siGoogledrive,
  siGooglesheets,
  siHubspot,
  siHuggingface,
  siInstagram,
  siIntercom,
  siJira,
  siLinear,
  siMailchimp,
  siMixpanel,
  siModelcontextprotocol,
  siMongodb,
  siN8n,
  siNotion,
  siOllama,
  siPagerduty,
  siPaypal,
  siPostgresql,
  siPosthog,
  siQuickbooks,
  siRedis,
  siReplicate,
  siSentry,
  siShopify,
  siSnowflake,
  siSquare,
  siStripe,
  siTelegram,
  siTodoist,
  siTrello,
  siVercel,
  siWeightsandbiases,
  siWhatsapp,
  siX,
  siXero,
  siYoutube,
  siZendesk,
  siZoom,
} from 'simple-icons';
import { cn } from '../cn';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SimpleIconData {
  path: string;
  hex: string;
  title: string;
}

// ---------------------------------------------------------------------------
// Tier 1: simple-icons glyphs (v16 confirmed)
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, SimpleIconData> = {
  // Google Suite
  gmail: siGmail,
  'google-calendar': siGooglecalendar,
  'google-drive': siGoogledrive,
  'google-sheets': siGooglesheets,
  'google-analytics': siGoogleanalytics,
  bigquery: siGooglebigquery,
  gcp: siGooglecloud,

  // Productivity
  notion: siNotion,
  airtable: siAirtable,
  clickup: siClickup,
  trello: siTrello,
  todoist: siTodoist,
  basecamp: siBasecamp,
  evernote: siEvernote,
  asana: siAsana,

  // Developer
  github: siGithub,
  gitlab: siGitlab,
  bitbucket: siBitbucket,
  linear: siLinear,
  sentry: siSentry,
  datadog: siDatadog,
  pagerduty: siPagerduty,
  circleci: siCircleci,
  vercel: siVercel,
  n8n: siN8n,

  // Collaboration / Comm
  confluence: siConfluence,
  atlassian: siAtlassian,
  jira: siJira,
  zoom: siZoom,
  discord: siDiscord,
  telegram: siTelegram,
  whatsapp: siWhatsapp,

  // CRM / Sales
  hubspot: siHubspot,
  calendly: siCalendly,
  intercom: siIntercom,
  zendesk: siZendesk,

  // Marketing
  mailchimp: siMailchimp,
  mixpanel: siMixpanel,
  posthog: siPosthog,

  // Social
  twitter: siX,
  instagram: siInstagram,
  facebook: siFacebook,
  youtube: siYoutube,

  // Finance
  stripe: siStripe,
  shopify: siShopify,
  quickbooks: siQuickbooks,
  xero: siXero,
  paypal: siPaypal,
  square: siSquare,

  // Design
  figma: siFigma,

  // AI / ML
  'anthropic-api': siAnthropic,
  huggingface: siHuggingface,
  wandb: siWeightsandbiases,
  replicate: siReplicate,
  ollama: siOllama,
  elevenlabs: siElevenlabs,

  // MCP
  modelcontextprotocol: siModelcontextprotocol,
  context7: siModelcontextprotocol,

  // Cloud / Infra
  cloudflare: siCloudflare,
  digitalocean: siDigitalocean,

  // Data
  snowflake: siSnowflake,
  databricks: siDatabricks,
  postgresql: siPostgresql,
  mongodb: siMongodb,
  redis: siRedis,
  elasticsearch: siElasticsearch,

  // Storage
  dropbox: siDropbox,
  box: siBox,
};

// ---------------------------------------------------------------------------
// Tier 2: official brand-asset URLs
// Brands absent from simple-icons v16; covers every connector in the catalog.
// Mirror of apps/web/features/connectors/config/connector-logos.ts (key entries).
// ---------------------------------------------------------------------------

const CONNECTOR_LOGO_URLS: Record<string, string> = {
  // Microsoft family — official SVGs via Wikimedia/Microsoft
  slack: 'https://a.slack-edge.com/80588/marketing/img/icons/icon_slack_hash_colored.png',
  outlook:
    'https://upload.wikimedia.org/wikipedia/commons/d/df/Microsoft_Office_Outlook_%282018%E2%80%93present%29.svg',
  onedrive:
    'https://upload.wikimedia.org/wikipedia/commons/3/3c/Microsoft_Office_OneDrive_%282019%E2%80%93present%29.svg',
  teams:
    'https://upload.wikimedia.org/wikipedia/commons/c/c9/Microsoft_Office_Teams_%282018%E2%80%93present%29.svg',
  sharepoint:
    'https://upload.wikimedia.org/wikipedia/commons/e/e1/Microsoft_Office_SharePoint_%282019%E2%80%93present%29.svg',
  microsoft365:
    'https://upload.wikimedia.org/wikipedia/commons/4/4f/Microsoft_Office_2013-2019_logo.svg',
  azure: 'https://upload.wikimedia.org/wikipedia/commons/a/a8/Microsoft_Azure_Logo.svg',

  // AI
  openai: 'https://upload.wikimedia.org/wikipedia/commons/4/4d/OpenAI_Logo.svg',

  // CRM
  salesforce: 'https://upload.wikimedia.org/wikipedia/commons/f/f9/Salesforce.com_logo.svg',
  pipedrive: 'https://www.google.com/s2/favicons?domain=pipedrive.com&sz=64',
  freshdesk: 'https://www.google.com/s2/favicons?domain=freshdesk.com&sz=64',

  // Social / Comm
  linkedin: 'https://upload.wikimedia.org/wikipedia/commons/c/ca/LinkedIn_logo_initials.png',
  twilio: 'https://www.google.com/s2/favicons?domain=twilio.com&sz=64',
  sendgrid: 'https://www.google.com/s2/favicons?domain=sendgrid.com&sz=64',

  // Design
  canva: 'https://upload.wikimedia.org/wikipedia/commons/b/bb/Canva_Logo.svg',
  adobe: 'https://upload.wikimedia.org/wikipedia/commons/8/8d/Adobe_Corporate_Logo.png',

  // Cloud / Infra
  aws: 'https://upload.wikimedia.org/wikipedia/commons/9/93/Amazon_Web_Services_Logo.svg',

  // Marketing
  segment: 'https://www.google.com/s2/favicons?domain=segment.com&sz=64',
  monday: 'https://upload.wikimedia.org/wikipedia/commons/c/c6/Monday_logo.svg',

  // Finance
  plaid: 'https://www.google.com/s2/favicons?domain=plaid.com&sz=64',

  // Healthcare
  'epic-fhir': 'https://www.google.com/s2/favicons?domain=epic.com&sz=64',
  cerner: 'https://www.google.com/s2/favicons?domain=oracle.com&sz=64',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getIcon(id: string): SimpleIconData | null {
  return ICON_MAP[id.toLowerCase()] ?? null;
}

function getLogoUrl(id: string): string | null {
  return CONNECTOR_LOGO_URLS[id.toLowerCase()] ?? null;
}

/**
 * Pure-black / near-black brand glyphs (Notion #000000, GitHub #181717, etc.)
 * would be invisible on a same-colored background. Render them in the theme's
 * foreground color via `currentColor` so they stay legible in BOTH light and
 * dark mode (dark glyph on light surface, light glyph on dark surface). Colored
 * brands keep their own hex, which contrasts fine against the neutral tile.
 */
function fillColor(icon: SimpleIconData): string {
  const hex = icon.hex.toUpperCase();
  if (hex === '000000' || hex === '181717' || hex === '181818') return 'currentColor';
  return `#${icon.hex}`;
}

// ---------------------------------------------------------------------------
// SIZE config
// ---------------------------------------------------------------------------

const SIZE = {
  sm: { wrapper: 'h-8 w-8 rounded-lg', svg: 16, img: 20 },
  md: { wrapper: 'h-9 w-9 rounded-lg', svg: 18, img: 22 },
  lg: { wrapper: 'h-11 w-11 rounded-xl', svg: 22, img: 28 },
} as const;

// ---------------------------------------------------------------------------
// ConnectorLogo
// ---------------------------------------------------------------------------

export interface ConnectorLogoProps {
  /** Connector id used to look up the brand logo */
  connectorId: string;
  /** Fallback gradient Tailwind classes — only used when no glyph or URL matches */
  fallbackGradient?: string;
  /** Fallback 1-2 char text rendered on the gradient tile */
  fallbackText?: string;
  /** Icon size variant */
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function ConnectorLogo({
  connectorId,
  fallbackGradient = 'from-zinc-600 to-zinc-700',
  fallbackText,
  size = 'md',
  className,
}: ConnectorLogoProps) {
  const [urlFailed, setUrlFailed] = useState(false);

  const id = connectorId.toLowerCase();
  const icon = getIcon(id);
  const logoUrl = getLogoUrl(id);
  const { wrapper, svg, img } = SIZE[size];

  // Tier 1: simple-icons glyph
  if (icon) {
    return (
      <div
        className={cn(
          'flex shrink-0 items-center justify-center border border-border/60 bg-muted/30',
          wrapper,
          className,
        )}
        aria-hidden="true"
      >
        <svg
          role="img"
          aria-label={`${icon.title} logo`}
          viewBox="0 0 24 24"
          width={svg}
          height={svg}
          className="text-foreground"
          style={{ fill: fillColor(icon), flexShrink: 0 }}
        >
          <path d={icon.path} />
        </svg>
      </div>
    );
  }

  // Tier 2: official brand-asset URL image
  if (logoUrl && !urlFailed) {
    return (
      <div
        className={cn(
          'flex shrink-0 items-center justify-center overflow-hidden border border-border/60 bg-white/10',
          wrapper,
          className,
        )}
        aria-hidden="true"
      >
        <img
          src={logoUrl}
          alt=""
          width={img}
          height={img}
          className="object-contain"
          style={{ maxWidth: img, maxHeight: img }}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setUrlFailed(true)}
        />
      </div>
    );
  }

  // Tier 3: gradient tile — last resort
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-xs font-bold text-white',
        fallbackGradient,
        wrapper,
        className,
      )}
      aria-hidden="true"
    >
      {fallbackText ?? connectorId.slice(0, 2).toUpperCase()}
    </div>
  );
}
