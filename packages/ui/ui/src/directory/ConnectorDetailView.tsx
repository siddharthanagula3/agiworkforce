'use client';

import { ArrowUpRight, Copy, Info } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { cn } from '../cn';
import { ConnectorLogo } from '../settings-modal/ConnectorLogo';
import {
  CHIP_PREVIEW_COUNT,
  CONNECTED_LABEL,
  CONNECTOR_AUTHOR_LABEL,
  CONNECTOR_CATEGORIES_LABEL,
  CONNECTOR_COMMUNITY_NOTICE_SHORT,
  CONNECTOR_DETAILS_LABEL,
  CONNECTOR_DEVELOPED_BY_PREFIX,
  CONNECTOR_DISCONNECT_LABEL,
  CONNECTOR_DOCUMENTATION_LABEL,
  CONNECTOR_MORE_INFO_LABEL,
  CONNECTOR_PRIVACY_LABEL,
  CONNECTOR_SUPPORT_LABEL,
  CONNECTOR_TOOLS_LABEL,
  CONNECTOR_TRUST_COPY,
  CONNECTOR_URL_LABEL,
  CONNECTOR_WEBSITE_LABEL,
  CONNECT_LABEL,
  COPY_VALUE_LABEL,
  DIRECTORY_BADGE_LABELS,
  SHOW_LESS_LABEL,
  SHOW_MORE_PREFIX,
  SHOW_MORE_SUFFIX,
} from './constants';
import { DirectoryBackLink, DirectoryDetailHeader } from './DirectoryDetailHeader';
import {
  DETAIL_LOGO_SHAPE,
  DETAIL_LOGO_SIZE,
  DIRECTORY_FOCUS_RING,
  DIRECTORY_ICON_BUTTON,
} from './styles';
import type { DirectoryConnectorDetail } from './types';

function ConnectorLogoTile({ detail }: { detail: DirectoryConnectorDetail }) {
  const monogram = detail.monogram ?? detail.name.slice(0, 1).toUpperCase();
  if (detail.brandId) {
    return (
      <ConnectorLogo
        connectorId={detail.brandId}
        fallbackText={monogram}
        size="xl"
        className={DETAIL_LOGO_SHAPE}
      />
    );
  }
  if (detail.iconUrl) {
    return (
      <img
        src={detail.iconUrl}
        alt=""
        className={cn(DETAIL_LOGO_SIZE, DETAIL_LOGO_SHAPE, 'object-contain')}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        DETAIL_LOGO_SIZE,
        DETAIL_LOGO_SHAPE,
        'inline-flex items-center justify-center bg-muted text-lg font-semibold text-muted-foreground',
      )}
    >
      {monogram}
    </span>
  );
}

function OutboundLink({
  href,
  children,
  onOpenHref,
}: {
  href: string;
  children: ReactNode;
  onOpenHref?: (href: string) => Promise<void> | void;
}) {
  return (
    <button
      type="button"
      onClick={() => void onOpenHref?.(href)}
      className={cn(
        'inline-flex w-fit items-center gap-1 text-sm text-foreground underline underline-offset-4',
        DIRECTORY_FOCUS_RING,
      )}
    >
      {children}
      <ArrowUpRight aria-hidden className="size-3.5" />
    </button>
  );
}

function ChipList({ label, values }: { label: string; values: readonly string[] }) {
  const [expanded, setExpanded] = useState(false);
  if (values.length === 0) return null;
  const shown = expanded ? values : values.slice(0, CHIP_PREVIEW_COUNT);
  const hidden = values.length - shown.length;
  return (
    <section className="flex flex-col gap-2">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {label}
        <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
          {values.length}
        </span>
      </h4>
      <ul className="flex flex-wrap items-center gap-1.5">
        {shown.map((value) => (
          <li
            key={value}
            className="rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground"
          >
            {value}
          </li>
        ))}
        {hidden > 0 || expanded ? (
          <li>
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className={cn(
                'rounded-md px-2 py-1 text-xs text-foreground underline underline-offset-4',
                DIRECTORY_FOCUS_RING,
              )}
            >
              {expanded ? SHOW_LESS_LABEL : `${SHOW_MORE_PREFIX}${hidden} ${SHOW_MORE_SUFFIX}`}
            </button>
          </li>
        ) : null}
      </ul>
    </section>
  );
}

