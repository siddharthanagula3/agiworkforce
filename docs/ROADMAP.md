# Roadmap — AGI

> Live document. Update when waves/sprints change. Last updated: 2026-05-16.

## Current state (2026-05-16)

**Brand**: public surface is **AGI** (simplified from "AGI Workforce" 2026-05-15). Repo path + internal packages remain `agiworkforce`.

**Launch posture**: BYOK + Local v1 shipping; all 6 paid tiers (Hobby / Pro / Pro+ / **Pro Max $99 NEW** / Max / Enterprise) on **email-only waitlist** until **August 1, 2026 graduation**. Why: 60-90 days of BYOK telemetry will set per-tier caps from data instead of guesses, eliminating fraud risk + Stripe-launch dependency from Days-1-30. See [`memory/byok-first-pivot-2026-05-16.md`](../memory/byok-first-pivot-2026-05-16.md).

**Active waves**:

- **Wave 0** (cleanup) — ✅ SHIPPED 2026-05-03: -1.04M LOC, 102 dead crates, SSOT structure
- **Wave 1** (CLI v1.0) — ✅ SHIPPED 2026-05-03: `v-cli-1.0.0`, 5 platform binaries, Homebrew + install.sh + cargo paths live; npm pending NPM_TOKEN
- **Wave 2** (Desktop v1.0 prep) — ✅ ABSORBED into v3 UI sprint
- **Wave 3** (Mobile + Chrome ext + VS Code ext) — ✅ ABSORBED into v3 UI sprint
- **Wave 4 v3 shells** — ✅ SHIPPED 2026-05-16: 26 v3 components scaffolded behind `DESKTOP_CHAT_V3` flag (rollout 0%)
- **Wave 5 v3 wiring + full UI** — ✅ SHIPPED 2026-05-16: real-store wiring across desktop + web + mobile + chrome ext + VS Code ext; flag flipped `enabledForAll: true`; PR #366 (38 commits / +19,659 LOC)
- **Wave 6 finalize** — 🚧 IN FLIGHT 2026-05-16+: 22 deliverables. $99 Pro Max SSOT wiring, waitlist signup + Supabase table, pricing CTA flip to "Join Waitlist", 5-chip trust row, Routing-WHY badge, pre-request quota line, BYOK polish suite (per-provider quotas + auto-fallback + spend tracking + key rotation + secure storage), AGI Memory v1 import/export, conversation export multi-format, multi-model side-by-side Pro+ gated, Aug 1 countdown banner, voice privacy lock, legal page scaffolding, Chrome + VS Code BYOK control-plane positioning, 4 new ESLint anti-pattern locks. Plan at [`~/.claude/plans/v6-finalize-frontend-2026-05-16.md`](../tasks/launch-checklist-2026-07-18.md).
- **Wave 7** (post-graduation, Sep+) — Multi-language voice, memory graph viz, computer-use full backend, OCR spend-stack importer, GrowthBook integration

**Pre-launch milestones (May 16 → Aug 1)**:

- ✅ Apple Developer PLA renewed 2026-05-16 (macOS notarization unblocked)
- ⏳ Brand mark pick (A/B/C at `docs/design/brand-mark-proposals/preview.html`)
- ⏳ Anthropic Partner / OpenAI Startups / Google for Startups / AWS Activate applications
- ⏳ Wave 6 ships
- ⏳ 12-15 customer interviews from public complaint threads (r/cursor / OpenRouter / TypingMind switchers)
- ⏳ 14-day pre-launch checklist July 18-31 (see [`tasks/launch-checklist-2026-07-18.md`](../tasks/launch-checklist-2026-07-18.md))

**Aug 1, 2026 — Graduation day**:

- Stripe checkout flips live (was dormant)
- Waitlist members get 50% off first 6 months
- Pricing CTAs flip "Join Waitlist" → "Subscribe"
- Public announcement: "We waited 90 days to finalize pricing because we wanted to be sure"

**Realistic outcome targets** (per converged iteration-3 research):

