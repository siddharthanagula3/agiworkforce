import { useState, useRef, useCallback, useMemo } from 'react';
import { Button } from '@shared/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/ui/tabs';
import {
  Code,
  Eye,
  Download,
  Share2,
  Copy,
  Check,
  RefreshCw,
  Maximize2,
  ExternalLink,
  History,
  Shield,
} from 'lucide-react';
import { cn } from '@shared/lib/utils';
import { ScrollArea } from '@shared/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@shared/ui/dropdown-menu';
import { sanitizeArtifact, sanitizeSVG, hasXSSRisk } from '@shared/utils/html-sanitizer';
import { Alert, AlertDescription } from '@shared/ui/alert';
import { SandboxedIframe } from '../SandboxedIframe';
import type { ArtifactRenderPayload, ArtifactKind } from '@/lib/artifact-sandbox';

export interface ArtifactVersion {
  id: string;
  content: string;
  timestamp: Date;
  description?: string;
}

export interface ArtifactData {
  id: string;
  type: 'html' | 'react' | 'svg' | 'mermaid' | 'code';
  language?: string;
  title?: string;
  content: string;
  versions?: ArtifactVersion[];
  currentVersion?: number;
}

interface ArtifactPreviewProps {
  artifact: ArtifactData;
  onVersionChange?: (versionIndex: number) => void;
  onShare?: () => void;
  className?: string;
}

/**
 * ArtifactPreview Component - Claude Artifacts-like Live Preview
 *
 * Features:
 * - Live rendering of HTML/React/SVG code
 * - Preview/Code toggle (split view)
 * - Version control with history
 * - Instant sharing
 * - Multiple export formats
 * - Responsive iframe sandbox
 *
 * Dominates ChatGPT Canvas by:
 * - Live interactive preview (Canvas only shows static editor)
 * - Real-time rendering of web apps
 * - Instant version switching
 */
