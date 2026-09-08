import { describe, expect, it } from 'vitest';

import { buildWebCloudAutoRoutingRequest } from './request-processor';

const MODEL = 'agi-auto';
const TASK_TYPE = 'general' as const;

function requestWith(preferences: { usOnly: boolean } | null | undefined) {
  return buildWebCloudAutoRoutingRequest(
    MODEL,
    'max',
    TASK_TYPE,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    preferences,
  );
}

/**
 * `usOnly` is a real provider-exclusion overlay: the policy is in
 * `routing-policies.json`, both the TypeScript and the Rust resolver enforce it,
 * and `/api/me/routing-preferences` has always persisted the user's choice.
 * This builder constructs every real web routing request and never set the
 * field, so the preference reached the database and stopped there.
 *
 * `zeroDataRetentionOnly` is the structurally identical sibling that WAS
 * threaded, which is why the omission reads as an oversight rather than a
 * decision, and why it is asserted here beside it.
 */
describe('the user’s saved routing preference reaches the resolver', () => {
  it('sets usOnly when the user asked for it', () => {
    expect(requestWith({ usOnly: true })).toMatchObject({ usOnly: true });
  });

  it('omits the field entirely when the user did not', () => {
    expect(requestWith({ usOnly: false })).not.toHaveProperty('usOnly');
  });

  it.each([[null], [undefined]])('omits it when no preference was resolved (%s)', (preferences) => {
    expect(requestWith(preferences)).not.toHaveProperty('usOnly');
  });

  it('leaves the rest of the request byte-identical', () => {
    const withoutPreference = requestWith({ usOnly: false });
    const withPreference = requestWith({ usOnly: true });

    expect({ ...withPreference, usOnly: undefined }).toEqual({
      ...withoutPreference,
      usOnly: undefined,
    });
  });

  it('is threaded the same way as its zero-data-retention sibling', () => {
    const zdr = buildWebCloudAutoRoutingRequest(
      MODEL,
      'max',
      TASK_TYPE,
      undefined,
      undefined,
      undefined,
      undefined,
      true,
    );

    expect(zdr).toMatchObject({ zeroDataRetentionOnly: true });
    expect(requestWith({ usOnly: true })).toMatchObject({ usOnly: true });
  });
});
