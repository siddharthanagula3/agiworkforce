# App Store listing: AGI Mobile (iOS)

AGI Mobile version 1 is a free app with no in-app purchases:
`apps/mobile/src/features/billing/storePurchases.json` sets `"nativePurchases": false`, so the
app shows no purchase, upgrade or price, opens no StoreKit connection and links
to no purchase. The listing describes only what the Free plan includes.

The submission copy lives in one place and this file does not repeat it:

| What                                                                   | Owner                                                                                  |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Name, subtitle, promotional text, keywords, description, What's New    | `apps/mobile/store-listing/LISTING-METADATA-IOS.json`                                  |
| Category, age rating, privacy labels, pricing, export compliance, URLs | `apps/mobile/store-listing/LISTING-METADATA-IOS.json`                                  |
| App Review notes (purchases, Plan screen, external links, permissions) | `apps/mobile/store-listing/REVIEWER-NOTES-IOS.md`                                      |
| Google Play listing and review notes                                   | `apps/mobile/store-listing/LISTING-METADATA-ANDROID.json`, `REVIEWER-NOTES-ANDROID.md` |
| Screenshots and their frames                                           | `apps/mobile/store-listing/screenshots/RUNBOOK.md`                                     |

`apps/mobile/__tests__/ios-store-submission-config.test.ts` holds those files to
the purchase switch, the character limits and the shipped code.

## What the listing must not say

- Anything about buying: plans for sale, credit top-ups, upgrades, subscriptions
  or prices. The app sells nothing in version 1, and App Review 2.3 and 3.1.1 and
  Google Play's Payments and Metadata policies judge the listing against the
  binary.
- A feature outside the Free plan. The Free plan's capabilities come from
  `billingPlanCapabilities('free')` in
  `packages/contracts/types/src/billing-catalog.ts`.
- A feature that ships switched off in `apps/mobile/lib/v1FeatureFlags.ts`.
- A model provider the mobile picker cannot select.

`apps/web/lib/__tests__/public-billing-copy.test.ts` reads this file and fails
if it names a switched-off feature or an unselectable provider, or if a priced
line below drifts from the billing catalog.

## Web plans, for reference only

These plans are sold for the AGI Cloud web product, not in the app. An account
that already holds one gets that plan's access after signing in to AGI Mobile.
None of these lines, names or prices belongs in either store listing.

- Basic, $7/mo.
- Premium, $20/mo.
- Max, $100/mo.
- Ultra, $200/mo.
- Team, $25 per seat/mo, or $240 per seat/yr.
