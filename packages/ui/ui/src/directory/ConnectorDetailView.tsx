'use client';

import { Copy, Info, Monitor } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { cn } from '../cn';
import { ConnectorLogo } from '../settings-modal/ConnectorLogo';
import {
  CHIP_PREVIEW_COUNT,
  CONNECTED_LABEL,
  CONNECTOR_ADDED_LABEL,
  CONNECTOR_ADD_API_KEY_LABEL,
  CONNECTOR_AUTHOR_LABEL,
  CONNECTOR_CATEGORIES_LABEL,
  CONNECTOR_COMMUNITY_NOTICE_SHORT,
  CONNECTOR_DESKTOP_DOWNLOAD_LABEL,
  CONNECTOR_DESKTOP_ONLY_COPY,
  CONNECTOR_DESKTOP_ONLY_LABEL,
  CONNECTOR_DISCONNECT_LABEL,
  CONNECTOR_DOCUMENTATION_LABEL,
  CONNECTOR_MADE_BY_LABEL,
  CONNECTOR_MORE_INFO_LABEL,
  CONNECTOR_NEEDS_SETUP_LABEL,
  CONNECTOR_PRIVACY_LABEL,
  CONNECTOR_RELATED_HEADING,
  CONNECTOR_REPOSITORY_LABEL,
  CONNECTOR_SIGN_IN_LABEL,
  CONNECTOR_SIGN_IN_NONE,
  CONNECTOR_SIGN_IN_REQUIRED,
  CONNECTOR_SUPPORT_LABEL,
  CONNECTOR_TERMS_LINK_LABEL,
  CONNECTOR_TERMS_PREFIX,
  CONNECTOR_TOOLS_LABEL,
  CONNECTOR_TRUST_COPY,
  CONNECTOR_URL_LABEL,
  CONNECTOR_WEBSITE_LABEL,
  CONNECT_LABEL,
  COPY_VALUE_LABEL,
  SHOW_LESS_LABEL,
  SHOW_MORE_PREFIX,
  SHOW_MORE_SUFFIX,
} from './constants';
import { DirectoryBadge, isGlyphBadge } from './DirectoryBadges';
import {
  DetailMonogram,
  DirectoryBackLink,
  DirectoryDetailHeader,
  OutboundLink,
} from './DirectoryDetailHeader';
import { DirectoryCard } from './DirectoryGrid';
import {
  DETAIL_HEADER_BAND,
  DETAIL_HEADING,
  DETAIL_LABEL,
  DETAIL_LOGO_SHAPE,
  DETAIL_LOGO_SIZE,
  DETAIL_NOTICE,
  DIRECTORY_FOCUS_RING,
  DIRECTORY_ICON_BUTTON,
} from './styles';
import type {
  DirectoryConnectableMode,
  DirectoryConnectorDetail,
  DirectoryEntry,
  DirectorySectionKey,
} from './types';

const RELATED_SECTION: DirectorySectionKey = 'connectors';
const EMPTY_ENTRIES: readonly DirectoryEntry[] = [];
const EMPTY_VALUES: readonly string[] = [];
const HEADER_PILL_CLASS = 'bg-background';
const ADDED_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
};
const CATEGORY_SEPARATOR = ', ';

function ConnectorLogoTile({ detail }: { detail: DirectoryConnectorDetail }) {
  const [iconFailed, setIconFailed] = useState(false);
  const monogram = detail.monogram ?? detail.name.slice(0, 1).toUpperCase();
  if (detail.brandId) {
    return (
      <ConnectorLogo
        connectorId={detail.brandId}
        fallbackText={monogram}
        size="2xl"
        className={DETAIL_LOGO_SHAPE}
      />
    );
  }
  if (detail.iconUrl && !iconFailed) {
    return (
      <img
        src={detail.iconUrl}
        alt=""
        onError={() => setIconFailed(true)}
        className={cn(DETAIL_LOGO_SIZE, DETAIL_LOGO_SHAPE, 'object-contain p-2')}
      />
    );
  }
  return <DetailMonogram monogram={monogram} />;
}

function ToolList({ values }: { values: readonly string[] }) {
  const [expanded, setExpanded] = useState(false);
  if (values.length === 0) return null;
  const shown = expanded ? values : values.slice(0, CHIP_PREVIEW_COUNT);
  const hidden = values.length - shown.length;
  return (
    <section className="flex flex-col gap-3">
      <h4 className={DETAIL_HEADING}>{CONNECTOR_TOOLS_LABEL}</h4>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {shown.map((value) => (
          <li
            key={value}
            className="truncate rounded-md bg-muted px-2.5 py-1.5 font-mono text-xs text-foreground"
            title={value}
          >
            {value}
          </li>
        ))}
      </ul>
      {hidden > 0 || expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className={cn(
            'w-fit rounded-md text-xs text-foreground underline underline-offset-4',
            DIRECTORY_FOCUS_RING,
          )}
        >
          {expanded ? SHOW_LESS_LABEL : `${SHOW_MORE_PREFIX}${hidden} ${SHOW_MORE_SUFFIX}`}
        </button>
      ) : null}
    </section>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className={DETAIL_LABEL}>{label}</dt>
      <dd className="min-w-0 text-sm text-foreground">{children}</dd>
    </div>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className={DETAIL_NOTICE}>
      <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-col gap-1">{children}</div>
    </div>
  );
}

