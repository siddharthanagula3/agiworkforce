# Area 81. Free / Basic / Pro / Max 5x / Max 20x planning structure

28 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S81.01 Versioned plan catalog.
- Should: One plan catalog with a version number drives pricing and checkout, and each subscription records the catalog version it was sold under.
- Status: web done, desktop done
- Code: apps/web/lib/services/entitlement-resolution.ts:249; apps/web/app/api/stripe-webhook/lib/db.ts:773

## S81.02 Free-plan feature bundle.
- Should: The Free plan has a defined bundle (capabilities and limits) that is shown to users and enforced server-side.
- Status: web done, desktop done, mobile done
- Code: apps/web/app/pricing/page.tsx:1170; packages/contracts/types/src/billing-catalog.ts:289; packages/contracts/types/src/billing-catalog.ts:208; apps/web/app/api/media/image/generate/route.ts:223; apps/web/features/chat/components/dialogs/UpgradePlanDialog.tsx:79; apps/mobile/src/features/settings/cloud-billing/index.tsx:51; apps/mobile/src/features/settings/cloud-billing/index.tsx:327; apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:71

## S81.03 Basic-plan feature bundle.
- Should: The Basic plan has a defined, priced bundle (capabilities and limits) shown on pricing and in-app and enforced from the catalog.
- Status: web done, desktop done, mobile done
- Code: apps/web/app/pricing/page.tsx:785; packages/contracts/types/src/billing-catalog.ts:358; packages/contracts/types/src/billing-catalog.ts:213; apps/web/features/chat/components/dialogs/UpgradePlanDialog.tsx:92; apps/web/lib/rate-limit.ts:1234; apps/mobile/src/features/settings/plans/index.tsx:59; apps/mobile/src/features/settings/cloud-billing/index.tsx:398

## S81.04 Pro-plan feature bundle.
- Should: The Pro plan has a defined, priced bundle (capabilities and limits) shown on pricing and in-app and enforced from the catalog.
- Status: web done, desktop done, mobile done
- Code: apps/web/app/pricing/page.tsx:793; packages/contracts/types/src/billing-catalog.ts:369; packages/contracts/types/src/billing-catalog.ts:213; apps/web/features/chat/components/dialogs/UpgradePlanDialog.tsx:92; apps/web/app/api/media/image/generate/route.ts:224; apps/mobile/src/features/settings/plans/index.tsx:59; apps/mobile/src/features/settings/cloud-billing/index.tsx:398

## S81.05 Max 5x feature bundle.
- Should: The Max 5x plan has a defined, priced bundle (capabilities and limits) shown on pricing and in-app and enforced from the catalog.
- Status: web done, desktop done, mobile done
- Code: apps/web/app/pricing/page.tsx:811; packages/contracts/types/src/billing-catalog.ts:380; packages/contracts/types/src/billing-catalog.ts:213; apps/web/features/chat/components/dialogs/UpgradePlanDialog.tsx:92; apps/mobile/src/features/settings/plans/index.tsx:59; apps/mobile/src/features/settings/cloud-billing/index.tsx:398

## S81.06 Max 15x feature bundle.
- Should: The Max 15x plan has a defined, priced bundle (capabilities and limits) shown on pricing and in-app and enforced from the catalog.
- Status: web done, desktop done, mobile done
- Code: apps/web/app/pricing/page.tsx:818; packages/contracts/types/src/billing-catalog.ts:391; packages/contracts/types/src/billing-catalog.ts:213; apps/web/features/chat/components/dialogs/UpgradePlanDialog.tsx:92; apps/mobile/src/features/settings/plans/index.tsx:59; apps/mobile/src/features/settings/cloud-billing/index.tsx:398

## S81.07 Explicit definition of the baseline behind “5x” and “15x.”
- Should: Pricing states what "1x" means: the baseline plan behind 5x/15x and its concrete allowance.
- Status: web done, desktop done, vscode done, chrome unverified
- Code: apps/web/app/pricing/page.tsx:741; apps/web/app/pricing/page.tsx:774; packages/contracts/types/src/managed-usage-limits.ts:139; apps/extension-vscode/src/features/account-auth/planComparison.ts:34; packages/contracts/types/src/managed-usage-limits.ts:178

## S81.08 Explicit identification of the allowance being multiplied.
- Should: Plan copy names exactly which allowance a multiplier scales (e.g. managed-usage credits per 5-hour, weekly and monthly window).
- Status: web done, desktop done, vscode done, chrome unverified
- Code: apps/web/app/pricing/page.tsx:741; apps/web/app/pricing/page.tsx:774; packages/contracts/types/src/managed-usage-limits.ts:160; apps/extension-vscode/src/features/account-auth/planComparison.ts:37; packages/contracts/types/src/managed-usage-limits.ts:178

