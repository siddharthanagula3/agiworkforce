# AGI — Mobile v1 — Claude Design prompt (v2, 2026-05-18)

> **Supersedes v1 of this prompt** (same filename, earlier today). Reason: 2026-05-18 strategic pivot — v1 is **local-only**; cloud is **waitlist-gated** everywhere. Lock: `~/.claude/.../memory/locks/v1-local-only-cloud-waitlist-2026-05-18.md`.

**Use this as a single paste-in prompt for Claude Design (Prototype tab, high fidelity).** Project name: `AGI — Mobile v1 (Local-only)`. Inherits the 16 locked frontend decisions and tokens from Desktop v1 prompt where they apply to local mode.

Authoritative refs:

- Tokens: `packages/design-tokens/src/index.ts`
- Reference screenshots: `~/Desktop/reference/ui/` (Claude iOS, ChatGPT iOS, Perplexity iOS, Gemini iOS, Apple Intelligence)
- Surface deep-dive: `docs/surfaces/mobile.md`
- Current product source: `docs/current/product-suite.md`
- Archived PRD V5 source material: `docs/archive/2026-05-21-docs-consolidation/PRD.md`

---

## 0 · The frame

**Product:** AGI runs entirely on the user's iPhone or Android device. No login. No account. No cloud. No subscription. No data leaves the device.

**Developer:** AGI Automation LLC · Delaware, USA.

**v1 launch market:** India (cost-sensitive, mobile-first, high install rate for free apps; downloads/ratings drive global trust).

**Pricing in v1:** $0. Forever. For everything that runs on-device.

**Cloud:** Waitlist only. Email capture. We'll email when it opens. (No public date.)

This is what we tell the user, top of every privacy-relevant screen and at every cloud-gate. The product _is_ the privacy promise.

---

## 1 · Claude Design settings