function formatAddedAt(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toLocaleDateString(undefined, ADDED_DATE_FORMAT);
}

function resolveMode(detail: DirectoryConnectorDetail): DirectoryConnectableMode {
  if (detail.connectableMode) return detail.connectableMode;
  return detail.connectable === false ? 'needs-setup' : 'connect';
}

const PRIMARY_LABEL_BY_MODE: Record<DirectoryConnectableMode, string> = {
  connect: CONNECT_LABEL,
  'api-key-form': CONNECTOR_ADD_API_KEY_LABEL,
  'desktop-and-cli': CONNECTOR_DESKTOP_ONLY_LABEL,
  'needs-setup': CONNECTOR_NEEDS_SETUP_LABEL,
};

const ACTIONABLE_MODES: ReadonlySet<DirectoryConnectableMode> = new Set([
  'connect',
  'api-key-form',
]);

function DesktopAvailability({ href }: { href?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-muted p-3">
      <Monitor aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="flex min-w-0 flex-col gap-2">
        <p className="text-sm font-medium text-foreground">{CONNECTOR_DESKTOP_ONLY_LABEL}</p>
        <p className="text-xs text-muted-foreground">{CONNECTOR_DESKTOP_ONLY_COPY}</p>
        {href ? (
          <a
            href={href}
            className={cn(
              'inline-flex w-fit min-h-8 items-center rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors motion-reduce:transition-none hover:bg-muted',
              DIRECTORY_FOCUS_RING,
            )}
          >
            {CONNECTOR_DESKTOP_DOWNLOAD_LABEL}
          </a>
        ) : null}
      </div>
    </div>
  );
}

