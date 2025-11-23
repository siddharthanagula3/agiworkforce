/**
 * BillingPageDialog Component
 * Dialog wrapper for PricingPage to be used in the main app
 */

import { Dialog, DialogContent } from '../ui/Dialog';
import { PricingPage } from '../../pages/PricingPage';

interface BillingPageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BillingPageDialog({ open, onOpenChange }: BillingPageDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[90vh] w-full p-0 overflow-hidden">
        <div className="h-[90vh]">
          <PricingPage />
        </div>
      </DialogContent>
    </Dialog>
  );
}

