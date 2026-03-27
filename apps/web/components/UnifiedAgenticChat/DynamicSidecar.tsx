import { AnimatePresence, motion } from 'framer-motion';
import {
  Braces,
  ChevronLeft,
  ChevronRight,
  Code2,
  Database,
  FileText,
  Image as ImageIcon,
  MousePointerClick,
  PanelTopOpen,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Video,
  X,
  Activity,
} from 'lucide-react';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { cn } from '@/lib/utils';
import type { Artifact } from '@/types/chat';
import { BrowserVisualization } from '../Browser/BrowserVisualization';
import { MonacoEditor } from '../Editor/MonacoEditor';
import { TerminalPanel } from '../Execution/TerminalPanel';
import { MediaGallery } from '../Media/MediaGallery';
import { BackgroundTasksPanel } from '../BackgroundTasks/BackgroundTasksPanel';
import { ArtifactRenderer } from './ArtifactRenderer';
import { DiffViewer } from './Sidecar/DiffViewer';
import { useUnifiedChatStore } from '@/stores/unified/unifiedChatStore';

export type DynamicPanelType =
  | 'terminal'
  | 'browser'
  | 'code'
  | 'video'
  | 'media'
  | 'files'
  | 'data'
  | 'preview'
  | 'diff'
  | 'canvas'
  | 'artifact'
  | 'tasks'
  | null;

interface DynamicSidecarProps {
  panelType: DynamicPanelType;
  payload?: Record<string, unknown>;
  contextId?: string | null;
  allowedDirectory?: string;
  allowStatus?: 'allowed' | 'restricted';
  onClose?: () => void;
  defaultMinimized?: boolean;
}

const headerIconMap: Record<Exclude<DynamicPanelType, null>, React.ReactNode> = {
  terminal: <Terminal className="h-4 w-4 text-emerald-400" />,
  browser: <MousePointerClick className="h-4 w-4 text-sky-400" />,
  code: <Braces className="h-4 w-4 text-amber-400" />,
  video: <Video className="h-4 w-4 text-orange-400" />,
  media: <ImageIcon className="h-4 w-4 text-indigo-400" />,
  files: <FileText className="h-4 w-4 text-muted-foreground" />,
  data: <Database className="h-4 w-4 text-blue-400" />,
  preview: <PanelTopOpen className="h-4 w-4 text-orange-400" />,
  diff: <FileText className="h-4 w-4 text-muted-foreground" />,
  canvas: <Braces className="h-4 w-4 text-pink-400" />,
  artifact: <Code2 className="h-4 w-4 text-amber-400" />,
  tasks: <Activity className="h-4 w-4 text-cyan-400" />,
};

// AUDIT-005-018 fix: Separate component to handle video autoPlay with error handling
function VideoPanel({ src, title }: { src?: string; title?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [autoPlayFailed, setAutoPlayFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    // AUDIT-005-018 fix: Handle autoPlay promise rejection
    // Browsers may block autoplay due to various policies
    const attemptAutoPlay = async () => {
      try {
        await video.play();
        setAutoPlayFailed(false);
      } catch (err) {
        // AutoPlay was blocked - this is expected behavior in many browsers
        // The video will still be playable via controls
        void err;
        setAutoPlayFailed(true);
      }
    };

    attemptAutoPlay();
  }, [src]);

  return (
    <div className="flex h-full flex-col gap-3">
      {title && <div className="text-sm font-medium text-foreground">{title}</div>}
      <div className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-black/60">
        <video
          ref={videoRef}
          className="h-auto w-full"
          src={src}
          controls
          aria-label={title || 'Video output'}
        />
        {autoPlayFailed && (
          <div className="absolute bottom-2 left-2 rounded bg-background/80 px-2 py-1 text-xs text-muted-foreground">
            Click play to start video
          </div>
        )}
      </div>
    </div>
  );
}

const springConfig = {
  type: 'spring' as const,
  damping: 25,
  stiffness: 300,
};

const sidecarVariants = {
  hidden: {
    x: '100%',
    opacity: 0,
    transition: springConfig,
  },
  visible: {
    x: 0,
    opacity: 1,
    transition: springConfig,
  },
  minimized: {
    width: 48,
    transition: { duration: 0.2, ease: 'easeOut' as const },
  },
  expanded: {
    width: '100%',
    transition: { duration: 0.2, ease: 'easeOut' as const },
  },
};

