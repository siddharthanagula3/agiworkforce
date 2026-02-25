'use client';

import { Lock } from 'lucide-react';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import type { PlanTier } from './tiers';
import { TIER_LABEL } from './tiers';

interface SubscriptionLockDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  featureName: string;
  requiredTier: PlanTier;
  description?: string;
}

export function SubscriptionLockDialog({
  open,
  onOpenChange,
  featureName,
  requiredTier,
  description,
}: SubscriptionLockDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-700 max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-zinc-800 mx-auto mb-2">
            <Lock className="w-5 h-5 text-zinc-400" aria-hidden="true" />
          </div>
          <DialogTitle className="text-center text-zinc-100">{featureName}</DialogTitle>
          <DialogDescription className="text-center text-zinc-400">
            {description || `This feature requires the ${TIER_LABEL[requiredTier]} plan or higher.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 mt-2">
          <Link href="/pricing" onClick={() => onOpenChange(false)}>
            <Button className="w-full bg-white text-black hover:bg-zinc-200">View Plans</Button>
          </Link>
          <Button
            variant="ghost"
            className="w-full text-zinc-400"
            onClick={() => onOpenChange(false)}
          >
            Maybe Later
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
