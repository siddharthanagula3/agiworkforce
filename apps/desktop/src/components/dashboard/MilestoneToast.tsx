/**
 * MilestoneToast Component
 * Celebration toast when hitting milestones
 */

import { useEffect } from 'react';
import { Trophy, Share2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/Button';
import { useROIStore } from '../../stores/roiStore';
import type { Milestone } from '../../types/roi';

interface MilestoneToastContentProps {
  milestone: Milestone;
  onAcknowledge: () => void;
  onShare: () => void;
}

function MilestoneToastContent({ milestone, onAcknowledge, onShare }: MilestoneToastContentProps) {
  return (
    <div className="flex flex-col gap-3 w-full">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-500" />
          <div>
            <p className="font-semibold text-foreground">Milestone Achieved!</p>
            <p className="text-sm text-muted-foreground">{milestone.message}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={onAcknowledge}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-3 bg-primary/10 rounded-lg">
        <p className="text-sm font-medium text-foreground">
          You've saved <span className="text-primary font-bold">{milestone.value}</span> in total!
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Next milestone: {milestone.nextMilestone}
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          variant="default"
          size="sm"
          className="flex-1"
          onClick={onAcknowledge}
        >
          Awesome!
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex items-center gap-1"
          onClick={onShare}
        >
          <Share2 className="h-3 w-3" />
          Share
        </Button>
      </div>
    </div>
  );
}

export function MilestoneToast() {
  const { unacknowledgedMilestones, acknowledgeMilestone } = useROIStore();

  useEffect(() => {
    // Show toast for each unacknowledged milestone
    unacknowledgedMilestones.forEach((milestone) => {
      const handleAcknowledge = async () => {
        try {
          await acknowledgeMilestone(milestone.id);
          toast.dismiss(milestone.id);
        } catch (error) {
          console.error('Failed to acknowledge milestone:', error);
        }
      };

      const handleShare = () => {
        // Share to Twitter or clipboard
        const shareText = `🎉 Just hit a milestone with AGI Workforce! I've saved ${milestone.value} so far. Next target: ${milestone.nextMilestone}! #Automation #ProductivityWins`;

        if (navigator.share) {
          navigator.share({
            title: 'AGI Workforce Milestone',
            text: shareText,
          }).catch((err) => {
            console.error('Error sharing:', err);
            copyToClipboard(shareText);
          });
        } else {
          // Fallback to Twitter intent or clipboard
          const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
          window.open(twitterUrl, '_blank');
        }

        handleAcknowledge();
      };

      // Show toast with custom component
      toast.custom(
        (t) => (
          <div className="bg-background border border-border rounded-lg shadow-lg p-4 w-[400px]">
            <MilestoneToastContent
              milestone={milestone}
              onAcknowledge={handleAcknowledge}
              onShare={handleShare}
            />
          </div>
        ),
        {
          id: milestone.id,
          duration: 10000, // 10 seconds
          position: 'top-right',
        }
      );
    });
  }, [unacknowledgedMilestones, acknowledgeMilestone]);

  return null; // This component doesn't render anything directly
}

function copyToClipboard(text: string) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(
      () => {
        toast.success('Copied to clipboard!');
      },
      (err) => {
        console.error('Failed to copy:', err);
        toast.error('Failed to copy to clipboard');
      }
    );
  }
}
