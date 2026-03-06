import { AnimatePresence, motion } from 'framer-motion';
import {
  Braces,
  ChevronLeft,
  ChevronRight,
  Code2,
  Database,
  Eye,
  FileText,
  FolderOpen,
  GitBranch,
  Globe,
  Image as ImageIcon,
  MessageSquare,
  Monitor,
  MousePointerClick,
  PanelTopOpen,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Store,
  Terminal,
  Video,
  X,
  Activity,
  Calendar,
  FileOutput,
  Gauge,
  Cloud,
  ShieldCheck as GovernanceIcon,
  Zap,
} from 'lucide-react';
import React, { lazy, Suspense, useState, useRef, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { cn } from '../../lib/utils';
import type { Artifact } from '../../types/chat';
import { BrowserVisualization } from '../Browser/BrowserVisualization';
import { BrowserAutomationPanel } from '../Agent/BrowserAutomationPanel';
import { MonacoEditor } from '../Editor/MonacoEditor';
import { TerminalPanel } from '../Execution/TerminalPanel';
import { MediaGallery } from '../Media/MediaGallery';
import { BackgroundTasksPanel } from '../BackgroundTasks/BackgroundTasksPanel';
import { ArtifactRenderer } from './ArtifactRenderer';
import { DiffViewer } from './Sidecar/DiffViewer';
import { useUnifiedChatStore } from '../../stores/unifiedChatStore';

// Lazy-loaded sidecar panels
const LazyGitPanel = lazy(() => import('../Git/GitPanel').then((m) => ({ default: m.GitPanel })));
const LazyDatabaseWorkspace = lazy(() =>
  import('../Database/DatabaseWorkspace').then((m) => ({ default: m.DatabaseWorkspace })),
);
const LazyFilesystemWorkspace = lazy(() =>
  import('../Filesystem/FilesystemWorkspace').then((m) => ({ default: m.FilesystemWorkspace })),
);
const LazyVisionWorkspace = lazy(() =>
  import('../Vision/VisionWorkspace').then((m) => ({ default: m.VisionWorkspace })),
);
const LazyComputerUseMonitor = lazy(() =>
  import('../ComputerUse/ComputerUseMonitor').then((m) => ({ default: m.ComputerUseMonitor })),
);
const LazySchedulerPanel = lazy(() =>
  import('../Scheduler/SchedulerPanel').then((m) => ({ default: m.SchedulerPanel })),
);
const LazyDocumentGenerator = lazy(() =>
  import('../Documents/DocumentGenerator').then((m) => ({ default: m.DocumentGenerator })),
);
const LazyActionRecorder = lazy(() =>
  import('../Automation/ActionRecorder').then((m) => ({ default: m.ActionRecorder })),
);
const LazyMarketplacePage = lazy(() =>
  import('../Marketplace/MarketplacePage').then((m) => ({ default: m.MarketplacePage })),
);
const LazyMessagingIntegrations = lazy(() =>
  import('../Messaging/MessagingIntegrations').then((m) => ({ default: m.MessagingIntegrations })),
);
const LazyProductivityWorkspace = lazy(() =>
  import('../Productivity/ProductivityWorkspace').then((m) => ({
    default: m.ProductivityWorkspace,
  })),
);
const LazyCloudStoragePanel = lazy(() =>
  import('../Cloud/CloudStoragePanel').then((m) => ({ default: m.CloudStoragePanel })),
);
const LazyGovernanceDashboard = lazy(() =>
  import('../Governance/GovernanceDashboard').then((m) => ({ default: m.GovernanceDashboard })),
);
const LazyCanvasWorkspace = lazy(() =>
  import('../Canvas/CanvasWorkspace').then((m) => ({ default: m.CanvasWorkspace })),
);

const SidecarLoadingFallback = () => (
  <div className="flex h-full items-center justify-center text-sm text-zinc-500">
    <div className="animate-pulse">Loading panel...</div>
  </div>
);

export type DynamicPanelType =
  | 'terminal'
  | 'browser'
  | 'extension'
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
  | 'git'
  | 'database'
  | 'filesystem'
  | 'vision'
  | 'computer-use'
  | 'swarm'
  | 'scheduler'
  | 'documents'
  | 'automation'
  | 'marketplace'
  | 'messaging'
  | 'productivity'
  | 'cloud'
  | 'governance'
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
  extension: <Globe className="h-4 w-4 text-teal-400" />,
  code: <Braces className="h-4 w-4 text-amber-400" />,
  video: <Video className="h-4 w-4 text-orange-400" />,
  media: <ImageIcon className="h-4 w-4 text-indigo-400" />,
  files: <FileText className="h-4 w-4 text-slate-300" />,
  data: <Database className="h-4 w-4 text-blue-400" />,
  preview: <PanelTopOpen className="h-4 w-4 text-orange-400" />,
  diff: <FileText className="h-4 w-4 text-zinc-300" />,
  canvas: <Braces className="h-4 w-4 text-pink-400" />,
  artifact: <Code2 className="h-4 w-4 text-amber-400" />,
  tasks: <Activity className="h-4 w-4 text-cyan-400" />,
  git: <GitBranch className="h-4 w-4 text-orange-400" />,
  database: <Database className="h-4 w-4 text-blue-400" />,
  filesystem: <FolderOpen className="h-4 w-4 text-yellow-400" />,
  vision: <Eye className="h-4 w-4 text-purple-400" />,
  'computer-use': <Monitor className="h-4 w-4 text-cyan-400" />,
  swarm: <Zap className="h-4 w-4 text-amber-400" />,
  scheduler: <Calendar className="h-4 w-4 text-green-400" />,
  documents: <FileOutput className="h-4 w-4 text-rose-400" />,
  automation: <Activity className="h-4 w-4 text-red-400" />,
  marketplace: <Store className="h-4 w-4 text-violet-400" />,
  messaging: <MessageSquare className="h-4 w-4 text-teal-400" />,
  productivity: <Gauge className="h-4 w-4 text-lime-400" />,
  cloud: <Cloud className="h-4 w-4 text-sky-400" />,
  governance: <GovernanceIcon className="h-4 w-4 text-emerald-400" />,
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
        console.debug('[DynamicSidecar] Video autoPlay was blocked:', err);
        setAutoPlayFailed(true);
      }
    };

    attemptAutoPlay();
  }, [src]);

  return (
    <div className="flex h-full flex-col gap-3">
      {title && <div className="text-sm font-medium text-zinc-200">{title}</div>}
      <div className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-black/60">
        <video
          ref={videoRef}
          className="h-auto w-full"
          src={src}
          controls
          aria-label={title || 'Video output'}
        />
        {autoPlayFailed && (
          <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/70 rounded text-xs text-zinc-400">
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
      case 'extension':
        return <BrowserAutomationPanel className="flex-1" />;
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
            <div className="hidden h-full bg-black/50 px-3 py-4 text-xs text-zinc-400 md:block">
              File tree is visible in the primary sidecar. Previewing selected file here.
            </div>
            <div className="col-span-2 h-full bg-black/70">
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
            <div className="flex h-full items-center justify-center text-sm text-zinc-500">
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
            <div className="h-full overflow-auto rounded-lg border border-white/10 bg-black/30 p-4">
              <pre className="whitespace-pre-wrap break-words text-sm text-zinc-200">
                {payload['content'] as string}
              </pre>
            </div>
          );
        }

        const imageSrc =
          (payload?.['src'] as string | undefined) || (payload?.['imageUrl'] as string | undefined);
        if (imageSrc) {
          return (
            <div className="flex h-full items-center justify-center rounded-lg border border-white/10 bg-black/30 p-4">
              <img
                src={imageSrc}
                alt="Preview"
                className="max-h-full max-w-full rounded-lg border border-white/10 object-contain"
              />
            </div>
          );
        }

        return (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-zinc-400">
            <Shield className="h-6 w-6 text-zinc-500" />
            <span>No preview content is available yet.</span>
            {contextId ? (
              <span className="text-xs text-zinc-500">Message ID: {contextId}</span>
            ) : null}
          </div>
        );
      }

      case 'data':
        return (
          <div className="flex h-full flex-col">
            <div className="bg-black/40 p-2 text-xs text-zinc-400 border-b border-white/5">
              Data Preview (Read-Only)
            </div>
            <div className="flex-1 overflow-auto p-0">
              <table className="w-full text-sm text-left text-zinc-300">
                <thead className="bg-white/5 text-xs uppercase text-zinc-500 sticky top-0">
                  <tr>
                    <th className="px-4 py-2 border-b border-white/10">Key</th>
                    <th className="px-4 py-2 border-b border-white/10">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {payload?.['data'] && typeof payload['data'] === 'object' ? (
                    Object.entries(payload['data'] as Record<string, unknown>).map(([k, v]) => (
                      <tr key={k} className="hover:bg-white/5">
                        <td className="px-4 py-2 font-mono text-xs text-zinc-500">{k}</td>
                        <td className="px-4 py-2">{String(v)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={2} className="px-4 py-4 text-center text-zinc-500 italic">
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
            <div className="h-full overflow-auto rounded-lg border border-white/10 bg-black/30 p-4">
              <pre className="whitespace-pre-wrap break-words text-sm text-zinc-200">
                {payload['content'] as string}
              </pre>
            </div>
          );
        }
        return <DiffViewer contextId={contextId ?? undefined} className="h-full" />;

      case 'canvas':
        return (
          <Suspense fallback={<SidecarLoadingFallback />}>
            <LazyCanvasWorkspace />
          </Suspense>
        );

      case 'git':
        return (
          <Suspense fallback={<SidecarLoadingFallback />}>
            <LazyGitPanel repoPath={(payload?.['repoPath'] as string) || '.'} />
          </Suspense>
        );

      case 'database':
        return (
          <Suspense fallback={<SidecarLoadingFallback />}>
            <LazyDatabaseWorkspace />
          </Suspense>
        );

      case 'filesystem':
        return (
          <Suspense fallback={<SidecarLoadingFallback />}>
            <LazyFilesystemWorkspace />
          </Suspense>
        );

      case 'vision':
        return (
          <Suspense fallback={<SidecarLoadingFallback />}>
            <LazyVisionWorkspace />
          </Suspense>
        );

      case 'computer-use':
        return (
          <Suspense fallback={<SidecarLoadingFallback />}>
            <LazyComputerUseMonitor />
          </Suspense>
        );

      case 'scheduler':
        return (
          <Suspense fallback={<SidecarLoadingFallback />}>
            <LazySchedulerPanel />
          </Suspense>
        );

      case 'documents':
        return (
          <Suspense fallback={<SidecarLoadingFallback />}>
            <LazyDocumentGenerator />
          </Suspense>
        );

      case 'automation':
        return (
          <Suspense fallback={<SidecarLoadingFallback />}>
            <LazyActionRecorder />
          </Suspense>
        );

      case 'marketplace':
        return (
          <Suspense fallback={<SidecarLoadingFallback />}>
            <LazyMarketplacePage />
          </Suspense>
        );

      case 'messaging':
        return (
          <Suspense fallback={<SidecarLoadingFallback />}>
            <LazyMessagingIntegrations userId={(payload?.['userId'] as string) || ''} />
          </Suspense>
        );

      case 'productivity':
        return (
          <Suspense fallback={<SidecarLoadingFallback />}>
            <LazyProductivityWorkspace />
          </Suspense>
        );

      case 'cloud':
        return (
          <Suspense fallback={<SidecarLoadingFallback />}>
            <LazyCloudStoragePanel />
          </Suspense>
        );

      case 'governance':
        return (
          <Suspense fallback={<SidecarLoadingFallback />}>
            <LazyGovernanceDashboard />
          </Suspense>
        );

      default:
        return (
          <div className="flex h-full flex-col items-center justify-center text-sm text-zinc-400">
            <Shield className="mb-2 h-6 w-6 text-zinc-500" />
            Awaiting panel content…
          </div>
        );
    }
  };

  if (isMinimized) {
    return (
      <motion.div
        className="flex flex-col items-center py-4 px-1 bg-gray-900/95 border-l border-gray-700/50 h-full"
        initial="hidden"
        animate="visible"
        variants={sidecarVariants}
      >
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors mb-4"
          aria-label="Expand sidecar"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {panelType && (
          <div className="p-2 rounded-lg bg-gray-800/50 text-gray-300">
            {headerIconMap[panelType]}
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      className="flex h-full flex-col bg-gray-900/95 dark:bg-gray-950/95 backdrop-blur-xs"
      initial="hidden"
      animate="visible"
      exit="hidden"
      variants={sidecarVariants}
    >
      {}
      <div className="flex items-center justify-between border-b border-gray-700/50 px-4 py-3 bg-gray-800/30">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-zinc-100">
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
              'flex items-center justify-center h-7 w-7 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-gray-700/50 transition-colors',
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
              'flex items-center justify-center h-7 w-7 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-gray-700/50 transition-colors',
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
