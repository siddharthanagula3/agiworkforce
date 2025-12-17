import { invoke } from '@/lib/tauri-mock';
import {
  BarChart3,
  Check,
  Code2,
  Copy,
  Download,
  FileSpreadsheet,
  FileUp,
  Network,
  Presentation,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts';
import { toast } from 'sonner';
import { useTheme } from '../../hooks/useTheme';
import { cn } from '../../lib/utils';
import { useCodeStore } from '../../stores/codeStore';
import type { Artifact } from '../../types/chat';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { usePrompt } from '../ui/PromptDialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip';
import { PresentationArtifact } from './artifact-components/PresentationArtifact';
import { SpreadsheetArtifact } from './artifact-components/SpreadsheetArtifact';

interface ArtifactRendererProps {
  artifact: Artifact;
  className?: string;
}

export function ArtifactRenderer({ artifact, className }: ArtifactRendererProps) {
  const [copied, setCopied] = useState(false);
  const { theme } = useTheme();
  const rootPath = useCodeStore((state) => state.rootPath);
  const openFile = useCodeStore((state) => state.openFile);
  const setActiveFile = useCodeStore((state) => state.setActiveFile);

  // Updated Nov 16, 2025: Use accessible dialogs
  const { prompt, dialog: promptDialog } = usePrompt();

  const buildAbsolutePath = (base: string, target: string) => {
    const separator = base.includes('\\') ? '\\' : '/';
    const trimmed = target.replace(/^[\\/]+/, '').trim();
    if (!trimmed) {
      return base;
    }
    return base.endsWith(separator) ? `${base}${trimmed}` : `${base}${separator}${trimmed}`;
  };

  // Updated Nov 16, 2025: Use accessible PromptDialog instead of window.prompt
  const handleInsertIntoEditor = async () => {
    if (artifact.type !== 'code') return;
    if (!rootPath) {
      toast.error('Open a project folder before applying code to a file.');
      return;
    }

    const relativePath = await prompt({
      title: 'Write code to file',
      description: 'Enter the relative path where you want to save this code',
      label: 'File path',
      defaultValue: 'src/new-file.ts',
      placeholder: 'src/component.tsx',
    });

    if (!relativePath) {
      return;
    }

    const absolutePath = buildAbsolutePath(rootPath, relativePath);
    try {
      await invoke('file_write', { path: absolutePath, content: artifact.content });
      await openFile(absolutePath);
      setActiveFile(absolutePath);
      toast.success('Code applied to editor');
    } catch (error) {
      console.error('Failed to apply code to editor', error);
      toast.error('Failed to write code to file');
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([artifact.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${artifact.title || 'artifact'}.${getFileExtension(artifact)}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getFileExtension = (artifact: Artifact): string => {
    if (artifact.type === 'code' && artifact.language) {
      return artifact.language;
    }
    if (artifact.type === 'spreadsheet') return 'csv';
    if (artifact.type === 'presentation') return 'md';
    return artifact.type === 'chart' || artifact.type === 'diagram' ? 'json' : 'txt';
  };

  const icon = useMemo(() => {
    switch (artifact.type) {
      case 'code':
        return <Code2 className="h-4 w-4" />;
      case 'chart':
        return <BarChart3 className="h-4 w-4" />;
      case 'diagram':
      case 'mermaid':
        return <Network className="h-4 w-4" />;
      case 'spreadsheet':
        return <FileSpreadsheet className="h-4 w-4" />;
      case 'presentation':
        return <Presentation className="h-4 w-4" />;
      default:
        return <Code2 className="h-4 w-4" />;
    }
  }, [artifact.type]);

  return (
    <>
      <Card className={cn('overflow-hidden', className)}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 bg-muted/50">
          <div className="flex items-center gap-2">
            {icon}
            <CardTitle className="text-sm font-semibold">
              {artifact.title ||
                `${artifact.type.charAt(0).toUpperCase() + artifact.type.slice(1)} Artifact`}
            </CardTitle>
            {artifact.language && (
              <Badge variant="outline" className="text-xs">
                {artifact.language}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {artifact.type === 'code' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleInsertIntoEditor}
                    aria-label="Apply code to file"
                  >
                    <FileUp className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Apply to file...</p>
                </TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleCopy}
                  aria-label="Copy to clipboard"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-green-500" />
                      <span className="sr-only">Copied!</span>
                    </>
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{copied ? 'Copied!' : 'Copy to clipboard'}</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleDownload}
                  aria-label="Download artifact"
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Download</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {artifact.type === 'code' ? (
            <CodeArtifact artifact={artifact} isDark={theme === 'dark'} />
          ) : artifact.type === 'chart' ? (
            <ChartArtifact artifact={artifact} />
          ) : artifact.type === 'table' ? (
            <TableArtifact artifact={artifact} />
          ) : artifact.type === 'mermaid' ? (
            <MermaidArtifact artifact={artifact} />
          ) : artifact.type === 'spreadsheet' ? (
            <SpreadsheetArtifact artifact={artifact} />
          ) : artifact.type === 'presentation' ? (
            <PresentationArtifact artifact={artifact} />
          ) : (
            <div className="p-4 text-sm text-muted-foreground">Unsupported artifact type</div>
          )}
        </CardContent>
      </Card>
      {promptDialog}
    </>
  );
}

// Code artifact with Claude-style syntax highlighting
function CodeArtifact({ artifact, isDark: _isDark }: { artifact: Artifact; isDark: boolean }) {
  const lineCount = artifact.content.split('\n').length;

  return (
    <div className="overflow-x-auto bg-gray-950">
      {/* @ts-expect-error - SyntaxHighlighter type incompatibility with React 18 */}
      <SyntaxHighlighter
        language={artifact.language || 'text'}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: '1rem',
          background: 'transparent',
          fontSize: '13px',
          lineHeight: '1.6',
        }}
        showLineNumbers={lineCount > 3}
        lineNumberStyle={{
          minWidth: '2.5em',
          paddingRight: '1em',
          color: '#4b5563',
          userSelect: 'none',
        }}
        wrapLongLines={false}
      >
        {artifact.content}
      </SyntaxHighlighter>
    </div>
  );
}

// Chart artifact with various chart types
type ChartSeriesConfig = {
  dataKey: string;
  color?: string;
};

type ChartArtifactConfig = {
  type: 'bar' | 'line' | 'pie';
  data: Array<Record<string, number | string>>;
  xKey?: string;
  valueKey?: string;
  nameKey?: string;
  bars?: ChartSeriesConfig[];
  lines?: ChartSeriesConfig[];
};

function ChartArtifact({ artifact }: { artifact: Artifact }) {
  const chartData = useMemo<ChartArtifactConfig | null>(() => {
    try {
      const parsed = JSON.parse(artifact.content) as ChartArtifactConfig;
      if (!parsed?.type || !parsed?.data) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }, [artifact.content]);

  if (!chartData) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Invalid chart data. Expected format: {'{'}type:
        &quot;bar&quot;|&quot;line&quot;|&quot;pie&quot;, data: [...]{'}'}
      </div>
    );
  }

  const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#a4de6c', '#d084d0'];

  return (
    <div className="p-4 h-[400px]" data-testid="chart-container">
      <ResponsiveContainer width="100%" height="100%">
        {chartData.type === 'bar' ? (
          <BarChart data={chartData.data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={chartData.xKey || 'name'} />
            <YAxis />
            <RechartsTooltip />
            <Legend />
            {chartData.bars?.map((bar, index) => (
              <Bar
                key={bar.dataKey}
                dataKey={bar.dataKey}
                fill={bar.color || COLORS[index % COLORS.length]}
              />
            )) || <Bar dataKey="value" fill="#8884d8" />}
          </BarChart>
        ) : chartData.type === 'line' ? (
          <LineChart data={chartData.data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey={chartData.xKey || 'name'} />
            <YAxis />
            <RechartsTooltip />
            <Legend />
            {chartData.lines?.map((line, index) => (
              <Line
                key={line.dataKey}
                type="monotone"
                dataKey={line.dataKey}
                stroke={line.color || COLORS[index % COLORS.length]}
              />
            )) || <Line type="monotone" dataKey="value" stroke="#8884d8" />}
          </LineChart>
        ) : chartData.type === 'pie' ? (
          <PieChart>
            <Pie
              data={chartData.data}
              dataKey={chartData.valueKey || 'value'}
              nameKey={chartData.nameKey || 'name'}
              cx="50%"
              cy="50%"
              outerRadius={120}
              label
            >
              {chartData.data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <RechartsTooltip />
            <Legend />
          </PieChart>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Unsupported chart type: {chartData.type}
          </div>
        )}
      </ResponsiveContainer>
    </div>
  );
}

// Table artifact
function TableArtifact({ artifact }: { artifact: Artifact }) {
  const tableData = useMemo(() => {
    try {
      const parsed = JSON.parse(artifact.content);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return {
          columns: Object.keys(parsed[0]),
          rows: parsed,
        };
      }
      return null;
    } catch {
      return null;
    }
  }, [artifact.content]);

  if (!tableData) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Invalid table data. Expected array of objects.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted">
          <tr>
            {tableData.columns.map((col) => (
              <th key={col} className="px-4 py-2 text-left font-semibold border-b">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tableData.rows.map((row, i) => (
            <tr key={i} className="hover:bg-muted/50 border-b">
              {tableData.columns.map((col) => (
                <td key={col} className="px-4 py-2">
                  {String(row[col] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Mermaid diagram artifact (placeholder - would need mermaid library)
// mermaid diagram artifact implementation
function MermaidArtifact({ artifact }: { artifact: Artifact }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [svg, setSvg] = React.useState<string>('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;

    const renderDiagram = async () => {
      if (!artifact.content) return;

      try {
        // Dynamic import to avoid SSR issues if any (though this is a desktop app)
        const mermaid = (await import('mermaid')).default;

        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark', // Using dark theme to match app aesthetic
          securityLevel: 'loose',
          fontFamily: 'Styrene, Inter, sans-serif',
        });

        const id = `mermaid-${crypto.randomUUID().replace(/-/g, '')}`;
        // Verify Content is valid
        if (!artifact.content.trim()) {
          throw new Error('Empty diagram content');
        }

        const { svg } = await mermaid.render(id, artifact.content);

        if (mounted) {
          setSvg(svg);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          console.error('Mermaid render error:', err);
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };

    renderDiagram();

    return () => {
      mounted = false;
    };
  }, [artifact.content]);

  if (error) {
    return (
      <div className="p-4 border border-rose-500/20 bg-rose-500/10 rounded-lg">
        <p className="text-sm font-medium text-rose-400 mb-2">Failed to render diagram</p>
        <pre className="text-xs text-rose-300 whitespace-pre-wrap">{error}</pre>
        <div className="mt-4 pt-4 border-t border-rose-500/20">
          <p className="text-xs text-zinc-400 mb-1">Source:</p>
          <pre className="text-xs text-zinc-300 font-mono bg-black/20 p-2 rounded">
            {artifact.content}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-white/5 rounded-lg overflow-x-auto flex justify-center min-h-[200px] items-center">
      {svg ? (
        <div
          ref={containerRef}
          dangerouslySetInnerHTML={{ __html: svg }}
          className="w-full h-full flex justify-center [&_svg]:max-w-full [&_svg]:h-auto"
        />
      ) : (
        <div className="text-zinc-500 text-sm animate-pulse">Rendering diagram...</div>
      )}
    </div>
  );
}
