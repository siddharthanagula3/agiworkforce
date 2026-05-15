import { invoke, isTauri } from '@/lib/tauri-mock';
import { save } from '@tauri-apps/plugin-dialog';
import {
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
  Layers,
  Network,
  Presentation,
  Table2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useThemeContext } from '../../providers/ThemeProvider';
import { cn } from '../../lib/utils';
import { useCodeStore } from '../../stores/codeStore';
import type { Artifact } from '../../types/chat';
import { Badge } from '../ui/Badge';
import { SectionErrorBoundary } from '../ui/SectionErrorBoundary';
import { Button } from '../ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
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
import { ReactPreview } from './artifact-components/ReactPreview';
import { SpreadsheetArtifact } from './artifact-components/SpreadsheetArtifact';
import { ChartArtifact } from './artifacts/ChartArtifact';
import { CodeArtifact } from './artifacts/CodeArtifact';
import { HtmlArtifact } from './artifacts/HtmlArtifact';
import { MarkdownArtifact } from './artifacts/MarkdownArtifact';
import { MermaidArtifact } from './artifacts/MermaidArtifact';
import { SvgArtifact } from './artifacts/SvgArtifact';
import { TableArtifact } from './artifacts/TableArtifact';

interface ArtifactRendererProps {
  artifact: Artifact;
  className?: string;
}

