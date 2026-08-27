import {
  DISCOVERABLE_SURFACE_CAPABILITIES,
  getSurfaceCapabilityAvailability,
  type SourceSurface,
  type SurfaceCapabilityAvailabilityPresentation,
} from '@agiworkforce/types';
import { getTierPolicy } from '@shared/config/llm';
import { COMING_SOON_LABEL, NOTIFY_CTA, SURFACE_STATUS } from '@/lib/marketing-constants';
import {
  BROWSER_CONTROL_COPY,
  BROWSER_CONTROL_SURFACE,
  COMPUTER_USE_CAPABILITY,
  EXECUTOR_LINKS,
  executorCtaLabel,
} from './constants';

export const COMPUTER_USE_ON_WEB: SurfaceCapabilityAvailabilityPresentation =
  getSurfaceCapabilityAvailability(COMPUTER_USE_CAPABILITY, BROWSER_CONTROL_SURFACE);

export interface ComputerUseExecutor {
  surface: SourceSurface;
  label: string;
  status: string;
  shipped: boolean;
  href: string | null;
}

export interface ExecutorCta {
  href: string;
  label: string;
}

export function listComputerUseExecutors(): ComputerUseExecutor[] {
  const { availability } = DISCOVERABLE_SURFACE_CAPABILITIES[COMPUTER_USE_CAPABILITY];
  const labels = COMPUTER_USE_ON_WEB.availableSurfaceLabels;
  return (Object.keys(availability) as SourceSurface[])
    .filter((surface) => availability[surface])
    .map((surface, index) => ({
      surface,
      label: labels[index] ?? surface,
      status: SURFACE_STATUS[surface],
      shipped: SURFACE_STATUS[surface] !== COMING_SOON_LABEL,
      href: EXECUTOR_LINKS[surface] ?? null,
    }));
}

export function primaryExecutorCta(executors: readonly ComputerUseExecutor[]): ExecutorCta {
  const shipped = executors.find((executor) => executor.shipped && executor.href !== null);
  if (!shipped?.href) return { href: NOTIFY_CTA.href, label: NOTIFY_CTA.label };
  return { href: shipped.href, label: executorCtaLabel(shipped.label) };
}

export interface ComputerUsePlan {
  known: boolean;
  includedInPlan: boolean;
}

export function evaluateComputerUsePlan(
  tier: string | null | undefined,
  planKnown = true,
): ComputerUsePlan {
  return { known: planKnown, includedInPlan: getTierPolicy(tier).allowComputerUse === true };
}

export function describePlanAllowance(plan: ComputerUsePlan): string {
  if (!plan.known) return BROWSER_CONTROL_COPY.planUnknown;
  return plan.includedInPlan ? BROWSER_CONTROL_COPY.planIncluded : BROWSER_CONTROL_COPY.planBlocked;
}
