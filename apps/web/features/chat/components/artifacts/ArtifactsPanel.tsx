'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Code2, X, FileCode, PanelRightOpen, FolderDown } from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { Button, EmptyState } from '@agiworkforce/ui';
import { useChatUIStore } from '@agiworkforce/unified-chat';
import type { PrivacyMode, SharedArtifact } from '@agiworkforce/types';
import {
  publishArtifact as publishArtifactService,
  resolveOriginPrivacyMode,
  type PublishResult,
} from '@agiworkforce/artifacts';
import { useArtifactsStore, type Artifact } from '../../stores/artifacts-store';
import { useStreamingArtifactStore } from '../../stores/streaming-artifact-store';
import { getProviderModeForModel } from '../../lib/localByokHandoff';
import { useChatStore, type Conversation, type Message } from '@shared/stores/web-chat-store';
import { ArtifactPreview } from './ArtifactPreview';
import { StreamingArtifactView } from './StreamingArtifactView';
import { downloadAllArtifacts } from '../../utils/downloadArtifacts';
import { createWebCloudPublisher } from './publishArtifactClient';
import { toast } from 'sonner';
import { toUserMessage } from '@/lib/user-error-message';
import { ArtifactPrivacyNotice } from '@/features/onboarding/components/ArtifactPrivacyNotice';
import { useUIStore } from '@shared/stores/layout-store';
import { TASK_DOCK_ARTIFACTS_LABEL, TASK_DOCK_LABEL } from '../../lib/agi-work';

function ArtifactTab({
  artifact,
  isSelected,
  onSelect,
}: {
  artifact: Artifact;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
        isSelected
          ? 'bg-primary/15 text-primary'
          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
      title={artifact.title}
    >
      <FileCode className="h-3 w-3 shrink-0" />
      <span className="max-w-[120px] truncate">{artifact.title}</span>
    </button>
  );
}

/**
 * The task dock and this panel share one right slot, so an artifact opening
 * over a running task must leave a way back to it rather than replacing it.
 */
function SlotTabs({ onShowTaskDock }: { onShowTaskDock: () => void }) {
  return (
    <div className="flex items-center gap-1 border-b border-border/20 px-3 py-2" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={false}
        onClick={onShowTaskDock}
        className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground motion-reduce:transition-none"
      >
        {TASK_DOCK_LABEL}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected
        className="rounded-lg bg-primary/15 px-3 py-1.5 text-xs font-medium text-primary"
      >
        {TASK_DOCK_ARTIFACTS_LABEL}
      </button>
    </div>
  );
}

function ArtifactsEmptyState() {
  return (
    <EmptyState
      icon={Code2}
      title="No artifacts yet"
      description="Renderable code and generated files will appear here"
      className="flex-1"
    />
  );
}

function ArtifactViewer({
  artifact,
  versionHistory,
  onClose,
  publishArtifact,
}: {
  artifact: Artifact;
  versionHistory: SharedArtifact[];
  onClose: () => void;
  publishArtifact?: () => Promise<PublishResult>;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ArtifactPreview
        artifact={artifact}
        versionHistory={versionHistory}
        className="mt-0 rounded-none border-0"
        variant="panel"
        onClose={onClose}
        {...(publishArtifact ? { publishArtifact } : {})}
      />
    </div>
  );
}

type ArtifactOriginSource = Pick<
  Artifact,
  'messageId' | 'computeSession' | 'generatedFile' | 'artifactManifest'
>;

export type ArtifactOriginMessage = Pick<Message, 'id' | 'model' | 'metadata'>;

/**
 * SECURITY-FIX F3 (CWE-863): the publish button used to declare
 * `privacyMode: 'managed'` for every artifact, which made the managed-cloud
 * upload unconditional.
 *
 * The boundary is derived from every signal the conversation actually carries,
 * reduced most-restrictive-first, and is `undefined` when the conversation
 * carries none, which `publishArtifact` refuses rather than guessing at. Only
 * the Local→BYOK handoff writes `metadata.privacyMode`, so an ordinary Local
 * (Ollama/LM Studio) conversation is unlabeled and must be classified from the
 * model that served it, the same model-derived boundary the regenerate guards
 * use, plus any `providerMode` a turn declares.
 *
 * A `managed` label on the artifact's own descriptors is deliberately NOT
 * evidence: those descriptors are synthesised client-side from this very turn,
 * so `managed` there is a display default rather than an observation. Their
 * non-managed labels still count, because those only ever narrow the boundary.
 */
