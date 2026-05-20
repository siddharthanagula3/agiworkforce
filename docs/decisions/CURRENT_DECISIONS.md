# Current Decisions

Last reviewed: 2026-05-20.

This is the decision index for documentation cleanup. It is not a new product spec; it points to the latest evidence that was read during the docs audit.

## Decision Sources

Current repo source of truth:

- `docs/PRD.md` - canonical product spec in the repo, marked V5 / last refreshed 2026-05-18.
- `docs/PRD-MOBILE.md` - canonical mobile PRD in the repo, dated 2026-05-17.
- `docs/archive/2026-05-18-wave-0-complete.md` - verified Wave 0 mobile local-first completion record.
- `docs/PRD-RESOLUTIONS-AND-AUDIT.md` - prior PRD audit with explicit Delete / Update / Retain classifications.
- `AGI_WORKFORCE.md` - root source-of-truth entry point for platform posture; mobile launch posture is narrowed below.

Claude Code memory source:

- Main memory index: `/Users/siddhartha/.claude/projects/-Users-siddhartha-Desktop-agiworkforce/memory/MEMORY.md`
- Locked decisions: `/Users/siddhartha/.claude/projects/-Users-siddhartha-Desktop-agiworkforce/memory/locks/`
- Repo-local memory stub: `.claude/projects/-Users-siddhartha-Desktop-agiworkforce/memory/audit-2026-05-06.md`
- MCP memory graph: available, but currently contains older desktop/runtime observations, not the latest mobile/product locks.

Important cleanup note: repo links to `memory/*.md` are broken because there is no repo-root `memory/` directory.

## Latest Locked Decisions

1. AGI Workforce is locked as an **OpenAI/Anthropic-style application suite**, not just a chat app or CLI. The differentiation is local-first privacy, explicit BYOK, multi-provider routing, and privacy-controlled managed compute across Web, Desktop, Mobile, CLI, VS Code, and Chrome.
   Evidence: `docs/decisions/2026-05-20-openai-anthropic-application-suite-thesis.md`, `PLAN.md`, `audit/anthropic-apps-parity/application-suite-thesis-2026-05-20.md`.

2. Public brand is **AGI**. Repo paths, package names, crates, and internal identifiers stay `agiworkforce`.
   Evidence: `memory/locks/brand-agi-2026-05-15.md`, `docs/PRD.md`, `README.md`.

3. Mobile is the lead launch surface.
   Evidence: `docs/PRD.md`, `docs/PRD-MOBILE.md`, `memory/locks/mobile-first-strategy-2026-05-16.md`, `memory/locks/mobile-first-amendments-2026-05-17.md`.

4. Mobile is the first implementation focus. Founder clarified on 2026-05-20 that the 2026-05-18 local-first/cloud-waitlist locks apply to the mobile application first, not as a repo-wide reversal of the platform Local + BYOK posture.
   Evidence: founder clarification in current Codex session, `memory/locks/v1-local-only-cloud-waitlist-2026-05-18.md`, `docs/archive/2026-05-18-wave-0-complete.md`, `docs/design/mobile-screen-design-prompt-2026-05-18.md`.

5. Mobile v1 should ship as **Local + explicit BYOK**, not AGI-managed cloud. Local is the default trust boundary; BYOK is a separate provider trust boundary with explicit consent.
   Evidence: founder clarification in current Codex session, `docs/PRD-MOBILE.md`, `docs/archive/2026-05-18-wave-0-complete.md`.

6. Managed Cloud / AGI Compute Credits / subscriptions remain waitlist or private beta only. Do not sell public managed credits in mobile v1. The future credit model must be closed-loop, non-transferable, payment-rail-aware, reserve for processor fees/tax/refunds/chargebacks, and settle usage from actual provider cost.
   Evidence: founder clarification in current Codex session; existing billing backlog in `tasks/todo.md` and `supabase/migrations/`.

7. Local to BYOK is a **fork**, not a silent transfer or mode flip. The original Local thread remains local forever.
   Required flow: user taps Continue with BYOK, sees a disclosure, chooses full chat / last N messages / selected messages, chooses attachment/tool-output inclusion, runs local secret redaction, previews the payload, then creates a new BYOK fork with a visible provider label.
   Hard rules: never auto-route a Local chat to BYOK; never silently send Local attachments to BYOK; every message stores `privacy_mode: local | byok | managed`; BYOK labels must name the provider, e.g. "Claude via your Anthropic key".

