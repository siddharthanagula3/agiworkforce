import { UsageLimitBannerContainer } from '@agiworkforce/unified-chat';

interface CapBannerProps {
  hasMessages: boolean;
}

/**
 * Soft cap warning — reuses the auto-wired `UsageLimitBannerContainer`
 * primitive from unified-chat. It only renders when budget usage crosses
 * the SHOW_THRESHOLD (70%) and the user hasn't dismissed this session.
 *
 * The hard-stop (100%) modal lives in `CapModal.tsx`.
 */
export function CapBanner({ hasMessages }: CapBannerProps) {
  return <UsageLimitBannerContainer hasMessages={hasMessages} />;
}
