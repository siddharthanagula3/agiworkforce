# Mobile Prompt Markdown

_Started 2026-05-18 11:39 UTC_

---

## User

use mobile prompt md file

## Assistant

_[tool: local_ls]_

_[tool: local_read]_

_[tool: questions_v2]_

This is a massive prompt — 41 screens × ~6 states × 2 themes = ~280 frames. Combined with the **Wireframe** skill you attached, I should approach this as broad exploration rather than trying to ship ~280 polished frames in one shot.

Let me ask a few quick scoping questions before diving in.

## User

Questions answered:

- variation_count: 6
- fidelity_check: Decide for me
- scope: Everything — do all 41 at wireframe fidelity
- vary_what: you decide.
- presentation: Decide for me
- device_frame: Yes — iPhone 15 Pro Max bezel (430×932) per the prompt
- android: Yes — Android for the 3 specified screens
- states: Decide for me
- themes: Both light and dark for every screen
- novelty: Also Perplexity patterns.
- anything_else: follow the prompt.

## Assistant

_[tool: update_todos]_

_[tool: list_files]_

Big scope — let me lay out a plan and get moving.

_[tool: list_files]_

_[tool: copy_starter_component]_

_[tool: copy_starter_component]_

_[tool: copy_starter_component]_

Design system is empty — fine, I have all tokens from the prompt. Let me copy starters.

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: grep]_

_[tool: read_file]_

_[tool: write_file]_

Plan locked in: wireframe aesthetic (sketchy fonts, b&w + sparing accent), each screen at 430×932 inside a simplified phone shell, light+dark pairs, and 4-6 variants on the truly hero screens. Let me build the kit first.

_[tool: grep]_

_[tool: write_file]_

Let me build the index + system page + chat section first to verify the pipeline, then knock out the rest.

_[tool: write_file]_

Now writing screens-system.jsx and screens-b-chat.jsx first to verify, then I'll knock out the rest in parallel.

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: show_html]_

Let me write stubs for remaining sections and the app.jsx, then verify the pipeline works.

_[tool: show_html]_

_[tool: get_webview_logs]_

_[tool: save_screenshot]_

Clean. Let me take a quick screenshot to make sure the variants render properly, then knock out the remaining sections.

_[tool: view_image]_

_[tool: write_file]_

_[tool: write_file]_

Pipeline works. Now I'll batch out the remaining sections. Starting with A, C, D in parallel.

_[tool: write_file]_

_[tool: write_file]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Good references. I'll update the Perplexity-style empty state and model picker to be more faithful, and add a ChatGPT-style drawer + plus menu as alternates. Also adding a "Model council" concept (Perplexity's multi-model = our Compare).

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Now ChatGPT-style drawer, replacing Drawer_V2:

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: write_file]_

_[tool: write_file]_

Now sections F + G + H + I + J + Android — knocking these out:

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: write_file]_

_[tool: done]_

All sections written. Let me verify it loads cleanly.

_[tool: snip]_

_[tool: fork_verifier_agent]_

Done — **~145 wireframe artboards** across **12 sections** matching the prompt's §4 inventory:

- **00 System** + **01 Components** (tokens, type ramp, 12 cross-cutting reusables)
- **A First-run** — 6 onboarding variants (conventional · editorial · manifesto · privacy-promise · carousel · provider-band), mode pick, login, reset
- **B Chat** — 6 empty-state variants incl. true **Perplexity-style** (wordmark + segmented tabs + rich composer), active, long-press, Compare (+ paywall)
- **C Cap** — 6 cap-reached variants (conventional · side-by-side · timer-hero · soft · per-modality · inline)
- **D Composer** — 3 plus-menu variants (**AGI grid · Perplexity Options · ChatGPT list+strip**), 6 model-picker variants incl. **Perplexity "Models" with max badges**, voice record + review
- **E Drawer** — 6 drawer variants incl. **ChatGPT-style** (Projects + Recents + floating Chat FAB), gesture-peek, About
- **F Destinations** — Skills (+ empty), Projects (+ empty), Dispatch, Connectors, Settings index, Account
- **G Settings** — Personalization · Memory w/ competitor-import · Notifications · Capabilities · Auto-approve · Integrations · Storage+DSAR · Voice (locked never-train)
- **H Agents + Companion** — list, detail, 6 Companion variants (orb · text-reveal · bars · multi-agent · card-stack · lock-screen)
- **I Misc** — 6 Billing variants (stacked · carousel · table · estimator · annual-push · App Store sheet), Camera, Share preview, Widgets
- **J Legal** — index, Article 50, 404/offline/server-error
- **Android** — Drawer · Onboarding · Storage (per §0)

Sketchy aesthetic per the Wireframe skill (Patrick Hand / Caveat handwritten type, b&w + sparing teal/terracotta/danger). Every artboard has a dark twin (a few have multiple). Drag-reorder, inline-rename, and fullscreen focus all work via the design canvas.

The Perplexity multi-model concept ("Model council Max") shows up in the **Plus menu V2** as a Pro+-locked row — that's how the prompt's `compare` (lock B8) surfaces as an in-composer option, not a separate destination.

