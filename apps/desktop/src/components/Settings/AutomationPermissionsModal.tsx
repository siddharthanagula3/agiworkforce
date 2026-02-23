import { useEffect, useState } from 'react';
import { AutomationPermissionsSettings } from './AutomationPermissionsSettings';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/Dialog';

export function AutomationPermissionsModal() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    function handleShow(e: Event) {
      const detail = (e as CustomEvent).detail as { message?: string };
      setMessage(detail?.message ?? 'Grant the required permissions to use Agent mode.');
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
        <AutomationPermissionsSettings />
      </DialogContent>
    </Dialog>
  );
}
