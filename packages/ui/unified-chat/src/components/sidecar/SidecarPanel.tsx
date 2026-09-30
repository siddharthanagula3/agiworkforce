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
  children?: React.ReactNode;
  onClose?: () => void;
  defaultMinimized?: boolean;
  allowStatus?: 'allowed' | 'restricted';
  allowedDirectory?: string;
  className?: string;
}

const PANEL_ICONS: Record<Exclude<SidecarPanelType, null>, React.ReactNode> = {
  terminal: <Terminal className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />,
  browser: <MousePointerClick className="h-4 w-4 text-muted-foreground" />,
  extension: <Globe className="h-4 w-4 text-muted-foreground" />,
  code: <Braces className="h-4 w-4 text-muted-foreground" />,
  video: <Video className="h-4 w-4 text-muted-foreground" />,
  media: <ImageIcon className="h-4 w-4 text-muted-foreground" />,
  files: <FileText className="h-4 w-4 text-muted-foreground" />,
  data: <Database className="h-4 w-4 text-muted-foreground" />,
  preview: <PanelTopOpen className="h-4 w-4 text-muted-foreground" />,
  diff: <FileText className="h-4 w-4 text-foreground" />,
  canvas: <Braces className="h-4 w-4 text-muted-foreground" />,
  artifact: <Code2 className="h-4 w-4 text-muted-foreground" />,
  tasks: <Activity className="h-4 w-4 text-muted-foreground" />,
  git: <GitBranch className="h-4 w-4 text-muted-foreground" />,
  database: <Database className="h-4 w-4 text-muted-foreground" />,
  filesystem: <FolderOpen className="h-4 w-4 text-muted-foreground" />,
  vision: <Eye className="h-4 w-4 text-muted-foreground" />,
  'computer-use': <Monitor className="h-4 w-4 text-muted-foreground" />,
  swarm: <Zap className="h-4 w-4 text-muted-foreground" />,
  scheduler: <Calendar className="h-4 w-4 text-muted-foreground" />,
  documents: <FileOutput className="h-4 w-4 text-muted-foreground" />,
  automation: <Activity className="h-4 w-4 text-muted-foreground" />,
  marketplace: <Store className="h-4 w-4 text-muted-foreground" />,
  messaging: <MessageSquare className="h-4 w-4 text-muted-foreground" />,
  productivity: <Gauge className="h-4 w-4 text-muted-foreground" />,
  cloud: <Cloud className="h-4 w-4 text-muted-foreground" />,
  governance: <ShieldCheck className="h-4 w-4 text-muted-foreground" />,
  'agent-collab': <Zap className="h-4 w-4 text-muted-foreground" />,
  'visual-editor': <Code2 className="h-4 w-4 text-muted-foreground" />,
  'dynamic-canvas': <Braces className="h-4 w-4 text-muted-foreground" />,
};

function panelLabel(panelType: SidecarPanelType): string {
  if (!panelType) return 'Workspace';
  return panelType.charAt(0).toUpperCase() + panelType.slice(1);
}

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
      <div className="inline-flex items-center gap-1 rounded-full border border-success-fill/30 bg-success-fill/10 px-2 py-1 text-caption font-medium text-success-text">
        <ShieldCheck className="h-3 w-3" />
        {allowedDirectory ?? 'Allowed'}
      </div>
    ) : (
      <div className="inline-flex items-center gap-1 rounded-full border border-warning-fill/30 bg-warning-fill/10 px-2 py-1 text-caption font-medium text-warning-text">
        <ShieldAlert className="h-3 w-3" />
        Restricted
      </div>
    );

  if (isMinimized) {
    return (
      <div
        className={cn(
          'flex flex-col items-center py-4 px-1 bg-card border-s border-border h-full',
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
