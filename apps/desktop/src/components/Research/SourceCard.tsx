/**
 * SourceCard Component
 *
 * Displays information about a research source including
 * its analysis status, relevance, and extracted key points.
 */
import { memo, useState } from 'react';
import {
  Globe,
  FileText,
  Mail,
  Calendar,
  Brain,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Link2,
} from 'lucide-react';

import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/Collapsible';
import { cn } from '@/lib/utils';

export type SourceStatus = 'pending' | 'analyzing' | 'done' | 'failed';
export type SourceType = 'web' | 'document' | 'email' | 'calendar' | 'memory';

export interface SourceData {
  id: string;
  url: string;
  title: string;
  domain?: string;
  type?: SourceType;
  status: SourceStatus;
  relevance?: number;
  keyPoints?: string[];
  snippet?: string;
  error?: string;
  analyzedAt?: number;
}

export interface SourceCardProps {
  source: SourceData;
  className?: string;
  showDetails?: boolean;
  onOpenSource?: (url: string) => void;
}

const TYPE_ICONS: Record<SourceType, typeof Globe> = {
  web: Globe,
  document: FileText,
  email: Mail,
  calendar: Calendar,
  memory: Brain,
};

const STATUS_CONFIG: Record<
  SourceStatus,
  {
    icon: typeof Clock;
    color: string;
    bgColor: string;
    label: string;
    animate?: string;
  }
> = {
  pending: {
    icon: Clock,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
    label: 'Pending',
  },
  analyzing: {
    icon: Loader2,
    color: 'text-primary',
    bgColor: 'bg-primary/10',
    label: 'Analyzing',
    animate: 'animate-spin',
  },
  done: {
    icon: CheckCircle2,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    label: 'Done',
  },
  failed: {
    icon: XCircle,
    color: 'text-destructive',
    bgColor: 'bg-destructive/10',
    label: 'Failed',
  },
};

export const SourceCard = memo(function SourceCard({
  source,
  className,
  showDetails = true,
  onOpenSource,
}: SourceCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const statusConfig = STATUS_CONFIG[source.status];
  const StatusIcon = statusConfig.icon;
  const TypeIcon = TYPE_ICONS[source.type || 'web'];

  const hasKeyPoints = source.keyPoints && source.keyPoints.length > 0;
  const canExpand = showDetails && (hasKeyPoints || source.snippet);

  const handleOpenSource = () => {
    if (source.url && onOpenSource) {
      onOpenSource(source.url);
    } else if (source.url) {
      window.open(source.url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <Card className={cn('overflow-hidden', className)}>
        <CollapsibleTrigger asChild disabled={!canExpand}>
          <CardContent
            className={cn(
              'p-3 flex items-start gap-3',
              canExpand && 'cursor-pointer hover:bg-accent/50 transition-colors',
            )}
          >
            {/* Status indicator */}
            <div
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                statusConfig.bgColor,
              )}
            >
              <StatusIcon className={cn('h-4 w-4', statusConfig.color, statusConfig.animate)} />
            </div>

            {/* Main content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <TypeIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <p className="text-sm font-medium truncate">{source.title}</p>
                  </div>
                  {source.domain && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Link2 className="h-3 w-3" />
                      {source.domain}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Relevance score */}
                  {source.relevance !== undefined && source.status === 'done' && (
                    <RelevanceBadge relevance={source.relevance} />
                  )}

                  {/* Expand/collapse indicator */}
                  {canExpand && (
                    <div className="text-muted-foreground">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Error message */}
              {source.status === 'failed' && source.error && (
                <p className="mt-1.5 text-xs text-destructive">{source.error}</p>
              )}

              {/* Analyzing progress indicator */}
              {source.status === 'analyzing' && (
                <div className="mt-2">
                  <Progress value={undefined} className="h-1" />
                </div>
              )}
            </div>
          </CardContent>
        </CollapsibleTrigger>

        {/* Expanded content */}
        <CollapsibleContent>
          <div className="border-t px-3 py-3 space-y-3">
            {/* Snippet */}
            {source.snippet && <p className="text-sm text-muted-foreground">{source.snippet}</p>}

            {/* Key points */}
            {hasKeyPoints && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Key Points</p>
                <ul className="space-y-1">
                  {source.keyPoints!.map((point, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm">
                      <ChevronRight className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Open source button */}
            {source.url && (
              <button type="button"
                onClick={handleOpenSource}
                className="flex items-center gap-1.5 text-xs text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Open source
              </button>
            )}
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
});

interface RelevanceBadgeProps {
  relevance: number;
}

function RelevanceBadge({ relevance }: RelevanceBadgeProps) {
  const percentage = Math.round(relevance * 100);

  let colorClass = 'bg-muted text-muted-foreground';
  if (percentage >= 80) {
    colorClass = 'bg-green-500/10 text-green-500';
  } else if (percentage >= 60) {
    colorClass = 'bg-yellow-500/10 text-yellow-500';
  } else if (percentage >= 40) {
    colorClass = 'bg-orange-500/10 text-orange-500';
  }

  return (
    <Badge variant="outline" className={cn('text-xs', colorClass)}>
      {percentage}%
    </Badge>
  );
}

export default SourceCard;