export function ConnectorDetailView({
  detail,
  onBack,
  onConnect,
  onDisconnect,
  onOpenSettings,
  onCopyLink,
  onCopyValue,
  onOpenHref,
  footer,
  busy,
}: {
  detail: DirectoryConnectorDetail;
  onBack: () => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onOpenSettings?: () => void;
  onCopyLink?: () => void;
  onCopyValue?: (value: string) => Promise<void> | void;
  onOpenHref?: (href: string) => Promise<void> | void;
  footer?: ReactNode;
  busy?: boolean;
}) {
  const connected = detail.connected === true;
  const authorName = detail.authorName === detail.name ? null : detail.authorName;
  const moreInfo: { label: string; href: string }[] = [
    { label: CONNECTOR_DOCUMENTATION_LABEL, href: detail.documentationUrl ?? '' },
    { label: CONNECTOR_WEBSITE_LABEL, href: detail.websiteUrl ?? '' },
    { label: CONNECTOR_SUPPORT_LABEL, href: detail.supportUrl ?? '' },
    { label: CONNECTOR_PRIVACY_LABEL, href: detail.privacyPolicyUrl ?? '' },
  ].filter((row) => row.href.length > 0);

  return (
    <div className="flex flex-col gap-5">
      <DirectoryBackLink onBack={onBack} />
      <DirectoryDetailHeader
        title={detail.name}
        name={detail.name}
        icon={<ConnectorLogoTile detail={detail} />}
        subtitle={detail.summary}
        badge={
          detail.badge ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {DIRECTORY_BADGE_LABELS[detail.badge]}
            </span>
          ) : null
        }
        primaryLabel={connected ? CONNECTED_LABEL : CONNECT_LABEL}
        primaryDone={connected}
        onPrimary={detail.connectable === false ? undefined : onConnect}
        onOpenSettings={onOpenSettings}
        {...(connected && !onOpenSettings && onDisconnect
          ? { onRemove: onDisconnect, removeLabel: CONNECTOR_DISCONNECT_LABEL }
          : {})}
        onCopyLink={onCopyLink}
        busy={busy}
      />

      {detail.badge === 'community' ? (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted p-3">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-xs text-foreground">{CONNECTOR_COMMUNITY_NOTICE_SHORT}</p>
        </div>
      ) : null}

      {detail.description ? (
        <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
          {detail.description}
        </p>
      ) : null}

      {detail.publisher && detail.publisher !== detail.name ? (
        <div className="flex flex-col gap-1.5">
          {detail.publisherUrl ? (
            <OutboundLink href={detail.publisherUrl} onOpenHref={onOpenHref}>
              {`${CONNECTOR_DEVELOPED_BY_PREFIX} ${detail.publisher}`}
            </OutboundLink>
          ) : (
            <p className="text-sm text-foreground">
              {`${CONNECTOR_DEVELOPED_BY_PREFIX} ${detail.publisher}`}
            </p>
          )}
          <p className="text-xs text-muted-foreground">{CONNECTOR_TRUST_COPY}</p>
        </div>
      ) : null}

      <ChipList label={CONNECTOR_TOOLS_LABEL} values={detail.tools ?? []} />
      <ChipList label={CONNECTOR_CATEGORIES_LABEL} values={detail.categories ?? []} />

      {authorName || detail.connectorUrl ? (
        <>
          <hr className="border-border" />
          <section className="flex flex-col gap-2">
            <h4 className="text-sm font-semibold text-foreground">{CONNECTOR_DETAILS_LABEL}</h4>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {authorName ? (
                <div className="flex flex-col gap-1">
                  <dt className="text-xs text-muted-foreground">{CONNECTOR_AUTHOR_LABEL}</dt>
                  <dd>
                    {detail.authorUrl ? (
                      <OutboundLink href={detail.authorUrl} onOpenHref={onOpenHref}>
                        {authorName}
                      </OutboundLink>
                    ) : (
                      <span className="text-sm text-foreground">{authorName}</span>
                    )}
                  </dd>
                </div>
              ) : null}
              {detail.connectorUrl ? (
                <div className="flex min-w-0 flex-col gap-1">
                  <dt className="text-xs text-muted-foreground">{CONNECTOR_URL_LABEL}</dt>
                  <dd className="flex min-w-0 items-center gap-1">
                    <span className="truncate font-mono text-xs text-foreground">
                      {detail.connectorUrl}
                    </span>
                    {onCopyValue ? (
                      <button
                        type="button"
                        aria-label={`${COPY_VALUE_LABEL} ${CONNECTOR_URL_LABEL}`}
                        onClick={() => void onCopyValue(detail.connectorUrl ?? '')}
                        className={cn(DIRECTORY_ICON_BUTTON, DIRECTORY_FOCUS_RING)}
                      >
                        <Copy aria-hidden className="size-3.5" />
                      </button>
                    ) : null}
                  </dd>
                </div>
              ) : null}
            </dl>
          </section>
        </>
      ) : null}

      {footer}

      {moreInfo.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold text-foreground">{CONNECTOR_MORE_INFO_LABEL}</h4>
          <ul className="flex flex-col gap-1">
            {moreInfo.map((row) => (
              <li key={row.label}>
                <OutboundLink href={row.href} onOpenHref={onOpenHref}>
                  {row.label}
                </OutboundLink>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
