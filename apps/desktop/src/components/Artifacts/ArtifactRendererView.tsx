/**
 * ArtifactRendererView Component
 *
 * Renders different artifact types with appropriate viewers.
 */

import React, { useMemo } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ReactMarkdown from 'react-markdown';
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
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent } from '@/components/ui/Card';
import { sanitizeSvg } from '@/utils/security';
import type {
  ChartRenderData,
  CodeRenderData,
  DiagramRenderData,
  DocumentRenderData,
  ImageRenderData,
  PresentationRenderData,
  RenderedArtifact,
  SpreadsheetRenderData,
  WebRenderData,
} from '@/stores/artifactStore';

interface ArtifactRendererViewProps {
  rendered: RenderedArtifact;
  isStreaming?: boolean;
  className?: string;
}

export function ArtifactRendererView({
  rendered,
  isStreaming,
  className,
}: ArtifactRendererViewProps) {
  const { rendered_content } = rendered;

  return (
    <div className={cn('p-4', className)}>
      {isStreaming && (
        <div className="mb-4 flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-sm text-blue-500">Generating...</span>
        </div>
      )}

      {rendered_content.type === 'Code' && <CodeRenderer data={rendered_content.data} />}
      {rendered_content.type === 'Document' && <DocumentRenderer data={rendered_content.data} />}
      {rendered_content.type === 'Spreadsheet' && (
        <SpreadsheetRenderer data={rendered_content.data} />
      )}
      {rendered_content.type === 'Diagram' && <DiagramRenderer data={rendered_content.data} />}
      {rendered_content.type === 'Web' && <WebRenderer data={rendered_content.data} />}
      {rendered_content.type === 'Chart' && <ChartRenderer data={rendered_content.data} />}
      {rendered_content.type === 'Presentation' && (
        <PresentationRenderer data={rendered_content.data} />
      )}
      {rendered_content.type === 'Image' && <ImageRenderer data={rendered_content.data} />}
    </div>
  );
}

// =============================================================================
// Code Renderer
// =============================================================================

function CodeRenderer({ data }: { data: CodeRenderData }) {
  return (
    <div className="rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800">
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-100 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {data.language}
          </Badge>
          <span className="text-xs text-zinc-500">{data.line_count} lines</span>
        </div>
        {data.executable && (
          <Badge variant="outline" className="text-xs text-green-600 border-green-600">
            Executable
          </Badge>
        )}
      </div>
      <SyntaxHighlighter
        language={data.language}
        style={oneDark}
        customStyle={{
          margin: 0,
          padding: '1rem',
          background: 'transparent',
          fontSize: '13px',
          lineHeight: '1.6',
        }}
        showLineNumbers={data.line_count > 3}
        lineNumberStyle={{
          minWidth: '2.5em',
          paddingRight: '1em',
          color: '#4b5563',
          userSelect: 'none',
        }}
        wrapLongLines={false}
        lineProps={(lineNumber) => ({
          style: {
            backgroundColor: data.highlight_lines.includes(lineNumber)
              ? 'rgba(59, 130, 246, 0.2)'
              : 'transparent',
          },
        })}
      >
        {data.source}
      </SyntaxHighlighter>
    </div>
  );
}

// =============================================================================
// Document Renderer
// =============================================================================

