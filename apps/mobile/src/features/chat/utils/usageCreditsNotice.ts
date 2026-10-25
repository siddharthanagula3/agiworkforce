import { create } from 'zustand';

export const QUOTA_WARNING_HEADER = 'X-Quota-Warning';

export const USAGE_CREDITS_NOTICE =
  'Now using usage credits. Your plan limit is reached, so messages are billed to your credits.';

export const USAGE_CREDITS_NOTICE_ACTION = 'View usage';

export const USAGE_CREDITS_NOTICE_ROUTE = '/(app)/settings/cloud-usage';

export function isUsageCreditsNotice(header: string | null | undefined): boolean {
  if (!header) return false;
  return header
    .split(';')
    .map((part) => part.split('=').map((value) => value.trim()))
    .some(([key, value]) => key === 'scope' && value === 'usage_credits');
}

interface UsageCreditsNoticeState {
  shown: boolean;
  told: boolean;
  dismiss: () => void;
}

export const useUsageCreditsNoticeStore = create<UsageCreditsNoticeState>()((set) => ({
  shown: false,
  told: false,
  dismiss: () => set({ shown: false }),
}));

/** Once per app session, as web and the leaders switch their usage notice to credits. */
export function surfaceUsageCreditsNotice(headers: { get(name: string): string | null }): void {
  if (!isUsageCreditsNotice(headers.get(QUOTA_WARNING_HEADER))) return;
  if (useUsageCreditsNoticeStore.getState().told) return;
  useUsageCreditsNoticeStore.setState({ shown: true, told: true });
}
