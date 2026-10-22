'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MoreVertical, Plus } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Spinner,
  useConfirmAction,
} from '@agiworkforce/ui';
import { toast } from 'sonner';
import { useSession } from '@/lib/identity/client';
import { toUserMessage } from '@/lib/user-error-message';
import { formatRelativeTime } from '@shared/utils/format';
import { buildNewChatHref } from '@features/chat/lib/new-chat-entry';
import { webSignInHref } from '@features/marketing/components/system/nav';
import {
  LIVE_ARTIFACTS_PAGE_PATH,
  connectorDisplayName,
  liveArtifactChatHref,
  type LiveArtifact,
} from './live-artifact-contract';
import {
  LiveArtifactRequestError,
  listLiveArtifacts,
  removeLiveArtifact,
  setLiveArtifactRefreshPolicy,
} from './live-artifact-client';

const NEW_LIVE_ARTIFACT_DRAFT =
  'Build a live dashboard that reads my connected apps and shows the numbers I track each week: ';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'signed-out' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; artifacts: LiveArtifact[] };

function appList(connectors: readonly string[]): string {
  return new Intl.ListFormat(undefined, { type: 'conjunction' }).format(
    connectors.map(connectorDisplayName),
  );
}

function subtitle(artifact: LiveArtifact): string {
  if (artifact.readiness === 'needs_connection' && artifact.missingConnectors.length > 0) {
    return `Connect ${appList(artifact.missingConnectors)} to refresh`;
  }
  return `Reads ${appList(artifact.connectors)}`;
}

function LiveArtifactCard({
  artifact,
  onOpen,
  onChanged,
  onRemoved,
}: {
  artifact: LiveArtifact;
  onOpen: () => void;
  onChanged: (next: LiveArtifact) => void;
  onRemoved: () => void;
}) {
  const { confirm, dialog } = useConfirmAction();
  const manual = artifact.refreshPolicy === 'manual';
  const title = artifact.title || 'Untitled artifact';
  const timestamp = formatRelativeTime(artifact.lastRefreshedAt ?? artifact.createdAt);

  const togglePolicy = async () => {
    try {
      onChanged(
        await setLiveArtifactRefreshPolicy(artifact.artifactId, manual ? 'on_open' : 'manual'),
      );
    } catch (error) {
      toast.error(toUserMessage(error, 'The refresh setting could not be saved.'));
    }
  };

  const stop = () =>
    confirm({
      title: `Stop live updates for ${title}?`,
      description: `It stops reading ${appList(artifact.connectors)} and leaves this list. The artifact stays in its chat, and you can allow its connected apps again later.`,
      confirmLabel: 'Stop live updates',
      destructive: true,
      onConfirm: async () => {
        try {
          await removeLiveArtifact(artifact.artifactId);
          onRemoved();
        } catch (error) {
          toast.error(toUserMessage(error, 'Live updates could not be stopped.'));
        }
      },
    });

  return (
    <li
      className="group relative flex min-h-[148px] flex-col rounded-xl border border-border bg-card transition-colors hover:border-foreground/30"
      data-testid="live-artifact-card"
    >
      <button
        type="button"
        onClick={onOpen}
        className="flex flex-1 flex-col gap-1 rounded-xl p-4 pe-12 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="truncate text-base font-medium text-foreground">{title}</span>
        <span
          className={
            artifact.readiness === 'needs_connection'
              ? 'truncate text-sm text-warning-text'
              : 'truncate text-sm text-muted-foreground'
          }
        >
          {subtitle(artifact)}
        </span>
        <span className="mt-auto pt-4 text-sm text-muted-foreground">{timestamp}</span>
      </button>
      <div className="absolute end-2 top-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="h-9 w-9 p-0"
              aria-label={`Options for ${title}`}
            >
              <MoreVertical className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onOpen}>Open</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void togglePolicy()}>
              {manual ? 'Refresh when opened' : 'Refresh only when I ask'}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={stop}>Stop live updates</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {dialog}
    </li>
  );
}

export function LiveArtifactsView() {
  const router = useRouter();
  const { isLoaded, isSignedIn } = useSession();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  const load = useCallback((signal?: AbortSignal) => {
    setState({ kind: 'loading' });
    listLiveArtifacts(signal).then(
      (artifacts) => setState({ kind: 'ready', artifacts }),
      (error: unknown) => {
        if (signal?.aborted) return;
        if (error instanceof LiveArtifactRequestError && error.status === 401) {
          setState({ kind: 'signed-out' });
          return;
        }
        setState({
          kind: 'error',
          message: toUserMessage(error, 'Your live artifacts could not be loaded.'),
        });
      },
    );
  }, []);

  useEffect(() => {
    if (!isLoaded) return undefined;
    if (!isSignedIn) {
      setState({ kind: 'signed-out' });
      return undefined;
    }
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [isLoaded, isSignedIn, load]);

  const replace = (next: LiveArtifact) =>
    setState((current) =>
      current.kind === 'ready'
        ? {
            kind: 'ready',
            artifacts: current.artifacts.map((artifact) =>
              artifact.artifactId === next.artifactId ? next : artifact,
            ),
          }
        : current,
    );

  const drop = (artifactId: string) =>
    setState((current) =>
      current.kind === 'ready'
        ? {
            kind: 'ready',
            artifacts: current.artifacts.filter((artifact) => artifact.artifactId !== artifactId),
          }
        : current,
    );

  return (
    <section
      data-design="agi"
      className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12"
    >
      <header className="flex flex-col gap-1">
        <h1 className="text-h2 text-foreground">Live artifacts</h1>
        <p className="text-sm text-muted-foreground">
          Artifacts that refresh with current data from your connected apps each time you open them.
        </p>
      </header>

      {state.kind === 'loading' ? (
        <div className="flex justify-center py-16">
          <Spinner size="sm" aria-label="Loading live artifacts" />
        </div>
      ) : state.kind === 'signed-out' ? (
        <div
          className="flex flex-col items-start gap-3 py-8"
          data-testid="live-artifacts-signed-out"
        >
          <p className="text-sm text-muted-foreground">Sign in to see your live artifacts.</p>
          <Button size="sm" asChild>
            <a href={webSignInHref(LIVE_ARTIFACTS_PAGE_PATH)}>Sign in</a>
          </Button>
        </div>
      ) : state.kind === 'error' ? (
        <div className="flex flex-col items-start gap-3 py-8" role="alert">
          <p className="text-sm text-danger">{state.message}</p>
          <Button size="sm" variant="outline" onClick={() => load()}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          {state.artifacts.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="live-artifacts-empty">
              No live artifacts yet. Open an artifact that reads your connected apps and allow it.
            </p>
          ) : null}
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Live artifacts">
            {state.artifacts.map((artifact) => (
              <LiveArtifactCard
                key={artifact.artifactId}
                artifact={artifact}
                onOpen={() =>
                  router.push(liveArtifactChatHref(artifact.conversationId, artifact.artifactId))
                }
                onChanged={replace}
                onRemoved={() => drop(artifact.artifactId)}
              />
            ))}
            <li className="min-h-[148px]">
              <Link
                href={buildNewChatHref({ draft: NEW_LIVE_ARTIFACT_DRAFT })}
                className="flex h-full min-h-[148px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                data-testid="live-artifact-new"
              >
                <Plus className="h-5 w-5" aria-hidden="true" />
                <span className="text-sm">New live artifact</span>
              </Link>
            </li>
          </ul>
        </>
      )}
    </section>
  );
}
