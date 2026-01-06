import { ArrowRight, CheckCircle, Play, Settings, Share2, Sparkles } from 'lucide-react';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../../components/ui/Dialog';
import { useMarketplaceStore } from '../marketplaceStore';

export function CloneSuccessModal() {
  const { clonedWorkflow, showCloneSuccessModal, closeCloneSuccess, openShareModal } =
    useMarketplaceStore();

  if (!clonedWorkflow) return null;

  const handleRunNow = () => {
    closeCloneSuccess();
    console.log('Running workflow:', clonedWorkflow.id);
  };

  const handleCustomize = () => {
    closeCloneSuccess();
    console.log('Customizing workflow:', clonedWorkflow.id);
  };

  const handleShareMyVersion = () => {
    closeCloneSuccess();
    openShareModal(clonedWorkflow);
  };

  return (
    <Dialog open={showCloneSuccessModal} onOpenChange={closeCloneSuccess}>
      <DialogContent className="max-w-2xl">
        {}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="relative mb-4">
            <div className="absolute inset-0 animate-ping">
              <div className="h-20 w-20 rounded-full bg-green-500/20" />
            </div>
            <div className="relative h-20 w-20 rounded-full bg-linear-to-br from-green-400 to-green-600 flex items-center justify-center">
              <CheckCircle className="h-12 w-12 text-white" />
            </div>
          </div>

          <DialogTitle className="text-3xl mb-2">Workflow Cloned Successfully!</DialogTitle>
          <DialogDescription className="text-lg">
            You now have your own copy of "{clonedWorkflow.title}" ready to use
          </DialogDescription>
        </div>

        {}
        <Card className="p-4 bg-linear-to-br from-primary/5 to-primary/10 border-primary/20 mb-6">
          <div className="flex items-start gap-4">
            {clonedWorkflow.thumbnail_url ? (
              <img
                src={clonedWorkflow.thumbnail_url}
                alt={clonedWorkflow.title}
                className="w-24 h-24 rounded-lg object-cover"
              />
            ) : (
              <div className="w-24 h-24 rounded-lg bg-linear-to-br from-primary/30 to-primary/10 flex items-center justify-center text-4xl">
                ⚙️
              </div>
            )}
            <div className="flex-1">
              <h3 className="font-bold text-lg mb-1">{clonedWorkflow.title}</h3>
              <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                {clonedWorkflow.description}
              </p>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{clonedWorkflow.category}</Badge>
                <span className="text-xs text-muted-foreground">
                  by {clonedWorkflow.creator_name}
                </span>
              </div>
            </div>
          </div>
        </Card>

        {}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
          <Button size="lg" onClick={handleRunNow} className="h-auto py-4">
            <div className="flex flex-col items-center gap-2">
              <Play className="h-6 w-6" />
              <div>
                <p className="font-semibold">Run Now</p>
                <p className="text-xs opacity-80">Execute immediately</p>
              </div>
            </div>
          </Button>
          <Button variant="outline" size="lg" onClick={handleCustomize} className="h-auto py-4">
            <div className="flex flex-col items-center gap-2">
              <Settings className="h-6 w-6" />
              <div>
                <p className="font-semibold">Customize</p>
                <p className="text-xs opacity-80">Edit and configure</p>
              </div>
            </div>
          </Button>
        </div>

        {}
        <Card className="p-4 bg-linear-to-br from-purple-500/10 to-pink-500/10 border-purple-500/20">
          <div className="flex items-start gap-4">
            <div className="shrink-0">
              <div className="h-12 w-12 rounded-full bg-linear-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
            </div>
            <div className="flex-1">
              <h4 className="font-semibold mb-1">Customize and Share Your Version</h4>
              <p className="text-sm text-muted-foreground mb-3">
                After making improvements, publish your version to help the community and gain
                recognition as a creator!
              </p>
              <Button variant="outline" size="sm" onClick={handleShareMyVersion} className="gap-2">
                <Share2 className="h-4 w-4" />
                Share This Workflow
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>

        {}
        <div className="mt-6 p-4 rounded-lg bg-muted/50 border">
          <h4 className="font-semibold mb-3 flex items-center gap-2">
            <span>💡</span>
            Quick Tips
          </h4>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span>
                <strong>Test before using:</strong> Run the workflow with sample data first to
                understand how it works
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span>
                <strong>Customize for your needs:</strong> Adjust settings, triggers, and actions to
                fit your specific use case
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              <span>
                <strong>Leave a review:</strong> Help others by rating and reviewing this workflow
                after using it
              </span>
            </li>
          </ul>
        </div>

        {}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button variant="ghost" onClick={closeCloneSuccess}>
            Close
          </Button>
          <div className="text-sm text-muted-foreground">
            You can find this workflow in your workflows list
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