8. The repo PRD and public docs still say Local + BYOK are live/free and paid tiers graduate on 2026-08-01. Keep that as the platform posture unless a formal PRD amendment changes it; do not use platform pricing docs to override the mobile-v1 managed-cloud waitlist.
   Evidence: `docs/PRD.md`, `docs/PRD-MOBILE.md`, `AGI_WORKFORCE.md`, `README.md`, `docs/PRICING.md`, `docs/ROADMAP.md`.

9. Current cleanup policy: update mobile-specific docs first. Avoid broad public/pricing rewrites unless the PRD is explicitly amended beyond mobile scope.

10. Mobile local model architecture is Path C: system-native multimodal primitives plus downloaded text model, not one universal model.
   Evidence: `memory/locks/v1-model-selection-final-2026-05-18.md`, `docs/archive/2026-05-18-wave-0-complete.md`, `tasks/research/V1-MODEL-SELECTION-REPORT.md`.

11. Current mobile default downloaded text model is Qwen3-4B-Instruct-2507. Apple Foundation Models and AICore are additive system layers, not the only chat model.
    Evidence: `memory/locks/v1-model-selection-final-2026-05-18.md`, `memory/locks/research-corrected-platform-facts-2026-05-18.md`.

12. Do not hardcode model IDs or provider capabilities. Use the model catalogs.
    Evidence: `memory/locks/rule-models-json-canonical.md`, `docs/PRD.md`, `AGI_WORKFORCE.md`.

13. Auto-routing must be explicit and explainable; silent model substitution is a rejected anti-pattern.
    Evidence: newer `memory/locks/auto-routing-decision-2026-05-16.md`.
    Supersedes conflicting silent-routing language in older `memory/locks/auto-routing-spec-2026-05-07.md`.

14. One chat layout across six surfaces remains a non-regression rule.
    Evidence: `docs/PRD.md`, `docs/VISION.md`, `docs/surfaces/*.md`, `memory/MEMORY.md`.

15. `@agiworkforce/llm-normalize` is the canonical app-level cross-provider contract.
    Evidence: `docs/PRD.md`, `AGI_WORKFORCE.md`, `packages/llm-normalize/`.

16. Design tokens are locked: teal `#21808d` and terracotta `#da7756`; brand mark A/B/C is still a founder decision.
    Evidence: `memory/locks/brand-agi-2026-05-15.md`, `memory/locks/design-prompt-v1-2026-05-16.md`, `docs/design/design-spec-2026-05-15.md`.

## Outdated Or Historical

- `docs/HANDOFF.md` is a Wave 1 CLI handoff from 2026-05-03, despite newer docs calling it current.
- `docs/BILLION_DOLLAR_PLAYBOOK.md` is a 2026-05-08 strategy snapshot and should not override PRD V5 or the 2026-05-18 mobile locks.
- `memory/locks/byok-first-launch-2026-05-16.md`, `subscription-tiers-2026-05-15.md`, and `pricing-billing-decisions-2026-05-16.md` remain platform-pricing evidence, but they do not make AGI-managed cloud or credits part of mobile v1.
- `memory/locks/auto-routing-spec-2026-05-07.md` is superseded on silent routing by `auto-routing-decision-2026-05-16.md`.
- `docs/archive/**` is historical unless a current doc explicitly cites it as evidence.

## Mobile Scope Clarification

Founder clarified on 2026-05-20 that the local-first/cloud-waitlist decision is about concentrating on the mobile application first and avoiding AGI-managed cloud risk at launch.

Current interpretation:

- **Mobile v1**: Local + explicit BYOK; Local is default and BYOK requires consent.
- **Local -> BYOK**: creates a new fork after context selection, secret scan, and preview; the original Local thread remains unchanged.
- **Managed Cloud / Credits**: waitlist or private beta only until ledgering, payment rails, fraud, refund, chargeback, and provider-term risk are designed and verified.
- **Platform docs**: Local + BYOK posture remains valid for repo-level/non-mobile launch copy unless amended by PR.
- **Next docs work**: rewrite mobile-specific docs and launch copy so they stop presenting BYOK as a silent mode switch or AGI-managed cloud path.
