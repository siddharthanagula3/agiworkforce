import React, { useCallback, useEffect, useState } from 'react';
import { cn } from '../../lib/utils';
import {
  X,
  Maximize2,
  Code2,
  Globe,
  Terminal,
  FileText,
  Eye,
  Play,
  Copy,
  Download,
  Smartphone,
  Monitor,
  Edit3,
  Database,
  Table,
  Filter,
} from 'lucide-react';
import { useUnifiedChatStore, SidecarMode } from '../../stores/unifiedChatStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../ui/Button';
import Editor from '@monaco-editor/react';

interface SidecarPanelProps {
  className?: string;
}

export const SidecarPanel: React.FC<SidecarPanelProps> = ({ className }) => {
  const sidecar = useUnifiedChatStore((state) => state.sidecar);
  const closeSidecar = useUnifiedChatStore((state) => state.closeSidecar);
  const setSidecar = useUnifiedChatStore((state) => state.setSidecar);

  const [isResizing, setIsResizing] = useState(false);
  const [width, setWidth] = useState(600);
  const [minWidth] = useState(400);
  const [maxWidth] = useState(1200);
  const [selectedText, setSelectedText] = useState('');
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const [code, setCode] = useState('// Your code here');

  // Detach to new window (Tauri specific)
  const handleDetach = useCallback(async () => {
    // This would use Tauri APIs to open a new window
    // In production: await invoke('open_sidecar_window', { mode: sidecar.activeMode });
  }, []);

  // Handle text selection for Canvas mode
  useEffect(() => {
    if (sidecar.activeMode !== 'canvas') return;

    const handleSelection = () => {
      const selection = window.getSelection();
      const text = selection?.toString();
      if (text && text.length > 0) {
        setSelectedText(text);
      }
    };

    document.addEventListener('mouseup', handleSelection);
    return () => document.removeEventListener('mouseup', handleSelection);
  }, [sidecar.activeMode]);

  // Handle resize
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);

      const startX = e.clientX;
      const startWidth = width;

      const handleMouseMove = (e: MouseEvent) => {
        const delta = startX - e.clientX;
        const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + delta));
        setWidth(newWidth);
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [width, minWidth, maxWidth],
  );

  const renderModeContent = () => {
    switch (sidecar.activeMode) {
      case 'code':
        return (
          <div className="flex-1 flex flex-col">
            {/* Code Editor */}
            <div className="flex-1 border-b border-gray-200 dark:border-gray-700">
              <Editor
                height="70%"
                defaultLanguage="typescript"
                theme="vs-dark"
                value={code}
                onChange={(value) => setCode(value || '')}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  lineNumbers: 'on',
                  wordWrap: 'on',
                  automaticLayout: true,
                }}
              />
            </div>

            {/* Terminal Output */}
            <div className="h-[30%] bg-black p-4 font-mono text-sm text-green-400 overflow-auto">
              <div className="mb-2 text-gray-400">Terminal Output:</div>
              {terminalOutput.length === 0 ? (
                <div className="text-gray-600">Ready to run...</div>
              ) : (
                terminalOutput.map((line, i) => <div key={i}>{line}</div>)
              )}
            </div>

            {/* Toolbar */}
            <div className="border-t border-gray-200 dark:border-gray-700 p-3 flex items-center gap-2">
              <Button
                size="sm"
                variant="default"
                onClick={() => setTerminalOutput(['Running...', 'Output will appear here'])}
                className="flex items-center gap-2"
              >
                <Play className="h-3 w-3" />
                Run
              </Button>
              <Button size="sm" variant="outline" className="flex items-center gap-2">
                <Copy className="h-3 w-3" />
                Copy
              </Button>
              <Button size="sm" variant="outline" className="flex items-center gap-2">
                <Download className="h-3 w-3" />
                Apply to File
              </Button>
            </div>
          </div>
        );

      case 'preview':
        return (
          <div className="flex-1 flex flex-col">
            {/* Preview Toolbar */}
            <div className="border-b border-gray-200 dark:border-gray-700 p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={previewMode === 'desktop' ? 'default' : 'outline'}
                  onClick={() => setPreviewMode('desktop')}
                  className="flex items-center gap-2"
                >
                  <Monitor className="h-3 w-3" />
                  Desktop
                </Button>
                <Button
                  size="sm"
                  variant={previewMode === 'mobile' ? 'default' : 'outline'}
                  onClick={() => setPreviewMode('mobile')}
                  className="flex items-center gap-2"
                >
                  <Smartphone className="h-3 w-3" />
                  Mobile
                </Button>
              </div>
              <Button size="sm" variant="outline" className="flex items-center gap-2">
                <Eye className="h-3 w-3" />
                Inspect
              </Button>
            </div>

            {/* Preview Content */}
            <div className="flex-1 p-4 bg-gray-50 dark:bg-gray-900 overflow-auto">
              <div
                className={cn(
                  'mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg',
                  previewMode === 'mobile' ? 'max-w-sm' : 'w-full',
                )}
                style={{ minHeight: '400px' }}
              >
                <iframe
                  src="about:blank"
                  className="w-full h-full rounded-lg"
                  style={{ minHeight: '400px' }}
                  sandbox="allow-scripts allow-same-origin"
                  title="Preview"
                />
              </div>
            </div>
          </div>
        );

      case 'canvas':
        return (
          <div className="flex-1 flex flex-col">
            {/* Canvas Editor */}
            <div className="flex-1 p-6 overflow-auto">
              <div
                className="prose prose-lg dark:prose-invert max-w-none"
                contentEditable
                suppressContentEditableWarning
                onMouseUp={() => {
                  // Handle selection for editing
                }}
              >
                <h1>Document Title</h1>
                <p>
                  This is a rich text editor. You can select text to see editing options. The
                  content here is fully editable and supports rich formatting.
                </p>
                <p>
                  Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
                  incididunt ut labore et dolore magna aliqua.
                </p>
              </div>
            </div>

            {/* Floating Toolbar for selected text */}
            {selectedText && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute top-20 right-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-2 flex items-center gap-1"
              >
                <Button size="sm" variant="ghost" className="text-xs">
                  Shorten
                </Button>
                <Button size="sm" variant="ghost" className="text-xs">
                  Rewrite
                </Button>
                <Button size="sm" variant="ghost" className="text-xs">
                  Fix Grammar
                </Button>
                <Button size="sm" variant="ghost" className="text-xs">
                  Change Tone
                </Button>
              </motion.div>
            )}
          </div>
        );

      case 'browser':
        return (
          <div className="flex-1 flex flex-col">
            {/* URL Bar */}
            <div className="border-b border-gray-200 dark:border-gray-700 p-3">
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <Globe className="h-4 w-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="Enter URL..."
                  className="flex-1 bg-transparent outline-none text-sm"
                  defaultValue={sidecar.contextId || ''}
                />
              </div>
            </div>

            {/* Browser Content */}
            <div className="flex-1 bg-white dark:bg-gray-900">
              <iframe
                src={sidecar.contextId || 'about:blank'}
                className="w-full h-full"
                sandbox="allow-scripts allow-same-origin"
                title="Browser"
              />
            </div>
          </div>
        );

      case 'terminal':
        return (
          <div className="flex-1 bg-black p-4 font-mono text-sm text-green-400 overflow-auto">
            <div className="mb-4 text-gray-400">Terminal Session</div>
            <div className="space-y-2">
              <div>$ npm install</div>
              <div className="text-gray-500">Installing dependencies...</div>
              <div>✓ Packages installed successfully</div>
              <div className="mt-4">$ npm run dev</div>
              <div className="text-blue-400">Server running at http://localhost:3000</div>
            </div>
          </div>
        );

      case 'diff':
        return (
          <div className="flex-1 flex flex-col">
            <div className="border-b border-gray-200 dark:border-gray-700 p-3">
              <h3 className="font-medium">File Changes</h3>
            </div>
            <div className="flex-1 p-4 font-mono text-sm overflow-auto">
              <div className="space-y-2">
                <div className="text-red-500">- Old line of code</div>
                <div className="text-green-500">+ New line of code</div>
                <div className="text-gray-500"> Unchanged line</div>
              </div>
            </div>
          </div>
        );

      // FIX: Added Data Mode
      case 'data' as any:
        return (
          <div className="flex-1 flex flex-col">
            <div className="border-b border-gray-200 dark:border-gray-700 p-3 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-teal-500" />
                <h3 className="font-medium text-sm">Data Analysis</h3>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                  <Filter className="h-3 w-3" /> Filter
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                  <Download className="h-3 w-3" /> Export CSV
                </Button>
              </div>
            </div>
            <div className="flex-1 p-0 overflow-auto">
              <div className="w-full min-w-max">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-100 dark:bg-gray-800 text-xs uppercase text-gray-500 sticky top-0">
                    <tr>
                      {['ID', 'Name', 'Status', 'Value', 'Date', 'Category'].map((h) => (
                        <th
                          key={h}
                          className="px-6 py-3 font-medium border-b border-gray-200 dark:border-gray-700"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-6 py-3 font-mono text-xs text-gray-500">#{1000 + i}</td>
                        <td className="px-6 py-3 font-medium">Project Alpha Item {i}</td>
                        <td className="px-6 py-3">
                          <span
                            className={cn(
                              'px-2 py-0.5 rounded-full text-xs font-medium',
                              i % 3 === 0
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                : i % 3 === 1
                                  ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                                  : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
                            )}
                          >
                            {i % 3 === 0 ? 'Completed' : i % 3 === 1 ? 'Pending' : 'Archived'}
                          </span>
                        </td>
                        <td className="px-6 py-3 font-mono">${(i * 1234.56).toFixed(2)}</td>
                        <td className="px-6 py-3 text-gray-500">2024-03-{10 + i}</td>
                        <td className="px-6 py-3 text-gray-500">Finance</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 p-2 bg-gray-50 dark:bg-gray-900 text-xs text-gray-500 flex justify-between">
              <span>8 rows selected</span>
              <span>Total: $45,320.00</span>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const getModeIcon = (mode: SidecarMode | 'data') => {
    switch (mode) {
      case 'code':
        return <Code2 className="h-4 w-4" />;
      case 'browser':
        return <Globe className="h-4 w-4" />;
      case 'terminal':
        return <Terminal className="h-4 w-4" />;
      case 'preview':
        return <Eye className="h-4 w-4" />;
      case 'canvas':
        return <Edit3 className="h-4 w-4" />;
      case 'diff':
        return <FileText className="h-4 w-4" />;
      case 'data':
        return <Table className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const getModeLabel = (mode: string) => {
    return mode.charAt(0).toUpperCase() + mode.slice(1);
  };

  if (!sidecar.isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 350 }}
        className={cn(
          'fixed right-0 top-0 h-full bg-white dark:bg-charcoal-900 shadow-2xl flex',
          className,
        )}
        style={{ width: `${width}px` }}
      >
        {/* Resize Handle */}
        <div
          className={cn(
            'absolute left-0 top-0 h-full w-1 cursor-ew-resize hover:bg-teal-500 transition-colors',
            isResizing && 'bg-teal-500',
          )}
          onMouseDown={handleMouseDown}
        />

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2">
              {/* Mode Tabs */}
              <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-x-auto max-w-[400px] scrollbar-hide">
                {(
                  [
                    'code',
                    'preview',
                    'canvas',
                    'browser',
                    'terminal',
                    'diff',
                    'data',
                  ] as SidecarMode[]
                ).map((mode) => (
                  <Button
                    key={mode}
                    size="sm"
                    variant={sidecar.activeMode === mode ? 'default' : 'ghost'}
                    onClick={() => setSidecar({ activeMode: mode })}
                    className="flex items-center gap-1 px-2 py-1 whitespace-nowrap"
                  >
                    {getModeIcon(mode)}
                    <span className="text-xs">{getModeLabel(mode)}</span>
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                onClick={handleDetach}
                className="h-7 w-7"
                title="Pop out to new window"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" onClick={closeSidecar} className="h-7 w-7">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Content */}
          {renderModeContent()}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default SidecarPanel;
