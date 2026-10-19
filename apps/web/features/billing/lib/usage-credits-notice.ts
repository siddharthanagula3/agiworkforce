import { toast } from 'sonner';
import { settingsSectionPath } from '@/features/settings/lib/web-settings-sections';

const QUOTA_WARNING_HEADER = 'X-Quota-Warning';
const USAGE_CREDITS_SCOPE = 'usage_credits';
const USAGE_CREDITS_NOTICE_SEEN_KEY = 'agi.usage-credits-notice-seen';

export const USAGE_CREDITS_NOTICE_MESSAGE =
  'Now using usage credits. Your plan limit is reached, so messages are billed to your credits.';

export function isUsageCreditsNotice(header: string | null): boolean {
  if (!header) return false;
  return header
    .split(';')
    .map((part) => part.split('=').map((value) => value.trim()))
    .some(([key, value]) => key === 'scope' && value === USAGE_CREDITS_SCOPE);
}

/** Once per browser session, the way the leaders switch their usage notice to credits. */
export function surfaceUsageCreditsNotice(response: Response): void {
  if (!isUsageCreditsNotice(response.headers.get(QUOTA_WARNING_HEADER))) return;
  try {
    if (window.sessionStorage.getItem(USAGE_CREDITS_NOTICE_SEEN_KEY) === '1') return;
    window.sessionStorage.setItem(USAGE_CREDITS_NOTICE_SEEN_KEY, '1');
  } catch {
    return;
  }
  toast.info(USAGE_CREDITS_NOTICE_MESSAGE, {
    duration: 15_000,
    action: {
      label: 'View usage',
      onClick: () => window.location.assign(settingsSectionPath('usage')),
    },
  });
}
