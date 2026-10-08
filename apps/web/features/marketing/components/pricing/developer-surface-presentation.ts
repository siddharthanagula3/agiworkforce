import type { TFunction } from 'i18next';
import {
  isReleased,
  SURFACE_NAMES,
  SURFACE_STATUS,
  type SurfaceId,
  type SurfaceStatusMap,
} from '@/lib/surface-status';

export function pricingSurfaceStatus(
  surface: SurfaceId,
  t: TFunction<'pricing'>,
  statuses: SurfaceStatusMap = SURFACE_STATUS,
): string {
  return isReleased(surface, statuses) ? t('surfaceAvailableNow') : t('models:selector.comingSoon');
}

export function pricingDeveloperSurfaceNote(
  t: TFunction<'pricing'>,
  statuses: SurfaceStatusMap = SURFACE_STATUS,
): string {
  return t('compareDeveloperSurfaceStatus', {
    cli: SURFACE_NAMES.cli,
    cliStatus: pricingSurfaceStatus('cli', t, statuses),
    vscode: SURFACE_NAMES.vscode,
    vscodeStatus: pricingSurfaceStatus('vscode', t, statuses),
  });
}

const MANAGED_CHAT_SURFACES = [
  'web',
  'desktop',
  'mobile',
  'chrome',
] as const satisfies readonly SurfaceId[];

export function pricingManagedChatSurfaceNote(
  t: TFunction<'pricing'>,
  statuses: SurfaceStatusMap = SURFACE_STATUS,
): string | undefined {
  const pending = MANAGED_CHAT_SURFACES.filter((surface) => !isReleased(surface, statuses));
  if (pending.length === 0) return undefined;
  return pending
    .map((surface) =>
      t('localFeature4', {
        surface: SURFACE_NAMES[surface],
        status: pricingSurfaceStatus(surface, t, statuses),
      }),
    )
    .join('; ');
}