export function ConnectorDetailView({
  detail,
  onBack,
  onConnect,
  onRequestCredentials,
  credentialForm,
  onDisconnect,
  onCopyLink,
  onCopyValue,
  onOpenHref,
  onOpenRelated,
  onInstallRelated,
  footer,
  busy,
}: {
  detail: DirectoryConnectorDetail;
  onBack: () => void;
  onConnect?: () => void;
  onRequestCredentials?: () => void;
  credentialForm?: ReactNode;
  onDisconnect?: () => void;
  onCopyLink?: () => void;
  onCopyValue?: (value: string) => Promise<void> | void;
  onOpenHref?: (href: string) => Promise<void> | void;
  onOpenRelated?: (id: string) => void;
  onInstallRelated?: (id: string) => void;
  footer?: ReactNode;
  busy?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const shownIdRef = useRef(detail.id);
  useEffect(() => {
    if (shownIdRef.current === detail.id) return;
    shownIdRef.current = detail.id;
    rootRef.current?.scrollIntoView?.({ block: 'start' });
  }, [detail.id]);

  const connected = detail.connected === true;
  const mode = resolveMode(detail);
  const listed = !connected && detail.listingNote !== undefined;
  const actionable = !listed && ACTIONABLE_MODES.has(mode);
  const primaryAction =
    mode === 'api-key-form' && onRequestCredentials ? onRequestCredentials : onConnect;
  const publisher = detail.publisher;
  const authorName =
    detail.authorName && detail.authorName !== publisher && detail.authorName !== detail.name
      ? detail.authorName
      : null;
  const addedAt = formatAddedAt(detail.addedAt);
  const categories = detail.categories ?? EMPTY_VALUES;
  const related = detail.related ?? EMPTY_ENTRIES;
  const moreInfo: { label: string; href: string }[] = [
    { label: CONNECTOR_DOCUMENTATION_LABEL, href: detail.documentationUrl ?? '' },
    { label: CONNECTOR_WEBSITE_LABEL, href: detail.websiteUrl ?? '' },
    { label: CONNECTOR_REPOSITORY_LABEL, href: detail.repositoryUrl ?? '' },
    { label: CONNECTOR_SUPPORT_LABEL, href: detail.supportUrl ?? '' },
    { label: CONNECTOR_PRIVACY_LABEL, href: detail.privacyPolicyUrl ?? '' },
  ].filter((row) => row.href.length > 0);

  return (
    <div ref={rootRef} className="flex flex-col gap-5">
      <DirectoryBackLink onBack={onBack} />
      <div className={DETAIL_HEADER_BAND}>
        <DirectoryDetailHeader
          title={detail.name}
          name={detail.name}
          icon={<ConnectorLogoTile detail={detail} />}
          subtitle={detail.summary}
          badge={
            detail.badge ? (
              <DirectoryBadge
                badge={detail.badge}
                className={isGlyphBadge(detail.badge) ? undefined : HEADER_PILL_CLASS}
              />
            ) : null
          }
          primaryLabel={connected ? CONNECTED_LABEL : PRIMARY_LABEL_BY_MODE[mode]}
          primaryDone={connected}
          onPrimary={actionable && !credentialForm ? primaryAction : undefined}
          statusNote={actionable || listed ? undefined : PRIMARY_LABEL_BY_MODE[mode]}
          {...(connected && onDisconnect
            ? { onRemove: onDisconnect, removeLabel: CONNECTOR_DISCONNECT_LABEL }
            : {})}
          onCopyLink={onCopyLink}
          busy={busy}
        />
      </div>

      {credentialForm ? <div data-testid="connector-credential-form">{credentialForm}</div> : null}

      {listed ? (
        <Notice>
          <p>{detail.listingNote}</p>
        </Notice>
      ) : null}

      {!connected && !listed && mode === 'desktop-and-cli' ? (
        <DesktopAvailability href={detail.desktopHref} />
      ) : null}

      {!connected && !listed && mode === 'needs-setup' && detail.setupNotice ? (
        <Notice>
          <p>{detail.setupNotice}</p>
        </Notice>
      ) : null}

      <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
        {detail.description ?? detail.summary}
      </p>

      <ToolList values={detail.tools ?? EMPTY_VALUES} />

      <Notice>
        {detail.badge === 'community' ? <p>{CONNECTOR_COMMUNITY_NOTICE_SHORT}</p> : null}
        <p>{CONNECTOR_TRUST_COPY}</p>
      </Notice>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          {categories.length > 0 ? (
            <DetailRow label={CONNECTOR_CATEGORIES_LABEL}>
              {categories.join(CATEGORY_SEPARATOR)}
            </DetailRow>
          ) : null}
          {publisher ? (
            <DetailRow label={CONNECTOR_MADE_BY_LABEL}>
              {detail.publisherUrl ? (
                <OutboundLink href={detail.publisherUrl} onOpenHref={onOpenHref}>
                  {publisher}
                </OutboundLink>
              ) : (
                publisher
              )}
            </DetailRow>
          ) : null}
          {authorName ? (
            <DetailRow label={CONNECTOR_AUTHOR_LABEL}>
              {detail.authorUrl ? (
                <OutboundLink href={detail.authorUrl} onOpenHref={onOpenHref}>
                  {authorName}
                </OutboundLink>
              ) : (
                authorName
              )}
            </DetailRow>
          ) : null}
          {detail.signInRequired === undefined ? null : (
            <DetailRow label={CONNECTOR_SIGN_IN_LABEL}>
              {detail.signInRequired ? CONNECTOR_SIGN_IN_REQUIRED : CONNECTOR_SIGN_IN_NONE}
            </DetailRow>
          )}
          {detail.connectorUrl ? (
            <DetailRow label={CONNECTOR_URL_LABEL}>
              <span className="flex min-w-0 items-center gap-1">
                <span className="truncate font-mono text-xs">{detail.connectorUrl}</span>
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
              </span>
            </DetailRow>
          ) : null}
          {addedAt ? <DetailRow label={CONNECTOR_ADDED_LABEL}>{addedAt}</DetailRow> : null}
        </div>
        {moreInfo.length > 0 ? (
          <DetailRow label={CONNECTOR_MORE_INFO_LABEL}>
            <ul className="flex flex-col gap-1.5">
              {moreInfo.map((row) => (
                <li key={row.label}>
                  <OutboundLink href={row.href} onOpenHref={onOpenHref}>
                    {row.label}
                  </OutboundLink>
                </li>
              ))}
            </ul>
          </DetailRow>
        ) : null}
      </dl>

      {footer}

      {related.length > 0 && onOpenRelated ? (
        <section className="flex flex-col gap-3 border-t border-border pt-5">
          <h4 className={DETAIL_HEADING}>{CONNECTOR_RELATED_HEADING}</h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {related.map((entry) => (
              <DirectoryCard
                key={entry.id}
                section={RELATED_SECTION}
                entry={entry}
                onOpen={onOpenRelated}
                onInstall={onInstallRelated}
              />
            ))}
          </div>
        </section>
      ) : null}

      {detail.termsHref ? (
        <p className="text-xs text-muted-foreground">
          {`${CONNECTOR_TERMS_PREFIX} `}
          <a
            href={detail.termsHref}
            target="_blank"
            rel="noreferrer"
            className={cn('text-foreground underline underline-offset-4', DIRECTORY_FOCUS_RING)}
          >
            {CONNECTOR_TERMS_LINK_LABEL}
          </a>
          .
        </p>
      ) : null}
    </div>
  );
}
