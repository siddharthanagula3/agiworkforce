// Middleware re-exported from proxy.ts.
// proxy.ts contains the full implementation (CSP nonce + Supabase session refresh + auth gating).
// Next.js requires middleware to live in middleware.ts at the project root.
export { proxy as default } from './proxy';
export { config } from './proxy';