export const DynamicSidecar: React.FC<DynamicSidecarProps> = ({
  panelType,
  payload,
  contextId,
  allowedDirectory,
  allowStatus = 'allowed',
  onClose,
  defaultMinimized = false,
}) => {
  const [isMinimized, setIsMinimized] = useState(defaultMinimized);

  // AUDIT-SIDECAR-082 fix: Subscribe to store for live artifact updates
  // Move hooks to top level to comply with rules of hooks
  const { messages } = useUnifiedChatStore(
    useShallow((state) => ({
      messages: state.messages,
    })),
  );

  // Get IDs from payload for preview mode
  const artifactId = payload?.['artifactId'] as string | undefined;
  const messageId = payload?.['messageId'] as string | undefined;

  // Find the live artifact from the store by resolving IDs
  const liveArtifact = useMemo(() => {
    // First try to find by specific artifactId if provided
    if (artifactId) {
      for (const msg of messages) {
        const artifacts = msg.artifacts || [];
        const metadataArtifacts = (msg.metadata?.artifacts as Artifact[] | undefined) || [];
        const allArtifacts = [...artifacts, ...metadataArtifacts];
        const found = allArtifacts.find((a) => a.id === artifactId);
        if (found) return found;
      }
    }

    // Fall back to finding by messageId and getting the latest artifact
    if (messageId) {
      const message = messages.find((m) => m.id === messageId);
      if (message) {
        const artifacts = message.artifacts || [];
        const metadataArtifacts = (message.metadata?.artifacts as Artifact[] | undefined) || [];

        // Return the latest artifact (most recently updated)
        const allArtifacts = [...artifacts, ...metadataArtifacts];
        if (allArtifacts.length > 0) {
          return allArtifacts[allArtifacts.length - 1];
        }
      }
    }

    return null;
  }, [artifactId, messageId, messages]);

  // Prefer live artifact from store, fall back to legacy static payload (for backward compatibility)
  const legacyArtifact = payload?.['artifact'] as Artifact | undefined;
  const previewArtifact = liveArtifact || legacyArtifact;

  const securityBadge =
    allowStatus === 'allowed' ? (
      <div className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-300">
        <ShieldCheck className="h-3 w-3" />
        {allowedDirectory ? allowedDirectory : 'Allowed'}
      </div>
    ) : (
      <div className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-300">
        <ShieldAlert className="h-3 w-3" />
        Restricted
      </div>
    );

  const renderContent = () => {
    switch (panelType) {
      case 'terminal':
        return <TerminalPanel className="flex-1" />;
      case 'browser':
        return (
          <BrowserVisualization
            className="flex-1"
            tabId={payload?.['tabId'] as string | undefined}
          />
        );
      case 'code':
        return (
          <MonacoEditor
            value={String(payload?.['code'] ?? '')}
            language={(payload?.['language'] as string) || 'typescript'}
            filePath={payload?.['filePath'] as string | undefined}
            enableLSP
            height="100%"
          />
        );
      case 'files':
        return (
          <div className="grid h-full grid-cols-1 md:grid-cols-3">
            <div className="hidden h-full bg-background/50 px-3 py-4 text-xs text-muted-foreground md:block">
              File tree is visible in the primary sidecar. Previewing selected file here.
            </div>
            <div className="col-span-2 h-full bg-background/70">
              <MonacoEditor
                value={String(payload?.['content'] ?? '')}
                filePath={payload?.['filePath'] as string | undefined}
                language={(payload?.['language'] as string) || 'typescript'}
                height="100%"
              />
            </div>
          </div>
        );
      case 'media':
        return <MediaGallery />;

      case 'video':
        return (
          <VideoPanel
            src={payload?.['src'] as string | undefined}
            title={
              typeof payload?.['title'] === 'string' ? (payload?.['title'] as string) : undefined
            }
          />
        );

      case 'tasks':
        return <BackgroundTasksPanel className="flex-1" maxHeight="100%" />;

      case 'artifact':
        if (!payload?.['artifact']) {
          return (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No artifact data provided
            </div>
          );
        }
        return (
          <div className="h-full overflow-y-auto">
            <ArtifactRenderer
              artifact={payload['artifact'] as Artifact}
              className="h-full border-none shadow-none"
            />
          </div>
        );

      case 'preview': {
        // Use pre-computed values from top-level hooks

        if (previewArtifact) {
          return (
            <div className="h-full overflow-y-auto">
              <ArtifactRenderer
                artifact={previewArtifact}
                className="h-full border-none shadow-none"
              />
            </div>
          );
        }

        // Fall back to content-based rendering
        if (typeof payload?.['content'] === 'string') {
          return (
            <div className="h-full overflow-auto rounded-lg border border-border/50 bg-background/40 p-4">
              <pre className="whitespace-pre-wrap break-words text-sm text-foreground/80">
                {payload['content'] as string}
              </pre>
            </div>
          );
        }

        const imageSrc =
          (payload?.['src'] as string | undefined) || (payload?.['imageUrl'] as string | undefined);
        if (imageSrc) {
          return (
            <div className="flex h-full items-center justify-center rounded-lg border border-border/50 bg-background/40 p-4">
              <img
                src={imageSrc}
                alt="Preview"
                className="max-h-full max-w-full rounded-lg border border-white/10 object-contain"
              />
            </div>
          );
        }

        return (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <Shield className="h-6 w-6 text-muted-foreground" />
            <span>No preview content is available yet.</span>
            {contextId ? (
              <span className="text-xs text-muted-foreground">Message ID: {contextId}</span>
            ) : null}
          </div>
        );
      }

      case 'data':
        return (
          <div className="flex h-full flex-col">
            <div className="border-b border-border/40 bg-background/40 p-2 text-xs text-muted-foreground">
              Data Preview (Read-Only)
            </div>
            <div className="flex-1 overflow-auto p-0">
              <table className="w-full text-left text-sm text-foreground/80">
                <thead className="sticky top-0 bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 border-b border-white/10">Key</th>
                    <th className="px-4 py-2 border-b border-white/10">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {payload?.['data'] && typeof payload['data'] === 'object' ? (
                    Object.entries(payload['data'] as Record<string, unknown>).map(([k, v]) => (
                      <tr key={k} className="hover:bg-white/5">
                        <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{k}</td>
                        <td className="px-4 py-2">{String(v)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={2}
                        className="px-4 py-4 text-center text-muted-foreground italic"
                      >
                        No structured data available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'diff':
        if (typeof payload?.['content'] === 'string') {
          return (
            <div className="h-full overflow-auto rounded-lg border border-border/50 bg-background/40 p-4">
              <pre className="whitespace-pre-wrap break-words text-sm text-foreground/80">
                {payload['content'] as string}
              </pre>
            </div>
          );
        }
        return <DiffViewer contextId={contextId ?? undefined} className="h-full" />;

      default:
        return (
          <div className="flex h-full flex-col items-center justify-center text-sm text-muted-foreground">
            <Shield className="mb-2 h-6 w-6 text-muted-foreground" />
            Awaiting panel content…
          </div>
        );
    }
  };

  if (isMinimized) {
    return (
      <motion.div
        className="flex h-full flex-col items-center border-l border-border/50 bg-background/95 px-1 py-4"
        initial="hidden"
        animate="visible"
        variants={sidecarVariants}
      >
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className="mb-4 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Expand sidecar"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {panelType && (
          <div className="rounded-lg bg-muted/50 p-2 text-foreground/80">
            {headerIconMap[panelType]}
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      className="flex h-full flex-col bg-background/95 backdrop-blur-xs"
      initial="hidden"
      animate="visible"
      exit="hidden"
      variants={sidecarVariants}
    >
      {}
      <div className="flex items-center justify-between border-b border-border/50 bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-foreground">
            {panelType ? headerIconMap[panelType] : null}
            <span className="font-medium">
              {panelType ? panelType.charAt(0).toUpperCase() + panelType.slice(1) : 'Workspace'}
            </span>
          </div>
          {securityBadge}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsMinimized(true)}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
            )}
            aria-label="Minimize sidecar"
            title="Minimize"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
              !onClose && 'opacity-60 pointer-events-none',
            )}
            aria-label="Close sidecar"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {}
      <AnimatePresence mode="wait">
        <motion.div
          key={panelType || 'none'}
          className="flex-1 overflow-hidden p-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
        >
          {renderContent()}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
};

export default DynamicSidecar;
