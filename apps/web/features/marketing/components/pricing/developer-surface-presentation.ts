import type { TFunction } from 'i18next';
import { isByokPlanTier, isLocalOnlyPlanTier, type BillingPlanTier } from '@agiworkforce/types';
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

export function pricingDeveloperSurfaceCell(
  plan: BillingPlanTier,
  entitlement: string,
  t: TFunction<'pricing'>,
  statuses: SurfaceStatusMap = SURFACE_STATUS,
): string {
  if (isLocalOnlyPlanTier(plan) || isByokPlanTier(plan)) {
    return t(
      isLocalOnlyPlanTier(plan) ? 'compareLocalDeveloperSurfaces' : 'compareByokDeveloperSurfaces',
      { surface: SURFACE_NAMES.cli, status: pricingSurfaceStatus('cli', t, statuses) },
    );
  }
  if (entitlement !== 'Yes') return entitlement;
  return t('compareManagedDeveloperSurfaces', {
    entitlement,
    cli: SURFACE_NAMES.cli,
    cliStatus: pricingSurfaceStatus('cli', t, statuses),
    vscode: SURFACE_NAMES.vscode,
    vscodeStatus: pricingSurfaceStatus('vscode', t, statuses),
  });
}
