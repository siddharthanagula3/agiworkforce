/**
 * How a Managed Cloud request proves which client surface it comes from.
 *
 * A browser-minted Clerk token carries `azp`, the origin Clerk saw mint it, so
 * the web app and the browser extension are bound by their origins. Native
 * apps mint tokens with no origin, so the mobile app asks Clerk for a token
 * from a JWT template that stamps the surface claim below; Clerk signs it, and
 * the gateway trusts nothing a caller can type in a header.
 */
export const SURFACE_TOKEN_CLAIM = 'surface';

export const MOBILE_SESSION_TOKEN_TEMPLATE = 'agi-mobile';

export const TEMPLATE_BOUND_SURFACES = ['mobile'] as const;

export type TemplateBoundSurface = (typeof TEMPLATE_BOUND_SURFACES)[number];