- 12-month base case: $5-20K MRR with 1 channel compounding + decent retention
- 12-month stretch: $20-50K MRR with niche locked + multi-surface trust differentiator working
- Escalation trigger: <$2K MRR by Oct 31, 2026 → honest pivot/wind-down assessment

**GTM channel priority**: HN > r/cursor + r/ClaudeAI + r/LocalLLaMA > Discord micro-communities (OpenRouter / Open WebUI / LibreChat / Cherry Studio) > 3-8 YouTube creators ($150-500 each + free Pro+) > long-tail SEO. Product Hunt = badge only. r/SaaS dead for direct conversion. See [`memory/launch-playbook-2026-05-16.md`](../memory/launch-playbook-2026-05-16.md).

**Audit status**: P0 13/14 closed, P1 21/25 closed. Pre-existing main CI red on Rust Security clippy (49 errors) fully resolved on PR #366 in flight.

## MVP plan — 3 waves

### Wave 1 — CLI v1.0 — SHIPPED 2026-05-03

Tagged `v-cli-1.0.0` after 3 CI iterations:

- Iter 1: linux missing libasound2-dev; windows unused import in cfg(unix) block
- Iter 2: linux-arm64 cross-compile failed on openssl-sys
- Iter 3: dropped linux-arm64 from matrix → 5/5 builds green, GitHub Release published

**Live install paths** (4 of 5 — npm pending NPM_TOKEN):

