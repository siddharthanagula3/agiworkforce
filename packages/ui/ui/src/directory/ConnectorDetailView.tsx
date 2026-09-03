'use client';

import { Info } from 'lucide-react';

import {
  CONNECTED_LABEL,
  CONNECTOR_COMMUNITY_NOTICE,
  CONNECTOR_PERMISSIONS_LABEL,
  CONNECTOR_TOOLS_LABEL,
  CONNECT_LABEL,
  DIRECTORY_BADGE_LABELS,
} from './constants';
import { DirectoryBackLink, DirectoryDetailHeader } from './DirectoryDetailHeader';
import type { DirectoryConnectorDetail } from './types';

function ConnectorIcon({ detail }: { detail: DirectoryConnectorDetail }) {
  if (detail.iconUrl) {
    return (
      <img
        src={detail.iconUrl}
        alt=""
        className="size-10 shrink-0 rounded-lg border border-border object-contain"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-sm font-semibold text-muted-foreground"
    >
      {detail.monogram ?? detail.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function ConnectorDetailView({
  detail,
  onBack,
  onConnect,
  onOpenSettings,
  onCopyLink,
  busy,
}: {
  detail: DirectoryConnectorDetail;
  onBack: () => void;
  onConnect?: () => void;
  onOpenSettings?: () => void;
  onCopyLink?: () => void;
  busy?: boolean;
}) {
  const tools = detail.tools ?? [];
  const permissions = detail.permissions ?? [];
  return (
    <div className="flex flex-col gap-4">
      <DirectoryBackLink onBack={onBack} />
      <DirectoryDetailHeader
        title={detail.name}
        name={detail.name}
        icon={<ConnectorIcon detail={detail} />}
        subtitle={detail.summary}
        badge={
          detail.badge ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {DIRECTORY_BADGE_LABELS[detail.badge]}
            </span>
          ) : null
        }
        primaryLabel={detail.connected ? CONNECTED_LABEL : CONNECT_LABEL}
        primaryDone={detail.connected === true}
        onPrimary={detail.connectable === false ? undefined : onConnect}
        onOpenSettings={onOpenSettings}
        onCopyLink={onCopyLink}
        busy={busy}
      />

      {detail.badge === 'community' ? (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted p-3">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-xs text-foreground">{CONNECTOR_COMMUNITY_NOTICE}</p>
        </div>
      ) : null}

      {detail.description ? (
        <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
          {detail.description}
        </p>
      ) : null}

      {tools.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold text-foreground">{CONNECTOR_TOOLS_LABEL}</h4>
          <ul className="flex flex-wrap gap-1.5">
            {tools.map((tool) => (
              <li
                key={tool}
                className="rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground"
              >
                {tool}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {permissions.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold text-foreground">{CONNECTOR_PERMISSIONS_LABEL}</h4>
          <ul className="flex flex-col gap-1">
            {permissions.map((permission) => (
              <li key={permission} className="text-xs text-muted-foreground">
                {permission}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
