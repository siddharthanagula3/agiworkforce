import {
  BILLING_PLAN_CAPABILITY_LABELS,
  billingPlanCapabilityPlanLabels,
  CONNECTOR_RELEASE_STATE,
  CONNECTORS_COMING_SOON_MESSAGE,
  connectorsReleased,
  type BillingPlanCapability,
  type ConnectorReleaseState,
} from '@agiworkforce/types';
import {
  isReleased,
  joinSurfaceNames,
  SURFACE_STATUS,
  type SurfaceId,
  type SurfaceStatusMap,
} from '@/lib/surface-status';

export interface ProductReleaseState {
  readonly surfaces: SurfaceStatusMap;
  readonly connectors: ConnectorReleaseState;
}

export const CURRENT_RELEASE_STATE: ProductReleaseState = Object.freeze({
  surfaces: SURFACE_STATUS,
  connectors: CONNECTOR_RELEASE_STATE,
});

const MANAGED_CHAT_SURFACE_PHRASES = {
  web: 'the web',
  desktop: 'desktop',
  mobile: 'mobile',
  chrome: 'Chrome',
} as const satisfies Partial<Record<SurfaceId, string>>;

type ManagedChatSurface = keyof typeof MANAGED_CHAT_SURFACE_PHRASES;

export const MANAGED_CHAT_SURFACES: readonly ManagedChatSurface[] = Object.freeze(
  Object.keys(MANAGED_CHAT_SURFACE_PHRASES) as ManagedChatSurface[],
);

export const DEVELOPER_SURFACES = ['cli', 'vscode'] as const satisfies readonly SurfaceId[];

const SKILLS_WITHOUT_CONNECTORS_LABEL = 'Skills';

function releasedManagedChatSurfaces(release: ProductReleaseState): ManagedChatSurface[] {
  return MANAGED_CHAT_SURFACES.filter((surface) => isReleased(surface, release.surfaces));
}

export function planCapabilityReleased(
  capability: BillingPlanCapability,
  release: ProductReleaseState = CURRENT_RELEASE_STATE,
): boolean {
  switch (capability) {
    case 'managed_chat':
      return releasedManagedChatSurfaces(release).length > 0;
    case 'developer_surfaces':
      return DEVELOPER_SURFACES.some((surface) => isReleased(surface, release.surfaces));
    case 'artifact_connectors':
      return connectorsReleased(release.connectors);
    default:
      return true;
  }
}

export function planCapabilityLabel(
  capability: BillingPlanCapability,
  release: ProductReleaseState = CURRENT_RELEASE_STATE,
): string {
  if (capability === 'managed_chat') {
    const phrases = releasedManagedChatSurfaces(release).map(
      (surface) => MANAGED_CHAT_SURFACE_PHRASES[surface],
    );
    return `Managed Cloud chat on ${joinSurfaceNames(phrases)}`;
  }
  if (capability === 'skills_connectors' && !connectorsReleased(release.connectors)) {
    return SKILLS_WITHOUT_CONNECTORS_LABEL;
  }
  return BILLING_PLAN_CAPABILITY_LABELS[capability];
}

export function connectorFeatureNote(
  release: ProductReleaseState = CURRENT_RELEASE_STATE,
): string | undefined {
  return connectorsReleased(release.connectors) ? undefined : CONNECTORS_COMING_SOON_MESSAGE;
}

export function planCapabilityEntitlementHint(capability: BillingPlanCapability): string {
  return `${planCapabilityLabel(capability)} is available on ${billingPlanCapabilityPlanLabels(capability)}.`;
}