export function ArtifactPreview({
  artifact,
  onVersionChange,
  onShare,
  className,
}: ArtifactPreviewProps) {
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [securityWarning, setSecurityWarning] = useState(false);
  // WEB-13 / WEB-20: bumped on refresh to force iframe re-mount.
  const [refreshKey, setRefreshKey] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const getPreviewHTML = useCallback((): string => {
    const content =
      artifact.versions && artifact.currentVersion !== undefined
        ? artifact!.versions[artifact.currentVersion]!.content
        : artifact.content;

    // SECURITY: Check for XSS risks and show warning
    // Use queueMicrotask to avoid setState during render
    if (hasXSSRisk(content)) {
      queueMicrotask(() => setSecurityWarning(true));
    }

    // SECURITY: Sanitize content based on artifact type
    const sanitizedContent = sanitizeArtifact(content, artifact.type);

    switch (artifact.type) {
      case 'html':
        return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' 'unsafe-eval' https:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https:;">
    <style>
      body {
        margin: 0;
        padding: 16px;
        font-family: system-ui, -apple-system, sans-serif;
      }
    </style>
  </head>
  <body>
    ${sanitizedContent}
  </body>
</html>`;

      case 'react':
        // For React, we'd need to transpile JSX - for now, show as HTML
        return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' 'unsafe-eval' https:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com; style-src 'self' 'unsafe-inline' https:;">
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="text/babel">
      ${sanitizedContent}
    </script>
  </body>
</html>`;

      case 'svg': {
        // SVG has additional sanitization via sanitizeSVG
        const sanitizedSVG = sanitizeSVG(content);
        return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
    <style>
      body {
        margin: 0;
        padding: 16px;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
      }
    </style>
  </head>
  <body>
    ${sanitizedSVG}
  </body>
</html>`;
      }

      case 'mermaid':
        return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
    <script>mermaid.initialize({ startOnLoad: true });</script>
  </head>
  <body>
    <div class="mermaid">
      ${content}
    </div>
  </body>
</html>`;

      default:
        return `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <style>
      body {
        margin: 0;
        padding: 16px;
        font-family: monospace;
        white-space: pre-wrap;
      }
    </style>
  </head>
  <body>${content}</body>
</html>`;
    }
  }, [artifact]);

  // WEB-13 / WEB-20: build the cross-origin sandbox payload from the artifact.
  // SandboxedIframe will post this to sandbox.agiworkforce.com (if configured)
  // or fall back to a same-origin srcDoc iframe with sandbox="allow-scripts"
  // (no allow-same-origin).
  const sandboxPayload = useMemo<ArtifactRenderPayload>(() => {
    const content =
      artifact.versions && artifact.currentVersion !== undefined
        ? artifact!.versions[artifact.currentVersion]!.content
        : artifact.content;
    const sanitized = sanitizeArtifact(content, artifact.type);
    const kind: ArtifactKind =
      artifact.type === 'code' ? 'code' : (artifact.type as ArtifactKind);
    switch (artifact.type) {
      case 'html':
        return { type: 'render', kind: 'html', html: sanitized, runScripts: true };
      case 'react':
        return { type: 'render', kind: 'react', code: sanitized };
      case 'svg':
        return { type: 'render', kind: 'svg', svg: sanitizeSVG(content) };
      case 'mermaid':
        return { type: 'render', kind: 'mermaid', code: content };
      default:
        return { type: 'render', kind, text: content };
    }
  }, [artifact]);

  const handleCopy = async () => {
    const content =
      artifact.versions && artifact.currentVersion !== undefined
        ? artifact!.versions[artifact.currentVersion]!.content
        : artifact.content;

    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = (format: 'html' | 'txt' | 'md') => {
    const content =
      artifact.versions && artifact.currentVersion !== undefined
        ? artifact!.versions[artifact.currentVersion]!.content
        : artifact.content;

    let blob: Blob;
    let filename: string;

    switch (format) {
      case 'html':
        blob = new Blob([getPreviewHTML()], { type: 'text/html' });
        filename = `${artifact.title || 'artifact'}.html`;
        break;
      case 'md': {
        const markdown = `# ${artifact.title || 'Artifact'}\n\n\`\`\`${artifact.language || artifact.type}\n${content}\n\`\`\``;
        blob = new Blob([markdown], { type: 'text/markdown' });
        filename = `${artifact.title || 'artifact'}.md`;
        break;
      }
      default:
        blob = new Blob([content], { type: 'text/plain' });
        filename = `${artifact.title || 'artifact'}.${artifact.language || 'txt'}`;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleOpenInNewTab = () => {
    // WEB-25: noopener,noreferrer prevents reverse-tabnabbing; revoke the blob
    // URL after a minute so the GC can reclaim the HTML body.
    const html = getPreviewHTML();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const handleRefresh = () => {
    // WEB-13: bump refreshKey to re-mount the SandboxedIframe; the new
    // iframe load triggers a fresh sandbox-ready + payload post.
    setRefreshKey((k) => k + 1);
  };

  const handleFullscreen = () => {
    if (!document.fullscreenElement && containerRef.current) {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const canPreview = ['html', 'react', 'svg', 'mermaid'].includes(artifact.type);

  return (
    <div
      ref={containerRef}
      className={cn(
        'mt-3 overflow-hidden rounded-xl border border-border bg-card shadow-lg',
        isFullscreen && 'fixed inset-0 z-modal rounded-none',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-muted/50 px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Code className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">{artifact.title || 'Artifact'}</span>
          </div>
          {artifact.type && (
            <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {artifact.type}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Version History */}
          {artifact.versions && artifact.versions.length > 1 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-2">
                  <History className="h-3.5 w-3.5" />
                  <span className="ml-1 text-xs">v{(artifact.currentVersion || 0) + 1}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {artifact.versions.map((version, index) => (
                  <DropdownMenuItem
                    key={version.id}
                    onClick={() => onVersionChange?.(index)}
                    className={cn(artifact.currentVersion === index && 'bg-accent')}
                  >
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium">Version {index + 1}</span>
                      <span className="text-xs text-muted-foreground">
                        {version.timestamp.toLocaleString()}
                      </span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 px-2">
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-green-500" />
                <span className="ml-1 text-xs">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span className="ml-1 text-xs">Copy</span>
              </>
            )}
          </Button>

          {/* Download Options */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2">
                <Download className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleDownload('html')}>
                Download as HTML
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDownload('txt')}>
                Download as {artifact.language?.toUpperCase() || 'TXT'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDownload('md')}>
                Download as Markdown
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {onShare && (
            <Button variant="ghost" size="sm" onClick={onShare} className="h-7 px-2">
              <Share2 className="h-3.5 w-3.5" />
            </Button>
          )}

          {canPreview && (
            <>
              <Button variant="ghost" size="sm" onClick={handleRefresh} className="h-7 px-2">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>

              <Button variant="ghost" size="sm" onClick={handleOpenInNewTab} className="h-7 px-2">
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>

              <Button variant="ghost" size="sm" onClick={handleFullscreen} className="h-7 px-2">
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Security Warning */}
      {securityWarning && (
        <Alert className="m-4 border-yellow-500 bg-yellow-50">
          <Shield className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-yellow-800">
            <strong>Security Notice:</strong> This artifact contains potentially risky content. It
            has been sanitized for your protection, but some functionality may be limited.
          </AlertDescription>
        </Alert>
      )}

      {/* Preview/Code Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'preview' | 'code')}
        className="w-full"
      >
        {canPreview && (
          <TabsList className="w-full justify-start rounded-none border-b border-border bg-muted/30 px-4">
            <TabsTrigger value="preview" className="gap-2">
              <Eye className="h-3.5 w-3.5" />
              Preview
            </TabsTrigger>
            <TabsTrigger value="code" className="gap-2">
              <Code className="h-3.5 w-3.5" />
              Code
            </TabsTrigger>
          </TabsList>
        )}

        {/* Preview Tab */}
        {canPreview && (
          <TabsContent value="preview" className="m-0 p-0">
            <div className={cn('bg-white', isFullscreen ? 'h-[calc(100vh-100px)]' : 'h-[500px]')}>
              <SandboxedIframe
                payload={sandboxPayload}
                fallbackSrcDoc={getPreviewHTML()}
                title={artifact.title || 'Artifact Preview'}
                className="h-full w-full border-0"
                refreshKey={refreshKey}
              />
            </div>
          </TabsContent>
        )}

        {/* Code Tab */}
        <TabsContent value="code" className="m-0 p-0">
          <ScrollArea
            className={cn('bg-gray-900', isFullscreen ? 'h-[calc(100vh-100px)]' : 'h-[500px]')}
          >
            <pre className="p-4">
              <code className="text-sm text-gray-100">
                {artifact.versions && artifact.currentVersion !== undefined
                  ? artifact!.versions[artifact.currentVersion]!.content
                  : artifact.content}
              </code>
            </pre>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
