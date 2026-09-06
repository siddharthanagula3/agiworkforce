'use client';

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

interface SimpleIconData {
  path: string;
  hex: string;
  title: string;
}

const ICON_MAP: Record<string, SimpleIconData> = {
  gmail: siGmail,
  'google-calendar': siGooglecalendar,
  'google-drive': siGoogledrive,
  'google-sheets': siGooglesheets,
  'google-analytics': siGoogleanalytics,
  bigquery: siGooglebigquery,
  gcp: siGooglecloud,

  notion: siNotion,
  airtable: siAirtable,
  clickup: siClickup,
  trello: siTrello,
  todoist: siTodoist,
  basecamp: siBasecamp,
  evernote: siEvernote,
  asana: siAsana,

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

  confluence: siConfluence,
  atlassian: siAtlassian,
  jira: siJira,
  zoom: siZoom,
  discord: siDiscord,
  telegram: siTelegram,
  whatsapp: siWhatsapp,

  hubspot: siHubspot,
  calendly: siCalendly,
  intercom: siIntercom,
  zendesk: siZendesk,

  mailchimp: siMailchimp,
  mixpanel: siMixpanel,
  posthog: siPosthog,

  twitter: siX,
  instagram: siInstagram,
  facebook: siFacebook,
  youtube: siYoutube,

  stripe: siStripe,
  shopify: siShopify,
  quickbooks: siQuickbooks,
  xero: siXero,
  paypal: siPaypal,
  square: siSquare,

  figma: siFigma,

  'anthropic-api': siAnthropic,
  huggingface: siHuggingface,
  wandb: siWeightsandbiases,
  replicate: siReplicate,
  ollama: siOllama,
  elevenlabs: siElevenlabs,

  modelcontextprotocol: siModelcontextprotocol,
  context7: siModelcontextprotocol,

  cloudflare: siCloudflare,
  digitalocean: siDigitalocean,

  snowflake: siSnowflake,
  databricks: siDatabricks,
  postgresql: siPostgresql,
  mongodb: siMongodb,
  redis: siRedis,
  elasticsearch: siElasticsearch,

  dropbox: siDropbox,
  box: siBox,
};

const CONNECTOR_LOGO_URLS: Record<string, string> = {
  slack: 'https://a.slack-edge.com/80588/marketing/img/icons/icon_slack_hash_colored.png',
  outlook:
    'https://commons.wikimedia.org/wiki/Special:FilePath/Microsoft%20Office%20Outlook%20%282018%E2%80%93present%29.svg',
  onedrive:
    'https://commons.wikimedia.org/wiki/Special:FilePath/Microsoft%20Office%20OneDrive%20%282019%E2%80%93present%29.svg',
  teams:
    'https://commons.wikimedia.org/wiki/Special:FilePath/Microsoft%20Office%20Teams%20%282025%E2%80%93present%29.svg',
  sharepoint:
    'https://commons.wikimedia.org/wiki/Special:FilePath/Microsoft%20Office%20SharePoint%20%282019%E2%80%93present%29.svg',
  microsoft365:
    'https://commons.wikimedia.org/wiki/Special:FilePath/Microsoft%20365%20%282022%29.svg',
  azure: 'https://upload.wikimedia.org/wikipedia/commons/a/a8/Microsoft_Azure_Logo.svg',

  openai: 'https://upload.wikimedia.org/wikipedia/commons/4/4d/OpenAI_Logo.svg',

  salesforce: 'https://upload.wikimedia.org/wikipedia/commons/f/f9/Salesforce.com_logo.svg',
  pipedrive: 'https://www.google.com/s2/favicons?domain=pipedrive.com&sz=64',
  freshdesk: 'https://www.google.com/s2/favicons?domain=freshdesk.com&sz=64',

  linkedin: 'https://upload.wikimedia.org/wikipedia/commons/c/ca/LinkedIn_logo_initials.png',
  twilio: 'https://www.google.com/s2/favicons?domain=twilio.com&sz=64',
  sendgrid: 'https://www.google.com/s2/favicons?domain=sendgrid.com&sz=64',

  canva: 'https://www.google.com/s2/favicons?domain=canva.com&sz=64',
  adobe: 'https://upload.wikimedia.org/wikipedia/commons/8/8d/Adobe_Corporate_Logo.png',

  aws: 'https://upload.wikimedia.org/wikipedia/commons/9/93/Amazon_Web_Services_Logo.svg',

  segment: 'https://www.google.com/s2/favicons?domain=segment.com&sz=64',
  monday: 'https://upload.wikimedia.org/wikipedia/commons/c/c6/Monday_logo.svg',

  plaid: 'https://www.google.com/s2/favicons?domain=plaid.com&sz=64',

  'epic-fhir': 'https://www.google.com/s2/favicons?domain=epic.com&sz=64',
  cerner: 'https://www.google.com/s2/favicons?domain=oracle.com&sz=64',
};

function getIcon(id: string): SimpleIconData | null {
  return ICON_MAP[id.toLowerCase()] ?? null;
}

function getLogoUrl(id: string): string | null {
  return CONNECTOR_LOGO_URLS[id.toLowerCase()] ?? null;
}

function fillColor(icon: SimpleIconData): string {
  const hex = icon.hex.toUpperCase();
  if (hex === '000000' || hex === '181717' || hex === '181818') return 'currentColor';
  return `#${icon.hex}`;
}

const SIZE = {
  sm: { wrapper: 'h-8 w-8 rounded-lg', svg: 16, img: 20 },
  md: { wrapper: 'h-9 w-9 rounded-lg', svg: 18, img: 22 },
  lg: { wrapper: 'h-11 w-11 rounded-xl', svg: 22, img: 28 },
  xl: { wrapper: 'h-16 w-16 rounded-xl', svg: 32, img: 40 },
  '2xl': { wrapper: 'h-20 w-20 rounded-2xl', svg: 40, img: 48 },
} as const;

export type ConnectorLogoSize = keyof typeof SIZE;

export interface ConnectorLogoProps {
  connectorId: string;
  fallbackGradient?: string;
  fallbackText?: string;
  size?: ConnectorLogoSize;
  className?: string;
}

export function ConnectorLogo({
  connectorId,
  fallbackGradient = 'from-primary/20 to-primary/5 text-primary',
  fallbackText,
  size = 'md',
  className,
}: ConnectorLogoProps) {
  const [urlFailed, setUrlFailed] = useState(false);

  const id = connectorId.toLowerCase().replace(/_/g, '-');
  const icon = getIcon(id);
  const logoUrl = getLogoUrl(id);
  const { wrapper, svg, img } = SIZE[size];

  if (icon) {
    return (
      <div
        className={cn(
          'flex shrink-0 items-center justify-center border border-border/60 bg-muted/30 text-foreground',
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
          style={{ fill: fillColor(icon), flexShrink: 0 }}
        >
          <path d={icon.path} />
        </svg>
      </div>
    );
  }

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

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-xs font-bold',
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
