// STB-7 TOMBSTONE — delete this file with `git rm` on a normal checkout.
//
// `addTokensToUserBalance()` POSTed to /api/usage/add-tokens, a route that has
// never existed in apps/web/app/api or the api-gateway, and it had zero
// importers repo-wide. It was the last remnant of the token-pack purchase flow,
// which was removed deliberately: `apps/web/__tests__/billing-waitlist-gate.test.tsx`
// records that "Credit top-ups (Topup.tsx, api/credit-topup, token-pack-purchase's
// buyTokenPack) were removed entirely — the locked product rule is 'no top-ups,
// ever'." Keeping a fulfillment helper for a retired purchase path is what made
// "money in, no tokens out" look like a wiring gap instead of a removed feature.
//
// There is no purchase path to re-point: Stripe cannot take money for a token
// pack because no checkout surface offers one. The honest state is "removed".
export {};