export function resolveArtifactOriginPrivacyMode(
  artifact: ArtifactOriginSource,
  messages: readonly ArtifactOriginMessage[],
  conversation?: Pick<Conversation, 'model'> | null,
): PrivacyMode | undefined {
  const restrictiveArtifactLabels = [
    artifact.generatedFile?.privacyMode,
    artifact.artifactManifest?.privacyMode,
    artifact.computeSession?.privacyMode,
  ].filter((mode) => mode !== undefined && mode !== 'managed');

  const transcriptSignals = messages.flatMap((message) => [
    message.metadata?.privacyMode,
    message.metadata?.providerMode,
    getProviderModeForModel(message.model ?? message.metadata?.model),
  ]);

  return resolveOriginPrivacyMode([
    ...restrictiveArtifactLabels,
    ...transcriptSignals,
    getProviderModeForModel(conversation?.model),
  ]);
}

const MOBILE_OVERLAY_QUERY = '(max-width: 639px)';

const MIN_PANEL_WIDTH = 280;
const MAX_PANEL_WIDTH = 900;
const PANEL_WIDTH_KEY_STEP = 24;

function useOverlayLayout(): 'unknown' | 'mobile' | 'desktop' {
  const [layout, setLayout] = useState<'unknown' | 'mobile' | 'desktop'>('unknown');

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      setLayout('desktop');
      return;
    }
    const query = window.matchMedia(MOBILE_OVERLAY_QUERY);
    const apply = () => setLayout(query.matches ? 'mobile' : 'desktop');
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  return layout;
}

function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.offsetParent !== null || element === document.activeElement);
}

function readArtifactDeepLink(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return new URLSearchParams(window.location.search).get('artifact');
  } catch {
    return null;
  }
}

