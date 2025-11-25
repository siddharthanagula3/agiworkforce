import React, { useState} from 'react';
import { X, Copy, Share2, Star, Eye, Clock, DollarSign, Calendar, ThumbsUp } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs';
import { ScrollArea } from '../ui/ScrollArea';
import { Separator } from '../ui/Separator';
import { Textarea } from '../ui/Textarea';
import { useMarketplaceStore } from '../../stores/marketplaceStore';
import { useAuthStore } from '../../stores/authStore';
import type { WorkflowDefinition } from '../../types/workflow';

export function WorkflowDetailModal() {
  const {
    selectedWorkflow,
    workflowReviews,
    showDetailModal,
    closeDetailModal,
    openShareModal,
    cloneWorkflow,
    rateWorkflow,
    showCloneSuccess,
  } = useMarketplaceStore();

  const [activeTab, setActiveTab] = useState('overview');
  const [isCloning, setIsCloning] = useState(false);
  const [userRating, setUserRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  if (!selectedWorkflow) return null;

  const workflowDef = selectedWorkflow.workflow_definition
    ? (JSON.parse(selectedWorkflow.workflow_definition) as WorkflowDefinition)
    : null;

  const handleClone = async () => {
    setIsCloning(true);
    try {
      const userId = useAuthStore.getState().getCurrentUserId();
      const userName = 'Current User';

      await cloneWorkflow({
        workflow_id: selectedWorkflow.id,
        user_id: userId,
        user_name: userName,
      });

      closeDetailModal();
      showCloneSuccess(selectedWorkflow);
    } catch (error) {
      console.error('Failed to clone workflow:', error);
      alert('Failed to clone workflow. Please try again.');
    } finally {
      setIsCloning(false);
    }
  };

  const handleShare = () => {
    openShareModal(selectedWorkflow);
  };

  const handleSubmitReview = async () => {
    if (userRating === 0) {
      alert('Please select a rating');
      return;
    }

    setIsSubmittingReview(true);
    try {
      const userId = useAuthStore.getState().getCurrentUserId();

      await rateWorkflow({
        workflow_id: selectedWorkflow.id,
        user_id: userId,
        rating: userRating,
        review_text: reviewText || undefined,
      });

      setUserRating(0);
      setReviewText('');
      alert('Review submitted successfully!');
    } catch (error) {
      console.error('Failed to submit review:', error);
      alert('Failed to submit review. Please try again.');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  return (
    <Dialog open={showDetailModal} onOpenChange={closeDetailModal}>
      <DialogContent className="max-w-5xl h-[90vh] p-0">
        <div className="flex flex-col h-full">
          {/* Header */}
          <DialogHeader className="px-6 py-4 border-b">
            <div className="flex items-start justify-between">
              <div className="flex-1 pr-8">
                <div className="flex items-center gap-3 mb-2">
                  <DialogTitle className="text-2xl">{selectedWorkflow.title}</DialogTitle>
                  {selectedWorkflow.is_featured && (
                    <Badge className="bg-gradient-to-r from-yellow-400 to-orange-400 text-white">
                      Featured
                    </Badge>
                  )}
                </div>
                <p className="text-muted-foreground">{selectedWorkflow.description}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={closeDetailModal}
                className="flex-shrink-0"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 mt-4">
              <Button onClick={handleClone} disabled={isCloning} size="lg" className="flex-1">
                <Copy className="mr-2 h-5 w-5" />
                {isCloning ? 'Cloning...' : 'Clone Workflow'}
              </Button>
              <Button variant="outline" size="lg" onClick={handleShare}>
                <Share2 className="mr-2 h-5 w-5" />
                Share
              </Button>
            </div>
          </DialogHeader>

          {/* Content */}
          <ScrollArea className="flex-1">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <div className="border-b px-6 sticky top-0 bg-background z-10">
                <TabsList className="h-12">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="steps">Steps</TabsTrigger>
                  <TabsTrigger value="reviews">
                    Reviews ({selectedWorkflow.total_reviews})
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="px-6 py-6">
                {/* Overview Tab */}
                <TabsContent value="overview" className="mt-0 space-y-6">
                  {/* Thumbnail */}
                  {selectedWorkflow.thumbnail_url && (
                    <div className="aspect-video rounded-lg overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5">
                      <img
                        src={selectedWorkflow.thumbnail_url}
                        alt={selectedWorkflow.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard
                      icon={<Copy className="h-5 w-5" />}
                      label="Clones"
                      value={selectedWorkflow.clone_count.toLocaleString()}
                    />
                    <StatCard
                      icon={<Eye className="h-5 w-5" />}
                      label="Views"
                      value={selectedWorkflow.view_count.toLocaleString()}
                    />
                    <StatCard
                      icon={<Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />}
                      label="Rating"
                      value={`${selectedWorkflow.avg_rating.toFixed(1)}/5`}
                    />
                    <StatCard
                      icon={<Calendar className="h-5 w-5" />}
                      label="Published"
                      value={new Date(selectedWorkflow.created_at).toLocaleDateString()}
                    />
                  </div>

                  <Separator />

                  {/* Creator Info */}
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Creator</h3>
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-lg font-medium">
                        {selectedWorkflow.creator_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium">{selectedWorkflow.creator_name}</p>
                        <p className="text-sm text-muted-foreground">Workflow Creator</p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Value Props */}
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Expected Value</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {selectedWorkflow.estimated_time_saved > 0 && (
                        <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                          <Clock className="h-8 w-8 text-green-600" />
                          <div>
                            <p className="text-2xl font-bold text-green-600">
                              {selectedWorkflow.estimated_time_saved} min
                            </p>
                            <p className="text-sm text-muted-foreground">Time Saved</p>
                          </div>
                        </div>
                      )}
                      {selectedWorkflow.estimated_cost_saved > 0 && (
                        <div className="flex items-center gap-3 p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                          <DollarSign className="h-8 w-8 text-green-600" />
                          <div>
                            <p className="text-2xl font-bold text-green-600">
                              ${selectedWorkflow.estimated_cost_saved}
                            </p>
                            <p className="text-sm text-muted-foreground">Cost Saved</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <Separator />

                  {/* Tags */}
                  {selectedWorkflow.tags.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-3">Tags</h3>
                      <div className="flex flex-wrap gap-2">
                        {selectedWorkflow.tags.map((tag) => (
                          <Badge key={tag} variant="secondary">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  <Separator />

                  {/* License */}
                  <div>
                    <h3 className="text-lg font-semibold mb-3">License</h3>
                    <Badge variant="outline">{selectedWorkflow.license.toUpperCase()}</Badge>
                  </div>
                </TabsContent>

                {/* Steps Tab */}
                <TabsContent value="steps" className="mt-0">
                  {workflowDef ? (
                    <div className="space-y-4">
                      <p className="text-muted-foreground">
                        This workflow contains {workflowDef.nodes.length} steps
                      </p>
                      {workflowDef.nodes.map((node, index) => (
                        <div
                          key={node.id}
                          className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex items-start gap-4">
                            <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary font-bold flex-shrink-0">
                              {index + 1}
                            </div>
                            <div className="flex-1">
                              <h4 className="font-semibold mb-1">
                                {node.data?.label || node.type}
                              </h4>
                              <p className="text-sm text-muted-foreground">
                                Type: <Badge variant="secondary">{node.type}</Badge>
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center text-muted-foreground py-8">
                      Workflow steps are not available
                    </p>
                  )}
                </TabsContent>

                {/* Reviews Tab */}
                <TabsContent value="reviews" className="mt-0 space-y-6">
                  {/* Write Review */}
                  <div className="p-4 rounded-lg border bg-card">
                    <h3 className="text-lg font-semibold mb-4">Write a Review</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium mb-2 block">Your Rating</label>
                        <div className="flex gap-2">
                          {[1, 2, 3, 4, 5].map((rating) => (
                            <button
                              key={rating}
                              onClick={() => setUserRating(rating)}
                              className="transition-transform hover:scale-110"
                            >
                              <Star
                                className={`h-8 w-8 ${
                                  rating <= userRating
                                    ? 'text-yellow-500 fill-yellow-500'
                                    : 'text-gray-300'
                                }`}
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium mb-2 block">
                          Review (Optional)
                        </label>
                        <Textarea
                          value={reviewText}
                          onChange={(e) => setReviewText(e.target.value)}
                          placeholder="Share your experience with this workflow..."
                          rows={4}
                        />
                      </div>
                      <Button
                        onClick={handleSubmitReview}
                        disabled={isSubmittingReview || userRating === 0}
                      >
                        {isSubmittingReview ? 'Submitting...' : 'Submit Review'}
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  {/* Reviews List */}
                  <div className="space-y-4">
                    {workflowReviews.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">
                        No reviews yet. Be the first to review!
                      </p>
                    ) : (
                      workflowReviews.map((review) => (
                        <div key={review.id} className="p-4 rounded-lg border bg-card">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center font-medium">
                                {review.user_name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-medium">{review.user_name}</p>
                                <div className="flex items-center gap-1">
                                  {Array.from({ length: 5 }).map((_, i) => (
                                    <Star
                                      key={i}
                                      className={`h-4 w-4 ${
                                        i < review.rating
                                          ? 'text-yellow-500 fill-yellow-500'
                                          : 'text-gray-300'
                                      }`}
                                    />
                                  ))}
                                </div>
                              </div>
                            </div>
                            <span className="text-sm text-muted-foreground">
                              {new Date(review.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          {review.review_text && (
                            <p className="text-muted-foreground mb-2">{review.review_text}</p>
                          )}
                          <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                            <ThumbsUp className="h-4 w-4" />
                            <span>Helpful ({review.helpful_count})</span>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

function StatCard({ icon, label, value }: StatCardProps) {
  return (
    <div className="p-4 rounded-lg border bg-card">
      <div className="flex items-center gap-2 mb-2 text-muted-foreground">{icon}</div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