Open any artboard fullscreen with the expand button; ←/→ to cycle within a section, ↑/↓ across sections.Acknowledged — verifier finished cleanly (no issues flagged). The deck is ready for review.

## User

<pasted_text name="Pasted text (107 lines)">

# v1 = local-only, cloud is waitlist gate (locked 2026-05-18)

        8
        9 User directive 2026-05-18, verbatim summary: "we are not building cloud mode for v1 so there is no need of development for that area right now. but we need screen for waitlist. cloud is paid
           and it will be subscription based and top up based with minimum top up according to country."
       10
       11 ## What v1 ships (free, forever, no account required)
       12
       13 Everything that runs on the user's own silicon. Specifically:
       14 - Text chat (Apple Foundation Models / executorch / llama.rn, capability-routed)
       15 - Image analysis with question (on-device vision — Llama 3.2 Vision / Phi-3.5-vision / Apple FM vision)
       16 - Voice in + voice out (iOS Speech / Whisper local / Piper or system TTS)
       17 - File Q&A (PDF, txt, code, markdown)
       18 - HealthKit query (on-device only)
       19 - Photos / Camera / Files / Calendar / Contacts integration (on-device only)
       20 - Long-context chat (capped by device RAM)
       21 - Multi-model compare across local models (Llama 1B vs 3B vs Apple FM)
       22 - Memory (local-encrypted, sqlite-vec)
       23 - Projects (local-only file org)
       24 - Skills (copy from GitHub, runs on device)
       25 - OCR / Translate (Apple Vision / Translate frameworks)
       26
       27 ## What v1 does NOT ship
       28
       29 - BYOK provider key entry (no field surfaced; if user has cloud API keys, they're not enterable in v1)
       30 - Cloud subscription tiers (no pricing cards)
       31 - Connectors that require server-side OAuth (GitHub, Notion, Linear, Slack, Drive, Plaid)
       32 - Web search (cloud-only)
       33 - Computer use (cloud-only)
       34 - Image generation (defer to v1.1; Stable Diffusion on iPhone is too thermally heavy in 2026)
       35
       36 ## Cloud waitlist UX (every cloud-touching surface)
       37
       38 - Mode toggle in chat header: `[On-device]` (active) `[Cloud · 🔒]` (locked)
       39 - Tapping locked Cloud → waitlist sheet
       40 - Waitlist fields: email (required) + country (optional, for future PPP pricing)
       41 - Storage: Supabase `cloud_waitlist` row (insert-only RLS, public-anon-write)
       42 - Confirmation state: "You're confirmed. We'll email you when cloud opens." (no public date)
       43 - After sign-up: future locked-cloud taps show "You're on the waitlist — joined Mar 18."
       44
       45 ## Cloud pricing model (locked, deferred to post-waitlist)
       46
       47 - **Subscription tier** (monthly + annual w/ 17% discount per pricing-billing lock)
       48 - **Top-up tier** (pay-as-you-go credits)
       49 - **Minimum top-up = PPP-adjusted per country** (low for India, standard for US/EU). Exact thresholds TBD when waitlist hits target.
       50 - Pricing exposed in-app ONLY after cloud opens — not in v1.
       51
       52 ## India-first GTM (locked)
       53
       54 Why India first:
       55 - App Store / Play Store downloads + ratings drive trust signal for global discoverability
       56 - Indian price sensitivity ("think for even $1 spend") → low cloud conversion expected, accepted
       57 - Local mode is free → no friction, high install rate
       58 - Builds userbase + reviews + developer trust for **AGI Automation LLC** developer brand
       59 - Other countries (US, EU) convert later for cloud once social proof exists
       60
       61 Implications for UI:
       62 - Storage sizes shown prominently per model (mid-market phones have ~256 GB, often shared with photos)
       63 - "Download over Wi-Fi" recommendation on >500 MB model files (3G/4G common outside metros)
       64 - Thermal warnings for inference-heavy operations (tropical climate, older devices)
       65 - DPDP Act 2023 (India's GDPR equivalent) compliance signaling in About + Settings/Privacy
       66 - Hindi UI strings deferred to v1.1 (English-only v1, system-locale for date/number formats)
       67
       68 ## Developer brand
       69
       70 - **Public developer name (App Store + Play Store + About page):** AGI Automation LLC
       71 - **Jurisdiction:** Delaware, USA
       72 - **Trust signals to surface in app:**
       73   - "AGI Automation LLC · Delaware, USA"
       74   - "Apple-verified developer"
       75   - "DPDP Act 2023 compliant"
       76   - "No account required"
       77   - "Works in airplane mode"
       78   - "Your conversations never leave your phone"
       79
       80 ## What's removed from prior design prompt (2026-05-18 v1)
       81
       82 These screens / concepts existed in the first prompt and must be deleted/transformed:
       83 - Cap warning banner (no caps locally)
       84 - Cap-reached blocking sheet (no caps locally)
       85 - Usage breakdown (transformed → Performance page: tokens/sec, device tier)
       86 - Billing screen (transformed → Waitlist screen)
       87 - Pricing 5-cards w/ M/Y toggle (deleted from v1; reappears post-waitlist)
       88 - BYOK consent modal (deleted)
       89 - Provider key entry modal (deleted)
       90 - Hobby cloud mode card in onboarding (deleted)
       91 - Login screen (no account required in v1 — only optional for cross-device sync via cloud later)
       92 - Provenance chip showing $cost (transformed → `tok/s` + `first-token-latency`)
       93
       94 ## What's added to design prompt v2
       95
       96 10 local edge cases + waitlist flow + performance page + on-device feature screens:
       97 - File too large prevention modal
       98 - File unreadable error
       99 - Image too large prevention
      100 - Offline banner (celebratory — "no problem, you're local")
      101 - Tap-cloud-model waitlist tease
      102 - Battery-low inference warning
      103 - Storage-full model-download modal
      104 - Thermal throttle composer chip
      105 - Model loading first-run sheet
      106 - Context-getting-long nudge ("start fresh chat for faster responses")
      107 - Waitlist email entry + confirmation
      108 - Performance / device-tier page
      109 - Image-with-question full-screen flow
      110 - Document Q&A drop-zone
      111 - OCR scan flow
      112 - On-device translate

</pasted_text>

## Assistant

_[tool: update_todos]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Big v1 pivot — local-only ships, cloud becomes a waitlist gate. Updating the wireframes now: removing all cap/billing/login/BYOK screens, transforming usage→performance and billing→waitlist, and adding the 17 new local-edge-case + on-device feature screens as a new Section K.

_[tool: write_file]_

Now the big additions — Section K (local edge cases + waitlist + perf + on-device features):

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Now register Section K and gut the old screens.Now stripping out the obsolete sections — Section C (caps), Billing variants in I, Login/Reset/Hobby in A:

_[tool: write_file]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Now Section A — remove Login/Reset/Hobby cloud and replace mode pick with a local-welcome + trust signals:

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: grep]_

_[tool: read_file]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Now Account → Profile (local), Drawer profile row, About with trust signals:

_[tool: grep]_

_[tool: read_file]_

_[tool: str_replace_edit]_

_[tool: grep]_

_[tool: grep]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Now update \_ChatTop with mode toggle, Drawer V1 tier badge:

_[tool: grep]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Now the System page table + the dead Billing variants in I and Login/Reset in A:

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Now verify everything still loads cleanly with the v1 pivot:

_[tool: done]_

_[tool: snip]_

_[tool: fork_verifier_agent]_

**v1 pivot landed.** What changed:

**Removed (cloud-only, deferred to waitlist):**

- Section C entirely (caps + usage breakdown)
- Billing 6 variants in Section I
- Login + Reset in Section A
- BYOK mode-pick card; "Hobby cloud" card
- All `$cost` provenance chips

**Transformed:**

- **Provenance chip** → on-device only: `↳ Llama 3.2 3B · on-device · Tier 2 · 22 t/s · ttft 180ms`
- **Mode-pick → Local-welcome** with the 5 trust signals (Apple-verified, DPDP Act 2023, no account, airplane mode, never leaves your phone) and a cloud-tease row
- **Account → Profile** (local-only, no email/billing/2FA)
- **Settings index** now: Local · On-device · System (with Cloud-waitlist + Privacy & DPDP rows)
- **About** prominently surfaces _AGI Automation LLC · Delaware, USA_ with the trust-signal block
- **Chat top bar** now carries the `[On-device][Cloud · 🔒]` mode toggle
- **Compare** is now on-device only (Apple FM 3B / Llama 3B / Qwen 0.5B), paywall sheet is a waitlist sheet
- **Plus menu V2** "Agent mode Pro+" → "Cloud · waitlist 🔒"

**Added — new Section 13 (K · Local v1 additions, 26 artboards):**

- **Waitlist flow** — email entry (with optional country for PPP pricing later) · confirmation · "already-joined" tap-tease
- **File/image guards** — file too large (with "split into 11 chunks" affordance) · file unreadable (OCR offer) · image too large (downscale to 1024)
- **Connectivity + device** — offline banner (celebratory ✈️) · battery-low inference warning · storage-full with smaller alternatives (Qwen 0.5B / Phi 3.5 mini) · thermal-throttle composer chip 🌡️
- **First-run + context** — model loading first-run sheet (Wi-Fi rec, ~3 min) · context-getting-long nudge with token meter
- **Performance page** — replaces Usage breakdown: device tier, loaded models with tps/ttft, live thermal + battery + DPDP audit
- **On-device features** — image + question full-screen · document Q&A drop-zone (idle + drag-over) · OCR scan with live recognized-text overlays · on-device translate (Hindi → English example for the India-first GTM)

System page now documents the v1-vs-waitlist split + the developer-brand trust signals as the canonical reference.

Verifier running in the background — will only ping if something's off.Acknowledged — verifier cleared the v1 pivot. Ready for review.
