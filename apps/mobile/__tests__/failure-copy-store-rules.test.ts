import {
  NOT_INCLUDED_IN_PLAN,
  purchaseNeutralRemainder,
  statedWait,
  withFailureReference,
  withoutExternalPurchaseSteering,
} from '../services/failureCopy';
import { NATIVE_PURCHASES_AVAILABLE } from '../src/features/billing/nativePurchaseAvailability';

const PAID_UPGRADE_ACCESS_NOTE =
  'Paid plans carry more capacity. If upgrades are not open to your account yet, the pricing page offers the upgrade waitlist or takes an access code.';

const STEERING_VOCABULARY =
  /upgrade|upgrading|pricing|access code|waitlist|add credits|top up|contact sales|subscribe|paid plan/i;

function sentencesIn(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-Z0-9“"'(])/);
}

function expectWellFormed(text: string) {
  expect(text).not.toMatch(/\s{2}|\s[,.]|,\.|,\s*$|\b(?:or|and),?[.!?]$/);
  for (const sentence of sentencesIn(text)) {
    expect([sentence, /^[A-Z0-9“"'(]/.test(sentence)]).toEqual([sentence, true]);
    expect([sentence, /[.!?]$/.test(sentence)]).toEqual([sentence, true]);
  }
}

describe('what this app is allowed to say about paying us', () => {
  it('is checked against the build that ships, which sells nothing in the app', () => {
    expect(NATIVE_PURCHASES_AVAILABLE).toBe(false);
  });

  it('says a model is not included without naming the plan or the staged upgrades', () => {
    expect(
      withoutExternalPurchaseSteering(
        'Model fixture-model is on the PRO plan, not yours. Choose a model your plan includes. Paid upgrades are opening in stages, so they need an access code or a place on the upgrade waitlist.',
      ),
    ).toBe('Model fixture-model isn’t included in your plan. Choose a model your plan includes.');
  });

  it('replaces the outside top-up errand with where to see the reset', () => {
    expect(
      withoutExternalPurchaseSteering(
        'Usage budget exhausted for this billing period. Upgrade your plan or add credits.',
      ),
    ).toBe(
      'Usage budget exhausted for this billing period. See Usage in Settings for when it resets.',
    );
    expect(
      withoutExternalPurchaseSteering(
        'This request could not be paid for. Top up credits and try again.',
      ),
    ).toBe('This request could not be paid for. See Usage in Settings for when it resets.');
  });

  it('leaves the advice a reader can act on inside the app untouched', () => {
    const inApp =
      'Auto could not find a model for this request on your plan. Choose a model from the picker.';
    expect(withoutExternalPurchaseSteering(inApp)).toBe(inApp);
  });

  it('names no access code and no waitlist, whatever the gateway sent', () => {
    const rewritten = withoutExternalPurchaseSteering(
      'The Free plan includes the free models only. Select one in the model picker, or use your own provider key. Paid upgrades are opening in stages, so they need an access code or a place on the upgrade waitlist.',
    );
    expect(rewritten).not.toMatch(/access code/i);
    expect(rewritten).not.toMatch(/waitlist/i);
    expect(rewritten).toBe(
      'The Free plan includes the free models only. Select one in the model picker, or use your own provider key.',
    );
  });

  it('never invents the sentence for a failure that had nothing to do with a plan', () => {
    const outage = 'This model is overloaded right now. Try again in a moment.';
    expect(withoutExternalPurchaseSteering(outage)).toBe(outage);
  });

  it('leaves a software upgrade alone, because it is not a purchase', () => {
    for (const sentence of [
      'This authorization was started before an upgrade. Please connect again.',
      'Upgrade this client before uploading a project source.',
    ]) {
      expect(withoutExternalPurchaseSteering(sentence)).toBe(sentence);
    }
  });

  it('falls back to the app’s own sentence when the message was nothing but a purchase', () => {
    const steering =
      'Paid upgrades are opening in stages. Join the waitlist or enter an access code to continue.';
    expect(purchaseNeutralRemainder(steering)).toBe('');
    expect(withoutExternalPurchaseSteering(steering)).toBe(NOT_INCLUDED_IN_PLAN);
    expect(withoutExternalPurchaseSteering('Upgrading raises this limit.')).toBe(
      NOT_INCLUDED_IN_PLAN,
    );
    expect(withoutExternalPurchaseSteering('')).toBe('');
  });

  it('drops a list of plan names instead of leaving half of it behind', () => {
    expect(
      withoutExternalPurchaseSteering(
        'Your plan does not include Deep Research. Upgrade to Premium, Max, Ultra, Team, or Enterprise to use it.',
      ),
    ).toBe('Your plan does not include Deep Research.');
  });

  // Copied from the gateway: apps/web/lib/billing/paid-upgrade-copy.ts and its
  // callers, managed-usage-request-service.ts, tier-unit-quota-service.ts,
  // free-plan-entitlements.ts, schedule-service.ts, attachment-allowance.ts,
  // request-processor.ts, turn-slot.ts, response-builder.ts, media routes,
  // e2b/compute-metering.ts, voice-session-budget.ts, billing/top-up,
  // artifact-completion.ts, mcp-custom-connections.ts and billing-catalog.ts.
  const GATEWAY_MESSAGES: ReadonlyArray<readonly [string, string]> = [
    [
      `You have reached the free usage limit on your account. Try again after it resets, or use your own provider key to keep going. ${PAID_UPGRADE_ACCESS_NOTE}`,
      'You have reached the free usage limit on your account. Try again after it resets, or use your own provider key to keep going.',
    ],
    [
      `No free capacity right now. Try again shortly, or use your own provider key. ${PAID_UPGRADE_ACCESS_NOTE}`,
      'No free capacity right now. Try again shortly, or use your own provider key.',
    ],
    [
      `Auto could not find a model for this request on your plan. Choose a model from the picker. ${PAID_UPGRADE_ACCESS_NOTE}`,
      'Auto could not find a model for this request on your plan. Choose a model from the picker.',
    ],
    [
      `The Free plan includes the free models only. Select one in the model picker, or use your own provider key. ${PAID_UPGRADE_ACCESS_NOTE}`,
      'The Free plan includes the free models only. Select one in the model picker, or use your own provider key.',
    ],
    [
      `Model fixture-model is on the Premium plan, not yours. Choose a model your plan includes. ${PAID_UPGRADE_ACCESS_NOTE}`,
      'Model fixture-model isn’t included in your plan. Choose a model your plan includes.',
    ],
    [
      'Usage budget exhausted for this billing period. Upgrade your plan or add credits.',
      'Usage budget exhausted for this billing period. See Usage in Settings for when it resets.',
    ],
    [
      'Your rolling 5-hour usage limit is reached. Wait for earlier usage to leave the window or upgrade for a higher limit.',
      'Your rolling 5-hour usage limit is reached. Wait for earlier usage to leave the window.',
    ],
    [
      'Your rolling weekly usage limit is reached. Wait for earlier usage to leave the window or upgrade for a higher limit.',
      'Your rolling weekly usage limit is reached. Wait for earlier usage to leave the window.',
    ],
    [
      'Your rolling flagship weekly usage limit is reached. Choose a standard model, wait for earlier usage to leave the window, or upgrade for a higher limit.',
      'Your rolling flagship weekly usage limit is reached. Choose a standard model or wait for earlier usage to leave the window.',
    ],
    [
      'Your plan’s monthly video generation allowance is used up. Wait for the next month or upgrade for more video seconds.',
      'Your plan’s monthly video generation allowance is used up. Wait for the next month.',
    ],
    [
      'Your plan’s monthly voice allowance is used up. Wait for the next month or upgrade for more voice minutes.',
      'Your plan’s monthly voice allowance is used up. Wait for the next month.',
    ],
    [
      'Your plan’s monthly computer use allowance is used up. Wait for the next month or upgrade for a higher limit.',
      'Your plan’s monthly computer use allowance is used up. Wait for the next month.',
    ],
    [
      'Free accounts can save 1,000 messages a day, and today’s are used up. Save more after midnight UTC, or upgrade for a higher limit.',
      'Free accounts can save 1,000 messages a day, and today’s are used up. Save more after midnight UTC.',
    ],
    [
      'Free accounts can start 100 conversations a day, and today’s are used up. Start more after midnight UTC, or upgrade for a higher limit.',
      'Free accounts can start 100 conversations a day, and today’s are used up. Start more after midnight UTC.',
    ],
    [
      'Free accounts can download 25 MB of files a day, and today’s allowance is used up. Download more after midnight UTC, or upgrade for a higher limit.',
      'Free accounts can download 25 MB of files a day, and today’s allowance is used up. Download more after midnight UTC.',
    ],
    [
      'Free accounts can send 10 emails a day, and today’s are used up. Send more after midnight UTC, or upgrade for a higher limit.',
      'Free accounts can send 10 emails a day, and today’s are used up. Send more after midnight UTC.',
    ],
    [
      'Free accounts can run 200 semantic searches of their files and chats a day, and today’s are used up. Results use keyword matching until midnight UTC, or upgrade for a higher limit.',
      'Free accounts can run 200 semantic searches of their files and chats a day, and today’s are used up. Results use keyword matching until midnight UTC.',
    ],
    [
      'Downloads return on 2026-12-01, or upgrade for a higher limit.',
      'Downloads return on 2026-12-01.',
    ],
    [
      'Free accounts include 1 GB of file storage, shared by your Library and project sources. Delete a file or upgrade to add another.',
      'Free accounts include 1 GB of file storage, shared by your Library and project sources. Delete a file.',
    ],
    [
      'Your Free plan includes 1 project folder. Upgrade your plan to add more, or delete an existing folder to make room.',
      'Your Free plan includes 1 project folder. Delete an existing folder to make room.',
    ],
    [
      'Free accounts can add up to 1 custom connector. Remove one or upgrade to add another.',
      'Free accounts can add up to 1 custom connector. Remove one.',
    ],
    [
      'Free plans can have up to 1 scheduled task. Delete one or upgrade to add another.',
      'Free plans can have up to 1 scheduled task. Delete one.',
    ],
    [
      'Free accounts can upload 10 files a day, and today’s are used. Upload more after midnight UTC, or upgrade for more.',
      'Free accounts can upload 10 files a day, and today’s are used. Upload more after midnight UTC.',
    ],
    [
      'Deep Research is available on Premium, Max, Ultra, Team, and Enterprise plans. Upgrade your plan to use it.',
      'Deep Research isn’t included in your plan.',
    ],
    [
      'Video generation is available on Ultra and Enterprise plans. Upgrade your plan and I can create that video for you.',
      'Video generation isn’t included in your plan.',
    ],
    [
      'Your plan does not include Video generation. Upgrade to Ultra or Enterprise to use it.',
      'Your plan does not include Video generation.',
    ],
    [
      'This request could not be paid for. Top up credits and try again.',
      'This request could not be paid for. See Usage in Settings for when it resets.',
    ],
    [
      'Your plan allows 1 response at a time and one is already running. Stop a running response or wait for it to finish, then send this message again. Upgrading raises this limit.',
      'Your plan allows 1 response at a time and one is already running. Stop a running response or wait for it to finish, then send this message again.',
    ],
    [
      'Your plan does not include concurrent managed responses. Upgrade to send this message.',
      'Your plan does not include concurrent managed responses.',
    ],
    [
      "Voice needs usage your plan doesn't include. Upgrade to talk with voice, or continue in text.",
      "Voice needs usage your plan doesn't include. Continue in text.",
    ],
    [
      'No charge was made. Upgrade your plan for more included usage, or contact support.',
      'No charge was made. Contact support.',
    ],
    [
      'This plan’s daily AGI Code spending ceiling is reached. Wait for earlier usage to leave the 24-hour window or upgrade for a higher ceiling.',
      'This plan’s daily AGI Code spending ceiling is reached. Wait for earlier usage to leave the 24-hour window.',
    ],
    [
      'Your Free usage cannot cover sandbox time right now. It refills as earlier usage leaves the window, or upgrade for a higher limit.',
      'Your Free usage cannot cover sandbox time right now. It refills as earlier usage leaves the window.',
    ],
    [
      'Your plan does not include AI responses in apps. Upgrade to use this part of the app.',
      'Your plan does not include AI responses in apps.',
    ],
    [
      'No active subscription found. Please subscribe to use video generation.',
      'No active subscription found.',
    ],
    [
      'That server exposes 40 tools, above the 10-tool limit for Free plans. Upgrade to attach it.',
      'That server exposes 40 tools, above the 10-tool limit for Free plans.',
    ],
    [
      'You have reached the current free usage limit. Upgrade for more hosted capacity.',
      'You have reached the current free usage limit.',
    ],
    [
      'That model requires a paid plan. Choose a free model or upgrade.',
      'That model isn’t included in your plan. Choose a free model.',
    ],
    [
      'You have used your rolling 5-hour capacity. It refills as earlier usage leaves the window, or upgrade for a higher limit.',
      'You have used your rolling 5-hour capacity. It refills as earlier usage leaves the window.',
    ],
    [
      'You have used your weekly capacity for the most capable models. Choose a standard model, wait for capacity to refill, or upgrade.',
      'You have used your weekly capacity for the most capable models. Choose a standard model or wait for capacity to refill.',
    ],
    [
      'Your plan usage for this billing period is used up. Upgrade or wait for the reset.',
      'Your plan usage for this billing period is used up. Wait for the reset.',
    ],
  ];

  it.each(GATEWAY_MESSAGES)('keeps what happened and drops the purchase in %j', (sent, kept) => {
    const shown = withoutExternalPurchaseSteering(sent);
    expect(shown).not.toMatch(STEERING_VOCABULARY);
    expect(shown).toBe(kept);
    expectWellFormed(shown);
  });
});

describe('a build that sells plans in the app', () => {
  function filterWithNativePurchases(): typeof import('../services/failureCopy') {
    let loaded: typeof import('../services/failureCopy') | undefined;
    jest.isolateModules(() => {
      jest.doMock('@/src/features/billing/nativePurchaseAvailability', () => ({
        NATIVE_PURCHASES_AVAILABLE: true,
      }));
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      loaded = require('../services/failureCopy') as typeof import('../services/failureCopy');
    });
    if (!loaded) throw new Error('failureCopy did not load');
    return loaded;
  }

  it('keeps the in-app upgrade facts and still names no errand off the phone', () => {
    const { withoutExternalPurchaseSteering: filtered } = filterWithNativePurchases();

    expect(
      filtered(
        'Model fixture-model is on the PRO plan, not yours. Choose a model your plan includes. Paid upgrades are opening in stages, so they need an access code or a place on the upgrade waitlist.',
      ),
    ).toBe(
      'Model fixture-model is on the PRO plan, not yours. Choose a model your plan includes. Paid upgrades are opening in stages.',
    );
    const freeLimit = filtered(
      `You have reached the free usage limit on your account. Try again after it resets, or use your own provider key to keep going. ${PAID_UPGRADE_ACCESS_NOTE}`,
    );
    expect(freeLimit).toBe(
      'You have reached the free usage limit on your account. Try again after it resets, or use your own provider key to keep going. Paid plans carry more capacity.',
    );
    expect(freeLimit).not.toMatch(/pricing|access code|waitlist/i);
    expect(
      filtered(
        'Your rolling 5-hour usage limit is reached. Wait for earlier usage to leave the window or upgrade for a higher limit.',
      ),
    ).toBe(
      'Your rolling 5-hour usage limit is reached. Wait for earlier usage to leave the window or upgrade for a higher limit.',
    );
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