- **Tab:** Prototype
- **Fidelity:** High
- **Frame size:** iPhone 15 Pro Max — 430×932 pt (primary). Android 412×892 dp variants for Drawer, Onboarding, Settings/Storage, Waitlist.
- **Design system:** Custom (tokens below — don't pull from any pre-seeded library)
- **Output:** one frame per screen + a system page (tokens, components, type ramp)

---

## 2 · Brand & tokens

### Palette (unchanged from v1 of this prompt — see system page)

Primary teal `#21808d`, accent terracotta `#da7756`, warm-cream surfaces light, warm-near-black dark. Full table in the system page.

### Typography

- **Headings/Body:** SF Pro Display / SF Pro Text (iOS), Roboto (Android)
- **Mono (code, tool calls, performance numbers):** SF Mono / JetBrains Mono
- **Numerics (tok/s, model sizes):** tabular SF Pro

### Iconography

Single Lucide family at 24 px, 1.5 stroke. Filled exceptions only: send button, active tab indicator, on-device shield badge.

### Brand mark

Neutral geometric placeholder. Always paired with the wordmark `AGI`. **Tagline lock:** `AGI runs on your device.` (Tagline appears on: onboarding hero, About page, app store listing — nowhere else.)

**Never** mimic: Claude burst, OpenAI spiral, Gemini sparkle, Perplexity orbit.

---

## 3 · Mode model (the toggle)

A binary mode is shown in the chat header as a segmented control:

```
┌──────────────────────┬──────────────────────┐
│  ⚡ On-device  (active)│  🔒 Cloud · Waitlist  │
└──────────────────────┴──────────────────────┘
```

- Tapping **On-device** = noop (it's already active and the only working mode in v1)
- Tapping **Cloud · Waitlist** = opens the cloud waitlist sheet (see screen #6)
- After user joins waitlist, the Cloud chip shows a small `✓` plus the rank: `✓ Cloud · #1,247 in line`

This segmented control appears on:

- Chat header (primary placement)
- Settings → Mode

Everywhere else, the language is "on-device" — never "local" in user-facing copy. (Engineers call it `local`; users see `on-device`.)

### Why a visible toggle, not a one-mode app?

Three reasons: (1) discoverability of the cloud waitlist, (2) explicit reassurance that "right now you're on-device — your messages aren't going anywhere," (3) eventual zero-friction switch the day cloud opens for waitlisters.

---

## 4 · The 16 locks — adapted for local-only v1

| #   | Lock                                          | Mobile v1 manifestation                                                                                                         |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Cap = hard stop                               | **N/A in v1.** No usage caps. Replace cap concepts with `tok/s` performance + `context %` indicators                            |
| 2   | Model picker = pill + reasoning slider        | Composer pill opens on-device model picker; cloud section is one row labeled "Cloud · Join waitlist"                            |
| 3   | Voice = on-device default, never-train locked | iOS Speech / Whisper local; "Never train on my voice" is the only checkbox (no cloud opt-in until waitlist opens)               |
| 4   | IA = single chat + 6 task chips               | Chat is drawer #1. Chips: `Ask · Image · Voice · Read · Translate · Scan` (local-runnable verbs, not cloud features)            |
| 5   | Brand = AGI + "your AI team"                  | Mobile tagline lock: **"AGI runs on your device"**                                                                              |
| 6   | Artifacts = multi-file + MCP-live             | Multi-file artifacts in local file scope; MCP-live deferred to v1.1 (needs server bridge)                                       |
| 7   | Computer-use = Pro+ inclusive                 | **N/A in v1.** Computer-use is cloud-only — appears in model picker as locked w/ waitlist tease                                 |
| 8   | Provenance = always-on                        | Chip shows: `Llama 3.2 3B · on-device · Tier 2 · 42 tok/s` — never $cost                                                        |
| 9   | Empty-state copy                              | `"What's on your mind, [Name]?"` + time variant. On-device shield badge sits above                                              |
| 10  | Drawer order                                  | Chat · Skills · Projects · Memory · Connectors · Settings (no Dispatch in v1 — cloud-only)                                      |
| 11  | Plus menu order                               | Camera · Photos · Files · Scan (OCR) · Voice · Skills · Translate (no GitHub, no Web search — both cloud)                       |
| 12  | No mode menu (4-mode style)                   | Confirmed — only the on-device/cloud segmented control                                                                          |
| 13  | Skills = GitHub-indexed, copy-into-workspace  | Same. Caption: "Runs entirely on your device"                                                                                   |
| 14  | Pricing = 5 cards + M/Y toggle                | **DELETED for v1.** Replaced by single Waitlist screen                                                                          |
| 15  | Memory = import-from-competitor-providers     | **TRANSFORMED for v1:** import from on-device sources (Files, Notes, exported ChatGPT/Claude JSON, etc.) — all parsed on-device |
| 16  | Annual = 17% / 50% off                        | **N/A in v1** (no paid product)                                                                                                 |

---

## 5 · Screen inventory — local-first v1

Total: **48 screens** (was 41 — added waitlist flow + 10 local edge cases + performance + on-device feature screens; removed cap/billing/BYOK/login screens).

### A · First-run (3 screens — no auth, no mode pick)

1. **Onboarding hero — privacy promise**
   Full-bleed dark. Brand mark center. Wordmark `AGI` + tagline `AGI runs on your device.`
   Subheading: `No login. No cloud. No tracking. Free forever.`
   Three small trust chips horizontal: `🔒 On-device only` · `✈️ Works offline` · `🇮🇳 DPDP Act 2023 compliant`
   Primary CTA: `Start chatting` (no email, no signup)
   Tiny footer: `Made by AGI Automation LLC · Delaware, USA`

2. **Device-tier detection**
   AGI inspects the device and shows: `Your iPhone 13 Pro Max routes to: Tier 2 · react-native-executorch · best balance of speed + quality`
   Below: per-tier card showing the default model that'll be downloaded (`Llama 3.2 3B · 2.1 GB`) + estimated download time on Wi-Fi (~3 min).
   CTA: `Download model (Wi-Fi only)` (toggle: `Download over cellular too` — off by default).
   Secondary: `Pick a different model` → opens local model picker (screen #18)

3. **First model download — progress**
   Centered radial progress, model name + size + speed (`Llama 3.2 3B · 2.1 GB · 14 MB/s`).
   Below: `Stays on your device.` `Ready in ~2 min.`
   When complete → auto-routes to Chat empty state (screen #7)

### B · Mode toggle + cloud waitlist (3 screens — NEW)

4. **Mode toggle (in chat header)** — segmented control as spec'd in §3. Two states: cloud-locked vs cloud-on-waitlist.

5. **Cloud waitlist — email entry**
   Half-sheet from bottom (not full-screen — feels like a side concern).
   Headline: `Cloud opens soon.`
   Body: `Want to use Claude, GPT, Gemini directly in AGI? Get notified when cloud opens. Paid by use — subscription + top-up, priced for your country.`
   Fields:
   - Email (required, validated)
   - Country (optional, default = device-locale-inferred, lets us prep regional pricing)
     Privacy line: `We'll only email you when cloud opens. No marketing.`
     CTA: `Join waitlist` (primary teal)
     Secondary: `Maybe later` (close sheet)

6. **Cloud waitlist — confirmed**
   Same sheet, replaced content.
   Big ✓ icon (teal).
   Headline: `You're in.`
   Body: `You're #1,247 in line. We'll email [user@example.com] when cloud opens.`
   Caption: `Want to be earlier in line? Share AGI with friends.` (deep-link share button)
   CTA: `Back to chat` (closes sheet, header chip updates to `✓ Cloud · #1,247 in line`)

### C · Chat surface (4 screens)

7. **Chat — empty state (on-device)**
   Top: hamburger left, segmented mode toggle right of title, new-chat icon far right.
   **On-device shield badge** below title bar (subtle, teal-tinted): `On-device · Llama 3.2 3B · Tier 2`
   Display headline centered: `What's on your mind, Siddhartha?` (or time variant `It's late-night, Siddhartha`)
   6 task chips below composer, in lock #11 order:
   `Ask · Image · Voice · Read · Translate · Scan`
   Composer at bottom: model pill (right), plus (left), mic (between).

8. **Chat — active conversation**
   Message list scrolls; sticky bottom composer.
   User bubbles: terracotta-tint, right-aligned.
   Assistant bubbles: no background, full-width text.
   **Performance chip** below each assistant turn (replaces v1 prompt's cost provenance):
   `Llama 3.2 3B · on-device · 42 tok/s · 1.1s first token`
   Tap chip → opens detail sheet (screen #46).
   Inline tool calls: collapsible bars (icon + status + chevron). All on-device tools.
   Stop-generating FAB during streaming.

9. **Chat — context filling up (NEW)**
   Once context ≥ 75% full, a subtle inline nudge appears above the composer (not a banner):
   `Chat is getting long. [Start a fresh chat] for faster responses.`
   When ≥ 95% full, nudge upgrades to chip with shake animation. Tap → confirms + creates new conversation, optionally piping memory.

10. **Compare — local models side-by-side**
    Split view, same prompt run on `Llama 3.2 1B` vs `Llama 3.2 3B` vs `Apple Foundation Models` (if available on device).
    Each column shows: model name, tok/s, first-token-latency, full response.
    Footer chip per column: `Use this model` (sets default).
    Free, always — this is the kind of feature that competitors gate behind subscription.

### D · Composer overlays (5 screens)

11. **Plus menu sheet**
    Half-sheet. Grid of 7 items in lock #11 order: `Camera · Photos · Files · Scan · Voice · Skills · Translate`.
    Each item: Lucide icon + label + tiny caption (e.g. `Camera — analyze in real-time`).
    Cloud connectors row at bottom: greyed `GitHub · Notion · Drive · Slack — open after waitlist [Join waitlist →]`

12. **Local model picker sheet**
    Half-sheet. Top: search.
    Sections:
    - **Installed** (currently downloaded) — each row: model name, size, runtime tier, tok/s benchmark, `In use` badge or `Switch` action.
    - **Recommended for your device** — based on tier detection, 3 models.
    - **Available to download** — full catalog grouped by family (Llama, Phi, Apple FM, Gemma, Qwen-local).
    - **Cloud** — one collapsed row: `Claude · GPT · Gemini · Mistral · Perplexity — open after waitlist [Join →]`
      Each downloadable row: size, runtime tier, download CTA. Tapping triggers download progress sheet (screen #25).

13. **Image-with-question — full screen (NEW, FREE in v1)**
    Full-screen takeover, image fills 70% of viewport.
    Bottom: composer field pre-filled with placeholder `What's in this image?` (editable).
    Optional: pencil tool overlay to circle areas of the image (sent as bounding-box prompt to vision model).
    Performance chip below send button: `Llama 3.2 Vision · on-device · ~6s for first token`
    Note for design: this is the feature where AGI undercuts ChatGPT Plus / Claude Pro — call it out copy-wise in App Store screenshot, not in-app.

14. **Voice — recording (on-device)**
    Full-screen takeover. Pulsing terracotta orb mid-screen. Live waveform. Timer top.
    Badge above orb: `Listening on-device · iOS Speech` (or `Whisper-small`)
    Cancel (X) bottom-left; Send (filled mic) bottom-right.
    Below orb: caption `Audio never leaves your device.`

15. **Voice — review**
    Transcribed text in composer (editable), mic icon shows ✓, link `Tap mic to re-record`.
    Send button enabled.

### E · Local edge cases (10 screens — NEW)

These are the "what could go wrong" surfaces that turn a polished app into one that survives App Review and real-world use.

16. **Offline banner (celebratory)**
    When OS reports offline: thin chip below top bar: `✈️ Offline — on-device mode works as normal.`
    Color: success-green tint (not warning yellow). This is the moment AGI's value prop pays off — celebrate it.

17. **Tap-cloud-model → waitlist tease**
    Half-sheet, opens from model picker.
    Headline: `Cloud opens soon.`
    Body: `Claude Opus 4.7 isn't on this device. Get notified when AGI cloud opens.`
    CTAs: `Join waitlist` (primary) · `Use [recommended local model]` (secondary)

18. **File too large — prevention**
    When user picks a file >10 MB in plus menu:
    Modal: `This PDF is 47 MB. On-device models work best with files under 10 MB.`
    Three CTAs stacked: `Trim to first 10 pages and upload` · `Upload anyway (slow)` · `Cancel`

19. **File unreadable — recovery**
    Toast that opens a sheet on tap:
    Title: `Couldn't read this file.`
    Body: `It may be password-protected, encrypted, or in an unsupported format. Supported: PDF, TXT, MD, CSV, JSON, common code, common images.`
    CTAs: `Try another file` · `Get help`

20. **Image too large — prevention**
    Modal: `This photo is 12 MP — bigger than on-device vision needs.`
    CTA: `Resize to 2048×2048 and continue` (primary, default) · `Cancel`

21. **Storage full — pre-download**
    Modal when user tries to download a model bigger than free space:
    `Llama 3.2 3B needs 2.1 GB. You have 800 MB free.`
    CTAs: `Manage storage` (deep-link to iOS Settings → Storage) · `Pick smaller model (Llama 3.2 1B · 730 MB)` · `Cancel`

22. **Battery low + heavy inference**
    Modal when user starts a long-context request while battery < 15%:
    `Your battery is at 8%. Heavy AI inference drains quickly.`
    CTAs: `Continue` · `Switch to lighter model (Llama 3.2 1B)` · `Plug in first` (closes modal, waits for plug-in event)

23. **Thermal throttle — composer chip**
    Subtle yellow chip in composer when device thermal state ≥ "warm":
    `⚠ Device is warm — responses may slow`
    Tappable → small sheet explaining what's happening + tip to let device cool. Not blocking.

24. **Model loading — first run**
    When user sends first message and model isn't loaded into memory yet:
    Inline skeleton with caption: `Starting Llama 3.2 3B on your device's Neural Engine — first run only…`
    Progress fills as model loads. Disappears once first token streams.

25. **Model download — progress (in-place in model picker)**
    Inline progress row replacing the "Download" CTA: model name, percent, MB/s, ETA.
    Cancel X far right. Background-download supported — sheet can close.

### F · Drawer + nav (3 screens)

26. **Drawer open**
    80%-width left sheet.
    Top: profile row — but in v1, no account, so row reads:
    `Hello, Siddhartha · Tap to add a name` (anonymous default).
    6 nav items per lock #10 (Chat, Skills, Projects, Memory, Connectors, Settings).
    Mode chip at top below profile: `On-device · Tier 2` with a small ⚡ icon.
    Footer: `About AGI` link + `v1.0.0` caption.

27. **Drawer collapsed gesture peek** — same as v1 of this prompt.

28. **About AGI**
    Brand mark hero. Wordmark + tagline `AGI runs on your device.`
    Version + build number.
    Trust block (centered, vertical stack):
    `AGI Automation LLC · Delaware, USA`
    `DPDP Act 2023 compliant`
    `No data sent to servers in on-device mode`
    `Apple-verified developer`
    Below: links — Privacy Policy · Terms of Service · Open-source acknowledgments · Article 50 disclosure.

### G · Drawer destinations (5 screens)

29. **Skills — on-device only**
    List of installed skills. FAB `+` to browse GitHub-indexed catalog.
    Each row caption: `Runs entirely on your device.`
    Empty state CTA: `Browse skills`.

30. **Projects — local**
    List of local projects. FAB `+`.
    Caption under empty state: `Projects stay on your device. Sync coming with cloud.`

31. **Memory — local + on-device imports**
    List of remembered facts (each: text, source-conversation link, delete-X).
    Top section: `Import from another app` — rows:
    - From a ChatGPT export.json file
    - From a Claude export
    - From Notes / Files / Drive (on-device file pickers)
      All parsing happens on-device. No cloud upload.

32. **Connectors — on-device only**
    Toggle list filtered to on-device-only integrations: HealthKit (iOS), Apple Photos, Files, Calendar, Contacts.
    Each row: icon, name, status (Connected / Disconnected), chevron.
    Greyed bottom section: `Cloud connectors (GitHub, Notion, Linear, Slack, Drive, Plaid)` — `Open after waitlist · [Join →]`

33. **Settings — section list**
    Sections: Mode (segmented control), Personalization, Memory, Voice, Connectors, Storage, Performance (NEW), Privacy, About.
    No Billing. No Account. No Notifications-prefs (push notifications are opt-in only at first install, not surfaced here in v1 — pushed to v1.1).

### H · Settings sub-screens (6 screens)

34. **Personalization** — display-name field (no email), theme picker, language picker (English only in v1, with placeholder for v1.1 Hindi + 9 Indian languages), accent picker.

35. **Memory (settings)** — see screen #31; this is the destination link from Settings → Memory.

36. **Voice (settings)** — toggle "Use on-device STT" (locked on in v1, cloud Whisper opt-in greyed `Open after waitlist`). The single locked checkbox: `Never train on my voice` (checked, disabled).

37. **Storage**
    Bar showing local DB + cache + downloaded models size.
    Per-row management:
    - Conversations (12.4 MB · `Clear`)
    - Cache (84 MB · `Clear`)
    - On-device models (`Manage` → opens model picker scoped to installed)
    - Memory (3.2 MB · `Manage` → opens memory list)
      Bottom: `Export all my data` (DSAR — produces a JSON zip on-device, share-sheet to save).
      Below that: `Delete everything` destructive red. Confirms 2x.

38. **Performance (NEW)**
    Device card top: `iPhone 15 Pro Max · A17 Pro · 8 GB RAM · iOS 18.3 · Tier 1 capable`
    Currently loaded model: `Llama 3.2 3B · 42 tok/s avg · 1.1s first-token avg`
    Tabs: 7-day chart of tok/s, first-token-latency, thermal events.
    CTA: `Benchmark this device` → runs 3-prompt test, shows results.
    Toggle: `Prefer faster, lighter model` (auto-routes to 1B for short prompts).

39. **Privacy — what stays on your device**
    A literal manifest, scrollable. Each row: data type + storage location + retention.
    Example rows:
    - `Your messages` → `On-device SQLCipher, encrypted with iOS Keychain key` · `Until you delete`
    - `Your voice recordings` → `Never stored — transcribed in real-time on-device`
    - `Photos you analyze` → `Processed in memory, not saved unless you save them` · `0s retention`
    - `HealthKit data` → `Read on-demand, never copied out of HealthKit` · `0s retention`
    - `Anonymous crash reports` → `Sentry, opt-in only` · `Off by default`
      Footer: `View Article 50 disclosure` link.

### I · Companion + on-device features (4 screens — NEW)

40. **Voice companion (ambient)**
    Full-bleed gradient. Centered pulsing orb. Status text: `Listening…` / `Thinking on-device…` / `Speaking…`. Tap orb to interrupt. All on-device.
    Badge above orb: `On-device · iOS Speech + Llama 3.2 3B + Piper TTS`

41. **Scan / OCR full-screen (NEW, FREE)**
    Camera viewfinder full-screen. Detected text outlined live (Apple Vision framework).
    Capture button bottom. After capture: extracted text appears + composer with prefilled `Summarize this` (editable).
    Performance chip: `Apple Vision · on-device · instant`

42. **Translate (NEW, FREE)**
    Two-pane layout: source language top, target language bottom.
    Source: detected automatically (or picker).
    Engine: Apple Translate on-device when available, else Llama 3.2 3B fallback.
    Performance chip: `On-device translation · Apple Translate`
    No 60-min/mo cap. No subscription. Free.

43. **Document Q&A drop-zone (NEW, FREE)**
    Card view with drag-affordance: `Drop a PDF, code file, or doc here. Then ask anything.`
    Recently-asked file list below.
    On-device RAG: file gets chunked + embedded with sqlite-vec, queries run locally.
    Performance chip per answer: `Llama 3.2 3B + sqlite-vec · on-device · 8s for retrieval + generation`

### J · Misc (3 screens)

44. **Camera** — same as v1 of this prompt (snap-to-attach).

45. **Share preview (incoming)** — preview of a shared conversation. CTA `Open in AGI`. For non-users: `Install AGI — free, on-device.` (App Store deep-link).

46. **Performance / provenance detail sheet (NEW)**
    Tap-target from performance chip on any assistant turn.
    Shows: model, runtime tier, tokens-in, tokens-out, first-token-latency, total-latency, tok/s, RAM peak, thermal state during inference, energy used (estimate).
    Caption at bottom: `Nothing sent to servers. All processing on your device.`

### K · Legal + errors (2 screens)

47. **Legal index** — list of: Privacy policy, Terms of service, Article 50 disclosure, Open-source acknowledgments, DPDP Act 2023 statement.

48. **+not-found / +error** — error fallback with brand mark, `Something went wrong` headline, `Go to chat` CTA, `Send anonymous diagnostic` opt-in checkbox.

---

## 6 · Cross-cutting components (design once, reuse)

1. **On-device shield badge** — small teal chip with shield icon. `On-device` or `On-device · Tier X`.
2. **Performance chip** — caption row: model + tier + tok/s + first-token-latency. Tap → screen #46.
3. **Tool-call bar** — collapsible row, icon + status + chevron. All tool calls in v1 are on-device.
4. **Inline citation pill** — only used when a doc Q&A response cites source; opens to highlighted span in source file.
5. **Sheet handle** — 36×4 rounded rect, top-center of sheets.
6. **Snackbar/toast** — bottom, auto-dismiss 4s.
7. **Empty-state illustration** — geometric mark + 1-line headline + 1-line caption + 1 CTA.
8. **Loading skeleton** — message-list + list-row variants.
9. **Offline banner** — celebratory green chip, "✈️ Offline — on-device mode works as normal."
10. **Cloud-waitlist tease sheet** — half-sheet, used everywhere a cloud feature is tapped.
11. **Permission prompt** — half-sheet shown BEFORE iOS dialog (Camera/Mic/Photos/HealthKit/Calendar/Contacts). Explains why in app voice first.
12. **Trust footer** — used on About + Onboarding + Privacy. Vertical stack: AGI Automation LLC · Delaware · DPDP Act 2023 · Apple-verified.

---

## 7 · States to design per screen

For each screen: render Loading / Empty / Populated / Error / Offline-celebratory / Light theme / Dark theme.

Expected total: **48 screens × ~3 useful states × 2 themes ≈ 290 frames**. Plus 12 components × 2 themes = 24. **Target ~315 frames.**

---

## 8 · Anti-patterns (always reject)

- Pricing cards in v1 (no paid product yet — waitlist only)
- Login screen (no account in v1)
- BYOK provider key entry (deferred to post-waitlist)
- Cap warning / cap-reached modals (no caps locally)
- Usage credits language anywhere
- `$cost` in provenance (replace with `tok/s`)
- Silent cloud fallback when user thinks they're local
- Charging for what runs on the user's silicon
- Hidden cloud waitlist (must be discoverable from chat header)
- Bottom tab bar (drawer only)
- "Let's build [repo]" coding-first empty state
- Cloud-default voice
- App Tracking Transparency for non-tracking flows
- Brand-mark mimicry (burst / spiral / sparkle)
- Heavy "AGI" or "Workforce" framing in copy — show, don't tell
- Hindi-only or English-only assumption in v1.1 prep — leave room for both
- INR pricing display in v1 (no pricing at all yet)

---

## 9 · India-specific UI calls (v1)

- **Storage sizes shown prominently** in MB/GB next to every model + file
- **Wi-Fi recommendation** on any download > 500 MB ("Use Wi-Fi for best speed")
- **Cellular-download toggle** off by default
- **Lakh/crore number format** deferred to v1.1; v1 uses standard comma format
- **DPDP Act 2023 compliance signaling** on About, Privacy, Onboarding hero
- **Tagline `AGI runs on your device.`** translatable to Hindi for v1.1: `आपके फ़ोन पर ही चलने वाला AI`
- **Trust footer** always names `AGI Automation LLC · Delaware, USA` — Indian users specifically look for US/EU registration as a quality signal
- **Apple Vision / Apple Translate** preferred over downloaded models when available — saves Indian users mobile data + storage

---

## 10 · Connector v1 cut

In v1 the Connectors screen shows only **on-device** sources:

✅ v1 (working on-device):

- HealthKit (iOS) — query workouts, sleep, vitals
- Apple Photos — access library, run vision on-device
- Files — read PDF, code, docs from on-device storage
- Calendar — read events, write events with confirmation
- Contacts — read with explicit permission

⏸ Post-waitlist (greyed in UI, `Join waitlist` CTA):

- GitHub
- Notion
- Linear
- Slack
- Google Drive
- Plaid (financial) — deferred even longer per prior product decision

---

## 11 · The waitlist data model (engineering note for the prompt consumer)

When implementing, the waitlist screens land rows in `supabase.public.cloud_waitlist`:

```sql
create table cloud_waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  country text,
  device_model text,
  device_tier int,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  unique (email)
);
```

RLS: anyone can insert their own email (anon write), nobody can select (no leaking the list). The `#N in line` count comes from a `count(*) where created_at < self.created_at` aggregate exposed via a security-definer RPC.

---

## 12 · Output expectations

Pages in Figma file, in order:

1. **00 — System** (palette, type ramp, components, brand)
2. **01 — Components** (12 cross-cutting × 2 themes)
3. **02 — First run** (3)
4. **03 — Mode + waitlist** (3)
5. **04 — Chat** (4)
6. **05 — Composer overlays** (5)
7. **06 — Local edge cases** (10)
8. **07 — Drawer + nav** (3)
9. **08 — Drawer destinations** (5)
10. **09 — Settings** (6)
11. **10 — Companion + on-device features** (4)
12. **11 — Misc** (3)
13. **12 — Legal + errors** (2)

Frame naming: `<page>.<n> — <screen> — <state> — <theme>`. Example: `06.18 — File too large prevention — populated — dark`.

Prototype-link the golden paths:

- Onboarding hero → device-tier detection → first-model-download → chat empty → first message → active chat
- Chat empty → tap Image chip → image picker → image-with-question → response
- Chat header → tap Cloud chip → waitlist email entry → waitlist confirmed → back to chat (header chip now shows #N in line)
- Plus menu → Camera → on-device OCR scan → extracted text → composer prefilled → send
- Plus menu → Files → file too large modal → trim → upload → response
- Settings → Performance → benchmark → results

---

## 13 · Acceptance checklist (for the engineer importing the Figma into Expo)

- [ ] Every assistant turn renders a performance chip with `tok/s` + `first-token-latency` (never $cost)
- [ ] Mode toggle is in the chat header on every chat screen
- [ ] Tapping the locked Cloud side opens the waitlist sheet
- [ ] After waitlist signup, header chip shows `✓ Cloud · #N in line`
- [ ] No pricing cards anywhere in v1
- [ ] No login screen — onboarding goes hero → tier-detect → model-download → chat
- [ ] Offline banner is celebratory green, not warning yellow
- [ ] Trust footer (`AGI Automation LLC · Delaware · DPDP Act 2023`) on About + Onboarding + Privacy
- [ ] All connectors that need cloud are visibly greyed with `Join waitlist` CTA, not hidden
- [ ] Storage screen shows model sizes prominently + has "Manage" affordances
- [ ] Performance screen exists and is benchmarkable
- [ ] Voice flow is on-device by default; cloud Whisper opt-in is GREYED in v1 with waitlist tease
- [ ] HealthKit/Camera/Mic/Photos/Calendar permissions all go through `permission-prompt` component first
- [ ] Both light + dark variants ship; system-following by default

---

End of prompt v2. Total: ~315 frames expected.
