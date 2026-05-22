# 14-day pre-launch checklist — AGI paid-tier graduation

**Window**: July 18 → July 31, 2026 (Aug 1 = paid-tier go-live)
**Source**: converged iteration-3 research synthesis (see `~/.claude/projects/.../memory/launch-playbook-2026-05-16.md`)
**Owner**: solo founder
**Mode**: ship, not research

---

## Pre-window setup (May 16 — May 30, before checklist starts)

These are the human-only blockers. Do them now, not in the 14-day window.

- [ ] Renew Apple Developer Program PLA (1 hour, $99) — unblocks macOS notarization pipeline
- [ ] Pick brand mark A / B / C from `docs/design/brand-mark-proposals/preview.html` (5 min)
- [ ] Apply to Anthropic Partner Program (4-6 week processing)
- [ ] Apply to OpenAI Startups (4-6 week processing)
- [ ] Apply to Google for Startups Cloud (2-4 week processing)
- [ ] Apply to AWS Activate (2-4 week processing)
- [ ] Write 5 cold DMs to r/cursor Auto-routing threads + OpenRouter UI complaint threads. Goal: 2 interviews booked this week.

## Pre-window product work (May 30 — July 17)

In parallel with interviews. From `memory/v6-roadmap-decisions-2026-05-16.md` Days 1-30:

- [ ] BYOK polish suite: per-provider quota dashboards
- [ ] BYOK polish suite: auto-fallback when rate-limited
- [ ] BYOK polish suite: unified spend tracking across providers
- [ ] BYOK polish suite: key rotation UX
- [ ] BYOK polish suite: secure encrypted storage (Stronghold + keyring)
- [ ] WaitlistSignup component + Supabase `waitlist_signups` table
- [ ] Pricing page CTA flip: paid tiers → "Join Waitlist"
- [ ] `packages/types/src/billing-catalog.ts` update with new $99 Pro Max tier
- [ ] Run 12-15 customer interviews. Threshold to commit messaging: same pain cluster in same language + 3+ showing real workarounds + 3+ saying they'd pay now.

---

## Day -14 — July 18 (Fri)

- [ ] Freeze launch messaging: write one-sentence value prop + one-sentence who-not-for + one-sentence comparison vs first-party stacks
- [ ] Finalize ToS (Termly/Iubenda generator + BYOK custom clauses)
- [ ] Finalize Privacy Policy with explicit "AGI doesn't train; providers may" boundary
- [ ] Enable Stripe Tax in dashboard (NOT live mode yet; sandbox-verify)
- [ ] Verify EU online-withdrawal-button is wired (June 19, 2026 deadline already passed)

## Day -13 — July 19 (Sat)

- [ ] Instrument 5 events: `waitlist_signup`, `app_opened`, `provider_key_added`, `first_successful_response`, `returned_within_7_days`
- [ ] Verify source attribution on waitlist signups
- [ ] Half-day off — rest is non-negotiable

## Day -12 — July 20 (Sun)

- [ ] Recruit 10 interviewees from public threads complaining about routing/UI fragmentation
- [ ] Send cold DMs using converged template (see playbook memory)

## Day -11 — July 21 (Mon)

- [ ] Run 3 customer interviews
- [ ] Pull exact phrases users use for switching pain — save to `tasks/launch-templates/user-quotes.md`

## Day -10 — July 22 (Tue)

- [ ] Draft HN Show post (use converged template from launch-templates)
- [ ] Draft 6 objection responses (wrapper, why-not-OpenWebUI, why-not-TypingMind, why-not-OpenRouter, sherlocking, privacy)
- [ ] Draft FAQ page honestly naming TypingMind / Open WebUI / LibreChat / Cherry Studio

## Day -9 — July 23 (Wed)

- [ ] Cut one 60-second demo video (paste prompt → show model → run two side-by-side → continue on second surface → tagline)
- [ ] Cut one 5-minute walkthrough (deeper explanation, secondary asset)
- [ ] No polish beyond clarity

## Day -8 — July 24 (Thu)

- [ ] Identify 3-8 mid-tail YouTube creators (5K-100K subs) reviewing TypingMind / Open WebUI / LibreChat / Cherry Studio
- [ ] Send personalized outreach + free Pro+ tier offer + optional $150-$500 honest-review fee

## Day -7 — July 25 (Fri)

