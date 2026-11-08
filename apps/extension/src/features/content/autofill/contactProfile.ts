import type { JobApplicationProfile } from '../../../types';

export const MAX_AUTOFILL_PROFILE_FIELD_CHARS = 2000;

export const CONTACT_PROFILE_FIELDS = {
  firstName: 'First name',
  lastName: 'Last name',
  fullName: 'Full name',
  email: 'Email address',
  phone: 'Phone number',
  locationCity: 'City or current location',
  locationState: 'State or province',
  locationCountry: 'Country',
  linkedinUrl: 'LinkedIn URL',
  githubUrl: 'GitHub URL',
  portfolioUrl: 'Portfolio URL',
  websiteUrl: 'Personal website URL',
  currentCompany: 'Current company',
  currentTitle: 'Current job title',
} satisfies Partial<Record<keyof JobApplicationProfile, string>>;

export type ContactAutofillProfile = Pick<
  JobApplicationProfile,
  keyof typeof CONTACT_PROFILE_FIELDS
>;

export const CONTACT_PROFILE_PARAMETERS = {
  type: 'object',
  description: `Keys: ${Object.keys(CONTACT_PROFILE_FIELDS).join(', ')}.`,
  additionalProperties: {
    type: 'string',
    minLength: 1,
    maxLength: MAX_AUTOFILL_PROFILE_FIELD_CHARS,
  },
  minProperties: 1,
  maxProperties: Object.keys(CONTACT_PROFILE_FIELDS).length,
};

export function parseContactAutofillProfile(value: unknown): ContactAutofillProfile | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (!entries.length) return null;
  for (const [key, field] of entries) {
    if (
      !Object.prototype.hasOwnProperty.call(CONTACT_PROFILE_FIELDS, key) ||
      typeof field !== 'string' ||
      !field.trim() ||
      field.length > MAX_AUTOFILL_PROFILE_FIELD_CHARS
    )
      return null;
    if (
      Array.from(field).some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      )
    )
      return null;
  }
  return Object.fromEntries(entries.map(([key, field]) => [key, (field as string).trim()]));
}
