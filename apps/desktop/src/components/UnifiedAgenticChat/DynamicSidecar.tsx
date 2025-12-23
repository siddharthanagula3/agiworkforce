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
} from 'lucide-react';
import React, { useState } from 'react';

import { cn } from '../../lib/utils';
import type { Artifact } from '../../types/chat';
import { BrowserVisualization } from '../Browser/BrowserVisualization';
import { MonacoEditor } from '../Editor/MonacoEditor';
import { TerminalPanel } from '../Execution/TerminalPanel';
import { MediaGallery } from '../Media/MediaGallery';
import { ArtifactRenderer } from './ArtifactRenderer';


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
  defaultMinimized?: boolean;
}

const headerIconMap: Record<Exclude<DynamicPanelType, null>, React.ReactNode> = {
  terminal: <Terminal className="h-4 w-4 text-emerald-400" />,
  browser: <MousePointerClick className="h-4 w-4 text-sky-400" />,
  code: <Braces className="h-4 w-4 text-purple-400" />,
  video: <Video className="h-4 w-4 text-orange-400" />,
  media: <ImageIcon className="h-4 w-4 text-indigo-400" />,
  files: <FileText className="h-4 w-4 text-slate-300" />,
  data: <Database className="h-4 w-4 text-blue-400" />,
  preview: <PanelTopOpen className="h-4 w-4 text-orange-400" />,
  diff: <FileText className="h-4 w-4 text-zinc-300" />,
  canvas: <Braces className="h-4 w-4 text-pink-400" />,
  artifact: <Code2 className="h-4 w-4 text-amber-400" />,
};


const springConfig = {
  type: 'spring',
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
    transition: { duration: 0.2, ease: 'easeOut' },
  },
  expanded: {
    width: '100%',
    transition: { duration: 0.2, ease: 'easeOut' },
  },
};

export const DynamicSidecar: React.FC<DynamicSidecarProps> = ({
  panelType,
  payload,
  allowedDirectory,
  allowStatus = 'allowed',
  onClose,
  defaultMinimized = false,
}) => {
  const [isMinimized, setIsMinimized] = useState(defaultMinimized);

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
          <div className="flex h-full flex-col gap-3">
            {typeof payload?.['title'] === 'string' ? (
              <div className="text-sm font-medium text-zinc-200">
                {payload?.['title'] as string}
              </div>
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
          <div className="h-full overflow-y-auto">
            <ArtifactRenderer
              artifact={payload['artifact'] as Artifact}
              className="h-full border-none shadow-none"
            />
          </div>
        );

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

      default:
        return (
          <div className="flex h-full flex-col items-center justify-center text-sm text-zinc-400">
            <Shield className="mb-2 h-6 w-6 text-zinc-500" />
            Awaiting agent output…
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
      className="flex h-full flex-col bg-gray-900/95 dark:bg-gray-950/95 backdrop-blur-sm"
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
