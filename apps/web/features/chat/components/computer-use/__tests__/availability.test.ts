import { describe, expect, it } from 'vitest';
import {
  DISCOVERABLE_SURFACE_CAPABILITIES,
  getSurfaceCapabilityAvailability,
  type SourceSurface,
} from '@agiworkforce/types';
import { getTierPolicy } from '@shared/config/llm';
import { COMING_SOON_LABEL, NOTIFY_CTA, SURFACE_STATUS } from '@/lib/marketing-constants';
import {
  COMPUTER_USE_ON_WEB,
  describePlanAllowance,
  evaluateComputerUsePlan,
  listComputerUseExecutors,
  primaryExecutorCta,
} from '../availability';
import { BROWSER_CONTROL_COPY, COMPUTER_USE_CAPABILITY } from '../constants';

describe('computer-use executors', () => {
  it('reads availability from the shared capability contract rather than a local copy', () => {
    expect(COMPUTER_USE_ON_WEB).toEqual(
      getSurfaceCapabilityAvailability(COMPUTER_USE_CAPABILITY, 'web'),
    );
    expect(COMPUTER_USE_ON_WEB.available).toBe(false);
  });

  it('lists every surface the contract says can execute, not just Chrome', () => {
    const { availability } = DISCOVERABLE_SURFACE_CAPABILITIES[COMPUTER_USE_CAPABILITY];
    const expected = (Object.keys(availability) as SourceSurface[]).filter(
      (surface) => availability[surface],
    );

    expect(listComputerUseExecutors().map((executor) => executor.surface)).toEqual(expected);
    expect(expected).toContain('desktop');
  });

  it('pairs each executor with its real shipping status', () => {
    for (const executor of listComputerUseExecutors()) {
      expect(executor.status).toBe(SURFACE_STATUS[executor.surface]);
      expect(executor.shipped).toBe(SURFACE_STATUS[executor.surface] !== COMING_SOON_LABEL);
      expect(executor.label).not.toBe(executor.surface);
    }
  });

  it('sends the user to a client that ships today, not to a waitlist', () => {
    const executors = listComputerUseExecutors();
    const shipped = executors.find((executor) => executor.shipped);
    const cta = primaryExecutorCta(executors);

    expect(shipped).toBeDefined();
    expect(cta.href).toBe(shipped?.href);
    expect(cta.label).toContain(shipped?.label as string);
    expect(cta.label).not.toBe(NOTIFY_CTA.label);
  });

  it('falls back to the notify CTA only when nothing has shipped', () => {
    expect(
      primaryExecutorCta([
        {
          surface: 'chrome',
          label: 'Chrome extension',
          status: COMING_SOON_LABEL,
          shipped: false,
          href: '/chrome-extension',
        },
      ]),
    ).toEqual({ href: NOTIFY_CTA.href, label: NOTIFY_CTA.label });
  });
});

describe('describePlanAllowance', () => {
  it('reads the entitlement from the shared tier policy', () => {
    expect(evaluateComputerUsePlan('free').includedInPlan).toBe(
      getTierPolicy('free').allowComputerUse,
    );
    expect(evaluateComputerUsePlan('max_15x').includedInPlan).toBe(
      getTierPolicy('max').allowComputerUse,
    );
  });

  it('does not read an unloaded plan as a denied one', () => {
    expect(describePlanAllowance(evaluateComputerUsePlan(null, false))).toBe(
      BROWSER_CONTROL_COPY.planUnknown,
    );
  });

  it('says so plainly when the plan excludes computer use', () => {
    expect(describePlanAllowance(evaluateComputerUsePlan('free'))).toBe(
      BROWSER_CONTROL_COPY.planBlocked,
    );
  });

  it('quotes no request limit, because no cap is enforced anywhere', () => {
    const line = describePlanAllowance(evaluateComputerUsePlan('max_15x'));

    expect(line).toBe(BROWSER_CONTROL_COPY.planIncluded);
    expect(line).not.toMatch(/\d/u);
  });
});
