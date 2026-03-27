import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  WifiOff,
  XCircle,
  Zap,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { cn } from '@/lib/utils';
import { useBrowserActivity } from '@/stores/browserActivityStore';

interface BrowserVisualizationProps {
  className?: string;
  tabId?: string;
  url?: string;
  title?: string | null;
  lastAction?: string | null;
  status?: 'idle' | 'planning' | 'executing' | 'done' | 'error';
  extensionConnected?: boolean;
  hasError?: boolean;
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function StatusChip({
  status,
  connected,
  hasError,
}: {
  status: BrowserVisualizationProps['status'];
  connected: boolean;
  hasError: boolean;
}) {
  if (!connected) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
        <WifiOff className="h-3 w-3" />
        Browser link inactive
      </span>
    );
  }

  if (hasError || status === 'error') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-300">
        <XCircle className="h-3 w-3" />
        Error
      </span>
    );
  }

  if (status === 'planning') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/20 bg-teal-500/10 px-2.5 py-1 text-[11px] font-medium text-teal-300">
        <Loader2 className="h-3 w-3 animate-spin" />
        Planning
      </span>
    );
  }

  if (status === 'executing') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-1 text-[11px] font-medium text-blue-300">
        <Zap className="h-3 w-3" />
        Executing
      </span>
    );
  }

  if (status === 'done') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
        <CheckCircle2 className="h-3 w-3" />
        Ready
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-muted/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
      <Globe className="h-3 w-3" />
      Idle
    </span>
  );
}

export function BrowserVisualization({
  className,
  url,
  title,
  lastAction,
  status,
  extensionConnected,
  hasError,
}: BrowserVisualizationProps) {
  const detail = useBrowserActivity();
  const [activeTab, setActiveTab] = useState<'preview' | 'activity'>('preview');
  const [copied, setCopied] = useState(false);

  const effective = useMemo(() => {
    const resolvedUrl = url || detail.url || '';
    const resolvedTitle = title ?? detail.title ?? null;
    const resolvedLastAction = lastAction ?? detail.lastAction ?? null;
    const resolvedStatus = status ?? detail.status ?? 'idle';
    const resolvedConnected = extensionConnected ?? detail.extensionConnected ?? false;
    const resolvedHasError = hasError ?? detail.hasError ?? false;

    return {
      url: resolvedUrl,
      title: resolvedTitle,
      lastAction: resolvedLastAction,
      status: resolvedStatus,
      extensionConnected: resolvedConnected,
      hasError: resolvedHasError,
    };
  }, [
    detail.extensionConnected,
    detail.hasError,
    detail.lastAction,
    detail.status,
    detail.title,
    detail.url,
    extensionConnected,
    hasError,
    lastAction,
    status,
    title,
    url,
  ]);

  const handleCopy = async () => {
    if (!effective.url) return;
    await navigator.clipboard.writeText(effective.url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  if (!effective.url) {
    return (
      <div
        className={cn(
          'flex h-full flex-col items-center justify-center gap-3 text-center',
          className,
        )}
      >
        <div className="rounded-full border border-border/60 bg-muted/40 p-3 text-muted-foreground">
          <Globe className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">No browser context yet</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Browser tasks, cited sources, and extension activity will appear here when the agent
            opens or acts on a page.
          </p>
        </div>
      </div>
    );
  }

  const host = hostFromUrl(effective.url);

  return (
    <div className={cn('flex h-full flex-col bg-background', className)}>
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as 'preview' | 'activity')}
        className="flex h-full flex-col overflow-hidden"
      >
        <div className="border-b border-border/50 px-4 py-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {effective.title || host}
              </p>
              <p className="truncate text-xs text-muted-foreground">{effective.url}</p>
            </div>
            <StatusChip
              status={effective.status}
              connected={effective.extensionConnected}
              hasError={effective.hasError}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <TabsList className="h-9 bg-muted/50">
              <TabsTrigger value="preview">Preview</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Copy className="h-3 w-3" />
                {copied ? 'Copied' : 'Copy'}
              </button>
              <a
                href={effective.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" />
                Open
              </a>
            </div>
          </div>
        </div>

        <TabsContent value="preview" className="mt-0 flex-1 overflow-hidden p-0">
          <div className="flex h-full flex-col overflow-hidden">
            <div className="border-b border-border/40 bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
              Embedded preview works when the source allows framing. If the preview is blank, use{' '}
              <span className="font-medium text-foreground">Open</span>.
            </div>
            <div className="relative flex-1 bg-black/20">
              <iframe
                key={effective.url}
                src={effective.url}
                title={effective.title || host}
                className="h-full w-full border-0 bg-background"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                referrerPolicy="no-referrer"
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="activity" className="mt-0 flex-1 overflow-auto p-4">
          <div className="space-y-4">
            <section className="rounded-xl border border-border/50 bg-muted/20 p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Current Page
              </p>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">{effective.title || host}</p>
                <p className="break-all text-xs text-muted-foreground">{effective.url}</p>
              </div>
            </section>

            <section className="rounded-xl border border-border/50 bg-muted/20 p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Last Action
              </p>
              <p className="text-sm text-foreground">
                {effective.lastAction || 'Waiting for browser activity…'}
              </p>
            </section>

            <section className="rounded-xl border border-border/50 bg-muted/20 p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                Status
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip
                  status={effective.status}
                  connected={effective.extensionConnected}
                  hasError={effective.hasError}
                />
                <span className="text-xs text-muted-foreground">
                  {effective.extensionConnected
                    ? 'Live browser automation is connected.'
                    : 'Showing source and browser context without a live extension session.'}
                </span>
              </div>
            </section>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default BrowserVisualization;