- [ ] Post ONE non-promotional contribution in each target community (r/cursor, r/ClaudeAI, r/LocalLLaMA, OpenRouter Discord, Open WebUI Discord). Do NOT mention launch.
- [ ] Submit Product Hunt listing for Aug 1 (12:01am PT schedule)
- [ ] Weekly Friday review: activation funnel by source

## Day -6 — July 26 (Sat)

- [ ] Send waitlist Email 1: "AGI goes paid on August 1"
- [ ] Segment respondents by current stack
- [ ] Half-day off

## Day -7 to Day -3 — July 26-29

- [ ] Run 3 more customer interviews with high-intent waitlist respondents
- [ ] Collect 2 short testimonials / quotes for landing page
- [ ] Office hour in one AI Discord on "Configuring BYOK safely across multiple providers"

## Day -3 — July 29 (Tue)

- [ ] Publish 2 long-tail comparison pages ("TypingMind vs AGI for power users", "OpenRouter UI options 2026")
- [ ] NOT head-term content

## Day -2 — July 30 (Wed)

- [ ] Warm creator/community contacts with the demo + plain-English who-it's-for note
- [ ] Final ToS / refund language / unsubscribe footer / tax settings audit
- [ ] Test Stripe end-to-end: purchase → webhook → entitlement unlock → cancel → reactivate

## Day -1 — July 31 (Thu)

- [ ] Send waitlist Email 2: "Two days left — if AGI is for you, here's the test"
- [ ] Final dry run of launch-day flows (HN draft ready, PH ready, email queued, X thread queued)
- [ ] Block out August 1 morning calendar for pure launch handling — no new features, no polish
- [ ] SLEEP. Do not ship anything Aug-1-morning.

---

## Launch day — August 1 (Fri)

1. **8:00am PT** — Send waitlist Email 3: "AGI is live"
2. **8:15am PT** — Post Show HN. First comment = founder story + "what's missing" + 2-3 concrete feedback prompts.
3. **8:30am PT** — Post X launch thread (NOT linking PH/HN in first tweet to avoid engagement suppression)
4. **9:00am PT** — Post Product Hunt (auto-publishes 12:01am PT, but engage now)
5. **9:30am PT** — Post in r/cursor + r/ChatGPTPro + r/LocalLLaMA where the post itself teaches something
6. **9:30am PT — 4:00pm PT** — Stay in HN thread. Answer every serious comment. Do NOT post more links. Do NOT ship features.
7. **5:00pm PT** — End-of-day pulse: how many signups by source? Activation funnel intact?

---

## Days +1 to +14 (Aug 2-15)

- [ ] Day +1: Personally email any power user who used AGI for >1 hour, ask for brief call
- [ ] Day +2: Turn every high-quality objection into FAQ / comparison page
- [ ] Day +3: Send waitlist Email 4: "Should you actually switch?"
- [ ] Day +4: Publish founder retrospective with REAL numbers (not hype)
- [ ] Day +7: First Friday review post-launch — activation funnel by source, channel survival decision
- [ ] Day +10: Re-contact non-converters with one-question email: "What blocked the switch?"
- [ ] Day +14: Decide channel mix for Days 15-30 based on what compounded. Kill weak channels.

---

## Escalation triggers (escalate = stop ship, return to talk mode)

- Sub-5% waitlist → paid conversion after 15+ interviews → message problem, not feature problem
- No repeatable acquisition source after 30 days → narrow to one niche
- Under $2K MRR by Oct 31, 2026 → honest pivot/wind-down assessment

## What NOT to do during the 14-day window

- ❌ Add new features (lock at July 17)
- ❌ Re-pitch the brand (locked May 15)
- ❌ Open new research threads (loop is closed)
- ❌ Run more than 3 active acquisition channels in parallel
- ❌ Skip the off-days
- ❌ Reply to HN comments past 4 hours after losing front-page presence (move on)

---

## Templates referenced

When you reach Day -10, the templates should exist at:

- `tasks/launch-templates/hn-show-post.md` — paste-ready Show HN body
- `tasks/launch-templates/cold-dm-template.md` — 5 variants per audience
- `tasks/launch-templates/objection-handling.md` — 6 verbatim responses
- `tasks/launch-templates/waitlist-emails-1-4.md` — email sequence
- `tasks/launch-templates/user-quotes.md` — interview quotes for landing page

These don't exist yet. Generate them in a future session after 5+ interviews when you have real user language to anchor against.
