import { PRODUCT_COPYRIGHT_NAME, PRODUCT_NAMES } from './product-names';

export interface AccountSessionLabelFields {
  browser: string | null;
  os?: string | null;
  surface?: string | null;
}

export const HTTP_LIBRARY_AGENTS: ReadonlySet<string> = new Set(['okhttp', 'cfnetwork', 'darwin']);

const APP_SESSION_NAME = `${PRODUCT_COPYRIGHT_NAME} ${PRODUCT_NAMES.mobile}`;

const APP_SESSION_PLATFORMS: ReadonlyMap<string, string> = new Map([
  ['android', 'Android'],
  ['ios', 'iOS'],
]);

export function isAppSession(row: AccountSessionLabelFields): boolean {
  if (row.surface === 'mobile') return true;
  if (row.surface && row.surface !== 'web') return false;
  const agent = row.browser?.trim().split(/[\s/]/)[0]?.toLowerCase();
  return agent !== undefined && HTTP_LIBRARY_AGENTS.has(agent);
}

export function appSessionLabel(row: AccountSessionLabelFields): string {
  const platform = row.os ? APP_SESSION_PLATFORMS.get(row.os) : undefined;
  return platform ? `${APP_SESSION_NAME} on ${platform}` : APP_SESSION_NAME;
}
