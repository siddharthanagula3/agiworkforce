# Enterprise Local — §4 Decision Recommendations (for founder sign-off)

Status: Recommendations awaiting founder decision
Owner: Founder (decisions) + Platform lead (implementation)
Last updated: 2026-07-09
Purpose: `docs/enterprise/enterprise-local-design.md` §4 lists four founder-owned decisions that gate P7 implementation. The verify primitive is built (`packages/contracts/licensing` + `crates/agiworkforce-licensing` + org-policy contract, cross-language fixtures). This file proposes a **recommended answer for each** so the calls can be made quickly. These are recommendations, not decisions — override freely; the code adapts to whatever you pick because `features[]`/`edition` are open values, not hardcoded.

Grounding: existing GTM is the freemium wedge — free Local + BYOK (no markup) everywhere, convert to paid managed cloud; consumer tiers Free / Basic ($8) / Pro ($20) / Max ($100–$200) / Enterprise. Enterprise-Local is the _sell-private-usage-to-orgs_ motion, distinct from managed-cloud conversion.

## FD-1 — Editions & pricing split (blocks the `edition`/`features[]` values, not the mechanism)

Recommend **two editions**:

- **Team** — self-serve, per-seat/month (suggest anchoring near consumer Max, e.g. ~$100–150/seat/yr billed annually or a small per-seat/mo), features: `org-policy`, `audit-export`, offline license, connected identity. Target: small teams wanting private Local usage with light governance.
- **Enterprise** — sales-assisted, custom/volume, adds: `self-hosted-gateway`, air-gapped tier, SSO/SCIM, priority support. Target: regulated/air-gapped orgs — this is the differentiated, defensible tier for the funding story ("your models, no markup, private, provably zero-egress").

`features[]` stays an opaque string array; populate: Team = `['org-policy','audit-export']`, Enterprise = `['org-policy','audit-export','self-hosted-gateway','air-gapped','sso-scim']`. **Only you set the actual prices** — the design carries no numbers.

## FD-2 — Seat true-up posture

Recommend **honor-count with audit-export visibility** (the design's default), matching commercial offline-licensing norms (JetBrains/GitLab offline). Rationale: true seat enforcement is impossible offline without a phone-home, which contradicts the zero-egress selling point. Each install records its seat claim in the local audit log; renewal/true-up reconciles from an exported audit bundle. Avoid hard seat-blocking — it would require the very egress the product promises not to make.

## FD-3 — Which identity tier ships first

Recommend **air-gapped first** (license file + local OS user, no cloud identity). Rationale: it's the stronger differentiator and the cleaner funding-demo story ("runs fully offline, provably private"), and it has _no_ external dependency (no Clerk-org wiring needed to demo). Connected tier (Clerk SSO/SCIM) is the easier sale but reuses cloud identity that already exists — add it second as the self-serve Team on-ramp. Shipping air-gapped first also exercises the offline-license path end-to-end, which is the novel part.

## FD-4 — Does the activation-ping option exist at all?

Recommend **yes, but off by default and org-controlled** (opt-in, endpoint from policy, sends only `licenseId + seatHash + version`, never content, never to our cloud). Rationale: some buyers _require_ its absence (air-gapped), others _want_ it for seat visibility — an off-by-default, org-pointed toggle serves both without compromising the zero-egress guarantee. If you prefer maximum purity for the demo narrative, ship **without it** and add later; costs nothing to defer.

## What each decision unblocks (implementation sequence, per design §3)

| Decision | Unblocks                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------- |
| FD-1     | populate `edition`/`features[]` values; license issuer tooling; Team self-serve billing wiring (Stripe) |
| FD-3     | which identity path to build first (air-gapped license-file flow vs Clerk-org SSO/SCIM)                 |
| FD-2     | audit-log seat-claim recording + export bundle format                                                   |
| FD-4     | whether to build the optional activation-ping client (1 small module)                                   |

Once FD-1 + FD-3 are set, the next buildable increment is the enforcement wiring (OrgPolicy consumed by the per-surface trust-kernel guards) + the license-issuer/signing tooling — both currently gated only on these two calls.
