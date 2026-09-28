import { toast } from 'sonner';

export const FINANCE_PAGE_HREF = '/chat/finance';

export function announceBankConnected(): void {
  toast.success('Bank accounts connected.', {
    action: {
      label: 'See your finances',
      onClick: () => window.location.assign(FINANCE_PAGE_HREF),
    },
  });
}
