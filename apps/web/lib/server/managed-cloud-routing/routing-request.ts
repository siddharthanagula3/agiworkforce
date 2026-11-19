import 'server-only';

import {
  DATA_REGIONS,
  DEFAULT_DATA_REGION,
  NON_US_VENDOR_TRANSPORTS,
  allowedDeveloperJurisdictions,
  excludedTransportsFor,
} from '@agiworkforce/compliance';
import {
  modelsPastDeprecationDate,
  observedRouteHealthFromSnapshots,
  resolveAutoRoute,
  type AutoRoutingRequest,
  type RoutingRuntimeState,
  type RoutingTaskType,
  type TaskFamily,
} from '@agiworkforce/routing';
import { admittedHarnessIds } from '@/lib/services/gateway-routing';
import type { ModelAccessPolicy } from '@/lib/services/model-policy-evaluator';
import type { WebCloudRolloutInputs } from '@/lib/services/model-rollout/rollout-routing-inputs';
import type { UserRoutingPreferences } from '@/lib/services/user-routing-preferences';

export const MANAGED_CLOUD_TRUST_MODE = 'managed_cloud';
export const MANAGED_CLOUD_RUNTIME_PROFILE_ID = 'web/cloud-chat';

/**
 * Transports managed routing will not dispatch through.
 *
 * Not a vendor boycott. These are the endpoints the model vendors run
 * themselves, outside the United States, and every model reachable through one
 * is also carried by a gateway that re-hosts it at the same published price,
 * so excluding these transports costs no model, where excluding the models
 * themselves would cost the whole reasoning ladder.
 *
 * This is the home region's answer, which `DATA_REGIONS.us` states as an
 * exclusion set in `@agiworkforce/compliance`. A region that pins processing
 * inside its own territory states an ALLOW set instead, because a transport
 * whose processing location is unpublished cannot be assumed to sit inside it;
 * no such region is provisioned, so nothing selects one here yet.
 */
const EXCLUDED_ROUTE_HOSTS: ReadonlySet<string> = excludedTransportsFor(
  { mode: DATA_REGIONS.us.inferenceRouteSetMode, transports: new Set(NON_US_VENDOR_TRANSPORTS) },
  NON_US_VENDOR_TRANSPORTS,
);

export interface RouteUsageEstimate {
  budgetRemainingCents?: number;
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
  taskFamily?: TaskFamily | null;
}

/**
 * `preferredRouteId` is reorder-only: `resolveAutoRoute` still requires the
 * preferred route to already be admissible for the resolved model, so an
 * exact-model selection can never be steered onto a different model by a stale
 * preference. `currentModelKey`/`previousTaskType` reach the resolver's own
 * session-stickiness gate, which an explicit selection never reaches.
 */
export interface RouteHealthInputs {
  runtimeState?: RoutingRuntimeState | null;
  unfundedRouteIds?: ReadonlySet<string>;
  policyExcludedRouteIds?: ReadonlySet<string>;
  preferredRouteId?: string | null;
  currentModelKey?: string | null;
  previousTaskType?: RoutingTaskType | null;
}

export interface ManagedCloudRequestFields {
  selection: string;
  subscriptionTier: string | undefined;
  taskType: RoutingTaskType;
  usage?: RouteUsageEstimate;
  preferSlots?: readonly string[];
  routeHealth?: RouteHealthInputs;
  availableProviderIds?: ReadonlySet<string>;
  zeroDataRetentionOnly?: boolean;
  zeroDataRetentionProviders?: ReadonlySet<string>;
  organizationPolicy?: ModelAccessPolicy | null;
  usOnly?: boolean;
  rollout?: WebCloudRolloutInputs;
  /** The region this deployment processes in, for a call that carries no rollout inputs. */
  homeRegion?: string | null;
  /**
   * Admission is fail-closed against a pinned region: every candidate must
   * publish it, so a route with no published residency answer is refused.
   */
  residencyRegion?: string | null;
  requiredRouteId?: string | null;
  noTrainingOnly?: boolean;
}

