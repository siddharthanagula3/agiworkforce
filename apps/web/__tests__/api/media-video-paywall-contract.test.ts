
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
    expect(readFileSync(PAYWALL_HOOK, 'utf8')).toContain(PAYWALL_CODE);
  });

  it.each([
    ['video', VIDEO_ROUTE],
    ['image', IMAGE_ROUTE],
  ])('the %s route returns a paywall-detectable 403 on tier refusal', (_label, path) => {
    const source = readFileSync(path, 'utf8');

    expect(source).toContain("canUseBillingPlanCapability(userTier, '");
    expect(source).toContain(PAYWALL_CODE);
  });

  it('does not refuse a tier with bare createError.forbidden', () => {
    const video = readFileSync(VIDEO_ROUTE, 'utf8');
    const gateIndex = video.indexOf("canUseBillingPlanCapability(userTier, 'video_generation')");
    expect(gateIndex).toBeGreaterThan(-1);

    const refusalBranch = video.slice(gateIndex, gateIndex + 1400);
    expect(refusalBranch).not.toContain('createError.forbidden(');
    expect(refusalBranch).toContain(PAYWALL_CODE);
  });

  it('names Max 15x and Enterprise as the plans that unlock video', () => {
    const video = readFileSync(VIDEO_ROUTE, 'utf8');
    expect(video).toContain("required_plans: ['max_15x', 'enterprise']");
  });
});
