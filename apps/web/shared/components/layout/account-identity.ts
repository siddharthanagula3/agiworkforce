export interface AccountIdentity {
  id: string;
  email?: string;
  name?: string;
  profile?: {
    display_name?: string | null;
  };
}

export function resolveAccountIdentity(
  canonicalUser: AccountIdentity | null,
  compatibilityUser: AccountIdentity | null,
  providerUser: AccountIdentity | null = null,
): AccountIdentity | null {
  const primary = canonicalUser ?? compatibilityUser ?? providerUser;
  if (!primary) return null;

  const forPrimaryAccount = (candidate: AccountIdentity | null) =>
    candidate?.id === primary.id ? candidate : null;
  const canonical = forPrimaryAccount(canonicalUser);
  const compatibility = forPrimaryAccount(compatibilityUser);
  const provider = forPrimaryAccount(providerUser);
  const clean = (value: string | null | undefined) => value?.trim() || undefined;
  const canonicalProfileName = clean(canonical?.profile?.display_name);
  const canonicalName = clean(canonical?.name);
  const compatibilityName = clean(compatibility?.name);
  const providerName = clean(provider?.name);
  const isApiFallbackName = (value: string | undefined) => value?.toLowerCase() === 'user';
  const name =
    canonicalProfileName ??
    (isApiFallbackName(canonicalName) ? undefined : canonicalName) ??
    (isApiFallbackName(compatibilityName) ? undefined : compatibilityName) ??
    providerName ??
    canonicalName ??
    compatibilityName;
  const email = clean(canonical?.email) ?? clean(compatibility?.email) ?? clean(provider?.email);

  return {
    id: primary.id,
    ...(name ? { name } : {}),
    ...(email ? { email } : {}),
    ...(canonical?.profile ? { profile: canonical.profile } : {}),
  };
}
