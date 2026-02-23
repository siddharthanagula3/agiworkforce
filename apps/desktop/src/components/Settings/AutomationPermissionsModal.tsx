import { useEffect, useState } from 'react';
import { AutomationPermissionsSettings } from './AutomationPermissionsSettings';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/Dialog';

export function AutomationPermissionsModal() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    function handleShow(e: Event) {
      const detail = (e as CustomEvent).detail as { message?: string; reason?: string };
      setMessage(detail?.message ?? 'Grant the required permissions to use Agent mode.');
      setReason(detail?.reason ?? '');
      setOpen(true);
    }
    window.addEventListener('agi:show-permissions-dialog', handleShow);
    return () => window.removeEventListener('agi:show-permissions-dialog', handleShow);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Automation Permissions Required</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        {reason && (
          <p className="text-sm text-muted-foreground mb-2">
            Missing permission:{' '}
            <span className="font-medium text-foreground">{reason.replace(/_/g, ' ')}</span>
          </p>
        )}
        <AutomationPermissionsSettings />
      </DialogContent>
    </Dialog>
  );
}
