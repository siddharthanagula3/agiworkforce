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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Lock className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          </div>
          <DialogTitle className="text-center">{featureName}</DialogTitle>
          <DialogDescription className="text-center">
            {description || `This feature requires the ${TIER_LABEL[requiredTier]} plan or higher.`}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 flex flex-col gap-3">
          <Link href="/pricing" onClick={() => onOpenChange(false)}>
            <Button className="w-full">View Plans</Button>
          </Link>
          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={() => onOpenChange(false)}
          >
            Maybe Later
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
