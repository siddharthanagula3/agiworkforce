/* eslint-disable @typescript-eslint/no-explicit-any -- store selectors and string parsing callbacks */
import { invoke } from '@/lib/tauri-mock';
import { save } from '@tauri-apps/plugin-dialog';
import {
  AlertTriangle,
  BarChart3,
  Check,
  ChevronDown,
  Code2,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  FileUp,
  Globe,
  Image as ImageIcon,
  Maximize2,
  Minimize2,
  Network,
  Play,
  Presentation,
  RefreshCw,
  Square,
  Table2,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useThemeContext } from '@/providers/ThemeProvider';
import { cn } from '@/lib/utils';
import { useCodeStore } from '@/stores/unified/codeStore';
import { sanitizeHtml } from '@/utils/security';
import type { Artifact } from '@/types/chat';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { usePrompt } from '../ui/PromptDialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/Tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/DropdownMenu';
import { PresentationArtifact } from './artifact-components/PresentationArtifact';
import { SpreadsheetArtifact } from './artifact-components/SpreadsheetArtifact';

interface ArtifactRendererProps {
  artifact: Artifact;
  className?: string;
}

export function ArtifactRenderer({ artifact, className }: ArtifactRendererProps) {
  const [copied, setCopied] = useState(false);
  const { theme } = useThemeContext();
  const rootPath = useCodeStore((state: any) => state.rootPath);
  const openFile = useCodeStore((state: any) => state.openFile);
  const setActiveFile = useCodeStore((state: any) => state.setActiveFile);
  const artifactStatus = (artifact as Artifact & { status?: string }).status;
  const hasContent = typeof artifact.content === 'string' && artifact.content.trim().length > 0;
  const awaitingOutput = artifactStatus === 'running' && !hasContent;

  // AUDIT-005-003 fix: Ref to track mount state and timeout for copy state reset
  const isMountedRef = useRef(true);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AUDIT-005-003 fix: Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const { prompt, dialog: promptDialog } = usePrompt();

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
    if (!hasContent) {
      toast.error('No output available yet.');
      return;
    }
    try {
      await navigator.clipboard.writeText(artifact.content);
      setCopied(true);
      // AUDIT-005-003 fix: Clear previous timeout and add mount check
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          setCopied(false);
        }
        copyTimeoutRef.current = null;
      }, 2000);
    } catch (error) {
      console.error('Failed to copy artifact output:', error);
      toast.error('Failed to copy output');
    }
  };

  const handleDownload = () => {
    if (!hasContent) {
      toast.error('No output available to download.');
      return;
    }
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

  const handleExportPdf = async () => {
    try {
      const savePath = await save({
        defaultPath: `${artifact.title || 'document'}.pdf`,
        filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
      });
      if (!savePath) return;

      // Split content into paragraphs for PDF generation
      const paragraphs = artifact.content
        .split(/\n\n+/)
        .map((p: any) => p.trim())
        .filter((p: any) => p.length > 0);

      await invoke('document_create_pdf_simple', {
        output_path: savePath,
        title: artifact.title || 'Document',
        author: null,
        paragraphs,
      });
      toast.success('Exported to PDF successfully');
    } catch (error) {
      console.error('Failed to export PDF:', error);
      toast.error('Failed to export to PDF');
    }
  };

  const handleExportWord = async () => {
    try {
      const savePath = await save({
        defaultPath: `${artifact.title || 'document'}.docx`,
        filters: [{ name: 'Word Document', extensions: ['docx'] }],
      });
      if (!savePath) return;

      // Split content into paragraphs for Word generation
      const paragraphs = artifact.content
        .split(/\n\n+/)
        .map((p: any) => p.trim())
        .filter((p: any) => p.length > 0);

      await invoke('document_create_word_simple', {
        output_path: savePath,
        title: artifact.title || 'Document',
        author: null,
        paragraphs,
      });
      toast.success('Exported to Word successfully');
    } catch (error) {
      console.error('Failed to export Word:', error);
      toast.error('Failed to export to Word');
    }
  };

  const handleExportExcel = async () => {
    if (artifact.type !== 'spreadsheet' && artifact.type !== 'table') return;

    try {
      const savePath = await save({
        defaultPath: `${artifact.title || 'spreadsheet'}.xlsx`,
        filters: [{ name: 'Excel Spreadsheet', extensions: ['xlsx'] }],
      });
      if (!savePath) return;

      // Parse the JSON content to extract headers and rows
      let data: Record<string, string | number>[];
      try {
        data = JSON.parse(artifact.content) as Record<string, string | number>[];
      } catch (parseError) {
        toast.error('Invalid JSON format in artifact');
        console.error('[ArtifactRenderer] JSON parse failed:', parseError);
        return;
      }

      if (!Array.isArray(data) || data.length === 0) {
        toast.error('No data to export');
        return;
      }

      const firstRow = data[0];
      if (!firstRow) {
        toast.error('No data to export');
        return;
      }

      const headers = Object.keys(firstRow);
      const rows = data.map((row) => headers.map((h) => String(row[h] ?? '')));

      await invoke('document_create_excel_simple', {
        output_path: savePath,
        sheet_name: artifact.title || 'Sheet1',
        headers,
        rows,
      });
      toast.success('Exported to Excel successfully');
    } catch (error) {
      console.error('Failed to export Excel:', error);
      toast.error('Failed to export to Excel');
    }
  };

  // Check if artifact type supports document export
  const supportsDocumentExport = ['code', 'presentation', 'mermaid'].includes(artifact.type);
  const supportsExcelExport = ['spreadsheet', 'table'].includes(artifact.type);
  const supportsImageExport = ['chart', 'mermaid'].includes(artifact.type);
  const supportsMarkdownExport = ['table', 'spreadsheet'].includes(artifact.type);

  const handleExportSvg = async () => {
    try {
      // Find the SVG element in the artifact container
      const container = document.querySelector(`[data-artifact-id="${artifact.id}"]`);
      const svgElement = container?.querySelector('svg');

      if (!svgElement) {
        toast.error('No chart found to export');
        return;
      }

      // Clone the SVG and add necessary attributes
      const clonedSvg = svgElement.cloneNode(true) as SVGElement;
      clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

      // Add background for better visibility
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('width', '100%');
      rect.setAttribute('height', '100%');
      rect.setAttribute('fill', '#1a1a2e');
      clonedSvg.insertBefore(rect, clonedSvg.firstChild);

      const svgString = new XMLSerializer().serializeToString(clonedSvg);
      const blob = new Blob([svgString], { type: 'image/svg+xml' });

      const savePath = await save({
        defaultPath: `${artifact.title || 'chart'}.svg`,
        filters: [{ name: 'SVG Image', extensions: ['svg'] }],
      });

      if (!savePath) return;

      // AUDIT-005-007 fix: Track FileReader and add mount check before state updates
      const reader = new FileReader();
      reader.onloadend = async () => {
        // Check if component is still mounted before proceeding
        if (!isMountedRef.current) return;
        const base64 = (reader.result as string).split(',')[1];
        await invoke('file_write_binary', { file_path: savePath, content: base64 });
        if (isMountedRef.current) {
          toast.success('Exported as SVG');
        }
      };
      reader.onerror = () => {
        if (isMountedRef.current) {
          toast.error('Failed to read SVG data');
        }
      };
      reader.readAsDataURL(blob);
    } catch (error) {
      console.error('Failed to export SVG:', error);
      // Fallback: download using blob URL
      try {
        const container = document.querySelector(`[data-artifact-id="${artifact.id}"]`);
        const svgElement = container?.querySelector('svg');
        if (svgElement) {
          const svgString = new XMLSerializer().serializeToString(svgElement);
          const blob = new Blob([svgString], { type: 'image/svg+xml' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${artifact.title || 'chart'}.svg`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          toast.success('Exported as SVG');
        }
      } catch {
        toast.error('Failed to export SVG');
      }
    }
  };

  const handleExportPng = async () => {
    try {
      const container = document.querySelector(`[data-artifact-id="${artifact.id}"]`);
      const svgElement = container?.querySelector('svg');

      if (!svgElement) {
        toast.error('No chart found to export');
        return;
      }

      // Get SVG dimensions
      const bbox = svgElement.getBoundingClientRect();
      const width = bbox.width || 800;
      const height = bbox.height || 600;

      // Clone and prepare SVG
      const clonedSvg = svgElement.cloneNode(true) as SVGElement;
      clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clonedSvg.setAttribute('width', String(width));
      clonedSvg.setAttribute('height', String(height));

      const svgString = new XMLSerializer().serializeToString(clonedSvg);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      // AUDIT-005-008 fix: Create canvas and draw SVG with mount check
      const img = new Image();
      img.onload = async () => {
        // Check if component is still mounted before proceeding
        if (!isMountedRef.current) {
          URL.revokeObjectURL(url);
          return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width * 2; // 2x for retina
        canvas.height = height * 2;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          ctx.scale(2, 2);
          ctx.fillStyle = '#1a1a2e';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(async (blob) => {
            // AUDIT-005-008 fix: Check mount state before state updates
            if (!isMountedRef.current) return;
            if (blob) {
              const pngUrl = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = pngUrl;
              a.download = `${artifact.title || 'chart'}.png`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(pngUrl);
              toast.success('Exported as PNG');
            }
          }, 'image/png');
        }
        URL.revokeObjectURL(url);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        if (isMountedRef.current) {
          toast.error('Failed to load image for PNG export');
        }
      };
      img.src = url;
    } catch (error) {
      console.error('Failed to export PNG:', error);
      toast.error('Failed to export PNG');
    }
  };

  const handleCopyMarkdown = async () => {
    try {
      const data = JSON.parse(artifact.content) as Record<string, string | number>[];
      if (!Array.isArray(data) || data.length === 0) {
        toast.error('No data to copy');
        return;
      }

      const firstRow = data[0];
      if (!firstRow) {
        toast.error('No data to copy');
        return;
      }

      const headers = Object.keys(firstRow);

      // Build markdown table
      const headerRow = `| ${headers.join(' | ')} |`;
      const separatorRow = `| ${headers.map(() => '---').join(' | ')} |`;
      const dataRows = data
        .map((row) => `| ${headers.map((h) => String(row[h] ?? '')).join(' | ')} |`)
        .join('\n');

      const markdown = `${headerRow}\n${separatorRow}\n${dataRows}`;

      await navigator.clipboard.writeText(markdown);
      toast.success('Copied as Markdown table');
    } catch (error) {
      console.error('Failed to copy as Markdown:', error);
      toast.error('Failed to copy as Markdown');
    }
  };

  const getFileExtension = (artifact: Artifact): string => {
    if (artifact.type === 'code' && artifact.language) {
      return artifact.language;
    }
    if (artifact.type === 'spreadsheet') return 'csv';
    if (artifact.type === 'presentation') return 'md';
    return artifact.type === 'chart' || artifact.type === 'diagram' ? 'json' : 'txt';
  };

  // Inline icon calculation - switch statement overhead doesn't justify memoization
  const icon = (() => {
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
      case 'html':
        return <Globe className="h-4 w-4" />;
      case 'document':
        return <FileText className="h-4 w-4" />;
      default:
        return <Code2 className="h-4 w-4" />;
    }
  })();

  return (
    <>
      <Card className={cn('overflow-hidden', className)} data-artifact-id={artifact.id}>
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
                  disabled={awaitingOutput}
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
                <p>
                  {awaitingOutput
                    ? 'Waiting for tool output'
                    : copied
                      ? 'Copied!'
                      : 'Copy to clipboard'}
                </p>
              </TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Download or export artifact"
                      disabled={awaitingOutput}
                    >
                      <Download className="h-3.5 w-3.5" />
                      <ChevronDown className="h-2.5 w-2.5 ml-0.5" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{awaitingOutput ? 'Waiting for tool output' : 'Download / Export'}</p>
                </TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={handleDownload}>
                  <Download className="mr-2 h-4 w-4" />
                  Download as text
                </DropdownMenuItem>
                {(supportsDocumentExport || supportsExcelExport) && <DropdownMenuSeparator />}
                {supportsDocumentExport && (
                  <>
                    <DropdownMenuItem onClick={handleExportPdf}>
                      <FileText className="mr-2 h-4 w-4 text-red-500" />
                      Export as PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportWord}>
                      <FileText className="mr-2 h-4 w-4 text-blue-500" />
                      Export as Word
                    </DropdownMenuItem>
                  </>
                )}
                {supportsExcelExport && (
                  <DropdownMenuItem onClick={handleExportExcel}>
                    <FileSpreadsheet className="mr-2 h-4 w-4 text-green-500" />
                    Export as Excel
                  </DropdownMenuItem>
                )}
                {supportsImageExport && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleExportSvg}>
                      <ImageIcon className="mr-2 h-4 w-4 text-purple-500" />
                      Export as SVG
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportPng}>
                      <ImageIcon className="mr-2 h-4 w-4 text-orange-500" />
                      Export as PNG
                    </DropdownMenuItem>
                  </>
                )}
                {supportsMarkdownExport && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleCopyMarkdown}>
                      <Table2 className="mr-2 h-4 w-4 text-cyan-500" />
                      Copy as Markdown
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {awaitingOutput ? (
            <div className="p-4 text-sm text-muted-foreground">Waiting for tool output...</div>
          ) : artifact.type === 'code' ? (
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
          ) : artifact.type === 'html' ? (
            <HtmlArtifact artifact={artifact} />
          ) : artifact.type === 'document' ? (
            <DocumentArtifact artifact={artifact} />
          ) : (
            <div className="p-4 text-sm text-muted-foreground">Unsupported artifact type</div>
          )}
        </CardContent>
      </Card>
      {promptDialog}
    </>
  );
}

function CodeArtifact({ artifact, isDark: _isDark }: { artifact: Artifact; isDark: boolean }) {
  const lineCount = artifact.content.split('\n').length;

  return (
    <div className="overflow-x-auto bg-gray-950">
      {}
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

function MermaidArtifact({ artifact }: { artifact: Artifact }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [svg, setSvg] = React.useState<string>('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;

    const renderDiagram = async () => {
      if (!artifact.content) return;

      try {
        const mermaid = (await import('mermaid')).default;

        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'strict', // Updated from 'loose' for security - blocks arbitrary JavaScript in diagrams
          fontFamily: 'Styrene, Inter, sans-serif',
        });

        const id = `mermaid-${crypto.randomUUID().replace(/-/g, '')}`;

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

  const sanitizedSvg = svg
    ? sanitizeHtml(svg, {
        allowedTags: [
          'svg',
          'path',
          'circle',
          'rect',
          'line',
          'polyline',
          'polygon',
          'g',
          'text',
          'tspan',
          'defs',
          'clipPath',
          'use',
          'image',
        ],
        allowedAttributes: {
          '*': [
            'fill',
            'stroke',
            'stroke-width',
            'd',
            'x',
            'y',
            'width',
            'height',
            'viewBox',
            'xmlns',
            'transform',
            'opacity',
            'class',
            'id',
          ],
          svg: ['viewBox', 'xmlns', 'width', 'height', 'preserveAspectRatio'],
        },
      })
    : null;

  return (
    <div className="p-4 bg-white/5 rounded-lg overflow-x-auto flex justify-center min-h-[200px] items-center">
      {sanitizedSvg ? (
        <div
          ref={containerRef}
          dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
          className="w-full h-full flex justify-center [&_svg]:max-w-full [&_svg]:h-auto"
        />
      ) : (
        <div className="text-zinc-500 text-sm animate-pulse">Rendering diagram...</div>
      )}
    </div>
  );
}

/**
 * Sandboxed iframe-based runtime for HTML/JavaScript artifacts.
 * Provides a CodePen/JSFiddle-like live preview experience.
 *
 * Security measures:
 * - Uses strict sandbox attributes to prevent:
 *   - Top-level navigation (allow-top-navigation disabled)
 *   - Form submissions to external URLs (allow-forms disabled by default)
 *   - Access to parent window (allow-same-origin disabled)
 *   - Popups and modal dialogs (allow-popups disabled)
 * - CSP meta tag injected into the HTML to restrict external resources
 * - Console output is captured and displayed for debugging
 * - Errors are caught and displayed gracefully
 */
function HtmlArtifact({ artifact }: { artifact: Artifact }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isRunning, setIsRunning] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [consoleOutput, setConsoleOutput] = useState<
    Array<{ type: 'log' | 'error' | 'warn' | 'info'; message: string; timestamp: number }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const consoleRef = useRef<HTMLDivElement>(null);

  // Generate a unique ID for message channel security
  const channelId = useRef(crypto.randomUUID());

  // AUDIT-005-004 fix: Ref to track reload timeout for cleanup
  const reloadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  // AUDIT-005-004 fix: Cleanup on unmount
  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (reloadTimeoutRef.current) {
        clearTimeout(reloadTimeoutRef.current);
        reloadTimeoutRef.current = null;
      }
    };
  }, []);

  // Build the sandboxed HTML document with security headers and console capture
  const buildSandboxedHtml = useCallback((content: string): string => {
    // Extract or detect if content is a full HTML document or just a snippet
    const isFullDocument = /<html[\s>]/i.test(content) || /<!doctype/i.test(content);

    // Content Security Policy to restrict what the iframe can do
    // - default-src 'self' blob: data: - allows same-origin, blobs, and data URIs
    // - script-src 'unsafe-inline' 'unsafe-eval' - needed for inline scripts
    // - style-src 'unsafe-inline' - needed for inline styles
    // - img-src * data: blob: - allows images from anywhere (common use case)
    // - font-src * data: - allows fonts
    // - connect-src 'none' - blocks fetch/XHR to prevent data exfiltration
    // - frame-src 'none' - blocks nested iframes
    const cspMeta = `<meta http-equiv="Content-Security-Policy" content="default-src 'self' blob: data:; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline' *; img-src * data: blob:; font-src * data:; connect-src 'none'; frame-src 'none'; object-src 'none';">`;

    // Console capture script that forwards console output to parent
    const consoleCapture = `
<script>
(function() {
  const channelId = '${channelId.current}';
  const originalConsole = {
    log: console.log.bind(console),
    error: console.error.bind(console),
    warn: console.warn.bind(console),
    info: console.info.bind(console)
  };

  function sendToParent(type, args) {
    try {
      const message = args.map(arg => {
        try {
          if (arg === undefined) return 'undefined';
          if (arg === null) return 'null';
          if (typeof arg === 'function') return '[Function]';
          if (typeof arg === 'symbol') return arg.toString();
          if (arg instanceof Error) return arg.stack || arg.message;
          if (typeof arg === 'object') {
            try {
              return JSON.stringify(arg, null, 2);
            } catch {
              return '[Circular Object]';
            }
          }
          return String(arg);
        } catch {
          return '[Unserializable]';
        }
      }).join(' ');

      window.parent.postMessage({
        type: 'sandbox-console',
        channelId: channelId,
        consoleType: type,
        message: message,
        timestamp: Date.now()
      }, '*');
    } catch (e) {
      // Silently fail if we can't communicate
    }
  }

  console.log = function(...args) {
    originalConsole.log(...args);
    sendToParent('log', args);
  };

  console.error = function(...args) {
    originalConsole.error(...args);
    sendToParent('error', args);
  };

  console.warn = function(...args) {
    originalConsole.warn(...args);
    sendToParent('warn', args);
  };

  console.info = function(...args) {
    originalConsole.info(...args);
    sendToParent('info', args);
  };

  // Catch unhandled errors
  window.onerror = function(message, source, lineno, colno, error) {
    sendToParent('error', ['Uncaught Error: ' + message + ' at line ' + lineno + ':' + colno]);
    return true;
  };

  // Catch unhandled promise rejections
  window.onunhandledrejection = function(event) {
    sendToParent('error', ['Unhandled Promise Rejection: ' + (event.reason?.message || event.reason || 'Unknown')]);
  };

  // Signal that the sandbox is ready
  window.parent.postMessage({
    type: 'sandbox-ready',
    channelId: channelId
  }, '*');
})();
</script>`;

    // Base styles for better default appearance
    const baseStyles = `
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 16px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.5;
    color: #e4e4e7;
    background: #18181b;
    min-height: 100vh;
  }
  a { color: #60a5fa; }
  pre, code {
    background: #27272a;
    border-radius: 4px;
    padding: 2px 6px;
    font-family: ui-monospace, monospace;
    font-size: 13px;
  }
  pre { padding: 12px; overflow-x: auto; }
  pre code { padding: 0; background: none; }
  button, input, select, textarea {
    font-family: inherit;
    font-size: inherit;
  }
  button {
    cursor: pointer;
    background: #3f3f46;
    border: 1px solid #52525b;
    color: #e4e4e7;
    padding: 8px 16px;
    border-radius: 6px;
  }
  button:hover { background: #52525b; }
  input, textarea, select {
    background: #27272a;
    border: 1px solid #3f3f46;
    color: #e4e4e7;
    padding: 8px 12px;
    border-radius: 6px;
  }
  input:focus, textarea:focus, select:focus {
    outline: none;
    border-color: #60a5fa;
  }
</style>`;

    if (isFullDocument) {
      // For full HTML documents, inject our security headers and console capture into <head>
      let modifiedContent = content;

      // Add CSP if not present
      if (!/<meta[^>]*content-security-policy/i.test(content)) {
        modifiedContent = modifiedContent.replace(/<head([^>]*)>/i, `<head$1>\n${cspMeta}`);
      }

      // Add console capture script at the beginning of head
      modifiedContent = modifiedContent.replace(/<head([^>]*)>/i, `<head$1>\n${consoleCapture}`);

      return modifiedContent;
    } else {
      // For HTML snippets, wrap in a full document
      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${cspMeta}
  ${consoleCapture}
  ${baseStyles}
</head>
<body>
${content}
</body>
</html>`;
    }
  }, []);

  // Listen for messages from the iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Validate the message is from our sandbox
      if (event.data?.channelId !== channelId.current) return;

      if (event.data.type === 'sandbox-console') {
        setConsoleOutput((prev) => [
          ...prev.slice(-99), // Keep last 100 messages
          {
            type: event.data.consoleType,
            message: event.data.message,
            timestamp: event.data.timestamp,
          },
        ]);
      } else if (event.data.type === 'sandbox-ready') {
        setError(null);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Auto-scroll console to bottom
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [consoleOutput]);

  // Build the iframe srcDoc
  const srcDoc = useMemo(() => {
    if (!isRunning) return '';
    try {
      return buildSandboxedHtml(artifact.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to build sandbox');
      return '';
    }
  }, [artifact.content, buildSandboxedHtml, isRunning]);

  const handleReload = useCallback(() => {
    setConsoleOutput([]);
    setError(null);
    setIsRunning(false);
    // AUDIT-005-004 fix: Clear previous timeout and store new one for cleanup
    if (reloadTimeoutRef.current) {
      clearTimeout(reloadTimeoutRef.current);
    }
    // Small delay to ensure iframe is destroyed before recreating
    reloadTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setIsRunning(true);
      }
      reloadTimeoutRef.current = null;
    }, 50);
  }, []);

  const handleStop = useCallback(() => {
    setIsRunning(false);
    setConsoleOutput((prev) => [
      ...prev,
      { type: 'info', message: 'Execution stopped', timestamp: Date.now() },
    ]);
  }, []);

  const handleRun = useCallback(() => {
    setConsoleOutput([]);
    setError(null);
    setIsRunning(true);
  }, []);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const getConsoleTypeColor = (type: 'log' | 'error' | 'warn' | 'info') => {
    switch (type) {
      case 'error':
        return 'text-red-400';
      case 'warn':
        return 'text-yellow-400';
      case 'info':
        return 'text-blue-400';
      default:
        return 'text-zinc-300';
    }
  };

  const getConsoleTypeIcon = (type: 'log' | 'error' | 'warn' | 'info') => {
    switch (type) {
      case 'error':
        return <AlertTriangle className="h-3 w-3 text-red-400" />;
      case 'warn':
        return <AlertTriangle className="h-3 w-3 text-yellow-400" />;
      default:
        return null;
    }
  };

  return (
    <div
      className={cn(
        'flex flex-col',
        isExpanded && 'fixed inset-4 z-50 bg-zinc-900 rounded-lg shadow-2xl',
      )}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-700/50 bg-zinc-800/50">
        <div className="flex items-center gap-1">
          {isRunning ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleStop}
                  aria-label="Stop execution"
                >
                  <Square className="h-3 w-3 fill-current" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Stop</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleRun}
                  aria-label="Run code"
                >
                  <Play className="h-3 w-3 fill-current" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Run</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={handleReload}
                aria-label="Reload"
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reload</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex-1" />

        <button
          onClick={() => setShowCode((prev) => !prev)}
          className={cn(
            'px-2 py-1 text-xs rounded transition-colors',
            showCode
              ? 'bg-zinc-700 text-zinc-200'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50',
          )}
        >
          {showCode ? 'Preview' : 'Code'}
        </button>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={toggleExpanded}
              aria-label={isExpanded ? 'Minimize' : 'Maximize'}
            >
              {isExpanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isExpanded ? 'Minimize' : 'Maximize'}</TooltipContent>
        </Tooltip>
      </div>

      {/* Main content area */}
      <div className={cn('flex flex-col', isExpanded ? 'flex-1 min-h-0' : 'h-[400px]')}>
        {showCode ? (
          /* Code view */
          <div className="flex-1 overflow-auto bg-gray-950">
            <SyntaxHighlighter
              language="html"
              style={oneDark}
              customStyle={{
                margin: 0,
                padding: '1rem',
                background: 'transparent',
                fontSize: '13px',
                lineHeight: '1.6',
                height: '100%',
              }}
              showLineNumbers
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
        ) : (
          /* Preview view */
          <div className="flex flex-col flex-1 min-h-0">
            {/* Iframe container */}
            <div className="flex-1 min-h-0 relative bg-zinc-900">
              {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-red-900/20 p-4">
                  <div className="text-center">
                    <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-2" />
                    <p className="text-sm text-red-300">{error}</p>
                  </div>
                </div>
              )}
              {isRunning && srcDoc && (
                <iframe
                  ref={iframeRef}
                  srcDoc={srcDoc}
                  title={artifact.title || 'HTML Preview'}
                  className="w-full h-full border-0"
                  // Security: Sandbox attribute restricts iframe capabilities
                  // - allow-scripts: Allow JavaScript execution (required for interactivity)
                  // - allow-modals: Allow alert(), confirm(), prompt() dialogs
                  // NOT included (blocked):
                  // - allow-same-origin: Prevents access to parent window and storage
                  // - allow-top-navigation: Prevents navigation of parent page
                  // - allow-forms: Prevents form submissions
                  // - allow-popups: Prevents window.open()
                  // - allow-pointer-lock: Prevents pointer lock API
                  // - allow-orientation-lock: Prevents orientation lock
                  // - allow-presentation: Prevents presentation mode
                  // - allow-downloads: Prevents file downloads
                  sandbox="allow-scripts allow-modals"
                  // Additional security: referrer policy
                  referrerPolicy="no-referrer"
                />
              )}
              {!isRunning && (
                <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
                  <div className="text-center">
                    <Square className="h-8 w-8 text-zinc-500 mx-auto mb-2" />
                    <p className="text-sm text-zinc-400">Execution stopped</p>
                    <button
                      onClick={handleRun}
                      className="mt-2 px-3 py-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 rounded text-zinc-200 transition-colors"
                    >
                      Run again
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Console output */}
            <div className="border-t border-zinc-700/50">
              <div className="px-3 py-1.5 text-xs font-medium text-zinc-400 bg-zinc-800/50 border-b border-zinc-700/50 flex items-center justify-between">
                <span>Console</span>
                {consoleOutput.length > 0 && (
                  <button
                    onClick={() => setConsoleOutput([])}
                    className="text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div
                ref={consoleRef}
                className="h-[100px] overflow-auto bg-zinc-950 font-mono text-xs"
              >
                {consoleOutput.length === 0 ? (
                  <div className="p-3 text-zinc-500">No console output</div>
                ) : (
                  consoleOutput.map((entry, i) => (
                    <div
                      key={`${entry.timestamp}-${i}`}
                      className={cn(
                        'px-3 py-1 border-b border-zinc-800/50 flex items-start gap-2',
                        getConsoleTypeColor(entry.type),
                      )}
                    >
                      {getConsoleTypeIcon(entry.type)}
                      <pre className="whitespace-pre-wrap break-all flex-1 m-0 bg-transparent p-0">
                        {entry.message}
                      </pre>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
function DocumentArtifact({ artifact }: { artifact: Artifact }) {
  return (
    <div className="p-4 bg-white/5 rounded-lg overflow-auto max-h-[500px]">
      <pre className="text-sm font-mono text-zinc-300 whitespace-pre-wrap font-sans">
        {artifact.content}
      </pre>
    </div>
  );
}
