import { invoke } from '@/lib/tauri-mock';
import { Heart, Trash2 } from 'lucide-react';
import React, { useEffect } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useMarketplaceStore } from '../../stores/marketplaceStore';
import type { PublishedWorkflow } from '../../types/marketplace';
import { Button } from '../ui/Button';
import { WorkflowCard } from './WorkflowCard';

export function MyFavoritesTab() {
  const [favorites, setFavorites] = React.useState<PublishedWorkflow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const { openDetailModal: _openDetailModal } = useMarketplaceStore();

  useEffect(() => {
    loadFavorites();
  }, []);

  const loadFavorites = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const userId = useAuthStore.getState().getCurrentUserId();
      const favoritedWorkflows = await invoke<PublishedWorkflow[]>('get_user_favorites', {
        userId,
      });
      setFavorites(favoritedWorkflows);
    } catch (err) {
      console.error('Failed to load favorites:', err);
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnfavorite = async (workflowId: string) => {
    try {
      const userId = useAuthStore.getState().getCurrentUserId();
      await invoke('unfavorite_workflow', { workflowId, userId });
      setFavorites((prev) => prev.filter((w) => w.id !== workflowId));
    } catch (err) {
      console.error('Failed to unfavorite workflow:', err);
      alert('Failed to unfavorite workflow. Please try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-muted-foreground">Loading your favorites...</div>
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

  if (favorites.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-2">My Favorite Workflows</h2>
        <p className="text-muted-foreground mb-6">
          Workflows you've bookmarked for later ({favorites.length})
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {favorites.map((workflow) => (
            <div key={workflow.id} className="relative group">
              <WorkflowCard workflow={workflow} />
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleUnfavorite(workflow.id)}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-background/95 backdrop-blur"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Remove
              </Button>
            </div>
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
        <Heart className="h-20 w-20 mx-auto text-muted-foreground" />
      </div>
      <h3 className="text-2xl font-semibold mb-2">No favorites yet</h3>
      <p className="text-muted-foreground mb-6 max-w-md mx-auto">
        Start exploring the marketplace and save workflows you'd like to come back to later. Click
        the heart icon on any workflow to add it to your favorites.
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
        Explore Marketplace
      </Button>
    </div>
  );
}
