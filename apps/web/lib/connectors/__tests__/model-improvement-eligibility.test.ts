import { describe, expect, it } from 'vitest';

import { CONNECTOR_CAPABILITIES } from '../catalog';
import {
  connectorModelImprovementPolicy,
  evaluateModelImprovementEligibility,
  type ModelImprovementEligibilityInput,
} from '../model-improvement-eligibility';

const OPTED_IN: ModelImprovementEligibilityInput = {
  source: 'user_content',
  accountOptIn: true,
  feedbackOptIn: true,
};

describe('connectorModelImprovementPolicy', () => {
  it('answers never for every connector in the catalog until one is named otherwise', () => {
    for (const connectorId of Object.keys(CONNECTOR_CAPABILITIES)) {
      expect(connectorModelImprovementPolicy(connectorId)).toBe('never');
    }
  });

  it('fails closed for a connector it has never heard of', () => {
    expect(connectorModelImprovementPolicy('not-a-connector')).toBe('never');
  });
});

describe('evaluateModelImprovementEligibility', () => {
  it('uses opted-in account content', () => {
    expect(evaluateModelImprovementEligibility(OPTED_IN).eligible).toBe(true);
  });

  it('refuses account content with no opt-in', () => {
    const verdict = evaluateModelImprovementEligibility({ ...OPTED_IN, accountOptIn: false });
    expect(verdict).toMatchObject({ eligible: false, code: 'no_account_opt_in' });
  });

  it('never uses connector content, even for an opted-in account', () => {
    const verdict = evaluateModelImprovementEligibility({
      ...OPTED_IN,
      source: 'connector_content',
      connectorId: 'google-drive',
    });
    expect(verdict).toMatchObject({ eligible: false, code: 'connector_content_not_eligible' });
  });

  it('treats a missing connector id on connector content as not eligible', () => {
    expect(
      evaluateModelImprovementEligibility({
        ...OPTED_IN,
        source: 'connector_content',
        connectorId: null,
      }).eligible,
    ).toBe(false);
  });

  it('gates feedback on its own opt-in, not on the account opt-in', () => {
    expect(
      evaluateModelImprovementEligibility({
        source: 'feedback',
        accountOptIn: false,
        feedbackOptIn: true,
      }).eligible,
    ).toBe(true);

    expect(
      evaluateModelImprovementEligibility({
        source: 'feedback',
        accountOptIn: true,
        feedbackOptIn: false,
      }),
    ).toMatchObject({ eligible: false, code: 'no_feedback_opt_in' });
  });

  it('lets an enterprise policy refuse what the account allowed', () => {
    expect(
      evaluateModelImprovementEligibility({
        ...OPTED_IN,
        organizationPolicy: { allowsModelImprovement: false, zeroDataRetentionOnly: false },
      }),
    ).toMatchObject({ eligible: false, code: 'enterprise_policy_denies' });
  });

  it('treats an absent workspace opinion as no denial', () => {
    expect(
      evaluateModelImprovementEligibility({
        ...OPTED_IN,
        organizationPolicy: { allowsModelImprovement: null, zeroDataRetentionOnly: false },
      }).eligible,
    ).toBe(true);
  });

  it('puts zero data retention ahead of every other answer', () => {
    expect(
      evaluateModelImprovementEligibility({
        ...OPTED_IN,
        organizationPolicy: { allowsModelImprovement: true, zeroDataRetentionOnly: true },
      }),
    ).toMatchObject({ eligible: false, code: 'zero_data_retention' });
  });

  it('cannot be re-enabled by a later check once refused', () => {
    const verdict = evaluateModelImprovementEligibility({
      source: 'feedback',
      feedbackOptIn: true,
      accountOptIn: true,
      organizationPolicy: { allowsModelImprovement: false, zeroDataRetentionOnly: false },
    });
    expect(verdict.eligible).toBe(false);
  });
});
