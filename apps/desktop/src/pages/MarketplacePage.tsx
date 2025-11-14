import { useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/Tabs';
import { MarketplaceHero } from '../components/marketplace/MarketplaceHero';
import { DiscoverTab } from '../components/marketplace/DiscoverTab';
import { MyWorkflowsTab } from '../components/marketplace/MyWorkflowsTab';
import { PublishWorkflowTab } from '../components/marketplace/PublishWorkflowTab';
import { MyFavoritesTab } from '../components/marketplace/MyFavoritesTab';
import { MyClonesTab } from '../components/marketplace/MyClonesTab';
import { WorkflowDetailModal } from '../components/marketplace/WorkflowDetailModal';
import { ShareModal } from '../components/marketplace/ShareModal';
import { CloneSuccessModal } from '../components/marketplace/CloneSuccessModal';
import { useMarketplaceStore } from '../stores/marketplaceStore';

export function MarketplacePage() {
  const {
    fetchFeatured,
    fetchTrending,
    fetchMarketplaceStats,
    fetchCategoryCounts,
    fetchPopularTags,
    showDetailModal,
    showShareModal,
    showCloneSuccessModal,
  } = useMarketplaceStore();

  useEffect(() => {
    // Load initial marketplace data
    fetchFeatured();
    fetchTrending();
    fetchMarketplaceStats();
    fetchCategoryCounts();
    fetchPopularTags();
  }, [fetchFeatured, fetchTrending, fetchMarketplaceStats, fetchCategoryCounts, fetchPopularTags]);

  return (
    <div className="flex h-full flex-col bg-background overflow-hidden">
      {/* Hero Section */}
      <MarketplaceHero />

      {/* Main Content with Tabs */}
      <div className="flex-1 overflow-auto">
        <Tabs defaultValue="discover" className="h-full">
          <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
            <div className="container mx-auto px-6">
              <TabsList className="h-12">
                <TabsTrigger value="discover" className="text-base">
                  Discover
                </TabsTrigger>
                <TabsTrigger value="my-workflows" className="text-base">
                  My Workflows
                </TabsTrigger>
                <TabsTrigger value="favorites" className="text-base">
                  My Favorites
                </TabsTrigger>
                <TabsTrigger value="clones" className="text-base">
                  My Clones
                </TabsTrigger>
                <TabsTrigger value="publish" className="text-base">
                  Publish New
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

          <div className="container mx-auto px-6 py-8">
            <TabsContent value="discover" className="mt-0">
              <DiscoverTab />
            </TabsContent>

            <TabsContent value="my-workflows" className="mt-0">
              <MyWorkflowsTab />
            </TabsContent>

            <TabsContent value="favorites" className="mt-0">
              <MyFavoritesTab />
            </TabsContent>

            <TabsContent value="clones" className="mt-0">
              <MyClonesTab />
            </TabsContent>

            <TabsContent value="publish" className="mt-0">
              <PublishWorkflowTab />
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Modals */}
      {showDetailModal && <WorkflowDetailModal />}
      {showShareModal && <ShareModal />}
      {showCloneSuccessModal && <CloneSuccessModal />}
    </div>
  );
}

export default MarketplacePage;