function DocumentRenderer({ data }: { data: DocumentRenderData }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <div className="mb-4 flex items-center gap-4 text-xs text-zinc-500">
        <span>{data.word_count} words</span>
        <span>{data.char_count} characters</span>
        <Badge variant="outline" className="text-xs">
          {data.format}
        </Badge>
      </div>
      {data.toc.length > 0 && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <h4 className="text-sm font-medium mb-2">Table of Contents</h4>
            <ul className="space-y-1">
              {data.toc.map((entry, i) => (
                <li
                  key={i}
                  style={{ marginLeft: `${(entry.level - 1) * 16}px` }}
                  className="text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  <a href={`#${entry.anchor}`}>{entry.title}</a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      {data.format === 'markdown' ? (
        <ReactMarkdown>{data.source}</ReactMarkdown>
      ) : (
        <div className="whitespace-pre-wrap">{data.source}</div>
      )}
    </div>
  );
}

// =============================================================================
// Spreadsheet Renderer
// =============================================================================

function SpreadsheetRenderer({ data }: { data: SpreadsheetRenderData }) {
  return (
    <div className="rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800">
      <div className="px-3 py-2 bg-zinc-100 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800">
        <span className="text-xs text-zinc-500">
          {data.row_count} rows, {data.columns.length} columns
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-800/30">
            <tr>
              <th className="w-10 px-2 py-2 text-left font-medium text-zinc-500 border-b border-zinc-200 dark:border-zinc-700">
                #
              </th>
              {data.columns.map((col) => (
                <th
                  key={col.name}
                  className="px-3 py-2 text-left font-medium text-zinc-700 dark:text-zinc-300 border-b border-zinc-200 dark:border-zinc-700 whitespace-nowrap"
                >
                  {col.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, i) => (
              <tr key={i} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                <td className="px-2 py-2 text-zinc-400 border-b border-zinc-100 dark:border-zinc-800 font-mono text-xs">
                  {i + 1}
                </td>
                {data.columns.map((col) => (
                  <td
                    key={col.name}
                    className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300"
                  >
                    {String(row[col.name] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =============================================================================
// Diagram Renderer (Mermaid)
// =============================================================================

function DiagramRenderer({ data }: { data: DiagramRenderData }) {
  const [svg, setSvg] = React.useState<string>('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let mounted = true;

    const renderDiagram = async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: data.theme === 'dark' ? 'dark' : 'default',
          securityLevel: 'strict',
        });

        const id = `mermaid-${crypto.randomUUID().replace(/-/g, '')}`;
        const { svg } = await mermaid.render(id, data.source);

        if (mounted) {
          setSvg(svg);
          setError(null);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };

    if (data.source) {
      renderDiagram();
    }

    return () => {
      mounted = false;
    };
  }, [data.source, data.theme]);

  if (error) {
    return (
      <div className="p-4 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20">
        <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-2">
          Failed to render diagram
        </p>
        <pre className="text-xs text-red-500 whitespace-pre-wrap">{error}</pre>
        <div className="mt-4 pt-4 border-t border-red-200 dark:border-red-800">
          <p className="text-xs text-zinc-500 mb-1">Source:</p>
          <pre className="text-xs font-mono bg-zinc-100 dark:bg-zinc-800 p-2 rounded">
            {data.source}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900/50">
      <div className="mb-2 flex items-center gap-2">
        <Badge variant="secondary" className="text-xs">
          {data.diagram_type}
        </Badge>
      </div>
      {svg ? (
        <div
          // AUDIT-NEW-001 fix: Sanitize SVG before rendering to prevent XSS attacks
          dangerouslySetInnerHTML={{ __html: sanitizeSvg(svg) }}
          className="flex justify-center [&_svg]:max-w-full [&_svg]:h-auto"
        />
      ) : (
        <div className="flex items-center justify-center py-8 text-zinc-400">
          <div className="animate-pulse">Rendering diagram...</div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Web Renderer (Sandboxed HTML)
// =============================================================================

function WebRenderer({ data }: { data: WebRenderData }) {
  const srcDoc = useMemo(() => {
    // Build sandboxed HTML with security headers
    const cspMeta = `<meta http-equiv="Content-Security-Policy" content="default-src 'self' blob: data:; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline' *; img-src * data: blob:; font-src * data:; connect-src 'none'; frame-src 'none';">`;

    const isFullDoc = /<html[\s>]/i.test(data.html);
    if (isFullDoc) {
      return data.html.replace(/<head([^>]*)>/i, `<head$1>\n${cspMeta}`);
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${cspMeta}
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
    }
  </style>
</head>
<body>
${data.html}
</body>
</html>`;
  }, [data.html]);

  return (
    <div className="rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-800">
      <div className="px-3 py-2 bg-zinc-100 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2">
        <Badge variant="secondary" className="text-xs">
          HTML Preview
        </Badge>
        {data.scripts_enabled && (
          <Badge variant="outline" className="text-xs text-amber-600 border-amber-600">
            Scripts Enabled
          </Badge>
        )}
      </div>
      <iframe
        srcDoc={srcDoc}
        title="HTML Preview"
        className="w-full border-0"
        style={{ height: data.viewport?.[1] || 400 }}
        sandbox={data.sandbox_permissions.join(' ')}
        referrerPolicy="no-referrer"
      />
    </div>
  );
}

// =============================================================================
// Chart Renderer
// =============================================================================

function ChartRenderer({ data }: { data: ChartRenderData }) {
  const COLORS = data.colors;

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Badge variant="secondary" className="text-xs capitalize">
          {data.chart_type} Chart
        </Badge>
      </div>
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          {data.chart_type === 'bar' ? (
            <BarChart data={data.data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={data.x_axis?.data_key || 'name'} />
              <YAxis />
              <RechartsTooltip />
              {data.show_legend && <Legend />}
              {data.series.map((s, i) => (
                <Bar
                  key={s.data_key}
                  dataKey={s.data_key}
                  fill={s.color || COLORS[i % COLORS.length]}
                />
              ))}
            </BarChart>
          ) : data.chart_type === 'line' ? (
            <LineChart data={data.data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={data.x_axis?.data_key || 'name'} />
              <YAxis />
              <RechartsTooltip />
              {data.show_legend && <Legend />}
              {data.series.map((s, i) => (
                <Line
                  key={s.data_key}
                  type="monotone"
                  dataKey={s.data_key}
                  stroke={s.color || COLORS[i % COLORS.length]}
                />
              ))}
            </LineChart>
          ) : data.chart_type === 'pie' ? (
            <PieChart>
              <Pie
                data={data.data}
                dataKey={data.series[0]?.data_key || 'value'}
                nameKey={data.x_axis?.data_key || 'name'}
                cx="50%"
                cy="50%"
                outerRadius={100}
                label
              >
                {data.data.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <RechartsTooltip />
              {data.show_legend && <Legend />}
            </PieChart>
          ) : (
            <div className="flex items-center justify-center h-full text-zinc-500">
              Unsupported chart type: {data.chart_type}
            </div>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// =============================================================================
// Presentation Renderer
// =============================================================================

function PresentationRenderer({ data }: { data: PresentationRenderData }) {
  const [currentSlide, setCurrentSlide] = React.useState(0);

  const slide = data.slides[currentSlide];

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <div className="px-3 py-2 bg-zinc-100 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
        <span className="text-xs text-zinc-500">
          Slide {currentSlide + 1} of {data.slide_count}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentSlide((p) => Math.max(0, p - 1))}
            disabled={currentSlide === 0}
            className="px-2 py-1 text-xs rounded bg-zinc-200 dark:bg-zinc-700 disabled:opacity-50"
          >
            Prev
          </button>
          <button
            onClick={() => setCurrentSlide((p) => Math.min(data.slide_count - 1, p + 1))}
            disabled={currentSlide === data.slide_count - 1}
            className="px-2 py-1 text-xs rounded bg-zinc-200 dark:bg-zinc-700 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
      {slide && (
        <div className="p-6 min-h-[300px]">
          {slide.title && (
            <h2 className="text-xl font-bold mb-4 text-zinc-900 dark:text-zinc-100">
              {slide.title}
            </h2>
          )}
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown>{slide.content}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Image Renderer
// =============================================================================

function ImageRenderer({ data }: { data: ImageRenderData }) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 flex items-center justify-center bg-zinc-50 dark:bg-zinc-900/50">
      <img
        src={data.source}
        alt={data.alt_text || 'Artifact image'}
        style={{
          maxWidth: data.width || '100%',
          maxHeight: data.height || 400,
        }}
        className="rounded"
      />
    </div>
  );
}
