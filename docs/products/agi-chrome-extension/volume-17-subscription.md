# AGI Chrome Extension — Volume 17 — Subscription

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-11

Authority: grounds in `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), `apps/extension/AGENTS.md`, and the following real repo paths: `apps/extension/src/features/native-bridge/providerStreamClient.ts`, `apps/extension/src/features/cloud-bridge/freeTrialClient.ts`, `apps/extension/src/features/computer-use/cloudAgentClient.ts`, `apps/extension/src/side_panel.ts`, `apps/web/lib/managed-compute-gate.ts`, `apps/web/features/chat/components/InlinePaywallCard.tsx`, `packages/contracts/types/src/models.json` (`tierAllowedModels`, `providers.managed_cloud.taskRouting`), and `packages/contracts/types/src/billing-catalog.ts`.

## Overview & stance

This volume defines how AGI subscription tiers are surfaced, gated, and enforced inside the Chrome extension — the "AGI Browser Companion." The stance is deliberate and narrow: **the extension holds no provider keys, runs no inference, and never renders a checkout.** Every paid capability is a server decision. The extension only _displays_ what the server allows and _routes_ the user to the web to pay.

Trust modes shape this surface heavily. Chrome exposes only two paths that touch subscriptions: (1) the **thin bridged chat / cloud agent**, which streams through the cloud gateway under a signed-in **Managed Cloud** identity, and (2) a **native-messaging bridge to Desktop** (`com.agiworkforce.browser`), where the Desktop host's own trust mode governs. **BYOK is never available on Chrome** — the extension carries no keys (`cloudAgentClient.ts` EGRESS rule: no provider host is ever contacted). **Local** is not a Chrome concept either; when the extension bridges to a Local Desktop session, that compute stays on the host and is billed by nothing. Therefore subscription enforcement on Chrome is exclusively about **Managed Cloud** usage: Free vs. the paid ladder, verified server-side and rendered from server responses.

> 🟡 **Pricing canon (updated 2026-07-11).** The ladder is Free / Basic $7·₹399 IAP-first / Pro $20 / Max $100 & $200 / Team $30-seat / Enterprise (`docs/plans/tier-metering-reconciliation-wave2-2026-07-11.md`, `docs/decisions/CURRENT_DECISIONS.md` #22), superseding the 2026-06-30 ladder this volume previously specified. Metering is token/value-based, displayed to the user as credits (never a flat prompt count) — Chrome's own `FREE_TRIAL_PROMPT_LIMIT = 3` counter is a client-side cache of a server-enforced budget, not itself the metering model. Capped, opt-in credit top-ups are enabled for paid tiers with per-tier payout parity; no discount anchors anywhere in paywall or pricing copy. Re-verified against code 2026-07-11: `packages/contracts/types/src/billing-catalog.ts` already prices `team` at $30/mo + $299/yr and has real `basic`/`pro`/`max` entries — only Basic's price ($8, needs $7) and the missing $200 Max tier are genuinely outstanding there; Chrome's own `PaywallRequiredTier` type is the deeper gap (still lists `hobby`/`pro_plus`, lacks `team` as distinct from `enterprise`).

## Free

Signed-in free users get a small cloud-chat allowance and full access to browser-agent primitives that do not require paid models. ✅ Built: `apps/extension/src/features/cloud-bridge/freeTrialClient.ts` implements a **3-prompt** economy allowance (`FREE_TRIAL_PROMPT_LIMIT = 3`), streamed from the web app's `/api/llm/v1/chat/completions` route using the economy model read from `packages/contracts/types/src/models.json` (`providers.managed_cloud.taskRouting.chat`) — never hardcoded (`FREE_TRIAL_MODEL`). The server (`reserveFreeTrialPrompt`) is authoritative; the local `agi_free_prompts_used` counter is only a cache that snaps to the limit on a `403 quota_exceeded`. Requirement: when remaining prompts reach 0, the extension must show the upgrade path (Section: Upgrade) rather than silently failing or retrying. 🟡 Gap: `freeTrialClient.ts` comments still say "Hobby/free" — "Hobby" is a **removed** tier and must be renamed to "Free" during the tier reconciliation task.

## Basic — $7/mo (₹399/mo, IAP-first)

🔭 Planned. Basic is the entry paid tier (**$7/mo**, cut from $8 on 2026-07-11; ₹399, the only fixed INR price) and is **IAP-first** — purchasable only via App Store/Play Store, never an in-extension or in-browser checkout. On Chrome it lifts the Free prompt cap and unlocks the **economy** model bucket for the bridged chat without unlocking paid flagship models. Requirement: the extension must gate Basic strictly from the server-returned tier — never infer Basic from client state. `packages/contracts/types/src/billing-catalog.ts` already has a real `basic` entry (priced at $8, needs the $7 correction); the extension-side gating logic for it is what's still 🔭. Do not invent an INR value beyond ₹399.

## Pro — $20/mo

🔭 Planned. Pro unlocks the `pro_additions` model bucket in `packages/contracts/types/src/models.json` `tierAllowedModels` (e.g. the mid-tier Sonnet/Gemini/GPT class — reference the catalog, do not re-list IDs here) and paid capabilities such as CDP computer-use. ✅ Built (enforcement seam): `cloudAgentClient.ts` already treats computer-use as a paid capability — a `403` from the gateway is interpreted as "your account is not on a paid plan, which computer-use requires." Requirement: Pro entitlement is decided server-side; the extension only reflects it. Pro INR is **TBD** — do not display an INR price for Pro.

## Max — $100/mo and $200/mo

🔭 Planned. Max has **two price points** ($100 and $200) presented as Max tiers (never "Plus"). Max unlocks the `flagship_additions` bucket in `tierAllowedModels` (top reasoning/coding models — reference `models.json`, do not hardcode) plus the highest usage/limits. Requirement: both Max price points map to the same Chrome capability surface unless the server signals otherwise via the entitlement response; the extension must not hardcode which models each Max price unlocks. Max INR is **TBD** — do not display one.

## Team — $30/seat/mo ($299/seat/yr)

🔭 Planned (Chrome gating) / ✅ Built (pricing) — `packages/contracts/types/src/billing-catalog.ts` already prices `team` at $30/mo + $299/yr, matching the 2026-07-11 reinstatement. Team is a **real, separate per-seat tier** between Max and Enterprise — do not fold it into Enterprise. On Chrome, Team entitlement should unlock at least the same model buckets as Max (server-decided); the extension has no seat-management UI of its own (out of scope — provisioned via web/account). Requirement: Team is included in the reconciled `PaywallRequiredTier` union alongside the other real tiers, not treated as equivalent to Enterprise.

## Enterprise — custom

🔭 Planned. Enterprise (custom pricing) serves org-scale SSO/admin/seat needs beyond Team. 🟡 Gap: `packages/contracts/types/src/billing-catalog.ts`'s `team` entry is correctly priced but the extension's own `PaywallRequiredTier` type doesn't yet include it as a distinct value from `enterprise`. On Chrome, Enterprise adds no in-extension admin UI (out of scope); it only changes what the server-verified entitlement grants. Requirement: Enterprise seats are provisioned via the web/account surface, never in the extension.

## Entitlement Verification — server-side

✅ Built. All entitlement decisions are server-side. The Managed Cloud gate lives in `apps/web/lib/managed-compute-gate.ts` — public alpha, open by default; the `AGI_MANAGED_COMPUTE_PRIVATE_BETA` env is only an incident kill-switch. The extension sends a Clerk bearer (from `chrome.storage.session`, never persisted to disk in production — `freeTrialClient.storeSessionToken` fails closed) and reacts to server status codes: `401` → sign-in prompt; `403` → paid-plan-required or incident gate; `429` with a structured body → paywall. ✅ Built: `providerStreamClient.ts` parses a `429` `{ kind:'paywall', feature, requiredTier, reason }` payload into a first-class `paywall` stream chunk so callers show upgrade UI instead of an error. Requirement: the extension must **never** grant a capability from client state alone — the local free counter is a cache, not an authority.

## Model-by-plan Gating

🟡 Partial. The plan→model map is sourced from `packages/contracts/types/src/models.json` `tierAllowedModels` (`economy`, `pro_additions`, `flagship_additions`) — mirroring Claude-in-Chrome plan gating. ✅ Built: the side panel renders locked models with an "Upgrade" tag instead of a selectable checkmark (`apps/extension/src/side_panel.ts`, the `sp-model-upgrade-tag` path). 🟡 Gap: the paywall types in `providerStreamClient.ts` still list `PaywallRequiredTier = 'hobby' | 'pro' | 'pro_plus' | 'max'` and mirror the web `InlinePaywallCard.tsx` type — `hobby` and `pro_plus` are **removed** tiers and must be reconciled to `free | basic | pro | max | team | enterprise` (Team included as a real, separate value, not folded into `enterprise`). Requirement: model gating is display-only; the server enforces the real allow-list, and the extension must not unlock a model client-side even if the label is wrong.

## Upgrade — routed to web pricing

✅ Built. There is **no in-extension checkout** — no Stripe, no billing UI. Upgrade actions open the web pricing page: `apps/extension/src/side_panel.ts` calls `chrome.tabs.create({ url: 'https://agiworkforce.com/pricing' })` from both the locked-model "Upgrade" tag and the paywall drawer. Requirement: every paywall/`429`/locked-model interaction terminates in a new-tab navigation to the web pricing/billing surface; the extension never collects payment details, plan selections, or card data.

## Repository map

- `apps/extension/src/features/native-bridge/providerStreamClient.ts` — bridged-chat stream + `429` paywall parsing.
- `apps/extension/src/features/cloud-bridge/freeTrialClient.ts` — Free 3-prompt allowance, server-authoritative quota.
- `apps/extension/src/features/computer-use/cloudAgentClient.ts` — cloud agent gateway client, EGRESS allowlist, paid-plan `403` handling.
- `apps/extension/src/side_panel.ts` — locked-model "Upgrade" tag + `chrome.tabs.create` to `/pricing`.
- `apps/web/lib/managed-compute-gate.ts` — server-side Managed Cloud gate + kill-switch.
- `apps/web/features/chat/components/InlinePaywallCard.tsx` — web paywall card the extension mirrors.
- `packages/contracts/types/src/models.json` — `tierAllowedModels`, `providers.managed_cloud.taskRouting` (model source of truth).
- `packages/contracts/types/src/billing-catalog.ts` — tier catalog (already has `basic`/`pro`/`max`/`team`; needs Basic's price corrected to $7 and the $200 Max tier added, 🟡).

## Competitor notes

Claude for Chrome gates browser-agent capabilities behind paid Claude plans and renders upgrade prompts from the account server; ChatGPT and Codex similarly meter usage server-side. AGI's deliberate divergence: (1) **multi-provider** — the plan→model buckets in `models.json` span Anthropic/OpenAI/Google/others, not one vendor; (2) **per-surface trust** — Chrome is Managed-Cloud-only for billing, while BYOK (free, no markup) exists only on Desktop/CLI/VS Code and Local compute is never billed; (3) **local-first** — when the extension bridges to a Local/BYOK Desktop session, no subscription applies because compute stays on the host. Like the parity products, AGI keeps entitlement authority server-side.

## Acceptance / Definition of Done

Production-ready when: entitlements are enforced only server-side; the extension renders paywalls solely from server `429`/`403` responses; no checkout or card entry exists in-extension; upgrade always routes to web pricing; and the removed-tier strings (`hobby`, `pro_plus`) are reconciled to `free | basic | pro | max | team | enterprise` (Team is a real, separate value — not removed).

- [ ] Build: `pnpm --filter @agiworkforce/extension typecheck` and `test` pass; no `basic`-tier reconciliation regression in `billing-catalog.ts`.
- [ ] Trust: no BYOK/provider key ever reaches the extension; Free counter treated as cache, server authoritative; Local/Desktop-bridged sessions never billed as cloud.
- [ ] Security: bearer never persisted to disk in production; all upgrade navigations go to the exact web pricing origin; paywall payloads validated (`kind:'paywall'`) before rendering.

## Anti-patterns

- Adding any in-extension checkout, Stripe call, or card capture.
- Unlocking a model or capability from client state instead of the server allow-list; hardcoding model IDs instead of reading `models.json`.
- Shipping removed tiers "Plus", `pro_plus`, or "Hobby". Team is NOT removed and is NOT folded into Enterprise — it is a real, separate per-seat tier.
- Inventing INR prices for Pro/Max/Team, or any USD price other than the canon ladder ($0 / $7 / $20 / $100 & $200 / $30-seat / custom).
- Introducing uncapped or non-opt-in top-ups, a top-up flow that breaks per-tier payout parity, a discount anchor in any paywall/pricing copy, or contacting a provider host directly (violates the `cloudAgentClient.ts` EGRESS rule).
- Referencing Supabase, or renaming `proxy.ts` to `middleware.ts` in a web entitlement route.
