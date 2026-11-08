import { fillNativeFormBatch } from '../formBatch';
import { pageElementSignature } from '../pageElements';
import { detectJobApplication } from './detector';
import { resolveLeverSelector } from './lever';
import { resolveGreenhouseSelector } from './greenhouse';
import { resolveLinkedInSelector } from './linkedin';
import { resolveAshbySelector, ASHBY_ALWAYS_ESCALATE_KEYS } from './ashby';
import { parseContactAutofillProfile } from './contactProfile';
import { resolveProfileValue } from './filler';

export async function fillApplicationContactBatch(
  value: unknown,
  expectedUrl: string,
  replaceExisting: unknown = false,
) {
  if (typeof replaceExisting !== 'boolean')
    throw new Error('The profile replacement option is invalid.');
  const profile = parseContactAutofillProfile(value);
  if (!profile) throw new Error('The application profile is invalid.');
  if (location.href !== expectedUrl)
    throw new Error('The application page changed before autofill.');
  const startedAt = performance.now();
  const detection = detectJobApplication();
  if (!detection.isJobApplication || !detection.platform)
    throw new Error('No supported job application form was detected.');
  const resolve = {
    lever: resolveLeverSelector,
    greenhouse: resolveGreenhouseSelector,
    linkedin: resolveLinkedInSelector,
    ashby: resolveAshbySelector,
  }[detection.platform];
  let profileFields = Object.entries(profile);
  if (!profile.fullName) {
    const derived = parseContactAutofillProfile({
      fullName: resolveProfileValue(profile, 'fullName'),
    });
    const nameField = resolve('fullName');
    if (
      derived?.fullName &&
      nameField &&
      !profileFields.some(([key]) => resolve(key)?.element === nameField.element)
    ) {
      profileFields = profileFields.filter(
        ([key]) => !['firstName', 'lastName'].includes(key) || resolve(key) !== null,
      );
      profileFields.push(['fullName', derived.fullName]);
    }
  }
  const fields = profileFields.map(([key, text]) => {
    const match = resolve(key);
    return {
      key,
      value: text!,
      selector: match?.selector ?? '',
      element: match?.element ?? null,
      signature: match?.element ? pageElementSignature(match.element) : '',
      selectionRequired: detection.platform === 'ashby' && ASHBY_ALWAYS_ESCALATE_KEYS.has(key),
    };
  });
  const result = await fillNativeFormBatch(fields, expectedUrl, replaceExisting);
  return {
    ...result,
    platform: detection.platform,
    elapsedMs: Math.round(performance.now() - startedAt),
  };
}
