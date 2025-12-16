import { AnimatePresence, motion } from 'framer-motion';
import {
  Braces,
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
} from 'lucide-react';
import React from 'react';

import { cn } from '../../lib/utils';
import type { Artifact } from '../../types/chat';
import { BrowserVisualization } from '../Browser/BrowserVisualization';
import { MonacoEditor } from '../Editor/MonacoEditor';
import { TerminalPanel } from '../execution/TerminalPanel';
import { MediaGallery } from '../Media/MediaGallery';
import { ArtifactRenderer } from './ArtifactRenderer';

// FIX: Added 'data' to supported types to match SidecarPanel
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
  | null;

interface DynamicSidecarProps {
  panelType: DynamicPanelType;
  payload?: Record<string, unknown>;
  allowedDirectory?: string;
  allowStatus?: 'allowed' | 'restricted';
  onClose?: () => void;
}

const headerIconMap: Record<Exclude<DynamicPanelType, null>, React.ReactNode> = {
  terminal: <Terminal className="h-4 w-4 text-emerald-300" />,
  browser: <MousePointerClick className="h-4 w-4 text-sky-300" />,
  code: <Braces className="h-4 w-4 text-purple-300" />,
  video: <Video className="h-4 w-4 text-orange-300" />,
  media: <ImageIcon className="h-4 w-4 text-indigo-300" />,
  files: <FileText className="h-4 w-4 text-slate-200" />,
  data: <Database className="h-4 w-4 text-blue-300" />,
  preview: <PanelTopOpen className="h-4 w-4 text-orange-300" />,
  diff: <FileText className="h-4 w-4 text-zinc-300" />,
  canvas: <Braces className="h-4 w-4 text-pink-300" />,
  artifact: <Code2 className="h-4 w-4 text-orange-300" />,
};

export const DynamicSidecar: React.FC<DynamicSidecarProps> = ({
  panelType,
  payload,
  allowedDirectory,
  allowStatus = 'allowed',
  onClose,
}) => {
  const securityBadge =
    allowStatus === 'allowed' ? (
      <div className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-100">
        <ShieldCheck className="h-3 w-3" />
        Allowed{allowedDirectory ? ` - ${allowedDirectory}` : ''}
      </div>
    ) : (
      <div className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-100">
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
            value={String(payload?.['code'] ?? '// Agent opened code context')}
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
                value={String(payload?.['content'] ?? '// Select a file to view')}
                filePath={payload?.['filePath'] as string | undefined}
                language={(payload?.['language'] as string) || 'typescript'}
                height="100%"
              />
            </div>
          </div>
        );
      case 'media':
        return <MediaGallery />;

      // FIX: Video Mode Implementation
      case 'video':
        return (
          <div className="flex h-full flex-col gap-3">
            {typeof payload?.['title'] === 'string' ? (
              <div className="text-sm text-zinc-200">{payload?.['title'] as string}</div>
            ) : null}
            <div className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-black/60">
              <video
                className="h-auto w-full"
                src={payload?.['src'] as string | undefined}
                controls
                autoPlay
                aria-label={
                  typeof payload?.['title'] === 'string'
                    ? (payload?.['title'] as string)
                    : 'Video output'
                }
              />
            </div>
          </div>
        );

      case 'artifact':
        if (!payload?.['artifact']) {
          return (
            <div className="flex h-full items-center justify-center text-sm text-zinc-500">
              No artifact data provided
            </div>
          );
        }
        return (
          <div className="h-full overflow-y-auto p-4">
            <ArtifactRenderer
              artifact={payload['artifact'] as Artifact}
              className="h-full border-none shadow-none"
            />
          </div>
        );

      // FIX: Data Mode Implementation (Matches SidecarPanel)
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
                    Object.entries(payload['data'] as Record<string, any>).map(([k, v]) => (
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

      default:
        return (
          <div className="flex h-full flex-col items-center justify-center text-sm text-zinc-400">
            <Shield className="mb-2 h-6 w-6 text-zinc-500" />
            Awaiting agent output…
          </div>
        );
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-zinc-100">
          {panelType ? headerIconMap[panelType] : null}
          <span className="font-semibold">
            {panelType ? panelType.charAt(0).toUpperCase() + panelType.slice(1) : 'Workspace'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {securityBadge}
          <button
            type="button"
            onClick={onClose}
            className={cn(
              'flex items-center justify-center h-7 w-7 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors border border-zinc-200 dark:border-zinc-700',
              !onClose && 'opacity-60 pointer-events-none',
            )}
            aria-label="Close sidecar"
            title="Close sidecar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={panelType || 'none'}
          className="flex-1 overflow-hidden p-4"
          initial={{ opacity: 0.4, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          {renderContent()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default DynamicSidecar;
