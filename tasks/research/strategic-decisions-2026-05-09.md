# Strategic Decisions Locked — Master-Plan Discussion (2026-05-09)

Tracking the 5 critical strategic decisions that shape the master plan. Each entry: decision, picked option, one-line rationale, downstream implications.

---

## Decision #1 — Surface focus strategy (2026-05-09, revised)

**Initial recommendation:** Differentiator-First, Two-Flagship-Surfaces.
**Founder override (final):** **Maximalist — match Anthropic on all 6 surfaces to 100% parity.**

**Rationale (founder's call):** Don't lose the suite story. The 6-surface narrative is critical for both VC fundraising and enterprise pitches. With Claude Max + parallel-AI-agent velocity, the 26–32-week timeline is achievable for a solo founder. The 4 differentiator moats (multi-provider / BYOK+Local / Linux / audit) get added on top of full parity, not in place of it. End state: feature breadth equal to Anthropic + four moats they cannot copy = head-to-head competitor with structural advantages.

**Acknowledged risks of Maximalist** (the founder accepts these knowingly):

- Anthropic ships new features during our build window — gap closure is a moving target.
- Slower path to first revenue (Hobby launch can still happen in 3 weeks if we phase VM later — see Decision #2).
- Solo + AI velocity must hold for 26+ weeks without burnout or scope-creep.
- Cowork VM is now mandatory eventually (4–6 months of focused engineering).

**Downstream implications:**

- Cowork VM is ON the path (sequencing decided in Decision #2).
- All 6 surfaces get parity-push budget, not just Desktop+Web.
- 4 orphan TS packages (mcp/skills/apply-patch/browser-tool) **must be wired into surfaces** (deletion no longer an option since Maximalist needs full feature surface).
- Direction inversion in `services/api-gateway/` from inbound bridge to outbound worker becomes mandatory (Anthropic's Dispatch architecture; can't match without it).
- 4 moats become layer-on-top marketing, not the primary positioning.

---

## Decision #2 — Cowork VM sequencing (2026-05-09)

**Picked:** **All three VM stacks in parallel** — Apple Virtualization Framework (macOS) + Hyper-V (Windows) + KVM/Firecracker (Linux), three sub-agent teams concurrent.

**Rationale:** Under Maximalist, all three OSs need the VM eventually. Parallel build collapses ~16–18 weeks of sequential rollout into ~12–14 weeks calendar. Hobby launch slips to ~8–10 weeks (vs the 3-week defer-VM path), but we ship VM-isolated autonomy on Mac + Windows + Linux on the same day — matching Anthropic on Mac/Win and **uniquely beating them on Linux**.

**Acknowledged risks:**

- 3-OS concurrent kernel-level engineering is the hardest thing on the roadmap; driver/security work doesn't always parallelize cleanly.
- Hobby launch slips ~5–7 weeks vs the Defer path → less Hobby revenue funding the build.
- Apple Virtualization Framework requires Swift/ObjC; Hyper-V requires C/C# Win32 APIs; KVM/Firecracker requires careful Rust + Linux kernel integration. Three new tech stacks.
- 2026-06-05 unsigned-Dispatch deadline still must be addressed in the Hobby-launch path even with VM slip.

**Downstream implications:**

- ~3 sub-agent teams must run concurrently for 12–14 weeks on VM work alone.
- Tauri config requires VM-host integration (`fileAssociations`, `.mcpb`/`.dxt` registration) for desktop extensions.
- `crates/sandbox-policy` (currently 121-LOC enum) becomes a thick crate consumed by all three VM hosts.
- Network proxy (already strong at 70%) gets the Anthropic-style child-side credential-injection layer added.

---

## Decision #3 — Architectural debt strategy (2026-05-09)

**Picked:** **Foundation-first sprint — 4–6 weeks pure architecture, no feature work.**

**Rationale:** Founder chose depth over speed. Stop all feature shipping for 4–6 weeks. Rebuild state architecture, wire orphan packages into surfaces, reconcile Supabase migrations, ship `messageQueueManager` + `AsyncLocalStorage<AgentContext>` + central `onChangeAppState` choke-point, consolidate 102 stores → ~30 well-scoped, drive TypeScript strictness + lint-zero. Then resume Maximalist parity push on a clean foundation with no debt accumulating beneath new features.

**Scope of the Foundation Sprint (~25 days work, 4–6 calendar weeks):**

1. Central state choke-point (`onChangeAppState` analog) — 2 d
2. `messageQueueManager` priority queue across all 6 surfaces — 5 d
3. `AsyncLocalStorage<AgentContext>` for 1,483 Tauri commands — 3 d
4. Wire 4 orphan TS packages (`mcp`, `skills`, `apply-patch`, `browser-tool`) into surfaces — 6–8 weeks (longest pole; can extend past sprint into the parity phase)
5. Reconcile two Supabase migration directories + apply canonical to production — 2 d
6. Consolidate 102 zustand stores → ~30 standardized — 3 wks
7. Direction inversion in `services/api-gateway/` (inbound→outbound worker model) — 30 d (also long pole; absorbs into the Foundation sprint scope)
8. TypeScript strictness + lint-zero + property-test infra — ongoing
9. Documentation of the new architecture as the ground-truth for future sub-agents — 3 d

**Acknowledged risks:**

- Hobby launch slips ~4–6 weeks — Hobby revenue start moves from week 3 to week ~8.
- 2026-06-05 unsigned-Dispatch deadline still must be addressed inside the Foundation sprint as P0 (3 days work, included in scope above).
- VM teams (Decision #2) run concurrently with Foundation since VM kernel-work is independent of state-architecture work — but VM-host integration with the unified-chat surface waits for foundation to stabilize.

**Downstream implications:**

- Foundation sprint is weeks 1–6.
- VM teams (3 parallel) run weeks 1–14 — start with Foundation, finish during the parity push.
- Hobby launch slips to week ~8–10 (vs week 3 in the deferred-VM path).
- Feature parity push (Plan mode, Skills, MCP OAuth, etc.) starts week 7 on a clean foundation.
- Net total to 100% Anthropic parity at AI velocity: ~24–28 weeks calendar.

---

## Decision #4 — Customer focus (2026-05-09)

**Initial recommendation:** Consumer-first to PMF, add Enterprise after ~50 Pro customers.
**Founder override (final):** **Both Equal from day one** — run consumer (Hobby/Pro PLG) and enterprise (Pro+/Max SLG) motions simultaneously.

**Rationale (founder's call):** Don't pick one customer; build for both. Match Anthropic's Team/Enterprise tier offering from day one. Use multi-provider + Linux + audit as the enterprise wedge while the consumer motion drives volume + viral marketing.

**Acknowledged risks of Both-equal:**

- Two GTM motions simultaneously is the hardest scope ask for a solo founder; coordination overhead is significant.
- Enterprise sales cycle is 3–9 months — first enterprise revenue may not arrive until month 9–12.
- SOC 2 timeline must accelerate from Q3 2026 baseline to ~Q1 2027 to be enterprise-credible.
- Splits engineering attention between consumer-polish (voice, image gen, viral UX) and enterprise-controls (SAML/SSO, audit, admin, on-prem).

**Downstream implications:**

- SAML/SSO + admin console + audit log enterprise polish + tenant isolation must move into the parity push (not deferred to year 2).
- SOC 2 prep starts in parallel with Foundation sprint (week 1+) instead of post-launch.
- Stripe billing must support both PLG self-serve AND enterprise custom contracts.
- Documentation track: needs both consumer onboarding AND enterprise admin guides.
- Infrastructure: needs both consumer-scale (millions of MAU) AND enterprise-scale (multi-tenancy, isolation).
- Net total to v1 (both consumer + enterprise feasible): ~28–32 weeks calendar.

---

## Decision #5 — Funding posture (2026-05-09)

**Initial recommendation:** Bootstrap with consumer revenue.
**Founder override (final):** **Build for strategic acquisition (12–24 months) — position for sale to Anthropic / Microsoft / Google.**

**Rationale (founder's call):** Optimize the build for acquisition-attractiveness. Target valuation $200–500M+. Don't try to outlast big players in a 7–10 year IPO race; build a category-defining competitor over 12–24 months and exit when acquirers compete for it. The four moats (multi-provider / BYOK+Local / Linux / audit) plus 6-surface suite parity plus Cowork-class VM isolation make AGI Workforce a uniquely attractive acquisition target — Anthropic gets multi-provider routing they can't build internally without rewrites; Microsoft gets a Linux-first AI agent that complements Copilot; Google gets a cross-Gemini-OpenAI-Claude framework they can't build because of competitive positioning.

**What this means in practice:**

- Optimize technical IP for acquirer-due-diligence (clean architecture, no orphan packages, comprehensive tests, documented systems).
- Build a referenceable customer book (Both-equal customer focus serves this directly).
- Maintain solo + AI-velocity to keep dilution at 0%.
- Secondary deal terms typically: $200–500M+ acquisition price, 2-year founder retention, performance-based earnout.

**Acknowledged risks:**

- Acquirer market may shift — Anthropic/MSFT/GOOG may not be acquiring 18 months from now if AI consolidation slows.
- Caps upside — if AGI Workforce reaches $1B+ valuation as a standalone, acquisition-prep optimizations may have left equity on the table.
- Forces "build what acquirer values" mindset, which can drift from "build what customers want."
- Solo founder personal sustainability — 24-month sprint with no team requires extraordinary discipline.

**Downstream implications:**

- Capital efficiency is the chief metric (no team to fund; minimal infrastructure spend).
- Documentation + architectural cleanliness = acquisition-due-diligence-ready (Foundation sprint serves this).
- Customer book composition matters: pursue 5–10 enterprise marquee logos by month 12 (referenceable for acquirer).
- Revenue at acquisition matters less than ARR run-rate trajectory + technical IP defensibility.
- Open-source posture remains: PROPRIETARY (closed source preserves IP value to acquirer).
