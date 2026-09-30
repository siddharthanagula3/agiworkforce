import { toast } from 'sonner';

export const FINANCE_PAGE_HREF = '/chat/finance';

export function announceBankConnected(navigate: (href: string) => void): void {
  toast.success('Bank accounts connected.', {
    action: {
      label: 'See your finances',
      onClick: () => navigate(FINANCE_PAGE_HREF),
    },
  });
}