export function ArtifactRenderer({ artifact, className }: ArtifactRendererProps) {
  const [copied, setCopied] = useState(false);
  const { theme } = useThemeContext();
  const rootPath = useCodeStore((state) => state.rootPath);
  const openFile = useCodeStore((state) => state.openFile);
  const setActiveFile = useCodeStore((state) => state.setActiveFile);
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
    } catch {
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
    } catch {
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
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleExportPdf = async () => {
    if (!isTauri) {
      toast.info('PDF export requires the desktop app');
      return;
    }
    try {
      const savePath = await save({
        defaultPath: `${artifact.title || 'document'}.pdf`,
        filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
      });
      if (!savePath) return;

      const paragraphs = artifact.content
        .split(/\n\n+/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      await invoke('document_create_pdf_simple', {
        outputPath: savePath,
        title: artifact.title || 'Document',
        author: null,
        paragraphs,
      });
      toast.success('Exported to PDF successfully');
    } catch {
      toast.error('Failed to export to PDF');
    }
  };

  const handleExportWord = async () => {
    if (!isTauri) {
      toast.info('Word export requires the desktop app');
      return;
    }
    try {
      const savePath = await save({
        defaultPath: `${artifact.title || 'document'}.docx`,
        filters: [{ name: 'Word Document', extensions: ['docx'] }],
      });
      if (!savePath) return;

      const paragraphs = artifact.content
        .split(/\n\n+/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      await invoke('document_create_word_simple', {
        outputPath: savePath,
        title: artifact.title || 'Document',
        author: null,
        paragraphs,
      });
      toast.success('Exported to Word successfully');
    } catch {
      toast.error('Failed to export to Word');
    }
  };

  const handleExportExcel = async () => {
    if (artifact.type !== 'spreadsheet' && artifact.type !== 'table') return;

    if (!isTauri) {
      toast.info('Excel export requires the desktop app');
      return;
    }

    try {
      const savePath = await save({
        defaultPath: `${artifact.title || 'spreadsheet'}.xlsx`,
        filters: [{ name: 'Excel Spreadsheet', extensions: ['xlsx'] }],
      });
      if (!savePath) return;

      let data: Record<string, string | number>[];
      try {
        data = JSON.parse(artifact.content) as Record<string, string | number>[];
      } catch {
        toast.error('Invalid JSON format in artifact');
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
        outputPath: savePath,
        sheetName: artifact.title || 'Sheet1',
        headers,
        rows,
      });
      toast.success('Exported to Excel successfully');
    } catch {
      toast.error('Failed to export to Excel');
    }
  };

  const supportsDocumentExport = [
    'code',
    'presentation',
    'mermaid',
    'markdown',
    'document',
  ].includes(artifact.type);
  const supportsExcelExport = ['spreadsheet', 'table'].includes(artifact.type);
  const supportsImageExport = ['chart', 'mermaid', 'svg'].includes(artifact.type);
  const supportsMarkdownExport = ['table', 'spreadsheet'].includes(artifact.type);

  const handleExportSvg = async () => {
    try {
      const container = document.querySelector(`[data-artifact-id="${artifact.id}"]`);
      const svgElement = container?.querySelector('svg');

      if (!svgElement) {
        toast.error('No chart found to export');
        return;
      }

      const clonedSvg = svgElement.cloneNode(true) as SVGElement;
      clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('width', '100%');
      rect.setAttribute('height', '100%');
      rect.setAttribute('fill', '#1a1a2e');
      clonedSvg.insertBefore(rect, clonedSvg.firstChild);

      const svgString = new XMLSerializer().serializeToString(clonedSvg);
      const blob = new Blob([svgString], { type: 'image/svg+xml' });

      if (!isTauri) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${artifact.title || 'chart'}.svg`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Exported as SVG');
        return;
      }

      const savePath = await save({
        defaultPath: `${artifact.title || 'chart'}.svg`,
        filters: [{ name: 'SVG Image', extensions: ['svg'] }],
      });

      if (!savePath) return;

      // AUDIT-005-007 fix: Track FileReader and add mount check before state updates
      const reader = new FileReader();
      reader.onloadend = async () => {
        if (!isMountedRef.current) return;
        try {
          const base64 = (reader.result as string).split(',')[1];
          await invoke('file_write_binary', { filePath: savePath, base64Content: base64 });
          if (isMountedRef.current) {
            toast.success('Exported as SVG');
          }
        } catch {
          if (isMountedRef.current) {
            toast.error('Failed to save SVG file');
          }
        }
      };
      reader.onerror = () => {
        if (isMountedRef.current) {
          toast.error('Failed to read SVG data');
        }
      };
      reader.readAsDataURL(blob);
    } catch {
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
          setTimeout(() => URL.revokeObjectURL(url), 1000);
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

      const bbox = svgElement.getBoundingClientRect();
      const width = bbox.width || 800;
      const height = bbox.height || 600;

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
        if (!isMountedRef.current) {
          URL.revokeObjectURL(url);
          return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width * 2;
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
              setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
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
    } catch {
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
      const headerRow = `| ${headers.join(' | ')} |`;
      const separatorRow = `| ${headers.map(() => '---').join(' | ')} |`;
      const dataRows = data
        .map((row) => `| ${headers.map((h) => String(row[h] ?? '')).join(' | ')} |`)
        .join('\n');

      const markdown = `${headerRow}\n${separatorRow}\n${dataRows}`;

      await navigator.clipboard.writeText(markdown);
      toast.success('Copied as Markdown table');
    } catch {
      toast.error('Failed to copy as Markdown');
    }
  };

  const getFileExtension = (artifact: Artifact): string => {
    if (artifact.type === 'code' && artifact.language) {
      return artifact.language;
    }
    if (artifact.type === 'spreadsheet') return 'csv';
    if (artifact.type === 'presentation') return 'md';
    if (artifact.type === 'markdown') return 'md';
    if (artifact.type === 'svg') return 'svg';
    if (artifact.type === 'react' || artifact.type === 'component') return 'tsx';
    return artifact.type === 'chart' || artifact.type === 'diagram' ? 'json' : 'txt';
  };

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
      case 'markdown':
        return <FileText className="h-4 w-4" />;
      case 'svg':
        return <ImageIcon className="h-4 w-4" />;
      case 'react':
      case 'component':
        return <Layers className="h-4 w-4" />;
      default:
        return <Code2 className="h-4 w-4" />;
    }
  })();

  const isDark = theme === 'dark';

  return (
    <SectionErrorBoundary sectionName="Artifact Renderer">
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
            ) : artifact.type === 'code' && artifact.language === 'mermaid' ? (
              <MermaidArtifact artifact={artifact} isDark={isDark} />
            ) : artifact.type === 'code' ? (
              <CodeArtifact artifact={artifact} isDark={isDark} />
            ) : artifact.type === 'chart' ? (
              <ChartArtifact artifact={artifact} />
            ) : artifact.type === 'table' ? (
              <TableArtifact artifact={artifact} />
            ) : artifact.type === 'mermaid' ? (
              <MermaidArtifact artifact={artifact} isDark={isDark} />
            ) : artifact.type === 'svg' ||
              (typeof artifact.content === 'string' &&
                artifact.content.trimStart().startsWith('<svg')) ? (
              <SvgArtifact artifact={artifact} />
            ) : artifact.type === 'markdown' ? (
              <MarkdownArtifact artifact={artifact} isDark={isDark} />
            ) : artifact.type === 'react' || artifact.type === 'component' ? (
              <ReactPreview code={artifact.content} />
            ) : artifact.type === 'spreadsheet' ? (
              <SpreadsheetArtifact artifact={artifact} />
            ) : artifact.type === 'presentation' ? (
              <PresentationArtifact artifact={artifact} />
            ) : artifact.type === 'html' ? (
              <HtmlArtifact artifact={artifact} />
            ) : artifact.type === 'document' ? (
              <MarkdownArtifact artifact={artifact} isDark={isDark} />
            ) : (
              <div className="p-4 text-sm text-muted-foreground">Unsupported artifact type</div>
            )}
          </CardContent>
        </Card>
        {promptDialog}
      </>
    </SectionErrorBoundary>
  );
}