export function buildManagedCloudRoutingRequest(
  fields: ManagedCloudRequestFields,
): AutoRoutingRequest {
  const { usage, routeHealth, rollout, residencyRegion, requiredRouteId } = fields;
  const gatewayFlagHarnessIds = admittedHarnessIds();
  const homeRegion = rollout ? rollout.region : fields.homeRegion;
  const developerJurisdictions = allowedDeveloperJurisdictions(
    residencyRegion ?? homeRegion ?? DEFAULT_DATA_REGION,
  );
  return {
    selection: fields.selection,
    taskType: fields.taskType,
    subscriptionTier: fields.subscriptionTier,
    trustMode: MANAGED_CLOUD_TRUST_MODE,
    runtimeProfileId: MANAGED_CLOUD_RUNTIME_PROFILE_ID,
    retiredModelKeys: modelsPastDeprecationDate(),
    ...(gatewayFlagHarnessIds ? { allowedHarnessIds: gatewayFlagHarnessIds } : {}),
    ...(fields.preferSlots !== undefined && fields.preferSlots.length > 0
      ? { preferSlots: fields.preferSlots }
      : {}),
    ...(usage?.budgetRemainingCents !== undefined
      ? { budgetRemainingCents: usage.budgetRemainingCents }
      : {}),
    ...(usage?.estimatedInputTokens !== undefined
      ? { estimatedInputTokens: usage.estimatedInputTokens }
      : {}),
    ...(usage?.estimatedOutputTokens !== undefined
      ? { estimatedOutputTokens: usage.estimatedOutputTokens }
      : {}),
    ...(usage?.taskFamily !== undefined ? { taskFamily: usage.taskFamily } : {}),
    ...(routeHealth?.runtimeState
      ? {
          runtimeState: routeHealth.runtimeState,
          observedRouteHealth: observedRouteHealthFromSnapshots(
            routeHealth.runtimeState.routeHealthSnapshots,
            routeHealth.unfundedRouteIds,
            routeHealth.policyExcludedRouteIds,
          ),
        }
      : {}),
    ...(routeHealth?.preferredRouteId ? { preferredRouteId: routeHealth.preferredRouteId } : {}),
    ...(requiredRouteId ? { requiredRouteId } : {}),
    ...(routeHealth?.currentModelKey ? { currentModelKey: routeHealth.currentModelKey } : {}),
    ...(routeHealth?.previousTaskType ? { previousTaskType: routeHealth.previousTaskType } : {}),
    ...(fields.availableProviderIds && fields.availableProviderIds.size > 0
      ? { availableProviderIds: fields.availableProviderIds }
      : {}),
    ...(fields.zeroDataRetentionOnly ? { zeroDataRetentionOnly: true } : {}),
    ...(fields.zeroDataRetentionProviders && fields.zeroDataRetentionProviders.size > 0
      ? { zeroDataRetentionProviders: fields.zeroDataRetentionProviders }
      : {}),
    ...(fields.noTrainingOnly ? { noTrainingOnly: true } : {}),
    ...(fields.organizationPolicy ? { organizationPolicy: fields.organizationPolicy } : {}),
    ...(fields.usOnly ? { usOnly: true } : {}),
    ...(residencyRegion ? { residencyRegion } : {}),
    excludedRouteHosts: EXCLUDED_ROUTE_HOSTS,
    ...(developerJurisdictions ? { allowedDeveloperJurisdictions: developerJurisdictions } : {}),
    ...(!rollout && homeRegion ? { region: homeRegion } : {}),
    ...(rollout
      ? {
          requestId: rollout.requestId,
          region: rollout.region,
          capabilitiesInUse: rollout.capabilitiesInUse,
          shadowRequestsToday: rollout.shadowRequestsToday,
          ...(rollout.enableObservedHealthRanking !== undefined
            ? { enableObservedHealthRanking: rollout.enableObservedHealthRanking }
            : {}),
          ...(rollout.enableCanary !== undefined ? { enableCanary: rollout.enableCanary } : {}),
          ...(rollout.enableShadow !== undefined ? { enableShadow: rollout.enableShadow } : {}),
          ...(rollout.canaryCohorts ? { canaryCohorts: rollout.canaryCohorts } : {}),
        }
      : {}),
  };
}

export function buildWebCloudAutoRoutingRequest(
  model: string,
  subscriptionTier: string | undefined,
  taskType: RoutingTaskType,
  usage?: RouteUsageEstimate,
  preferSlots?: readonly string[],
  routeHealth?: RouteHealthInputs,
  availableProviderIds?: ReadonlySet<string>,
  zeroDataRetentionOnly?: boolean,
  zeroDataRetentionProviders?: ReadonlySet<string>,
  organizationPolicy?: ModelAccessPolicy | null,
  userRoutingPreferences?: UserRoutingPreferences | null,
  rollout?: WebCloudRolloutInputs,
  residencyRegion?: string | null,
  requiredRouteId?: string | null,
  noTrainingOnly?: boolean,
): AutoRoutingRequest {
  return buildManagedCloudRoutingRequest({
    selection: model,
    subscriptionTier,
    taskType,
    usage,
    preferSlots,
    routeHealth,
    availableProviderIds,
    zeroDataRetentionOnly,
    zeroDataRetentionProviders,
    organizationPolicy,
    usOnly: userRoutingPreferences?.usOnly === true,
    rollout,
    residencyRegion,
    requiredRouteId,
    noTrainingOnly,
  });
}

/**
 * A workspace sitting in the deployment's own region is served from it by
 * construction, and the excluded transports are that region's own answer about
 * which transports may carry its traffic. A workspace pinned elsewhere is a
 * promise routing has to keep, so only then is its region carried into
 * admission.
 */
export function resolveResidencyRegion(
  workspaceRegion: string | null | undefined,
  deploymentRegion: string | null,
): string | null {
  if (!workspaceRegion) return null;
  return workspaceRegion === deploymentRegion ? null : workspaceRegion;
}

export function resolveWebCloudModelRoute(
  model: string,
  subscriptionTier: string | undefined,
  taskType: RoutingTaskType,
  usage?: RouteUsageEstimate,
  preferSlots?: readonly string[],
  routeHealth?: Omit<RouteHealthInputs, 'unfundedRouteIds' | 'policyExcludedRouteIds'>,
  availableProviderIds?: ReadonlySet<string>,
  zeroDataRetentionOnly?: boolean,
  zeroDataRetentionProviders?: ReadonlySet<string>,
  organizationPolicy?: ModelAccessPolicy | null,
  userRoutingPreferences?: UserRoutingPreferences | null,
  rollout?: WebCloudRolloutInputs,
  residencyRegion?: string | null,
  noTrainingOnly?: boolean,
) {
  return resolveAutoRoute(
    buildWebCloudAutoRoutingRequest(
      model,
      subscriptionTier,
      taskType,
      usage,
      preferSlots,
      routeHealth,
      availableProviderIds,
      zeroDataRetentionOnly,
      zeroDataRetentionProviders,
      organizationPolicy,
      userRoutingPreferences,
      rollout,
      residencyRegion,
      undefined,
      noTrainingOnly,
    ),
  );
}
