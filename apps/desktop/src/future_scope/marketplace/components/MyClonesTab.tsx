import { Calendar, Copy, ExternalLink } from 'lucide-react';
import React, { useEffect } from 'react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/Card';
import { invoke } from '../../../lib/tauri-mock';
import { useAuthStore } from '../../../stores/authStore';
import { WORKFLOW_CATEGORIES } from '../../../types/marketplace';

interface ClonedWorkflow {
  clone_id: string;
  workflow_id: string;
  workflow_title: string;
  workflow_description: string;
  category: string;
  creator_name: string;
  cloned_at: number;
  original_clone_count: number;
  original_avg_rating: number;
}

export function MyClonesTab() {
  const [clones, setClones] = React.useState<ClonedWorkflow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  useEffect(() => {
    loadClones();
  }, []);

  const loadClones = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const userId = useAuthStore.getState().getCurrentUserId();
      const userClones = await invoke<ClonedWorkflow[]>('get_user_clones', {
        userId,
      });
      setClones(userClones);
    } catch (err) {
      console.error('Failed to load clones:', err);
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const getCategoryLabel = (categoryValue: string): string => {
    const category = WORKFLOW_CATEGORIES.find((c) => c.value === categoryValue);
    return category?.label || categoryValue;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-muted-foreground">Loading your cloned workflows...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-destructive">Error: {error}</div>
      </div>
    );
  }

  if (clones.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-2">My Cloned Workflows</h2>
        <p className="text-muted-foreground mb-6">
          Workflows you've cloned from the marketplace ({clones.length})
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {clones.map((clone) => (
            <Card key={clone.clone_id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="mb-2">{clone.workflow_title}</CardTitle>
                    <CardDescription>{clone.workflow_description}</CardDescription>
                  </div>
                  <Badge variant="outline">{getCategoryLabel(clone.category)}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Creator Info */}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>By {clone.creator_name}</span>
                  </div>

                  {/* Clone Stats */}
                  <div className="flex items-center gap-6 text-sm">
                    <div className="flex items-center gap-2">
                      <Copy className="h-4 w-4 text-muted-foreground" />
                      <span>{clone.original_clone_count.toLocaleString()} total clones</span>
                    </div>
                    {clone.original_avg_rating > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-yellow-500">★</span>
                        <span>{clone.original_avg_rating.toFixed(1)} rating</span>
                      </div>
                    )}
                  </div>

                  {/* Cloned Date */}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>
                      Cloned on{' '}
                      {new Date(clone.cloned_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" size="sm" disabled>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Open Workflow
                    </Button>
                    <Button variant="outline" size="sm" disabled>
                      View Original
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-20">
      <div className="text-6xl mb-4">
        <Copy className="h-20 w-20 mx-auto text-muted-foreground" />
      </div>
      <h3 className="text-2xl font-semibold mb-2">No cloned workflows yet</h3>
      <p className="text-muted-foreground mb-6 max-w-md mx-auto">
        Browse the marketplace and clone workflows to customize them for your own use. Cloned
        workflows appear in your workflow library for editing and execution.
      </p>
      <Button
        size="lg"
        onClick={() => {
          const discoverTab = document.querySelector('[value="discover"]');
          if (discoverTab instanceof HTMLElement) {
            discoverTab.click();
          }
        }}
      >
        Browse Marketplace
      </Button>
    </div>
  );
}
