export const AUTH_LOGIN_PATH = '/login';
export const AUTH_SIGNUP_PATH = '/signup';
export const AUTH_LOGIN_COMPLETE_PATH = '/login/complete';
export const AUTH_SIGNUP_COMPLETE_PATH = '/signup/complete';
export const AUTH_SSO_CALLBACK_PATH = '/auth/sso-callback';
export const AUTH_DESKTOP_SURFACE = 'desktop';

const REDIRECT_PARAM = 'redirectTo';
const SURFACE_PARAM = 'surface';
const AUTH_RETRY_PARAM = 'authRetry';
const AUTH_RETRY_ON = '1';

export interface AuthRouteContext {
  redirectTo: string;
  desktopSurface: boolean;
  authRetry: boolean;
}

function query(entries: readonly (readonly [string, string])[]): string {
  return entries.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
}

function surfaceEntries(context: AuthRouteContext): readonly (readonly [string, string])[] {
  return context.desktopSurface ? [[SURFACE_PARAM, AUTH_DESKTOP_SURFACE]] : [];
}

function retryEntries(context: AuthRouteContext): readonly (readonly [string, string])[] {
  return context.authRetry ? [[AUTH_RETRY_PARAM, AUTH_RETRY_ON]] : [];
}

export function buildLoginUrl(context: AuthRouteContext): string {
  if (!context.desktopSurface) return AUTH_LOGIN_PATH;
  return `${AUTH_LOGIN_PATH}?${query([
    ...surfaceEntries(context),
    [REDIRECT_PARAM, context.redirectTo],
  ])}`;
}

export function buildSignupUrl(context: AuthRouteContext): string {
  if (!context.desktopSurface) return AUTH_SIGNUP_PATH;
  return `${AUTH_SIGNUP_PATH}?${query([
    ...surfaceEntries(context),
    [REDIRECT_PARAM, context.redirectTo],
  ])}`;
}

export function buildLoginCompleteUrl(context: AuthRouteContext): string {
  return `${AUTH_LOGIN_COMPLETE_PATH}?${query([
    [REDIRECT_PARAM, context.redirectTo],
    ...surfaceEntries(context),
    ...retryEntries(context),
  ])}`;
}

export function buildSignUpCompleteUrl(context: AuthRouteContext): string {
  return `${AUTH_SIGNUP_COMPLETE_PATH}?${query([[REDIRECT_PARAM, context.redirectTo]])}`;
}

export function buildSsoCallbackUrl(context: AuthRouteContext): string {
  return `${AUTH_SSO_CALLBACK_PATH}?${query([
    [REDIRECT_PARAM, context.redirectTo],
    ...surfaceEntries(context),
    ...retryEntries(context),
  ])}`;
}

export function readAuthRouteContext(
  params: { redirectTo?: string; next?: string; surface?: string; authRetry?: string },
  redirectTo: string,
): AuthRouteContext {
  return {
    redirectTo,
    desktopSurface: params.surface === AUTH_DESKTOP_SURFACE,
    authRetry: params.authRetry === AUTH_RETRY_ON,
  };
}
