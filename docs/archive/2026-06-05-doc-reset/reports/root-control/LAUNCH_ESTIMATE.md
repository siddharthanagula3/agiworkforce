# AGI Workforce — Launch Estimate (Phase 6)

Status: Current
Owner: Lead engineer (autonomous)
Purpose: realistic time-to-launch per surface + overall, computed for an **LLM-augmented solo founder** (parallel subagents, fast mode, high-but-rate-limited token budget) — NOT traditional team timelines.
Retention: Re-estimate after each major wave; estimates decay fast.
Last updated: 2026-05-29

## Assumptions (state them so the numbers are falsifiable)

1. **Operator model:** one founder + Claude Code with dynamic workflows (≤16 concurrent subagents), fast mode, file-ownership lanes. Throughput ≈ a small senior team for bounded, well-specified work; **near-zero** for work needing real-device QA, App Store review, legal, or external provisioning.
2. **Rate limits are the binding constraint, not engineering capacity.** Weekly token/usage caps pace deep multi-agent waves. A "wave" (≈18–30 agents reading/editing + verify) is roughly a half-to-full day of budget. Plan ~4–6 substantive waves/week before throttling.
3. **Verification is cloud/CI-runnable** (the gate battery in DoD) — no manual QA inside this loop; the founder does device/App-Store QA out-of-band.
4. **Locked serial order:** Mobile → Web → Desktop → CLI → Chrome → VS Code. Mobile v1 = "publicly released on App Store" (not just code-complete).
5. **v1 scope = Local + BYOK only**; Managed Cloud stays gated (removes the hardest billing/abuse/fraud work from the critical path).
6. Effort units below are **calendar-days of an LLM-augmented founder at sustainable rate-limit pace**, with the engineering-hours-equivalent in parens where useful.

## Work buckets (from AUDIT + DoD)

| Bucket | Scope | Est. (LLM-founder days) | Pacing risk |
| --- | --- | --- | --- |
| **B0 — Test-gate green** | Fix model-catalog drift (~45 tests, 4 surfaces) via catalog resolver + add the integrity test (E7); vscode snapshots; clippy 6 lints; tmp override | **1–2 days** | low — bounded, mechanical-ish, high parallelism |
| **B1 — P0 crashes** | Desktop ~11 byte-slice abort sites + char-safe helper + tests; mobile pinning launch crash + test | **1–2 days** | low |
| **B2 — Privacy/security P1s** | CLI voice + advisor + buildFallbackChain trust-gate (defense-in-depth at stream layer); gateway RLS-claim + jti revocation + enterprise join; ReactPreview CSP; chrome CI guard; logger redactor tests | **3–5 days** | medium — needs careful tests, some cross-file |
| **B3 — Wire-the-built-thing** | 4 provider adapters; app-server crate; web settings hooks→backend; generated-file UI; delete safe-delete crates + dead islands + empty stores pkg | **3–5 days** | medium |
| **B4 — Coverage floor + e2e** | Bring TS surfaces to ≥70/60, cli+desktop libs ≥60; add Playwright smokes (web/desktop) | **3–6 days** | medium — coverage tail is long |
| **B5 — Parity tail (the long pole)** | Desktop Cowork + Code modes (F1), Settings IA (F2), one-chat files (F3), Local→BYOK fork everywhere (F4), memory suite (F6), connectors directory (F7), artifacts full (F8), global search (F9), marketing pass (F13) | **15–30 days** | **high** — biggest, most product-judgment-heavy, rate-limit-bound |
| **B6 — Mobile launch readiness** | First-run on-device model works (F10), device QA, TestFlight, App Store review | **7–21 days wall-clock** | **very high** — App Store review + device QA are OUT of the agent loop |

## Critical path to a credible v1

**Phase 1 — Engineering floor (gate battery green, no P0/P1):** B0 + B1 + B2 + B3 → **~2 weeks** of LLM-founder time at sustainable pace. This makes the DoD §A–§E/§G achievable and the platform reliable + non-leaky. This is the part this autonomous mission can largely deliver.

**Phase 2 — Coverage + parity core:** B4 + the highest-value B5 items scoped to the **active surface (Mobile)** and the shared engine → **~3–4 weeks**.

**Phase 3 — Mobile v1 to App Store:** B6 → **+2–3 weeks wall-clock**, mostly waiting on review + device QA (founder-driven, not agent-driven).

**Overall to Mobile v1 public launch:** **~7–9 weeks** for the LLM-augmented founder, of which ~2–3 weeks is non-engineering wall-clock (App Store/device QA). The other five surfaces follow serially; each subsequent surface is cheaper because the shared engine + contracts are reused — **Web ~2–3 wks, Desktop ~4–6 wks (Cowork/Code is the heaviest), CLI ~1–2 wks, Chrome ~1–2 wks, VS Code ~1–2 wks** of incremental LLM-founder time, heavily overlapped with the parity tail.

## Where weekly rate limits pace the work (flag)

- **B5 parity tail** is the rate-limit-bound segment: it is many independent, medium-sized features, each wanting a read→design→implement→verify workflow. Expect to spread it over multiple weeks; ~4–6 substantive multi-agent waves/week is the realistic ceiling before throttling.
- **B4 coverage** similarly bounded — coverage backfill is high-volume, low-risk agent work that eats budget.
- **B0–B3** are NOT rate-limit-bound in practice — they're small enough to land inside 1–2 weeks even with caps.
- Non-engineering gates (**B6** App Store review, device QA, any provider-terms/billing for the eventual Managed path) do not consume token budget but DO set wall-clock and are outside this loop.

## Honest caveat

These numbers assume the gate battery stays the bar (no manual QA inside the loop) and that the parity tail (B5) is scoped to the locked SoT P0s, not gold-plated. If "production-complete across ALL six surfaces" is taken literally to mean every parity-matrix `Partial` → `verified` on all six surfaces simultaneously, that is a **multi-month** program even for an LLM-augmented founder, dominated by B5 × 6 surfaces and the rate-limit ceiling. The serial-surface lock exists precisely to avoid that; respect it.
