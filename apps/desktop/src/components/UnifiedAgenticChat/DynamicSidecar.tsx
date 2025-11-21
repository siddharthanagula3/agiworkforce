import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Braces,
  MousePointerClick,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Video,
} from 'lucide-react';

import { BrowserVisualization } from '../Browser/BrowserVisualization';
import { MonacoEditor } from '../Editor/MonacoEditor';
import { TerminalPanel } from '../execution/TerminalPanel';
import { cn } from '../../lib/utils';

export type DynamicPanelType = 'terminal' | 'browser' | 'code' | 'video' | null;

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
        Allowed{allowedDirectory ? ` · ${allowedDirectory}` : ''}
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
          <BrowserVisualization className="flex-1" tabId={payload?.tabId as string | undefined} />
        );
      case 'code':
        return (
          <MonacoEditor
            value={String(payload?.code ?? '// Agent opened code context')}
            language={(payload?.language as string) || 'typescript'}
            filePath={payload?.filePath as string | undefined}
            enableLSP
            height="100%"
          />
        );
      case 'video':
        return (
          <div className="flex h-full flex-col gap-3">
            {typeof payload?.title === 'string' ? (
              <div className="text-sm text-zinc-200">{payload.title}</div>
            ) : null}
            <div className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-black/60">
              {/* caption alternative is provided via aria-label for accessibility */}
              <video
                className="h-auto w-full"
                src={payload?.src as string | undefined}
                controls
                autoPlay
                aria-label={typeof payload?.title === 'string' ? payload.title : 'Video output'}
              />
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
              'rounded-lg border border-white/10 px-2 py-1 text-xs text-zinc-200 transition hover:border-white/30 hover:text-white',
              !onClose && 'opacity-60 pointer-events-none',
            )}
          >
            Close
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
