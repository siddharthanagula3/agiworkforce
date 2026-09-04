'use client';

import React from 'react';
import type { SimpleIcon } from 'simple-icons';
import {
  siAirtable,
  siAnthropic,
  siAsana,
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
  siMongodb,
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
  siWhatsapp,
  siWeightsandbiases,
  siX,
  siXero,
  siYoutube,
  siZendesk,
  siZoom,
} from 'simple-icons';
import { cn } from '@shared/lib/utils';
import { getConnectorLogo } from '../config/connector-logos';

type ConnectorLogoSource = {
  id: string;
  name: string;
  iconBg: string;
  iconText: string;
};

const SIMPLE_ICON_BY_CONNECTOR_ID: Record<string, SimpleIcon> = {
  gmail: siGmail,
  'google-calendar': siGooglecalendar,
  'google-drive': siGoogledrive,
  notion: siNotion,
  github: siGithub,
  'google-sheets': siGooglesheets,
  linear: siLinear,
  jira: siJira,
  confluence: siConfluence,
  asana: siAsana,
  zoom: siZoom,
  hubspot: siHubspot,
  calendly: siCalendly,
  intercom: siIntercom,
  'google-analytics': siGoogleanalytics,
  mailchimp: siMailchimp,
  stripe: siStripe,
  shopify: siShopify,
  twitter: siX,
  discord: siDiscord,
  elevenlabs: siElevenlabs,
  airtable: siAirtable,
  clickup: siClickup,
  trello: siTrello,
  todoist: siTodoist,
  basecamp: siBasecamp,
  evernote: siEvernote,
  vercel: siVercel,
  sentry: siSentry,
  datadog: siDatadog,
  pagerduty: siPagerduty,
  circleci: siCircleci,
  gitlab: siGitlab,
  bitbucket: siBitbucket,
  telegram: siTelegram,
  whatsapp: siWhatsapp,
  gcp: siGooglecloud,
  cloudflare: siCloudflare,
  digitalocean: siDigitalocean,
  snowflake: siSnowflake,
  bigquery: siGooglebigquery,
  databricks: siDatabricks,
  postgresql: siPostgresql,
  mongodb: siMongodb,
  redis: siRedis,
  elasticsearch: siElasticsearch,
  zendesk: siZendesk,
  figma: siFigma,
  quickbooks: siQuickbooks,
  xero: siXero,
  paypal: siPaypal,
  square: siSquare,
  dropbox: siDropbox,
  box: siBox,
  instagram: siInstagram,
  facebook: siFacebook,
  youtube: siYoutube,
  posthog: siPosthog,
  mixpanel: siMixpanel,
  huggingface: siHuggingface,
  wandb: siWeightsandbiases,
  'anthropic-api': siAnthropic,
  replicate: siReplicate,
  ollama: siOllama,
  // `epic-fhir` deliberately has NO glyph. It previously mapped to
  // `siEpicgames`, Epic Games, the video-game company, while the connector is
  // Epic Systems, the healthcare EHR vendor. Showing one company's trademark
  // for another is worse than showing none, and in a clinical-data context it is
  // actively misleading, so this falls through to the neutral initial tile.
  // Simple Icons carries no Epic Systems glyph to use instead.
};

export function OfficialConnectorLogo({
  connector,
  className,
}: {
  connector: ConnectorLogoSource;
  className?: string;
}) {
  const [remoteLogoFailed, setRemoteLogoFailed] = React.useState(false);
  const simpleIcon = SIMPLE_ICON_BY_CONNECTOR_ID[connector.id];
  const remoteLogo = getConnectorLogo(connector.id);

  if (simpleIcon) {
    return (
      <div
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-black/5 bg-white shadow-lg',
          className,
        )}
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true" focusable="false">
          <path d={simpleIcon.path} fill={`#${simpleIcon.hex}`} />
        </svg>
      </div>
    );
  }

  if (remoteLogo && !remoteLogoFailed) {
    return (
      <div
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-black/5 bg-white shadow-lg',
          className,
        )}
        aria-hidden="true"
      >
        <img
          src={remoteLogo.url}
          alt=""
          width={remoteLogo.width ?? 28}
          height={remoteLogo.height ?? 28}
          className="max-h-7 max-w-7 object-contain"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setRemoteLogoFailed(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-sm font-bold text-white shadow-lg',
        connector.iconBg,
        className,
      )}
      aria-hidden="true"
    >
      {connector.iconText}
    </div>
  );
}
