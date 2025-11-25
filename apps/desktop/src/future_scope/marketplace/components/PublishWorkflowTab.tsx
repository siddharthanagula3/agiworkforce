import { AlertCircle, CheckCircle, Plus, Upload, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Alert } from '../../../components/ui/Alert';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Label } from '../../../components/ui/Label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
import { invoke } from '../../../lib/tauri-mock';
import { useAuthStore } from '../../../stores/authStore';
import { WORKFLOW_CATEGORIES, type WorkflowLicense } from '../../../types/marketplace';
import { useMarketplaceStore } from '../marketplaceStore';

interface UserWorkflow {
  id: string;
  name: string;
  description?: string;
}

export function PublishWorkflowTab() {
  const { publishWorkflow } = useMarketplaceStore();

  const [userWorkflows, setUserWorkflows] = useState<UserWorkflow[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [estimatedTimeSaved, setEstimatedTimeSaved] = useState('');
  const [estimatedCostSaved, setEstimatedCostSaved] = useState('');
  const [license, setLicense] = useState<WorkflowLicense>('cc0');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingWorkflows, setLoadingWorkflows] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadUserWorkflows();
  }, []);

  const loadUserWorkflows = async () => {
    setLoadingWorkflows(true);
    try {
      const userId = useAuthStore.getState().getCurrentUserId();
      const workflows = await invoke<UserWorkflow[]>('get_user_workflows', { userId });
      setUserWorkflows(workflows);
    } catch (error) {
      console.error('Failed to load workflows:', error);
      setError('Failed to load your workflows. Please try again.');
    } finally {
      setLoadingWorkflows(false);
    }
  };

  const handleWorkflowSelect = (workflowId: string) => {
    setSelectedWorkflowId(workflowId);
    const workflow = userWorkflows.find((w) => w.id === workflowId);
    if (workflow) {
      setTitle(workflow.name);
      setDescription(workflow.description || '');
    }
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    // Validation
    if (!selectedWorkflowId) {
      setError('Please select a workflow to publish');
      return;
    }
    if (!title.trim()) {
      setError('Please enter a title');
      return;
    }
    if (!description.trim()) {
      setError('Please enter a description');
      return;
    }
    if (!category) {
      setError('Please select a category');
      return;
    }

    setIsLoading(true);

    try {
      await publishWorkflow({
        workflow_id: selectedWorkflowId,
        title: title.trim(),
        description: description.trim(),
        category: category as any,
        tags,
        thumbnail_url: thumbnailUrl || undefined,
        estimated_time_saved: parseInt(estimatedTimeSaved) || 0,
        estimated_cost_saved: parseFloat(estimatedCostSaved) || 0,
        license,
      });

      setSuccess(true);

      // Reset form
      setSelectedWorkflowId('');
      setTitle('');
      setDescription('');
      setCategory('');
      setTags([]);
      setThumbnailUrl('');
      setEstimatedTimeSaved('');
      setEstimatedCostSaved('');

      // Scroll to success message
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 100);
    } catch (error) {
      console.error('Failed to publish workflow:', error);
      setError('Failed to publish workflow. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Publish a Workflow</CardTitle>
          <CardDescription>
            Share your workflow with the community and help others automate their work
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Success Message */}
          {success && (
            <Alert className="mb-6 bg-green-500/10 border-green-500/20 text-green-600">
              <CheckCircle className="h-4 w-4" />
              <div>
                <p className="font-medium">Workflow published successfully!</p>
                <p className="text-sm">
                  Your workflow is now live in the marketplace. View it in the "My Workflows" tab.
                </p>
              </div>
            </Alert>
          )}

          {/* Error Message */}
          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <p>{error}</p>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Select Workflow */}
            <div className="space-y-2">
              <Label htmlFor="workflow">Select Workflow to Publish *</Label>
              {loadingWorkflows ? (
                <p className="text-sm text-muted-foreground">Loading your workflows...</p>
              ) : userWorkflows.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <div>
                    <p className="font-medium">No workflows found</p>
                    <p className="text-sm">
                      Create a workflow first before publishing to the marketplace.
                    </p>
                  </div>
                </Alert>
              ) : (
                <Select value={selectedWorkflowId} onValueChange={handleWorkflowSelect}>
                  <SelectTrigger id="workflow">
                    <SelectValue placeholder="Choose a workflow..." />
                  </SelectTrigger>
                  <SelectContent>
                    {userWorkflows.map((workflow) => (
                      <SelectItem key={workflow.id} value={workflow.id}>
                        {workflow.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="E.g., 'Automated Customer Support Email Responder'"
                maxLength={100}
                required
              />
              <p className="text-xs text-muted-foreground">{title.length}/100 characters</p>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what your workflow does, how it works, and what problems it solves..."
                rows={5}
                maxLength={500}
                required
              />
              <p className="text-xs text-muted-foreground">{description.length}/500 characters</p>
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label htmlFor="category">Category *</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select a category..." />
                </SelectTrigger>
                <SelectContent>
                  {WORKFLOW_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      <div>
                        <p className="font-medium">{cat.label}</p>
                        <p className="text-xs text-muted-foreground">{cat.description}</p>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tags */}
            <div className="space-y-2">
              <Label htmlFor="tags">Tags</Label>
              <div className="flex gap-2">
                <Input
                  id="tags"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  placeholder="Add tags (e.g., 'email', 'automation', 'crm')"
                />
                <Button type="button" variant="outline" onClick={handleAddTag}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-2">
                      {tag}
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(tag)}
                        className="hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Thumbnail URL */}
            <div className="space-y-2">
              <Label htmlFor="thumbnail">Thumbnail URL (Optional)</Label>
              <Input
                id="thumbnail"
                type="url"
                value={thumbnailUrl}
                onChange={(e) => setThumbnailUrl(e.target.value)}
                placeholder="https://example.com/image.png"
              />
              <p className="text-xs text-muted-foreground">
                Provide a URL to an image that represents your workflow
              </p>
            </div>

            {/* Estimated Value */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="timeSaved">Time Saved (minutes)</Label>
                <Input
                  id="timeSaved"
                  type="number"
                  min="0"
                  value={estimatedTimeSaved}
                  onChange={(e) => setEstimatedTimeSaved(e.target.value)}
                  placeholder="e.g., 30"
                />
                <p className="text-xs text-muted-foreground">
                  How much time does this workflow save per execution?
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="costSaved">Cost Saved ($)</Label>
                <Input
                  id="costSaved"
                  type="number"
                  min="0"
                  step="0.01"
                  value={estimatedCostSaved}
                  onChange={(e) => setEstimatedCostSaved(e.target.value)}
                  placeholder="e.g., 50"
                />
                <p className="text-xs text-muted-foreground">
                  Estimated cost savings per execution
                </p>
              </div>
            </div>

            {/* License */}
            <div className="space-y-2">
              <Label htmlFor="license">License *</Label>
              <Select
                value={license}
                onValueChange={(value) => setLicense(value as WorkflowLicense)}
              >
                <SelectTrigger id="license">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cc0">
                    <div>
                      <p className="font-medium">Public Domain (CC0)</p>
                      <p className="text-xs text-muted-foreground">
                        Anyone can use, modify, and distribute
                      </p>
                    </div>
                  </SelectItem>
                  <SelectItem value="mit">
                    <div>
                      <p className="font-medium">MIT License</p>
                      <p className="text-xs text-muted-foreground">
                        Permissive with attribution required
                      </p>
                    </div>
                  </SelectItem>
                  <SelectItem value="private">
                    <div>
                      <p className="font-medium">Private</p>
                      <p className="text-xs text-muted-foreground">
                        Only cloners can use, no redistribution
                      </p>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Publishing Guidelines */}
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <div>
                <p className="font-medium mb-2">Publishing Guidelines</p>
                <ul className="text-sm space-y-1 list-disc list-inside">
                  <li>Ensure your workflow is tested and working correctly</li>
                  <li>Provide clear, detailed descriptions</li>
                  <li>Use appropriate tags for better discoverability</li>
                  <li>Be respectful and professional</li>
                </ul>
              </div>
            </Alert>

            {/* Submit Button */}
            <Button
              type="submit"
              size="lg"
              disabled={isLoading || loadingWorkflows || userWorkflows.length === 0}
              className="w-full"
            >
              <Upload className="mr-2 h-5 w-5" />
              {isLoading ? 'Publishing...' : 'Publish to Marketplace'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Tips Card */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Tips for Success</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <TipItem
            title="Write a Clear Title"
            description="Use descriptive titles that explain what your workflow does. Avoid jargon."
          />
          <TipItem
            title="Detailed Description"
            description="Explain the problem your workflow solves, how it works, and any prerequisites."
          />
          <TipItem
            title="Use Relevant Tags"
            description="Add 3-5 tags that help users discover your workflow through search."
          />
          <TipItem
            title="Add Value Metrics"
            description="Specify time and cost savings to show the ROI of using your workflow."
          />
          <TipItem
            title="Share It!"
            description="After publishing, share your workflow on social media to get more clones."
          />
        </CardContent>
      </Card>
    </div>
  );
}

interface TipItemProps {
  title: string;
  description: string;
}

function TipItem({ title, description }: TipItemProps) {
  return (
    <div>
      <h4 className="font-medium mb-1">{title}</h4>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
