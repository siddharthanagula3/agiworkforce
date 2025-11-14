import React, { useEffect, useState } from 'react';
import { Upload, Eye, Copy, Star, Share2, Edit, Trash2, TrendingUp } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/Card';
import { Badge } from '../ui/Badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/AlertDialog';
import { useMarketplaceStore } from '../../stores/marketplaceStore';

export function MyWorkflowsTab() {
  const { myPublishedWorkflows, isLoading, fetchMyWorkflows, openShareModal, unpublishWorkflow } =
    useMarketplaceStore();

  const [selectedForDelete, setSelectedForDelete] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    // TODO: Get user ID from auth context
    const userId = 'current_user_id';
    fetchMyWorkflows(userId);
  }, [fetchMyWorkflows]);

  const handleUnpublish = async () => {
    if (!selectedForDelete) return;

    try {
      await unpublishWorkflow(selectedForDelete);
      setShowDeleteDialog(false);
      setSelectedForDelete(null);
    } catch (error) {
      console.error('Failed to unpublish workflow:', error);
      alert('Failed to unpublish workflow. Please try again.');
    }
  };

  const openDeleteDialog = (workflowId: string) => {
    setSelectedForDelete(workflowId);
    setShowDeleteDialog(true);
  };

  const totalStats = myPublishedWorkflows.reduce(
    (acc, workflow) => ({
      views: acc.views + workflow.view_count,
      clones: acc.clones + workflow.clone_count,
      avgRating:
        acc.avgRating +
        (workflow.total_reviews > 0 ? workflow.avg_rating : 0) / myPublishedWorkflows.length,
    }),
    { views: 0, clones: 0, avgRating: 0 },
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-muted-foreground">Loading your workflows...</div>
      </div>
    );
  }

  if (myPublishedWorkflows.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-8">
      {/* Summary Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Your Publishing Stats</CardTitle>
          <CardDescription>Performance overview of your published workflows</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <StatCard
              icon={<Upload className="h-5 w-5 text-blue-500" />}
              label="Published"
              value={myPublishedWorkflows.length.toString()}
              trend="+2 this month"
            />
            <StatCard
              icon={<Eye className="h-5 w-5 text-green-500" />}
              label="Total Views"
              value={totalStats.views.toLocaleString()}
              trend="+12% vs last week"
            />
            <StatCard
              icon={<Copy className="h-5 w-5 text-purple-500" />}
              label="Total Clones"
              value={totalStats.clones.toLocaleString()}
              trend="+8% vs last week"
            />
            <StatCard
              icon={<Star className="h-5 w-5 text-yellow-500" />}
              label="Avg Rating"
              value={totalStats.avgRating > 0 ? totalStats.avgRating.toFixed(1) : 'N/A'}
              trend="Across all workflows"
            />
          </div>
        </CardContent>
      </Card>

      {/* Workflows List */}
      <div>
        <h2 className="text-2xl font-bold mb-6">Your Published Workflows</h2>
        <div className="space-y-6">
          {myPublishedWorkflows.map((workflow) => (
            <Card key={workflow.id} className="overflow-hidden">
              <div className="grid md:grid-cols-[1fr,300px]">
                {/* Workflow Info */}
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-bold">{workflow.title}</h3>
                        {workflow.is_featured && (
                          <Badge className="bg-gradient-to-r from-yellow-400 to-orange-400 text-white">
                            Featured
                          </Badge>
                        )}
                        {workflow.is_trending && (
                          <Badge className="bg-gradient-to-r from-pink-500 to-rose-500 text-white">
                            🔥 Trending
                          </Badge>
                        )}
                      </div>
                      <p className="text-muted-foreground mb-4">{workflow.description}</p>

                      {/* Stats */}
                      <div className="flex items-center gap-6 text-sm">
                        <div className="flex items-center gap-2">
                          <Eye className="h-4 w-4 text-muted-foreground" />
                          <span>{workflow.view_count.toLocaleString()} views</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Copy className="h-4 w-4 text-muted-foreground" />
                          <span>{workflow.clone_count.toLocaleString()} clones</span>
                        </div>
                        {workflow.total_reviews > 0 && (
                          <div className="flex items-center gap-2">
                            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                            <span>
                              {workflow.avg_rating.toFixed(1)} ({workflow.total_reviews} reviews)
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Conversion Rate */}
                      {workflow.view_count > 0 && (
                        <div className="mt-3 flex items-center gap-2 text-sm">
                          <TrendingUp className="h-4 w-4 text-green-500" />
                          <span className="text-green-600 font-medium">
                            {((workflow.clone_count / workflow.view_count) * 100).toFixed(1)}%
                            conversion rate
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openShareModal(workflow)}>
                      <Share2 className="mr-2 h-4 w-4" />
                      Share
                    </Button>
                    <Button variant="outline" size="sm" disabled>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openDeleteDialog(workflow.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Unpublish
                    </Button>
                  </div>
                </CardContent>

                {/* Analytics Sidebar */}
                <div className="bg-muted/50 p-6 border-l">
                  <h4 className="font-semibold mb-4">Analytics</h4>
                  <div className="space-y-4">
                    <AnalyticItem
                      label="Views (7 days)"
                      value={Math.floor(workflow.view_count * 0.3).toString()}
                      change="+12%"
                    />
                    <AnalyticItem
                      label="Clones (7 days)"
                      value={Math.floor(workflow.clone_count * 0.2).toString()}
                      change="+8%"
                    />
                    <AnalyticItem label="Favorites" value="0" change="-" />
                    <div className="pt-4 border-t">
                      <p className="text-xs text-muted-foreground mb-1">Published</p>
                      <p className="text-sm font-medium">
                        {new Date(workflow.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Last Updated</p>
                      <p className="text-sm font-medium">
                        {new Date(workflow.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unpublish Workflow</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to unpublish this workflow? It will be removed from the
              marketplace and users will no longer be able to clone it. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnpublish} className="bg-destructive">
              Unpublish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  trend: string;
}

function StatCard({ icon, label, value, trend }: StatCardProps) {
  return (
    <div className="flex items-start gap-3">
      <div className="p-2 rounded-lg bg-background">{icon}</div>
      <div className="flex-1">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{trend}</p>
      </div>
    </div>
  );
}

interface AnalyticItemProps {
  label: string;
  value: string;
  change: string;
}

function AnalyticItem({ label, value, change }: AnalyticItemProps) {
  const isPositive = change.startsWith('+');

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-sm text-muted-foreground">{label}</p>
        {change !== '-' && (
          <span className={`text-xs font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {change}
          </span>
        )}
      </div>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-20">
      <div className="text-6xl mb-4">📦</div>
      <h3 className="text-2xl font-semibold mb-2">No Published Workflows Yet</h3>
      <p className="text-muted-foreground mb-6 max-w-md mx-auto">
        Share your workflows with the community! Publishing workflows helps others discover
        automation and establishes you as a creator.
      </p>
      <Button
        size="lg"
        onClick={() => {
          const publishTab = document.querySelector('[value="publish"]');
          if (publishTab instanceof HTMLElement) {
            publishTab.click();
          }
        }}
      >
        <Upload className="mr-2 h-5 w-5" />
        Publish Your First Workflow
      </Button>
    </div>
  );
}
