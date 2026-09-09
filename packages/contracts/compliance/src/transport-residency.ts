/**
 * @file Where a request is physically processed, as opposed to who owns the model.
 *
 * These are two different facts and this repository already treats them as two,
 * in `routeAdmissionRejections`: "the VENDOR that owns the model and the
 * TRANSPORT this route dispatches through". `provider-jurisdiction.ts` beside
 * this file answers the first question. This file answers the second.
 *
 * The distinction is not academic. The same model reaches a United States
 * gateway on one subscription tier and the model vendor's own endpoint on
 * another, so a single classification would describe one of those two routes
 * wrongly. "Our data must not leave the United States" is a question about this
 * file; "we do not use Chinese vendors" is a question about the other one.
 *
 * WHAT THIS IS NOT: a complete jurisdiction map. Of the transports this product
 * dispatches through, roughly half publish nothing about where inference runs.
 * A list of everything known to be outside the United States is defensible with
 * today's evidence; a list claiming to place every transport is not, and would
 * be worse than nothing because it would read as authoritative. `UNPUBLISHED`
 * exists so the gap is a value rather than an omission.
 */

export type ProcessingResidency = 'US' | 'NON_US' | 'UNPUBLISHED';

/**
 * Transports a model vendor operates itself, where the vendor is domiciled
 * outside the United States and the endpoint is documented as processing
 * outside it.
 *
 * Verified 2026-09-08 against the catalog's own pricing notes and vendor
 * documentation:
 *   - `deepseek` dispatches to `api.deepseek.com`, processed in China.
 *   - `qwen` dispatches to `dashscope-intl.aliyuncs.com`, Alibaba's Singapore
 *     deployment. The adapter defaulted to the Chinese-mainland
 *     `dashscope.aliyuncs.com` until 2026-08-30.
 *   - `zhipu`, `moonshot` and `minimax` each publish a mainland endpoint and an
 *     "international" one; no vendor document states the international
 *     endpoint's country, so neither is treated as United States processing.
 * The `_anthropic` suffixed entries are the same vendors' Anthropic-protocol
 * endpoints and carry the same answer.
 *
 * Every model reachable through these is also carried by gateways that
 * re-host it, at an identical published price, so excluding these transports
 * costs no capability and no money. That is what makes this list safe to apply
 * before the rest of the map exists.
 */
export const NON_US_VENDOR_TRANSPORTS = Object.freeze([
  'deepseek',
  'deepseek_anthropic',
  'qwen',
  'zhipu',
  'zhipu_anthropic',
  'moonshot',
  'moonshot_anthropic',
  'minimax',
] as const);

export type NonUsVendorTransport = (typeof NON_US_VENDOR_TRANSPORTS)[number];

export function isNonUsVendorTransport(transport: string): transport is NonUsVendorTransport {
  return (NON_US_VENDOR_TRANSPORTS as readonly string[]).includes(transport);
}

/**
 * The residency of a transport, as far as it can be established today.
 *
 * Deliberately answers `UNPUBLISHED` rather than guessing. A caller that must
 * keep processing inside the United States has to decide what an unpublished
 * transport means to it, and that decision belongs to the caller rather than
 * being hidden in a default here.
 */
export function transportResidency(transport: string): ProcessingResidency {
  if (isNonUsVendorTransport(transport)) return 'NON_US';
  return 'UNPUBLISHED';
}
