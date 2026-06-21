/**
 * E2B executor factory — the gated seam where the @e2b SDK binding lives.
 *
 * IMPORTANT (P3 status): the live @e2b sandbox binding is intentionally NOT wired in
 * this change. Provisioning a real `E2B_API_KEY` and verifying a live sandbox
 * round-trip is a founder-gated cut-over step (see
 * docs/plans/e2b-universal-execution-design-2026-06-21.md). Until then this returns
 * null even when the flags are on, so NOTHING silently executes — the router treats a
 * null executor as fail-closed (an explicit error to the model), never a fallback.
 */
import 'server-only';

import type { E2BExecutor } from './types';
import { e2bExecutionEnabled } from './gate';

/**
 * Return a gated E2B executor, or null when E2B execution is disabled/unconfigured or
 * the SDK binding is not yet wired. Fail-closed by construction.
 */
export function getE2BExecutor(): E2BExecutor | null {
  if (!e2bExecutionEnabled()) return null;

  // TODO(p3-cutover): instantiate the @e2b/code-interpreter client with
  // process.env.E2B_API_KEY, configure per-session resource limits (CPU/mem/
  // wall-clock/network), and return an E2BExecutor that proxies runCode/writeFile/
  // createFolder/dispose to the sandbox. Gated behind a verified live round-trip.
  return null;
}