## S81.09 Separate feature-access differences.
- Should: Plans differ in feature access (not just usage), the differences are listed, and each gate is enforced server-side.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/app/pricing/page.tsx:139; apps/mobile/src/features/settings/plans/index.tsx:44; apps/mobile/src/features/settings/plans/index.tsx:70; apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx:129; packages/contracts/types/src/billing-catalog.ts:247; packages/contracts/types/src/billing-catalog.ts:237; apps/cli/src/plans.rs:123; apps/extension-vscode/src/features/account-auth/planComparison.ts:43

## S81.10 Separate upload-size limits.
- Should: Each plan has its own upload-size limit, stated to users and enforced on upload.
- Status: web missing, desktop missing

## S81.11 Separate storage limits.
- Should: Each plan has its own storage limit, stated to users and enforced when files are added.
- Status: web done, desktop done
- Code: apps/web/app/api/projects/[id]/knowledge-files/route.ts:227

## S81.12 Separate context limits.
- Should: Each plan has its own context-size limit, stated to users and enforced per request.
- Status: web done, desktop done
- Code: packages/contracts/types/src/model-catalog.ts:2959; apps/web/app/pricing/page.tsx:229; apps/web/app/pricing/page.tsx:140

## S81.13 Separate concurrency limits.
- Should: Each plan has its own limit on simultaneous responses, stated to users and enforced per turn.
- Status: web done, desktop done
- Code: apps/web/app/pricing/page.tsx:1258; packages/contracts/types/src/billing-catalog.ts:311; apps/web/lib/rate-limit.ts:1223; apps/web/app/api/llm/v1/chat/completions/lib/turn-slot.ts:35

## S81.14 Separate generation settings.
- Should: Plans differ in generation settings (e.g. reasoning effort, manual model choice), the UI shows the gated options, and the server clamps requests to the plan.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1167; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1031; packages/contracts/types/src/model-catalog.ts:2470; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:531; apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:58; apps/cli/src/tui/widgets/model_picker.rs:563; apps/extension/src/features/cloud-bridge/managedModelPicker.ts:128

## S81.15 Separate per-model caps.
- Should: Plans carry caps specific to a model class (flagship models get their own weekly cap), shown to users and enforced on admission.
- Status: web done, desktop done, mobile done, cli done, vscode done
- Code: apps/web/features/settings/sections/UsageSection.tsx:564; apps/web/lib/services/managed-usage-request-service.ts:410; apps/web/lib/server/managed-usage-policy.ts:16; apps/web/app/pricing/page.tsx:710

## S81.16 Shared versus dedicated usage pools.
- Should: The plan structure states whether usage is pooled across members or dedicated per seat, and the ledger follows that choice.
- Status: web done, desktop done
- Code: apps/web/app/pricing/page.tsx:1021; apps/web/lib/services/entitlement-resolution.ts:142; apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx:165
- Unfinished: web: ['handler'] | desktop: ['handler']

## S81.17 Monthly and annual billing choices.
- Should: Users can choose monthly or annual billing where a plan offers both, with the annual saving shown and checkout charging the chosen cadence.
- Status: web done, desktop done
- Code: apps/web/app/pricing/page.tsx:882; apps/web/app/pricing/page.tsx:1046; apps/web/app/pricing/page.tsx:493; apps/web/app/pricing/page.tsx:727

## S81.18 Trial entitlements.
- Should: A plan can be granted as a time-limited trial that is shown as a trial and ends (reverts or bills) when its period is over.
- Status: web done, desktop done, chrome done
- Code: apps/web/app/api/checkout/route.ts:60; apps/web/app/api/checkout/route.ts:351; apps/web/lib/services/code-trial-expiry.ts:36; apps/web/features/settings/sections/BillingSection.tsx:544; apps/web/app/api/cron/expire-code-trials/route.ts:16

## S81.19 Promotional entitlements.
- Should: Promotional entitlements (promo codes, bonus credits, invite grants) exist, are applied to the account and are visible to the user.
- Status: web done, desktop done
- Code: apps/web/app/api/checkout/route.ts:407; apps/web/app/api/upgrade/route.ts:256; apps/web/features/billing/components/UpgradePromotionCode.tsx:31; apps/web/features/settings/sections/BillingSection.tsx:87; apps/web/features/admin/services/operator-metrics.ts:411

