# AGI Mobile · Round 2 — high-fidelity uplift + App Store screenshots

**Paste this into Claude Design (claude.ai/design), Prototype tab.** Project: continue `AGI Mobile · v1 wireframes` (don't start fresh — open the existing project so the canvas + 171 wireframe artboards stay as reference under the new pages).

> Round 1 = 171 wireframe artboards across 13 sections. Round 2 = polish the v1 hero flow to high fidelity + generate App Store / Play Store screenshots. Locks from Round 1 stay (v1 = on-device only, cloud = waitlist, no $cost, no caps, no login, India-first GTM, AGI Automation LLC developer brand).

---

## Goal this round

1. **Lift the hero v1 flow from wireframe to production-grade visual fidelity** — same layouts, real type, real icons, real shadows, real color.
2. **Generate 10 App Store / Play Store screenshots** (1290×2796 for iPhone 6.9") from the same flow.

Total: **24 in-app frames + 10 store frames = 34 deliverables** + a system page.

---

## Fidelity uplift — what changes vs. Round 1

|                 | Round 1 (wireframe)                         | Round 2 (production)                                                                                                |
| --------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Type — display  | `Caveat` script                             | **SF Pro Display, 700 weight, -0.5 letter-spacing on >24pt**                                                        |
| Type — body     | `Patrick Hand`                              | **SF Pro Text, 400/600**                                                                                            |
| Type — mono     | `JetBrains Mono` (kept)                     | **SF Mono** (drop fallback to JetBrains)                                                                            |
| Icons           | `WireGlyph` SVG paths, 1.6px stroke         | **Lucide 24px, 1.5 stroke, no fill**                                                                                |
| Borders         | `1.5px dashed`                              | **1px solid hairline** at `border-subtle` (0.08 ink alpha)                                                          |
| Shadows         | none                                        | **Sheets: `0 -8px 24px rgba(0,0,0,0.18)` · Cards: `0 1px 3px rgba(0,0,0,0.05)` · Modal scrims: `rgba(0,0,0,0.55)`** |
| Surfaces        | wireframe cream `#f6f3ec` / black `#1a1915` | **Production warm-cream `#faf9f7` / warm-black `#1a1915`** (final values in Round 1 system page)                    |
| Rotation/jitter | slight rotation on accent moments           | **none** — production is rectilinear                                                                                |
| Hatch fills     | dot-grid + diagonal-stripe placeholders     | **real photos / real model icons / real charts**                                                                    |

Everything else (palette logic, IA, copy, tokens) stays. The wireframes were structural — round 2 is _how it actually looks shipped_.

### Production palette (use exactly)

```
LIGHT
  bg-base       #faf9f7   warm cream (not white)
  bg-raised     #ffffff
  bg-sheet      #ffffff
  bg-hover      #f0eeeb
  text-primary  #1a1915
  text-2ndary   rgba(26,25,21,0.75)
  text-muted    rgba(26,25,21,0.50)
  border        rgba(26,25,21,0.08)
  teal          #21808d   (accent-primary)
  terracotta    #da7756   (accent-secondary)
  success       #16a34a
  warning       #d97706
  danger        #dc2626

DARK
  bg-base       #1a1915   warm near-black (not pure black)
  bg-raised     #242220
  bg-sheet      #2e2b28
  bg-hover      #363330
  text-primary  #e8e4db
  text-2ndary   rgba(232,228,219,0.75)
  text-muted    rgba(232,228,219,0.50)
  border        rgba(255,235,205,0.08)
  teal          #3eb8c4
  terracotta    #e89272
  success       #22c55e
  warning       #f59e0b
  danger        #ef4444
```

---

## Section H1 · Onboarding hero (3 screens × 2 themes = 6 frames)

1. **Onboarding hero** — full-bleed dark gradient (warm-black to slightly-warmer-black, top-to-bottom). Centered brand mark (~80pt) above wordmark `AGI` (SF Pro Display 96/96, -1 letter-spacing) + tagline `AGI runs on your device.` (SF Pro Text 16, regular, 80% white). Three trust chips horizontal w/ Lucide icons: `Cpu` "On-device only" · `Plane` "Works offline" · `Shield` "DPDP Act 2023 compliant". Primary CTA full-width pill `Start chatting` (teal fill). Tiny footer `Made by AGI Automation LLC · Delaware, USA`.

2. **Device-tier detection** — light/dark variants. Headline (SF Pro Display 32) `Your iPhone is ready.` Subhead (SF Pro Text 16, muted) `iPhone 15 Pro Max · A17 Pro · Tier 1 capable`. Below, a single card showing the recommended model: name, size (`2.1 GB`), runtime tier badge, estimated Wi-Fi download time. Toggle `Download over cellular too` (off). Primary CTA `Download model`. Secondary `Pick a different model` opens model picker.

3. **First model download** — radial progress (terracotta stroke on neutral track, 64% example), inside it tabular SF Pro showing `64%`. Below the radial: model name + size + speed (`14 MB/s · 2 min left`). Reassurance copy below: `Stays on your device.` Tiny "you can leave this screen" hint.

## Section H2 · Chat hero (4 screens × 2 themes = 8 frames)

4. **Chat empty — on-device** — top bar: hamburger left, `<ModeToggle>` centered (`[⚡ On-device] [🔒 Cloud]`), new-chat icon right. **On-device shield badge** (small teal-tinted pill with `Cpu` icon) immediately below top bar: `On-device · Llama 3.2 3B · Tier 2`. Centered (50% above composer) display headline `What's on your mind, Siddhartha?` (SF Pro Display 32, primary). Below composer: 6 task chips `Ask · Image · Voice · Read · Translate · Scan`. Composer: plus button left, mic between, model pill right (`Llama 3.2 3B ▾`), text input center.

5. **Chat active** — message thread scrolling. User bubble right-aligned (terracotta tint, ~22% opacity, 14px radius). Assistant text full-width, no bubble (transparent bg). **PerformanceChip below every assistant turn**: `↳ Llama 3.2 3B · on-device · Tier 2 · 22 t/s · ttft 180ms` (1px dashed border, mono 11, muted). Show one inline tool call (collapsible bar w/ Lucide `Zap` icon): `vector_search · local memory · 4 matches`. Streaming indicator on last turn (mono `▍` cursor). Stop FAB bottom-right when streaming.

6. **Cloud waitlist — entry state** — half-sheet over slightly-darkened chat. Sheet handle top. Big Lucide `Cloud` icon in soft tile top-left of sheet. Display headline `Cloud is coming.` Body 14/20: `v1 runs entirely on your device. Cloud unlocks bigger models, web search, and computer-use. Join the waitlist and we'll email you.` Two form fields: email (required, with hand-drawn placeholder), country (chevron-down, default `🇮🇳 India`). Primary CTA `Join waitlist` (teal pill). Footnote `No account created. Email is only used to notify you.`

7. **Cloud waitlist — confirmed state** — same sheet, replaced content. Big success-green circle w/ Lucide `Check` icon (40pt, white). Display `You're confirmed.` Rank line in teal 16/600: `#1,247 in line`. Body 14: `We'll email you when cloud opens. No date promised yet — we'll let you in in waves.` Stamp-style dashed pill below: `siddhartha@example.com · 🇮🇳 · joined May 18`. Primary CTA `Continue on-device`.

## Section H3 · On-device features (5 screens × 2 themes = 10 frames)

8. **Image-with-question full-screen** — photo fills top 70% of viewport (use a real-looking placeholder — building, plant, recipe). Bottom 30%: composer with prefilled placeholder `What's in this image?` (editable italic). Send button right. Below send: small PerformanceChip `Llama 3.2 Vision · on-device · Tier 2 · ~6s ttft`. Lock #7-killer caption: `Free. Runs on your phone.`

9. **Voice — recording** — full-screen takeover. Pulsing terracotta orb (~200pt) center, animated rings. Live waveform below (12 vertical bars, varying heights, terracotta). Timer top (`0:08`). Cancel `X` bottom-left; send filled-mic bottom-right. Badge above orb: `🔒 Listening on-device · Whisper-small`. Footnote: `Audio never leaves your device.`

10. **Document Q&A drop-zone** — light dashed-border card center: Lucide `FileText` icon (48pt, neutral) + headline `Drop a PDF or doc.` + caption `On-device RAG — file is chunked + indexed on your phone.` Below the card: "Recently asked" list with 3 example entries (filename, last-asked timestamp). FAB plus-button bottom-right.

11. **OCR scan** — camera viewfinder full-screen. Live text detection overlays (subtle teal-tinted rounded rects around detected text blocks, with crisp recognized strings showing inside each rect). Bottom bar: shutter button center, flash toggle left, gallery quick-access right. Caption strip above bottom bar: `Apple Vision · on-device · instant`.

12. **Performance page** — settings sub-screen. Top card: device summary (model, chip, RAM, iOS version, tier). Below: "Currently loaded" card showing `Llama 3.2 3B · 42 t/s avg · 1.1s ttft avg` + sparkline of last 7 days. 3 stat tiles in a row: thermal state, battery, models loaded. CTA `Benchmark this device` (secondary). Toggle `Prefer faster, lighter model`.

---

## App Store screenshots (10 frames @ 1290×2796 — iPhone 6.9")

Standard side-by-side: device frame mockup occupies ~70% of frame, marketing headline + 1-2 line benefit + small `AGI` wordmark in remaining ~30%. Frame backgrounds rotate between warm-cream and warm-black for visual rhythm. Headline type: SF Pro Display, 84pt, -1 letter-spacing.

1. **Hero / privacy promise** — Chat empty state in frame. Headline: `AGI runs on your device.` Sub: `No login. No cloud. No tracking. Free forever.`
2. **Free vs. paid competitors** — Compare screen (Llama 1B / 3B / Apple FM side-by-side). Headline: `Free, forever, for what runs on your phone.` Sub: `What ChatGPT Plus charges $20/mo for — yours, $0, on-device.`
3. **Image analysis** — Image-with-question screen w/ a real-looking plant photo. Headline: `Free image analysis.` Sub: `Powered by your phone's Neural Engine.`
4. **Voice privacy** — Voice recording screen. Headline: `Your voice never leaves your phone.` Sub: `On-device Whisper. Never trained on.`
5. **Document Q&A** — Document drop-zone with a PDF previewing. Headline: `Read any PDF. On-device.` Sub: `Chunked + indexed locally. Even works in airplane mode.`
6. **OCR / Scan** — OCR camera with detected receipt text. Headline: `Live OCR.` Sub: `Apple Vision + on-device LLM. Instant.`
7. **Translate (Hindi)** — Translate screen showing Hindi → English. Headline (Devanagari): `आपके फ़ोन पर ही AI.` English sub: `Hindi support on-device. More languages coming.`
8. **Multi-model compare** — Compare screen. Headline: `Compare local models, side-by-side.` Sub: `Llama 3B · Apple Foundation 3B · Qwen 0.5B.`
9. **Offline mode** — Chat with the celebratory `✈️ Offline — on-device mode works as normal.` banner visible. Headline: `Works in airplane mode.` Sub: `Because the AI is on your phone.`
10. **Cloud waitlist tease** — Confirmed state with `#1,247 in line`. Headline: `Cloud opens soon.` Sub: `Subscription + top-up later. Free on-device forever.`

Screenshots 1, 3, 4, 5, 7 are the India-first conversion-driving set (free + privacy emphasis). 2, 8, 9, 10 are global. 6 is universal.

---

## Locks unchanged (carry from Round 1)

- v1 = on-device only · cloud = waitlist gate · India-first GTM
- No `$cost` anywhere · no caps · no BYOK field · no login
- PerformanceChip format: `↳ <model> · on-device · <tier> · <tps> · ttft <ms>`
- Mode toggle in chat header on every chat-relevant screen
- Trust footer (`AGI Automation LLC · Delaware · DPDP Act 2023`) appears on About + Onboarding + Privacy
- 6 task chips: `Ask · Image · Voice · Read · Translate · Scan` (not the old Code/Write/Research set)
- Brand mark: neutral geometric (never burst, spiral, sparkle)

---

## Anti-patterns (reject)

- Patrick Hand / Caveat / any handwritten font (those were Round 1 wireframe-only)
- Dashed borders on anything except provenance chips
- Wireframe placeholders / dot-grids / hatch fills — use real content
- Bottom tab bar (drawer only)
- Pricing cards / login / BYOK key fields / cost provenance — all dead in v1
- $ symbols anywhere
- Stock-photo-feel marketing copy (AGI's voice is direct, concrete, technical)
- Mimicking ChatGPT's busy chrome — AGI is _less_ loaded, not more

---

## Output expectations

**Pages in order:**

1. **00 — System (uplift)** — production tokens, type ramp, Lucide icon family, components in both themes
2. **H1 — Onboarding** (6)
3. **H2 — Chat hero** (8)
4. **H3 — On-device features** (10)
5. **AS — App Store screenshots** (10 @ 1290×2796)

**Frame naming:** `<page>.<n> — <screen> — <theme>`. Example: `H2.5 — Chat active — dark`.

**Prototype connections:** wire onboarding hero → device-tier → first model download → chat empty → tap cloud chip → waitlist entry → waitlist confirmed → back to chat (chip now shows `✓ #1,247`).

---

## What's intentionally NOT in this round

- Settings sub-screens (deferred to Round 3 once hero is locked)
- Drawer + nav (Round 1 wireframes are sufficient until hero ships)
- Edge case modals (Round 1 covers them at wireframe; uplift only if launch testing shows they need polish)
- Marketing site / agiworkforce.com landing (separate "Web Round 1" prompt later)
- Android adaptations (do English iOS first; Android variant + Hindi localization comes in Round 3)

---

End of brief. ~34 frames expected. Total work budget should be ~3-4× a single screen's effort since these are uplifts, not net-new designs.