export function ArtifactsPanel() {
  const {
    getConversationArtifacts,
    getArtifactVersions,
    selectedArtifactId,
    panelOpen,
    cloudSyncStatus,
    cloudSyncError,
    persistenceDegraded,
    selectArtifact,
    setPanelOpen,
  } = useArtifactsStore();
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const taskDockOpen = useUIStore((s) => s.taskDockOpen);
  const streaming = useStreamingArtifactStore((s) => s.streaming);
  // re-exported through `useArtifact`) with no caller for the setter and a
  const panelWidth = useChatUIStore((s) => s.artifactPanelWidth);
  const setPanelWidth = useChatUIStore((s) => s.setArtifactPanelWidth);
  const layout = useOverlayLayout();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const conversationMessages = useChatStore((s) =>
    activeConversationId
      ? (s.messagesByConversation[activeConversationId] ?? s.messages)
      : s.messages,
  );
  const activeConversation = useChatStore(
    (s) =>
      s.conversations.find((conversation) => conversation.id === s.activeConversationId) ?? null,
  );
  const cloudPublisher = useMemo(
    () => createWebCloudPublisher({ conversationId: activeConversationId ?? null }),
    [activeConversationId],
  );
  const makePublishHandler = useCallback(
    (artifact: Artifact) => () =>
      publishArtifactService({
        artifact: {
          id: artifact.id,
          title: artifact.title,
          content: artifact.content,
          type: artifact.type,
          ...(artifact.language ? { language: artifact.language } : {}),
        },
        // The requested sink is always the managed cloud (web injects no local
        // file writer); `originPrivacyMode` decides whether this artifact is
        // allowed to reach it, and an unknown origin is refused there.
        privacyMode: 'managed',
        originPrivacyMode: resolveArtifactOriginPrivacyMode(
          artifact,
          conversationMessages,
          activeConversation,
        ),
        surface: 'web',
        cloudPublisher,
      }),
    [cloudPublisher, conversationMessages, activeConversation],
  );

  const artifacts = activeConversationId ? getConversationArtifacts(activeConversationId) : [];

  const selectedArtifact = artifacts.find((a) => a.id === selectedArtifactId) ?? artifacts[0];

  const streamingArtifact =
    streaming &&
    streaming.conversationId === activeConversationId &&
    !artifacts.some((a) => a.id === streaming.artifactId)
      ? streaming
      : null;
  const showStreamingView = Boolean(
    streamingArtifact && (selectedArtifactId === streamingArtifact.artifactId || !selectedArtifact),
  );

  const previousConversationRef = useRef<string | null>(activeConversationId);
  useEffect(() => {
    const previous = previousConversationRef.current;
    previousConversationRef.current = activeConversationId;
    if (!previous || !activeConversationId || previous === activeConversationId) return;

    const store = useArtifactsStore.getState();
    const conversationArtifacts = store.getConversationArtifacts(activeConversationId);
    const selected = store.selectedArtifactId;
    if (selected && conversationArtifacts.some((artifact) => artifact.id === selected)) return;
    store.selectArtifact(conversationArtifacts[0]?.id ?? null);
  }, [activeConversationId]);

  const [deepLinkId, setDeepLinkId] = useState<string | null>(() => readArtifactDeepLink());
  const appliedDeepLinkRef = useRef<string | null>(null);
  useEffect(() => {
    const onPopState = () => setDeepLinkId(readArtifactDeepLink());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  const artifactCount = artifacts.length;
  useEffect(() => {
    if (!deepLinkId || appliedDeepLinkRef.current === deepLinkId) return;
    void artifactCount;
    const store = useArtifactsStore.getState();
    if (!store.artifacts.some((artifact) => artifact.id === deepLinkId)) return;
    appliedDeepLinkRef.current = deepLinkId;
    store.selectArtifact(deepLinkId);
    store.setPanelOpen(true);
  }, [deepLinkId, artifactCount]);

  const isModalOverlay = layout === 'mobile' && panelOpen;

  useEffect(() => {
    if (!isModalOverlay) return;
    const panel = panelRef.current;
    if (!panel) return;

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const initial = focusableWithin(panel)[0] ?? panel;
    initial.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setPanelOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = focusableWithin(panel);
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    panel.addEventListener('keydown', onKeyDown);
    return () => {
      panel.removeEventListener('keydown', onKeyDown);
      const restore = restoreFocusRef.current;
      restoreFocusRef.current = null;
      if (restore && document.contains(restore)) restore.focus();
    };
  }, [isModalOverlay, setPanelOpen]);

  const onResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (layout !== 'desktop') return;
      event.preventDefault();
      const onPointerMove = (move: PointerEvent) => {
        setPanelWidth(window.innerWidth - move.clientX);
      };
      const onPointerUp = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        document.body.style.removeProperty('user-select');
      };
      document.body.style.setProperty('user-select', 'none');
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    },
    [layout, setPanelWidth],
  );

  const onResizeKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      setPanelWidth(
        panelWidth + (event.key === 'ArrowLeft' ? PANEL_WIDTH_KEY_STEP : -PANEL_WIDTH_KEY_STEP),
      );
    },
    [panelWidth, setPanelWidth],
  );

  if (!panelOpen) return null;

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm sm:hidden"
        onClick={() => setPanelOpen(false)}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role={isModalOverlay ? 'dialog' : undefined}
        aria-modal={isModalOverlay ? true : undefined}
        aria-label={isModalOverlay ? 'Artifacts' : undefined}
        tabIndex={isModalOverlay ? -1 : undefined}
        style={layout === 'desktop' ? { width: panelWidth } : undefined}
        className={cn(
          'flex flex-col border-l border-border/30 outline-none',
          'bg-card/95 backdrop-blur-xl',
          'fixed inset-y-0 right-0 z-40 w-full',
          'sm:relative sm:inset-auto sm:z-auto sm:w-full md:w-1/2 lg:w-[480px] sm:min-w-[280px] sm:shrink',
          'animate-in slide-in-from-right duration-300',
        )}
      >
        {/* AUDIT-FIX ART-23: drag handle (desktop only). Also keyboard
            operable, a mouse-only resize is not a resize for everyone. */}
        {layout === 'desktop' && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize artifacts panel"
            aria-valuenow={panelWidth}
            aria-valuemin={MIN_PANEL_WIDTH}
            aria-valuemax={MAX_PANEL_WIDTH}
            tabIndex={0}
            onPointerDown={onResizePointerDown}
            onKeyDown={onResizeKeyDown}
            className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize bg-transparent transition-colors hover:bg-primary/30 focus-visible:bg-primary/40 focus-visible:outline-none"
          />
        )}
        {/* Header, slim strip: panel title + count badge + Download all.
            Close X only shown here when no artifact is selected (no toolbar
            Close visible). When an artifact IS selected, the ArtifactPreview
            panel-variant toolbar carries the Close button. This ensures the
            panel is always closeable on mobile even with zero or unresolved
            artifact selections. */}
        {/* @container, same reason as the ArtifactPreview toolbar: this strip
            lives INSIDE the split pane, which the user can drag down to
            MIN_PANEL_WIDTH while the window stays wide. Viewport breakpoints
            here reveal labels at a width this bar never has. */}
        <div className="@container flex items-center justify-between border-b border-border/30 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2 overflow-hidden">
            <PanelRightOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
            <h2 className="shrink-0 text-sm font-semibold text-foreground">Artifacts</h2>
            {artifacts.length > 0 && (
              <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[12px] font-medium text-primary">
                {artifacts.length}
              </span>
            )}
            {/* AUDIT-FIX ART-20: quota-exhausted persistence is stated, not
                hidden. Without this the artifacts simply vanish on reload. */}
            {persistenceDegraded && (
              <span
                className="shrink-0 whitespace-nowrap text-[12px] text-danger"
                title="Browser storage is full, so artifacts are not being saved. They will disappear when this tab is closed."
              >
                Not saved
              </span>
            )}
            {cloudSyncStatus !== 'idle' && (
              <span
                className={cn(
                  'shrink-0 whitespace-nowrap text-[12px]',
                  cloudSyncStatus === 'error' ? 'text-danger' : 'text-muted-foreground',
                )}
                title={cloudSyncStatus === 'error' ? (cloudSyncError ?? undefined) : undefined}
              >
                {cloudSyncStatus === 'syncing'
                  ? 'Syncing…'
                  : cloudSyncStatus === 'error'
                    ? 'Sync retrying'
                    : 'Synced'}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {artifacts.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  toast.promise(downloadAllArtifacts(artifacts), {
                    loading: 'Preparing artifact download…',
                    success: 'Artifact download ready',
                    error: (error) => toUserMessage(error, 'Could not download artifacts'),
                  });
                }}
                className="h-7 px-2 text-xs"
                title="Download all artifacts as zip"
                aria-label="Download all artifacts as zip"
              >
                <FolderDown className="h-3.5 w-3.5" />
                <span className="ml-1 hidden @[26rem]:inline">Download all</span>
              </Button>
            )}
            {/* Show Close here only when the viewer toolbar is not visible
                (empty panel or no artifact selected) to avoid duplicating it. */}
            {!selectedArtifact && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPanelOpen(false)}
                className="h-7 w-7 p-0"
                aria-label="Close artifacts panel"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {taskDockOpen && <SlotTabs onShowTaskDock={() => setPanelOpen(false)} />}

        <ArtifactPrivacyNotice />

        {artifacts.length === 0 && !streamingArtifact ? (
          <ArtifactsEmptyState />
        ) : (
          <>
            {/* Tabs · horizontal scrollable list */}
            <div className="border-b border-border/20 px-3 py-2">
              <div className="flex gap-1 overflow-x-auto scrollbar-none">
                {artifacts.map((artifact) => (
                  <ArtifactTab
                    key={artifact.id}
                    artifact={artifact}
                    isSelected={artifact.id === selectedArtifact?.id}
                    onSelect={() => selectArtifact(artifact.id)}
                  />
                ))}
                {/* Live streaming artifact tab · pulsing dot marks the write in progress */}
                {streamingArtifact && (
                  <button
                    onClick={() => selectArtifact(streamingArtifact.artifactId)}
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                      showStreamingView
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                    )}
                    title={streamingArtifact.title}
                  >
                    <span
                      className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-primary"
                      aria-hidden="true"
                    />
                    <span className="max-w-[120px] truncate">{streamingArtifact.title}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="flex flex-1 flex-col overflow-hidden bg-background">
              {showStreamingView && streamingArtifact ? (
                <StreamingArtifactView artifact={streamingArtifact} />
              ) : selectedArtifact ? (
                <ArtifactViewer
                  artifact={selectedArtifact}
                  versionHistory={getArtifactVersions(selectedArtifact.id)}
                  onClose={() => setPanelOpen(false)}
                  publishArtifact={makePublishHandler(selectedArtifact)}
                />
              ) : (
                <ArtifactsEmptyState />
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

export function ArtifactsToggleButton() {
  const { getConversationArtifacts, panelOpen, togglePanel } = useArtifactsStore();
  const activeConversationId = useChatStore((s) => s.activeConversationId);

  // Shift+Cmd/Ctrl+A is claimed by the single useKeyboardShortcuts call in
  // WebChatPage, which calls this same store's togglePanel; a second
  // instance here would double-fire and cancel itself out.
  const artifacts = activeConversationId ? getConversationArtifacts(activeConversationId) : [];

  return (
    <button
      onClick={togglePanel}
      className={cn(
        'relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
        panelOpen
          ? 'bg-primary/15 text-primary'
          : 'bg-card/60 text-muted-foreground shadow-sm backdrop-blur-sm hover:bg-muted/60 hover:text-foreground',
      )}
      aria-label={panelOpen ? 'Close artifacts panel' : 'Open artifacts panel'}
      title="Artifacts"
    >
      <Code2 className="h-4 w-4" />
      {/* Badge showing count */}
      {artifacts.length > 0 && !panelOpen && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[12px] font-bold text-primary-foreground">
          {artifacts.length}
        </span>
      )}
    </button>
  );
}
