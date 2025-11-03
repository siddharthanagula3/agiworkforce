import { useState, useMemo } from 'react';
import { Copy, Check, Download, Code2, BarChart3, Network, FileUp } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Button } from '../ui/Button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { cn } from '../../lib/utils';
import { useTheme } from '../../hooks/useTheme';
import type { Artifact } from '../../types/chat';
import { useCodeStore } from '../../stores/codeStore';
import { toast } from 'sonner';
import { invoke } from '@tauri-apps/api/core';

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

  const buildAbsolutePath = (base: string, target: string) => {
    const separator = base.includes('\\') ? '\\' : '/';
    const trimmed = target.replace(/^[\\/]+/, '').trim();
    if (!trimmed) {
      return base;
    }
    return base.endsWith(separator) ? `${base}${trimmed}` : `${base}${separator}${trimmed}`;
  };

  const handleInsertIntoEditor = async () => {
    if (artifact.type !== 'code') return;
    if (!rootPath) {
      toast.error('Open a project folder before applying code to a file.');
      return;
    }
    const relativePath = window.prompt('Enter relative path to write code', 'src/new-file.ts');
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
      default:
        return <Code2 className="h-4 w-4" />;
    }
  }, [artifact.type]);

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 bg-muted/50">
        <div className="flex items-center gap-2">
          {icon}
          <CardTitle className="text-sm font-semibold">
            {artifact.title || `${artifact.type.charAt(0).toUpperCase() + artifact.type.slice(1)} Artifact`}
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
                <p>Apply to file…</p>
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
        ) : (
          <div className="p-4 text-sm text-muted-foreground">
            Unsupported artifact type
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Code artifact with syntax highlighting
function CodeArtifact({ artifact, isDark }: { artifact: Artifact; isDark: boolean }) {
  return (
    <div className="overflow-x-auto">
      <SyntaxHighlighter
        language={artifact.language || 'text'}
        style={isDark ? oneDark : oneLight}
        customStyle={{
          margin: 0,
          borderRadius: 0,
          fontSize: '0.875rem',
        }}
        showLineNumbers
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
        Invalid chart data. Expected format: {'{'}type: &quot;bar&quot;|&quot;line&quot;|&quot;pie&quot;, data: [...]{'}'}
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
              <th
                key={col}
                className="px-4 py-2 text-left font-semibold border-b"
              >
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
function MermaidArtifact({ artifact }: { artifact: Artifact }) {
  return (
    <div className="p-8 bg-muted/30">
      <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
        <p className="text-sm text-yellow-800 dark:text-yellow-200">
          Mermaid diagram rendering requires additional setup. The diagram source is shown below.
        </p>
      </div>
      <pre className="p-4 bg-background rounded-lg border overflow-x-auto">
        <code className="text-sm">{artifact.content}</code>
      </pre>
    </div>
  );
}
