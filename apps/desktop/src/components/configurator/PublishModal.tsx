import * as React from 'react';
import { Upload, Loader2, CheckCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Label } from '../ui/Label';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/Select';
import { Alert, AlertDescription } from '../ui/Alert';
import { Badge } from '../ui/Badge';
import { useConfiguratorStore } from '../../stores/configuratorStore';

export function PublishModal() {
  const [price, setPrice] = React.useState('0');
  const [tags, setTags] = React.useState('');
  const [category, setCategory] = React.useState('Operations');
  const [publishSuccess, setPublishSuccess] = React.useState(false);

  const publishModalOpen = useConfiguratorStore((state) => state.publishModalOpen);
  const setPublishModalOpen = useConfiguratorStore((state) => state.setPublishModalOpen);
  const isPublishing = useConfiguratorStore((state) => state.isPublishing);
  const publishError = useConfiguratorStore((state) => state.publishError);
  const selectedEmployee = useConfiguratorStore((state) => state.selectedEmployee);
  const employeeName = useConfiguratorStore((state) => state.employeeName);
  const employeeDescription = useConfiguratorStore((state) => state.employeeDescription);
  const publishToMarketplace = useConfiguratorStore((state) => state.publishToMarketplace);

  const handlePublish = async () => {
    if (!selectedEmployee?.id) {
      alert('Please save your employee before publishing');
      return;
    }

    try {
      const tagList = tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      await publishToMarketplace(selectedEmployee.id, parseFloat(price), tagList, category);
      setPublishSuccess(true);
    } catch (error) {
      console.error('Publish failed:', error);
    }
  };

  const handleClose = () => {
    setPublishModalOpen(false);
    setPublishSuccess(false);
    setPrice('0');
    setTags('');
    setCategory('Operations');
  };

  return (
    <Dialog open={publishModalOpen} onOpenChange={setPublishModalOpen}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Publish to Marketplace</DialogTitle>
          <DialogDescription>
            Share your custom employee with the community or sell it on the marketplace
          </DialogDescription>
        </DialogHeader>

        {!publishSuccess ? (
          <>
            <div className="space-y-4 py-4">
              {/* Preview */}
              <div className="rounded-md border p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-semibold">{employeeName}</h3>
                  <Badge>{category}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {employeeDescription || 'No description'}
                </p>
              </div>

              {/* Category */}
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CustomerSupport">Customer Support</SelectItem>
                    <SelectItem value="SalesMarketing">Sales & Marketing</SelectItem>
                    <SelectItem value="Development">Development</SelectItem>
                    <SelectItem value="Operations">Operations</SelectItem>
                    <SelectItem value="PersonalProductivity">Personal Productivity</SelectItem>
                    <SelectItem value="DataAnalysis">Data Analysis</SelectItem>
                    <SelectItem value="ContentCreation">Content Creation</SelectItem>
                    <SelectItem value="Finance">Finance</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Tags */}
              <div className="space-y-2">
                <Label htmlFor="tags">Tags</Label>
                <Input
                  id="tags"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="automation, email, customer-service"
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated tags to help users find your employee
                </p>
              </div>

              {/* Price */}
              <div className="space-y-2">
                <Label htmlFor="price">Monthly Price (USD)</Label>
                <Input
                  id="price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0.00"
                />
                <p className="text-xs text-muted-foreground">
                  Set to 0 for free. You&apos;ll earn 70% of the subscription price.
                </p>
              </div>

              {/* Publishing Guidelines */}
              <Alert>
                <AlertDescription>
                  <p className="mb-2 font-medium">Publishing Guidelines:</p>
                  <ul className="space-y-1 text-xs">
                    <li>• Provide a clear description of what your employee does</li>
                    <li>• Add relevant tags for discoverability</li>
                    <li>• Test thoroughly before publishing</li>
                    <li>• Follow community guidelines</li>
                  </ul>
                </AlertDescription>
              </Alert>

              {/* Error */}
              {publishError && (
                <Alert variant="destructive">
                  <AlertDescription>{publishError}</AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose} disabled={isPublishing}>
                Cancel
              </Button>
              <Button onClick={handlePublish} disabled={isPublishing}>
                {isPublishing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Publishing...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Publish
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          // Success state
          <>
            <div className="py-8 text-center">
              <CheckCircle className="mx-auto mb-4 h-16 w-16 text-green-500" />
              <h3 className="mb-2 text-lg font-semibold">Published Successfully!</h3>
              <p className="text-sm text-muted-foreground">
                Your employee is now live on the marketplace
              </p>
            </div>

            <div className="space-y-4">
              <Alert>
                <AlertDescription>
                  <p className="mb-2 font-medium">Next Steps:</p>
                  <ul className="space-y-1 text-xs">
                    <li>• Share your employee on social media</li>
                    <li>• Respond to user feedback and reviews</li>
                    <li>• Update regularly based on user requests</li>
                    <li>• Monitor analytics and performance</li>
                  </ul>
                </AlertDescription>
              </Alert>
            </div>

            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
