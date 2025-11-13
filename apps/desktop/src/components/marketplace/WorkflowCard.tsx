import React, { useState } from 'react';
import { Copy, Eye, Star, Share2, Sparkles, Clock, DollarSign } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import type { PublishedWorkflow } from '../../types/marketplace';
import { useMarketplaceStore } from '../../stores/marketplaceStore';

interface WorkflowCardProps {
  workflow: PublishedWorkflow;
  showAnalytics?: boolean;
}

export function WorkflowCard({ workflow, showAnalytics = false }: WorkflowCardProps) {
  const { openDetailModal, openShareModal, cloneWorkflow, showCloneSuccess } = useMarketplaceStore();
  const [isCloning, setIsCloning] = useState(false);

  const handlePreview = () => {
    openDetailModal(workflow);
  };

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    openShareModal(workflow);
  };

  const handleClone = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsCloning(true);
    try {
      // TODO: Get user ID from auth context
      const userId = 'current_user_id';
      const userName = 'Current User';

      await cloneWorkflow({
        workflow_id: workflow.id,
        user_id: userId,
        user_name: userName,
      });

      showCloneSuccess(workflow);
    } catch (error) {
      console.error('Failed to clone workflow:', error);
      alert('Failed to clone workflow. Please try again.');
    } finally {
      setIsCloning(false);
    }
  };

  return (
    <Card
      className="group hover:shadow-2xl hover:scale-[1.02] transition-all duration-300 cursor-pointer relative overflow-hidden"
      onClick={handlePreview}
    >
      {/* Gradient Overlay for Featured */}
      {workflow.is_featured && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-yellow-400 via-orange-400 to-pink-400" />
      )}

      {/* Thumbnail */}
      <div className="relative aspect-video bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 overflow-hidden">
        {workflow.thumbnail_url ? (
          <img
            src={workflow.thumbnail_url}
            alt={workflow.title}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-6xl opacity-20">⚙️</div>
          </div>
        )}

        {/* Badges */}
        <div className="absolute top-3 left-3 flex gap-2">
          {workflow.is_featured && (
            <Badge className="bg-gradient-to-r from-yellow-400 to-orange-400 text-white border-0">
              <Sparkles className="h-3 w-3 mr-1" />
              Featured
            </Badge>
          )}
          {workflow.is_trending && (
            <Badge className="bg-gradient-to-r from-pink-500 to-rose-500 text-white border-0">
              🔥 Trending
            </Badge>
          )}
        </div>

        {/* Share Button (Always visible on hover) */}
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="secondary"
            size="sm"
            className="h-8 w-8 p-0 rounded-full"
            onClick={handleShare}
          >
            <Share2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="line-clamp-1 group-hover:text-primary transition-colors">
            {workflow.title}
          </CardTitle>
        </div>
        <CardDescription className="line-clamp-2">{workflow.description}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Category Badge */}
        <div>
          <Badge variant="secondary">{workflow.category.replace(/([A-Z])/g, ' $1').trim()}</Badge>
        </div>

        {/* Stats Row */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <Stat icon={Copy} value={formatCount(workflow.clone_count)} label="clones" />
          <Stat icon={Eye} value={formatCount(workflow.view_count)} label="views" />
          {workflow.avg_rating > 0 && (
            <Stat
              icon={Star}
              value={workflow.avg_rating.toFixed(1)}
              label={`(${workflow.total_reviews})`}
              iconClassName="text-yellow-500 fill-yellow-500"
            />
          )}
        </div>

        {/* Value Props */}
        {(workflow.estimated_time_saved > 0 || workflow.estimated_cost_saved > 0) && (
          <div className="flex items-center gap-4 text-sm">
            {workflow.estimated_time_saved > 0 && (
              <div className="flex items-center gap-1 text-green-600">
                <Clock className="h-4 w-4" />
                <span className="font-medium">{workflow.estimated_time_saved}min saved</span>
              </div>
            )}
            {workflow.estimated_cost_saved > 0 && (
              <div className="flex items-center gap-1 text-green-600">
                <DollarSign className="h-4 w-4" />
                <span className="font-medium">${workflow.estimated_cost_saved} saved</span>
              </div>
            )}
          </div>
        )}

        {/* Tags */}
        {workflow.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {workflow.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 bg-secondary/50 text-secondary-foreground text-xs rounded-md"
              >
                {tag}
              </span>
            ))}
            {workflow.tags.length > 3 && (
              <span className="px-2 py-0.5 text-muted-foreground text-xs">
                +{workflow.tags.length - 3} more
              </span>
            )}
          </div>
        )}

        {/* Creator */}
        <div className="flex items-center gap-2 pt-2 border-t">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-sm font-medium">
            {workflow.creator_name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{workflow.creator_name}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(workflow.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Analytics (if enabled) */}
        {showAnalytics && (
          <div className="pt-2 border-t space-y-1 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>Conversion Rate:</span>
              <span className="font-medium">
                {((workflow.clone_count / (workflow.view_count || 1)) * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="gap-2 pt-4">
        <Button
          variant="outline"
          size="sm"
          onClick={handlePreview}
          className="flex-1"
        >
          <Eye className="mr-2 h-4 w-4" />
          Preview
        </Button>
        <Button
          size="sm"
          onClick={handleClone}
          disabled={isCloning}
          className="flex-1"
        >
          <Copy className="mr-2 h-4 w-4" />
          {isCloning ? 'Cloning...' : 'Clone'}
        </Button>
      </CardFooter>
    </Card>
  );
}

interface StatProps {
  icon: React.ComponentType<{ className?: string }>;
  value: string | number;
  label: string;
  iconClassName?: string;
}

function Stat({ icon: Icon, value, label, iconClassName }: StatProps) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className={iconClassName || 'h-4 w-4'} />
      <span className="font-medium">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

function formatCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}
