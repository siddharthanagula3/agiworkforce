/**
 * Signing in is the person's job, not the extension's.
 *
 * Three rules follow from that and are enforced here: a credential field is
 * left for the browser's own password manager, an identity-provider hop is part
 * of the flow rather than a navigation that broke, and a second-factor prompt is
 * never dismissed to keep a run moving.
 */

export const CREDENTIAL_FIELD_KINDS = [
  'password',
  'new-password',
  'one-time-code',
  'webauthn',
] as const;

export type CredentialFieldKind = (typeof CREDENTIAL_FIELD_KINDS)[number];

export interface CredentialFieldDescriptor {
  readonly type?: string | null;
  readonly autocomplete?: string | null;
  readonly name?: string | null;
  readonly id?: string | null;
  readonly label?: string | null;
  readonly inputMode?: string | null;
}

const OTP_HINT =
  /\b(otp|one[\s_-]?time|verification[\s_-]?code|passcode|2fa|mfa|totp|auth code)\b/i;
const WEBAUTHN_HINT = /\b(webauthn|passkey|yubikey|fido|(security|hardware)[\s_-]?key)\b/i;
const NEW_PASSWORD_HINT = /\b(new[\s_-]?password|confirm[\s_-]?password|repeat[\s_-]?password)\b/i;

function haystack(field: CredentialFieldDescriptor): string {
  return [field.autocomplete, field.name, field.id, field.label].filter(Boolean).join(' ');
}

export function credentialFieldKind(field: CredentialFieldDescriptor): CredentialFieldKind | null {
  const text = haystack(field);
  const autocomplete = (field.autocomplete ?? '').toLowerCase();

  if (autocomplete.includes('webauthn') || WEBAUTHN_HINT.test(text)) return 'webauthn';
  if (autocomplete.includes('one-time-code') || OTP_HINT.test(text)) return 'one-time-code';
  if (autocomplete.includes('new-password') || NEW_PASSWORD_HINT.test(text)) return 'new-password';
  if (
    (field.type ?? '').toLowerCase() === 'password' ||
    autocomplete.includes('current-password')
  ) {
    return 'password';
  }
  return null;
}

export function isCredentialField(field: CredentialFieldDescriptor): boolean {
  return credentialFieldKind(field) !== null;
}

export const PASSWORD_MANAGER_HANDOFF =
  'This is a sign-in field. AGI does not fill credentials: use your browser or password ' +
  'manager to fill it, then the run continues.';

export const MFA_HANDOFF =
  'This step needs your second factor. AGI will not answer or dismiss it: complete it yourself, ' +
  'and the run continues from there.';

/** Drops every credential field from a fill plan and names what was left alone. */
export function withoutCredentialFields<T extends CredentialFieldDescriptor>(
  fields: readonly T[],
): { fillable: T[]; handedOff: { field: T; kind: CredentialFieldKind }[] } {
  const fillable: T[] = [];
  const handedOff: { field: T; kind: CredentialFieldKind }[] = [];
  for (const field of fields) {
    const kind = credentialFieldKind(field);
    if (kind) handedOff.push({ field, kind });
    else fillable.push(field);
  }
  return { fillable, handedOff };
}

export type NavigationKind = 'same-origin' | 'sso-redirect' | 'sso-return' | 'unrelated-origin';

const SSO_REQUEST_PATHS =
  /\/(oauth2?|authorize|authorization|saml2?|sso|openid|idp|login\/oauth|auth\/realms)(\/|$)/i;
const SSO_REQUEST_PARAMS = ['client_id', 'redirect_uri', 'response_type', 'samlrequest'];
const SSO_RETURN_PARAMS = ['code', 'id_token', 'samlresponse', 'access_token'];

function parse(url: string): URL | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed : null;
  } catch {
    return null;
  }
}

function hasAnyParam(url: URL, names: readonly string[]): boolean {
  const keys = [...url.searchParams.keys()].map((key) => key.toLowerCase());
  const fragment = url.hash.toLowerCase();
  return names.some((name) => keys.includes(name) || fragment.includes(`${name}=`));
}

/**
 * Classifies one navigation. An identity provider is recognised by the shape of
 * the request, never by a list of provider hostnames, so a workspace running its
 * own identity provider is treated the same as a hosted one.
 */
export function classifyNavigation(from: string, to: string): NavigationKind {
  const source = parse(from);
  const target = parse(to);
  if (!source || !target) return 'unrelated-origin';
  if (source.origin === target.origin) return 'same-origin';

  if (SSO_REQUEST_PATHS.test(target.pathname) || hasAnyParam(target, SSO_REQUEST_PARAMS)) {
    return 'sso-redirect';
  }
  if (hasAnyParam(target, SSO_RETURN_PARAMS)) return 'sso-return';
  return 'unrelated-origin';
}

/**
 * Whether a chain of navigations is one sign-in flow that came back where it
 * started. A run that treats each hop as a new site would stop mid sign-in or
 * ask for approval again on the way back.
 */
export function isSsoFlow(chain: readonly string[]): boolean {
  if (chain.length < 3) return false;
  const start = parse(chain[0] ?? '');
  const end = parse(chain[chain.length - 1] ?? '');
  if (!start || !end || start.origin !== end.origin) return false;

  let sawRedirect = false;
  for (let index = 1; index < chain.length; index += 1) {
    const kind = classifyNavigation(chain[index - 1] ?? '', chain[index] ?? '');
    if (kind === 'unrelated-origin') return false;
    if (kind === 'sso-redirect') sawRedirect = true;
  }
  return sawRedirect;
}

export interface MfaSignals {
  readonly fields: readonly CredentialFieldDescriptor[];
  readonly headingText?: string | null;
}

/** True when the page is asking for a second factor of any kind. */
export function isMfaChallenge(signals: MfaSignals): boolean {
  if (
    signals.fields.some((field) => {
      const kind = credentialFieldKind(field);
      return kind === 'one-time-code' || kind === 'webauthn';
    })
  ) {
    return true;
  }
  const heading = signals.headingText ?? '';
  return OTP_HINT.test(heading) || WEBAUTHN_HINT.test(heading);
}