## S81.20 Purchased credit balances.
- Should: Users can buy credit top-ups that form a separate purchased balance, which carries over and is shown apart from the plan allowance.
- Status: web done, desktop done
- Code: apps/web/features/settings/sections/BillingSection.tsx:382; apps/web/features/settings/sections/BillingSection.tsx:942; apps/web/app/api/billing/top-up/route.ts:164; apps/web/app/api/billing/top-up/route.ts:178; apps/web/features/settings/sections/UsageSection.tsx:416

## S81.21 Optional overage.
- Should: Users can opt in to spending purchased credits past a plan limit (overage), off by default, and overage use is accounted separately from the plan windows.
- Status: web done, desktop done
- Code: apps/web/features/settings/sections/BillingSection.tsx:992; apps/web/app/api/billing/overage/route.ts:102; apps/web/db/neon/0281_managed_usage_overage_classification.sql:7

## S81.22 Grandfathered plan versions.
- Should: Subscribers on a retired plan or price keep what they bought (price, plan and allowances) while new buyers are sent to the successor.
- Status: web done, desktop done
- Code: packages/contracts/types/src/managed-usage-limits.ts:92; apps/web/app/api/stripe-webhook/lib/db.ts:773

## S81.23 Upgrade effective time.
- Should: An upgrade takes effect at a stated time (immediately), with the charge and the new renewal date shown before confirming.
- Status: web done, desktop done, mobile partial
- Code: apps/web/app/upgrade/UpgradeChooser.tsx:99; apps/web/features/billing/components/UpgradeConfirmDialog.tsx:248; apps/web/features/billing/components/UpgradeConfirmDialog.tsx:339; apps/web/features/billing/components/UpgradeOrderPanel.tsx:367; apps/mobile/lib/v1FeatureFlags.ts:6; apps/web/lib/server/mobile-iap-catalog.ts:26
- Unfinished: mobile: switch-on (owner): set FEATURES.billing true in apps/mobile/lib/v1FeatureFlags.ts and MOBILE_IAP_ENABLED on the server, with the App Store and Play products live; purchase, receipt, confirmation and restore code is built

## S81.24 Downgrade effective time.
- Should: A downgrade takes effect at a stated time (e.g. end of period), shown to the user before they confirm, with access kept until then.
- Status: web done, desktop done
- Code: apps/web/features/billing/components/DowngradeReviewDialog.tsx:140

## S81.25 Grace-period behavior.
- Should: When a renewal payment fails, the plan follows a defined grace rule and the user is told what access remains and how to fix it.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/billing/components/BillingPlanNotices.tsx:112; apps/mobile/src/features/settings/cloud-billing/index.tsx:236; apps/mobile/src/features/billing/store.ts:67; apps/cli/src/usage_summary.rs:557; apps/extension-vscode/src/core/commandSetup.ts:2076; apps/extension-vscode/src/utils/api.ts:837; apps/extension/src/side_panel.ts:8331; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:102

## S81.26 API/programmatic use treated explicitly.
- Should: Programmatic/API use is an explicit plan capability: which plans include it, what it consumes, and API calls are gated by it.
- Status: web done, desktop done, api done
- Code: apps/web/app/pricing/page.tsx:214; apps/web/lib/free-chat-surface-policy.ts:88; apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:82

## S81.27 Cross-platform entitlement sharing.
- Should: One account plan applies on every signed-in surface: each surface reads the same server-side entitlement and the server enforces it per surface.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done, api done
- Code: apps/web/features/settings/sections/BillingSection.tsx:671; apps/web/lib/services/entitlement-resolution.ts:253; apps/web/lib/free-chat-surface-policy.ts:72; apps/mobile/src/features/settings/cloud-billing/index.tsx:298; apps/mobile/src/features/billing/store.ts:67; apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:71; apps/cli/src/usage_summary.rs:232; apps/cli/src/usage_summary.rs:146

## S81.28 Plan-specific feature explanations.
- Should: Each plan explains its own features (what it adds over the current plan, and why a blocked feature needs a given plan).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/app/pricing/page.tsx:1170; apps/web/app/upgrade/UpgradeChooser.tsx:203; apps/web/features/billing/lib/plan-display.ts:36; packages/contracts/types/src/billing-catalog.ts:486; apps/web/app/api/media/image/generate/route.ts:223; apps/mobile/src/features/settings/plans/index.tsx:44; apps/mobile/src/features/settings/plans/index.tsx:31; apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx:129
