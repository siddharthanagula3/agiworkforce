import { CONNECTOR_OAUTH_APP_RETURN_URL } from '@agiworkforce/cloud-contracts';

export function connectorAppReturnUrl(params: Readonly<Record<string, string>>): URL {
  const target = new URL(CONNECTOR_OAUTH_APP_RETURN_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value) target.searchParams.set(key, value);
  }
  return target;
}

export function stateOfAuthorizeUrl(authorizeUrl: string): string | null {
  try {
    return new URL(authorizeUrl).searchParams.get('state');
  } catch {
    return null;
  }
}
