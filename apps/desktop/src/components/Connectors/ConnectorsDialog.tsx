import { Dialog, DialogContent } from '../ui/Dialog';
import { ScrollArea } from '../ui/ScrollArea';
import { ConnectorsGallery } from './ConnectorsGallery';

interface ConnectorsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConnectorsDialog({ open, onOpenChange }: ConnectorsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] p-0 gap-0 overflow-hidden">
        <ScrollArea className="max-h-[85vh] p-6">
          <ConnectorsGallery />
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
