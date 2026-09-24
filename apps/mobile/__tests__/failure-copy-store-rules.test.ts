import {
  statedWait,
  withFailureReference,
  withoutExternalPurchaseSteering,
} from '../services/failureCopy';

describe('what this app is allowed to say about paying us', () => {
  it('keeps the fact that upgrades are staged and drops the errand off the phone', () => {
    expect(
      withoutExternalPurchaseSteering(
        'Model fixture-model is on the PRO plan, not yours. Choose a model your plan includes. Paid upgrades are opening in stages, so they need an access code or a place on the upgrade waitlist.',
      ),
    ).toBe(
      'Model fixture-model is on the PRO plan, not yours. Choose a model your plan includes. Paid upgrades are opening in stages.',
    );
  });

  it('leaves the advice a reader can act on inside the app untouched', () => {
    const inApp =
      'Auto could not find a model for this request on your plan. Choose a model from the picker.';
    expect(withoutExternalPurchaseSteering(inApp)).toBe(inApp);
  });

  it('names no access code and no waitlist, whatever the gateway sent', () => {
    const rewritten = withoutExternalPurchaseSteering(
      'The Free plan includes the free model only. Select it in the model picker, or use your own provider key. Paid upgrades are opening in stages, so they need an access code or a place on the upgrade waitlist.',
    );
    expect(rewritten).not.toMatch(/access code/i);
    expect(rewritten).not.toMatch(/waitlist/i);
    expect(rewritten).toContain('Paid upgrades are opening in stages.');
  });

  it('never invents the sentence for a failure that had nothing to do with a plan', () => {
    const outage = 'This model is overloaded right now. Try again in a moment.';
    expect(withoutExternalPurchaseSteering(outage)).toBe(outage);
  });
});

describe('the reference and the wait this app repeats', () => {
  it('appends an id only when the server logged one', () => {
    expect(withFailureReference('It failed.', 'req_2b')).toBe('It failed. Reference: req_2b');
    expect(withFailureReference('It failed.', undefined)).toBe('It failed.');
    expect(withFailureReference('It failed.', '')).toBe('It failed.');
  });

  // The thresholds are the web app's, so the same wait does not read as
  // "about 60 minutes" on one surface and "about 1 hour" on another.
  it('states a wait in the unit a reader can hold in their head', () => {
    expect(statedWait(30)).toBe('about 30 seconds');
    expect(statedWait(89)).toBe('about 89 seconds');
    expect(statedWait(90)).toBe('about 2 minutes');
    expect(statedWait(3_600)).toBe('about 60 minutes');
    expect(statedWait(5_400)).toBe('about 2 hours');
    expect(statedWait(-5)).toBeUndefined();
  });
});
