/**
 * The video route's 403 body and the client's paywall detector have to agree on
 * one string, and nothing else forces them to.
 *
 * They disagreed in production: the route used `createError.forbidden(...)`,
 * which emits `ErrorCode.FORBIDDEN`, while `useMediaGeneration` only treats a
 * response as a paywall when it sees `plan_upgrade_required`. The mismatch had
 * no compile-time or runtime signal — the request 403'd correctly, the tier gate
 * worked correctly, and a Basic/Pro user asking for a video simply got a generic
 * "Forbidden" toast instead of the upgrade prompt. The sibling image route had
 * always returned the right shape, so the two media routes behaved differently
 * for the same class of refusal.
 *
 * This is a source-shape check rather than a request test because the failure is
 * a shared-constant mismatch, not behaviour: exercising the route through mocks
 * would assert the route returns what the route says, which is exactly the half
 * that was already self-consistent. Reading both files is what catches drift on
 * either side — rename the client constant and this fails too.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_WEB = join(__dirname, '..', '..');
const VIDEO_ROUTE = join(REPO_WEB, 'app/api/media/video/generate/route.ts');
const IMAGE_ROUTE = join(REPO_WEB, 'app/api/media/image/generate/route.ts');
const PAYWALL_HOOK = join(REPO_WEB, 'lib/hooks/useMediaGeneration.ts');

const PAYWALL_CODE = 'plan_upgrade_required';

describe('media paywall contract', () => {
  it('the client still detects the code the routes emit', () => {
    // If someone renames the sentinel here, both routes go silently generic.
    expect(readFileSync(PAYWALL_HOOK, 'utf8')).toContain(PAYWALL_CODE);
  });

  it.each([
    ['video', VIDEO_ROUTE],
    ['image', IMAGE_ROUTE],
  ])('the %s route returns a paywall-detectable 403 on tier refusal', (_label, path) => {
    const source = readFileSync(path, 'utf8');

    // The gate must exist at all — a route with no capability check would pass a
    // naive "does it mention the code" test while being wide open.
    expect(source).toContain("canUseBillingPlanCapability(userTier, '");
    expect(source).toContain(PAYWALL_CODE);
  });

  it('does not refuse a tier with bare createError.forbidden', () => {
    // The specific regression: `forbidden()` yields ErrorCode.FORBIDDEN, which
    // the client does not recognise as a paywall.
    const video = readFileSync(VIDEO_ROUTE, 'utf8');
    const gateIndex = video.indexOf("canUseBillingPlanCapability(userTier, 'video_generation')");
    expect(gateIndex).toBeGreaterThan(-1);

    // Look only at the refusal branch, not the whole file — createError.forbidden
    // is legitimate elsewhere (tenant mismatch, for one). Match the CALL form
    // with its open paren, so the comment above the branch explaining why we do
    // not call it does not trip this.
    const refusalBranch = video.slice(gateIndex, gateIndex + 1400);
    expect(refusalBranch).not.toContain('createError.forbidden(');
    expect(refusalBranch).toContain(PAYWALL_CODE);
  });

  it('names Max 15x and Enterprise as the plans that unlock video', () => {
    // billing-catalog.ts: video_generation: ['max_15x', 'enterprise'].
    // A message naming Pro would send users to a plan that still cannot do it.
    const video = readFileSync(VIDEO_ROUTE, 'utf8');
    expect(video).toContain("required_plans: ['max_15x', 'enterprise']");
  });
});
