/**
 * SidecarPanel — surface-agnostic sidecar (workspace panel) shell.
 *
 * Ported from apps/desktop/src/components/UnifiedAgenticChat/DynamicSidecar.tsx.
 *
 * This file contains the chrome (header, minimize/close buttons, animated
 * entry) and content routing for the sidecar. Desktop-specific panels
 * (MonacoEditor, TerminalPanel, BrowserVisualization, etc.) are NOT imported
 * here — they are injected via the `children` prop so this component stays
 * surface-agnostic.
 *
 * Usage in a host app:
 *   <SidecarPanel panelType="artifact" onClose={...}>
 *     <ArtifactRenderer artifact={...} />
 *   </SidecarPanel>
 */

import {
  Activity,
  Braces,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Code2,
  Database,
  Eye,
  FileOutput,
  FileText,
  FolderOpen,
  Gauge,
  GitBranch,
  Globe,
  Image as ImageIcon,
  MessageSquare,
  Monitor,
  MousePointerClick,
  PanelTopOpen,
  ShieldCheck,
  ShieldAlert,
  Store,
  Terminal,
  Video,
  X,
  Zap,
} from 'lucide-react';
import React, { useState } from 'react';
import { cn } from '../../lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SidecarPanelType =
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
  | 'agent-collab'
  | 'visual-editor'
  | 'dynamic-canvas'
  | null;

export interface SidecarPanelProps {
  panelType: SidecarPanelType;
  /** Panel body. When provided, renderContent is ignored. */
  children?: React.ReactNode;
  /** Called when the user clicks the close button. */
  onClose?: () => void;
  /** Whether the panel starts minimized. */
  defaultMinimized?: boolean;
  /** 'allowed' shows a green badge; 'restricted' shows an amber badge. */
  allowStatus?: 'allowed' | 'restricted';
  /** Directory label shown in the security badge. */
  allowedDirectory?: string;
  /** Additional class names on the root element. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Icon map
// ---------------------------------------------------------------------------

const PANEL_ICONS: Record<Exclude<SidecarPanelType, null>, React.ReactNode> = {
  terminal: <Terminal className="h-4 w-4 text-emerald-400" />,
  browser: <MousePointerClick className="h-4 w-4 text-sky-400" />,
  extension: <Globe className="h-4 w-4 text-teal-400" />,
  code: <Braces className="h-4 w-4 text-amber-400" />,
  video: <Video className="h-4 w-4 text-orange-400" />,
  media: <ImageIcon className="h-4 w-4 text-indigo-400" />,
  files: <FileText className="h-4 w-4 text-slate-300" />,
  data: <Database className="h-4 w-4 text-blue-400" />,
  preview: <PanelTopOpen className="h-4 w-4 text-orange-400" />,
  diff: <FileText className="h-4 w-4 text-foreground" />,
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
  governance: <ShieldCheck className="h-4 w-4 text-emerald-400" />,
  'agent-collab': <Zap className="h-4 w-4 text-fuchsia-400" />,
  'visual-editor': <Code2 className="h-4 w-4 text-teal-400" />,
  'dynamic-canvas': <Braces className="h-4 w-4 text-rose-400" />,
};

function panelLabel(panelType: SidecarPanelType): string {
  if (!panelType) return 'Workspace';
  return panelType.charAt(0).toUpperCase() + panelType.slice(1);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SidecarPanel({
  panelType,
  children,
  onClose,
  defaultMinimized = false,
  allowStatus = 'allowed',
  allowedDirectory,
  className,
}: SidecarPanelProps) {
  const [isMinimized, setIsMinimized] = useState(defaultMinimized);

  const securityBadge =
    allowStatus === 'allowed' ? (
      <div className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-300">
        <ShieldCheck className="h-3 w-3" />
        {allowedDirectory ?? 'Allowed'}
      </div>
    ) : (
      <div className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-300">
        <ShieldAlert className="h-3 w-3" />
        Restricted
      </div>
    );

  if (isMinimized) {
    return (
      <div
        className={cn(
          'flex flex-col items-center py-4 px-1 bg-card border-l border-border h-full',
          className,
        )}
        data-testid="sidecar-panel-minimized"
      >
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className="p-2 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors mb-4"
          aria-label="Expand sidecar"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        {panelType && (
          <div className="p-2 rounded-lg bg-muted text-muted-foreground">
            {PANEL_ICONS[panelType]}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn('flex h-full flex-col bg-card', className)} data-testid="sidecar-panel">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-muted shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-foreground">
            {panelType ? PANEL_ICONS[panelType] : null}
            <span className="font-medium">{panelLabel(panelType)}</span>
          </div>
          {securityBadge}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsMinimized(true)}
            className="flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="Minimize sidecar"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors',
              !onClose && 'opacity-60 pointer-events-none',
            )}
            aria-label="Close sidecar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden p-4" data-testid="sidecar-panel-body">
        {children ?? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <ShieldCheck className="h-6 w-6 text-muted-foreground opacity-40" />
            <span>Awaiting panel content…</span>
          </div>
        )}
      </div>
    </div>
  );
}