- `brew install siddharthanagula3/tap/agiworkforce` ✅
- `curl -fsSL .../install.sh | bash` ✅
- `cargo install --git ...` ✅
- Direct binary download from [release page](https://github.com/siddharthanagula3/agiworkforce/releases/tag/v-cli-1.0.0) ✅
- `npm install -g @agiworkforce/cli` ⏳ (re-run publish-npm job after setting NPM_TOKEN secret)

---

### Wave 1 (original plan, now historical) — CLI v1.0 (Week 1)

Ship the multi-provider CLI to the public via npm + Homebrew + GitHub releases.

**Why first:** Cargo green, binary exists, 22 subcommands work, npm wrapper exists, scripts/install.sh + scripts/homebrew/agiworkforce.rb exist. Just needs polish + distribution.

| Day | Task                                                                                                                  | Owner |
| --- | --------------------------------------------------------------------------------------------------------------------- | ----- |
| 1   | Strip 23 `#[allow(dead_code)]` modules in apps/cli/src/ (decide: wire or delete each)                                 | TBD   |
| 2   | Verify all 22 subcommands work end-to-end with 5 providers (Anthropic, OpenAI, Google, Ollama, Mistral)               | TBD   |
| 3   | Update apps/cli/npm/ for npm publish; verify 6 platform binaries (darwin-arm64/x64, linux-arm64/x64, win32-arm64/x64) | TBD   |
| 4   | Publish Homebrew formula via scripts/homebrew/agiworkforce.rb to a tap repo                                           | TBD   |
| 5   | Tag v1.0.0; release.sh creates GitHub release with binaries; update README badges                                     | TBD   |
| 6   | Show HN post + r/LocalLLaMA + Twitter                                                                                 | TBD   |
| 7   | Monitor issues; rapid patch v1.0.1 if needed                                                                          | TBD   |

**Distribution:**

```bash
npm install -g @agiworkforce/cli
brew install agiworkforce/tap/agiworkforce
curl -fsSL https://agiworkforce.com/install.sh | bash
# Or: GitHub releases
```

**Pitch for launch post:** "Codex CLI but with 10+ Providers including local Ollama. BYOK. No vendor lock."

---

### Wave 2 — Desktop v1.0 (Weeks 1–4, parallel with Wave 1)

Ship signed Desktop matching Claude Desktop minimalism (per design decision Q2=A).

| Week | Tasks                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | ~~Migrate apps/web's UnifiedAgenticChat~~ DONE per Wave 0 (apps/web/components/UnifiedAgenticChat/ deleted; live web chat is apps/web/features/chat/, 183 files). Remaining: triage desktop's apps/desktop/src/components/UnifiedAgenticChat/ (CommandPalette + SearchModal still imported as live overlays). Delete vestigial views from apps/desktop/src/components/ (~50 of 84 dirs). Estimate: 1-2 days. |
| 2    | **IPC pruning**: replace hand-listed `generate_handler!` with `inventory`/`linkme` proc-macro (FIX-023). Wire `apps/desktop/check-wiring.sh` into CI. Delete the 26 silently-dead commands + audit the 169 never-invoked.                                                                                                                                                                                    |
| 3    | **Windows code signing** (FIX-010): acquire EV cert; add `WINDOWS_CERTIFICATE` secret; wire AzureSignTool in release-desktop.yml. Test: `signtool verify /pa <installer>.exe`. Refuse to ship unsigned.                                                                                                                                                                                                      |
| 4    | **Polish + privacy**: rewrite Privacy Policy (FIX-008 with counsel), GDPR Settings → Data section (FIX-041), regression tests, signed release pipeline end-to-end test. Tag desktop v1.0.0.                                                                                                                                                                                                                  |

**Distribution:**

- agiworkforce.com/download → DMG + EXE + AppImage
- Auto-update via Tauri updater (already configured with minisign key)
- Mac App Store + Microsoft Store deferred (sandboxing rework)

**Pitch:** "Claude Desktop + ChatGPT + Gemini in one app. Use your own keys. Add local Ollama. Mobile companion approves agent actions from your phone."

---

### Wave 3 — Mobile + Extensions + Web Polish (Weeks 5–8)

| Surface                                  | Tasks                                                                                                                                                                        | Time                             |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| **Mobile (iOS App Store + Google Play)** | EAS Build, register Apple Developer Team ID, Google Play Developer account, App Store listing (screenshots, privacy policy, age rating), TestFlight beta, then submit.       | 3–4 weeks (review time included) |
| **Chrome ext**                           | Submit to Chrome Web Store. Screenshots, listing copy, privacy disclosure.                                                                                                   | 1–2 weeks                        |
| **VS Code ext**                          | Submit to VS Code Marketplace. README screenshots, demo gif.                                                                                                                 | 3–7 days                         |
| **Web**                                  | Fix WEB-4 (Stripe body-read), add observability (Sentry breadcrumbs end-to-end), CSP unsafe-inline removal (FIX-005 codemod). Hobby tier launch. Pro/Max waitlist page live. | 1 week                           |

---

## Beyond MVP (post-Wave 3)

- Linux computer-use (AT-SPI/libei integration — currently Path B placeholder per FIX-025)
- Real Google Cloud Batch integration (replace stub per FIX-028)
- EU data residency (currently us-east-2 only)
- Pro/Max tier launch (after security audit)
- Enterprise features: SSO, SCIM, custom retention
- Multi-agent / teams (currently stubbed in apps/cli/src/{teams.rs,subagent.rs})

---

## Decisions log (key product decisions, 2026-05-03)

| Decision               | Choice                                                                                       | Rationale                                             |
| ---------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Strategy               | Path C (CLI + Desktop in parallel, then mobile/ext/web)                                      | Maximize visibility while building richer surfaces    |
| Design                 | Pixel-close Claude Desktop UI clone                                                          | Lowest design risk, fastest user learning             |
| Web chat consolidation | ~~Migrate UnifiedAgenticChat → packages/chat~~ DONE Wave 0 (live at apps/web/features/chat/) | Single canonical component, mode-agnostic             |
| Pricing                | Local-only + BYOK free, Hobby paid only at MVP, Pro/Max waitlist                             | No managed cloud at scale until security audit clears |
| 110 dead crates        | Delete (preserved at ~/Desktop/reference/codex-cli/)                                         | -995K LOC; codex source preserved for re-port         |
| SSOT location          | Single AGI_WORKFORCE.md at root + docs/ reorg                                                | Discoverable entry point, version-controlled          |

## How to update this file

When a wave ships:

1. Move "Wave N" section into a "## Wave N — SHIPPED YYYY-MM-DD" entry above current state
2. Add what's actually live (binary versions, distribution channels)
3. Update "Current state" at top with latest sprint

When a sprint completes:

1. Move the sprint's plan file from `docs/plans/` to `docs/plans/archive/`
2. Update the "Active sprint" line at top
