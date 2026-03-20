import { Code2, Loader2, AlertCircle, MapPin, AlertTriangle, Info } from 'lucide-react';
import { toast } from 'sonner';
import type { ToolResultProps } from './index';
import { cn } from '@/lib/utils';
import { invoke } from '@/lib/tauri-mock';

interface LSPLocation {
  file?: string;
  line?: number;
  column?: number;
}

interface LSPDiagnostic {
  severity?: 'error' | 'warning' | 'info' | string;
  message: string;
  location?: LSPLocation;
}

interface LSPData {
  type?: 'hover' | 'definition' | 'diagnostics' | string;
  content?: string;
  location?: LSPLocation;
  items?: LSPDiagnostic[];
}

interface SeverityConfig {
  color: string;
  bg: string;
  icon: React.ReactNode;
}

const SEVERITY_CONFIG_MAP: Partial<Record<string, SeverityConfig>> = {
  error: {
    color: 'text-red-400',
    bg: 'bg-red-500/10 border-red-500/20',
    icon: <AlertCircle className="h-3 w-3" />,
  },
  warning: {
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/20',
    icon: <AlertTriangle className="h-3 w-3" />,
  },
  info: {
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/20',
    icon: <Info className="h-3 w-3" />,
  },
};

const DEFAULT_SEVERITY_CONFIG: SeverityConfig = {
  color: 'text-blue-400',
  bg: 'bg-blue-500/10 border-blue-500/20',
  icon: <Info className="h-3 w-3" />,
};

export function InlineLSPResult({ result, status }: ToolResultProps) {
  const data = result?.data as LSPData | undefined;

  if (status === 'running') {
    return (
      <div className="mt-3 flex items-center gap-2 p-3 rounded-lg bg-zinc-900/80 border border-white/10">
        <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
        <span className="text-sm text-zinc-400">Querying language server...</span>
      </div>
    );
  }

  if (status === 'failed' || status === 'error') {
    return (
      <div className="mt-3 p-3 rounded-lg bg-zinc-900/80 border border-red-500/30">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-300 font-medium">LSP query failed</p>
          {result?.error && <p className="text-xs text-zinc-500 mt-1">{result.error}</p>}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { type = 'hover', content, location, items = [] } = data;

  return (
    <div className="mt-3 rounded-lg bg-zinc-900/80 border border-white/10 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-zinc-800/60 border-b border-white/10">
        <Code2 className="h-4 w-4 text-indigo-400" />
        <span className="text-xs font-medium text-zinc-300 capitalize">{type}</span>
      </div>

      <div className="p-3 space-y-2">
        {(type === 'hover' || type === 'definition') && content && (
          <pre className="text-xs font-mono text-zinc-300 bg-zinc-950/60 p-2 rounded overflow-auto whitespace-pre-wrap break-words max-h-32">
            {content}
          </pre>
        )}

        {type === 'definition' && location && (
          <div
            className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
            onClick={async () => {
              if (location.file) {
                try {
                  await invoke('file_open_with_default_app', { path: location.file });
                } catch (err) {
                  console.error('Failed to open file:', err);
                  toast.error('Failed to open file');
                }
              }
            }}
          >
            <MapPin className="h-3 w-3" />
            <span className="font-mono truncate">{location.file}</span>
            {location.line !== undefined && <span className="text-zinc-500">:{location.line}</span>}
            {location.column !== undefined && (
              <span className="text-zinc-600">:{location.column}</span>
            )}
          </div>
        )}

        {type === 'diagnostics' && items.length > 0 && (
          <ul className="space-y-1.5">
            {items.map((item, i) => {
              const sev = item.severity ?? 'info';
              const cfg = SEVERITY_CONFIG_MAP[sev] ?? DEFAULT_SEVERITY_CONFIG;
              return (
                <li
                  key={i}
                  className={cn('flex items-start gap-2 p-2 rounded border text-xs', cfg.bg)}
                >
                  <span className={cn('shrink-0 mt-0.5', cfg.color)}>{cfg.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className={cn('font-medium', cfg.color)}>{item.message}</p>
                    {item.location?.file && (
                      <p className="text-zinc-500 font-mono mt-0.5 truncate">
                        {item.location.file}
                        {item.location.line !== undefined ? `:${item.location.line}` : ''}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {items.length === 0 && !content && (
          <p className="text-xs text-zinc-500 italic">No results</p>
        )}
      </div>
    </div>
  );
}
