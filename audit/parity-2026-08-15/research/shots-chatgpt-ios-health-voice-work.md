# ChatGPT iOS — Health, Voice, Work/Agent, Auth: Screenshot Evidence

**Scope of this document:** ChatGPT iOS app. Four sub-areas: (1) the Health vertical
(a full sub-product built on top of chat, with its own onboarding, tabs, dashboards,
and record connections), (2) Advanced Voice Mode onboarding and a live conversation,
(3) "Work" mode / remote coding-agent activity (including a distinct "Remote" desktop-
pairing feature discovered inside the unlabeled `IMG_06xx` files), and (4) sign-in /
biometric auth surfaces.

**IMPORTANT CAVEATS**

- These are **point-in-time captures of unknown exact date**. Timestamps visible in
  the iOS status bar range from 4:14–4:36 (Health/Voice set) and 8:28–9:45/9:12/9:18/9:24
  (Work/Remote/Auth/Promo set) — these are two or more distinct capture sessions, not one
  continuous walkthrough. Dates inside app content (e.g. health metric dates of
  "July 2026," "February 2026") suggest the captures were taken in a build where the
  device clock/content was set around mid-2026, consistent with this repo's current
  working date, but the exact capture date of each PNG is not otherwise recoverable.
- Nothing here should be treated as confirmed **current/GA** ChatGPT behavior without
  cross-checking against live product — screenshots are evidence of a UI that existed
  at capture time, not a promise it is unchanged today.
- The "Remote" desktop-pairing screens (`IMG_0618`–`IMG_0629`) show the operator's own
  device/repo names (`Siddharthas-MacBook-Air-2.local`, project folders named
  `agiworkforce`, `hermes-agent`, etc.) and this repo's own commit history inside a
  ChatGPT session. This is the user's real personal ChatGPT Pro account content, not
  a synthetic demo — flagging so it isn't mistaken for staged marketing material.
- One model/reasoning label appears verbatim in the UI as **"5.6 Sol"** (with an
  "Intelligence: High" / "Speed: Fast" sub-picker). This is reported exactly as
  displayed on screen — it is evidence of _the existence and shape_ of a model/effort/
  speed picker in OpenAI's Codex-mobile "Remote" surface, not a confirmed real OpenAI
  model ID, and must not be treated as one.
- No screen was inferred from a filename. Every file listed below was opened and
  visually inspected with the Read tool before being described.
- Where my assigned set was missing an adjacent step (e.g. `voice-04` was not in this
  set, only `voice-01/02/03/05`), that gap is called out explicitly rather than
  papered over.

---

## 0. File inventory (44 files, all opened)

### Health (24 files — `/Users/siddhartha/Desktop/references-2/`)

`chatgpt-ios-health-01-enable-apple-health.png` through
`chatgpt-ios-health-24-dashboard-blood-body-other.png` (continuous 01–24, no gaps).

### Voice (4 files — `/Users/siddhartha/Desktop/references-2/`)

`chatgpt-ios-voice-01-onboarding-privacy.png`,
`chatgpt-ios-voice-02-choose-spruce-voice.png`,
`chatgpt-ios-voice-03-live-conversation.png`,
`chatgpt-ios-voice-05-reasoning-status.png`
(**`voice-04` was not part of this assigned set — not covered by these captures.**)

### Work (2 files, two different directories)

`/Users/siddhartha/Desktop/references-2/chatgpt-ios-work-01-expanded-agent-activity.png`
`/Users/siddhartha/Desktop/chatgpt_reference/076-chatgpt-ios-work-mode-task-list-github-suggested-tasks.png`

### Promo / Auth / System auth (3 files — `/Users/siddhartha/Desktop/chatgpt_reference/`)

`026-chatgpt-ios-promo-bottom-sheet-introducing-codex-mobile.png`
`031-chatgpt-ios-auth-biometric-prompt-faceid-faster-login-continue-skip.png`
`036-os-ios-system-auth-consent-dialog-chatgpt-auth-openai-signin.png`

### Unlabeled (11 files — `/Users/siddhartha/Desktop/references-2/`)

`IMG_0618.PNG`, `IMG_0619.PNG`, `IMG_0620.PNG`, `IMG_0621.PNG`, `IMG_0622.PNG`,
`IMG_0623.PNG`, `IMG_0625.PNG`, `IMG_0626.PNG`, `IMG_0627.PNG`, `IMG_0628.PNG`,
`IMG_0629.PNG` (**`IMG_0624.PNG` does not exist in the directory** — confirmed by
directory listing, not a missed file).

Identified: this whole run is **not** a Health/Voice/Work screen — it is a separate,
previously-undocumented surface: **"Remote"**, a ChatGPT Pro (iOS) feature that pairs
the phone with Codex CLI running on the user's own Mac and lets the user drive that
desktop coding-agent session from the phone (browse projects, read/continue past
sessions, see diffs/test results, send new prompts, and set the approval/model/
intelligence/speed policy for that remote agent). It sits behind the "Introducing
Codex mobile" promo (file 026) and is reached from the hamburger sidebar's "Remote"
nav item (file 0618). Full breakdown in §3.2.

`claude_reference` directory: grep for the assigned patterns returned **zero matches**
— nothing in that directory is part of this set.

---

## 1. Health — full walkthrough

### 1.1 Screen-by-screen

**`health-01` — "Enable Apple Health" (custom pre-permission education screen)**

- Not the OS dialog — this is ChatGPT's own screen shown _before_ it, a common
  iOS pattern to raise opt-in rates by explaining the ask first.
- Heart icon in rounded-square app-icon tile.
- Headline: **"Enable Apple Health"**
- Body: _"Use sleep, activity, and recovery data from Apple Health to make responses
  more personalized and useful."_
- A stylized, non-interactive preview card underneath: mini "ChatGPT" panel header,
  a **"Turn On All"** link, and 7 skeleton rows (colored dot + greeked bar + toggle)
  — a preview of the real permission list about to appear.
- Primary CTA: **"Continue"** (full-width black pill).

**`health-02` through `health-06` — native iOS "Health Access" HealthKit sheet**
This is the real OS permission sheet (title **"Health Access"**), not custom UI, so
it is a literal enumeration of every HealthKit data type ChatGPT's Info.plist/
entitlements request. Header: **"Health"** / _"ChatGPT" would like to access and
update your Health data._ A **"Turn On All"** link sits above the per-item list;
each item defaults to an individually toggled-**off** switch. Full alphabetical list
observed across the 5 screenshots (scrolled continuously, one long list, not
sectioned):

Active Energy, AFib History, Blood Glucose, Blood Oxygen, Blood Type, Body Fat
Percentage, Body Mass Index, Body Temperature, Cardio Fitness, Cardio Fitness
Notifications, Cycling Distance, Date of Birth, Double Support Time, Electrocardiograms
(ECG), Environmental Sound Levels, Exercise Minutes, Fitzpatrick Skin Type, Flights
Climbed, Headphone Audio Levels, Heart Rate, Heart Rate Variability, Height, High Heart
Rate Notifications, Insulin Delivery, Irregular Rhythm Notifications, Lean Body Mass,
Low Heart Rate Notifications, Menstruation, Mindful Minutes, Ovulation Test Result,
Respiratory Rate, Resting Energy, Resting Heart Rate, Sex, Six-Minute Walk, Sleep,
Stair Speed: Down, Stair Speed: Up, Stand Minutes, Steps, Swimming Distance, Waist
Circumference, Walking + Running Distance, Walking Asymmetry, Walking Heart Rate
Average, Walking Speed, Walking Step Length, Weight, Wheelchair, Workouts.

- Footer copy (visible at the bottom of the full list, `health-06`): _"App
  Explanation: Share your Health data with ChatGPT so it can analyze and answer
  questions about your activity and wellness."_ and _"Data you allow can be accessed
  by the app in the background."_
- **Allow** (greyed/disabled while nothing is toggled on) / **Don't Allow** buttons
  pinned at the bottom throughout scrolling.
- This is the single richest piece of evidence in the set for "capabilities web docs
  wouldn't tell you": the complete HealthKit read/write scope list, including
  sensitive categories (AFib History, ECG, Insulin Delivery, Menstruation, Ovulation
  Test Result, Sex, Date of Birth, Fitzpatrick Skin Type).

**`health-07` — "Connect accounts" (step 1 of a 4-step onboarding, progress dots
visible top-center, dot 1 of 4 filled)**

- Headline **"Connect accounts"**, a **Search** field, then a scrollable list of
  healthcare-provider/portal integrations, each row: brand icon, provider name, and
  a circular **"+"** add button. Observed (partial list, more below the fold):
  Function Health, One Medical, Baylor Scott & White Health, Christus Health,
  AdventHealth, Texas Health Resources, Parkland, Children's Health North Texas,
  Premise Health.
- **Continue** pill pinned at bottom (enabled even with nothing connected — this
  step is skippable by proceeding).

**`health-08` — native OAuth/web-auth consent sheet layered on the same screen**

- _"ChatGPT" Wants to Use "epproxy.texashealth.org" to Sign In_ / _"This allows the
  app and website to share information about you."_ / **Cancel** / **Continue**.
- Reveals the provider integrations are done via **per-health-system OAuth proxy
  domains** (`epproxy.<healthsystem>.org` pattern) — i.e., a health-data aggregation
  layer sitting in front of each hospital system's own patient-portal login, not a
  single unified health-data API. This is invisible from any public ChatGPT doc.

**`health-09` / `health-10` — "Add new condition" search list (step 2 of 4, dot 2
filled)**

- **Search** field (top) with an **"X"** clear/close button; a live keyboard is up
  in `09` with an empty query (cursor blinking), suggesting this is a
  browse/typeahead list shown even before typing.
- Rows are clinical condition names in rounded-pill list rows with **"+"** buttons.
  Full list seen across both frames: Hypertensive disorder, Hyperlipidaemia,
  Depressive disorder, Gastrooesophageal reflux disease, Type 2 diabetes mellitus,
  Essential hypertension, Obesity, Diabetes mellitus, Asthma, Coronary
  arteriosclerosis, Allergic rhinitis, Hypothyroidism, Upper respiratory infection,
  Hypercholesterolaemia, Backache, Abdominal pain, Osteoarthritis, Low back pain,
  Anaemia.
- Note the **British-English clinical spellings** ("Hyperlipidaemia,"
  "Hypercholesterolaemia," "Anaemia," "Gastrooesophageal") — strongly suggests the
  condition list is sourced from a SNOMED CT–style clinical terminology database
  (SNOMED CT International uses UK spelling) rather than a hand-authored US list.

**`health-11` — "Add conditions" landing (still step 2 of 4)**

- Headline **"Add conditions"**, subhead _"Add any conditions you'd like ChatGPT to
  know about."_
- Two big rows, each a search-style pill with a **"+"** on the right:
  **"Add new condition"** (magnifying-glass icon — leads to `09`/`10`) and
  **"Import from medical records"** (circular-refresh icon — leads back into the
  "Connect accounts" flow, see `12`).
- Bottom CTA: **"Skip for now"** (black pill) — different label from the `Continue`
  used on step 1, signaling this step is explicitly optional/skippable.

**`health-12` — "Connect accounts" shown a second time**

- Pixel-identical to `health-07` (same list, same Continue pill, dot 1 of 4 active)
  but reached this time via "Import from medical records" from inside the
  conditions step. Documented as a real observation: **the same "Connect accounts"
  screen is reachable from two different points in onboarding** (its own top-level
  step, and as a fallback inside "Add conditions").

**`health-13` / `health-14` — "Add new medication" (step 3 of 4, dot 3 filled)**

- `13`: empty **Search** field, keyboard up, no results yet, up/down + checkmark
  controls visible above the keyboard (likely predictive/autocomplete navigation).
- `14`: query **"Head"** typed, showing live search results — and revealing the
  medication database includes **non-prescription consumer/cosmetic products**, not
  just drugs: "Head & Shoulders", "Head & Shoulders Shampoo Product", "Head &
  Shoulders Topical Product", "zinc pyrithione Medicated Shampoo [Head & Shoulders]",
  "zinc pyrithione Topical Cream/Lotion/Spray [Head & Shoulders]", "Head & Shoulders
  Clinical Strength", "Head & Shoulders Damage Treatment".
- The `generic name Form [Brand]` bracket notation (e.g. _"zinc pyrithione Topical
  Cream [Head & Shoulders]"_) is the standard **RxNorm** naming convention — strong
  evidence the medication search is backed by RxNorm (or an RxNorm-derived dataset),
  again not discoverable from marketing docs.

**`health-15` / `health-16` — "Add health issues in your family history" (step 4 of
4, dot 4/last filled — a long dash rather than a dot, i.e. this is the terminal
step)**

- Headline **"Add health issues in your family history"**.
- Content is grouped under plain-language (not clinical-Latin) category headers,
  each a small grey label above a run of pill rows with **"+"**:
  - **Cardiovascular**: Heart disease, High blood pressure, Stroke, High cholesterol,
    Atrial fibrillation
  - **Cancer**: Breast cancer, Colon cancer, Skin cancer _(cut off)_, Prostate
    cancer, Ovarian cancer
  - **Metabolic**: Diabetes, Thyroid disorder, Obesity
  - **Neurological**: Depression, Anxiety, Dementia, Bipolar disorder
- Contrast with the condition-search step: family history uses a short **curated,
  consumer-friendly, pre-grouped** list; conditions uses a **long clinical-
  terminology free-text search**. Different UX pattern for a similar data type,
  presumably because family history has a small enough vocabulary to enumerate.
- Bottom CTA here is **"Done"**, not "Continue" — confirms this is the last
  onboarding step.

**`health-17` — same family-history screen, scrolled to the bottom**

- After "Bipolar disorder" the list ends with an **"Add another health issue"**
  free-text search row (search icon + "+"), giving an escape hatch into free text
  once the curated list is exhausted. "Done" pill still pinned at the bottom.

**`health-18` — Health tab, "Home" sub-tab, error/empty state (post-onboarding
landing)**

- Top chrome: hamburger (left), **"Health"** title (center), **"•••"** more-menu
  (right, circular button) — this replaces the generic ChatGPT top bar entirely,
  confirming Health is a distinct top-level surface with its own chrome.
- **"Get started"** section header with a dismiss **"X"**; a horizontally
  scrollable row of suggestion cards, e.g. **"Energy boost — What should I focus
  on to boost my energy?"** (bolt icon) and a second, partially cropped card
  starting "H.../Su..." with a magnifying-glass icon.
- A pill-style **sub-tab bar**: **Home | Chats | Records | Accounts** (Home
  selected/filled here) — this is the Health surface's own internal navigation,
  separate from the app's global nav.
- Body: an error card — _"Health data couldn't be loaded. Please try again."_ +
  **"Try again"** link.
- Bottom composer: standard **"Ask ChatGPT"** input (+ attach, mic, send-arrow) plus
  a **Health-specific disclaimer** persisted under the composer: _"ChatGPT can make
  mistakes and isn't intended for diagnosis or treatment. Consult your doctor for
  medical advice."_ — this exact medical-safety disclaimer is unique to the Health
  surface (not the standard ChatGPT footer).

**`health-19` — Health tab, "Chats" sub-tab, empty state**

- Same header/Get-started/tab-bar/composer chrome as `18`.
- Body: speech-bubble icon + **"Health chats will appear here"**, centered.

**`health-20` — Health tab, "Records" sub-tab, connect state**

- Body: a bordered card (visually distinct — outlined container, unlike the bare
  list style elsewhere) with clipboard-with-heart icon, headline **"Connect health
  records"**, subhead _"Bring more data into ChatGPT by connecting your health
  records"_, and a black pill **"Connect"** button.

**`health-21` — Health tab, "Accounts" sub-tab**

- Row 1: **"+ Add account"** (grey circular icon, plain row, no chevron).
- Divider, then: **Apple Health** row — heart-icon avatar, label "Apple Health",
  secondary status line **"Connected"** (plain text status, not a toggle control).

**`health-22` / `health-23` / `health-24` — Health tab, "Home" sub-tab, populated
dashboard (a different, later Home state than the error state in `18`)**
The dashboard is organized into topical **cards**, each a white rounded container
with a bold section header and metric rows. Each metric row shows: label, a large
value + smaller unit, a recency stamp ("Yesterday" or a full date), and a small
right-aligned **sparkline** (either a dot-scatter mini-chart or a bar sparkline,
varies by metric). Full content observed, in on-screen order:

- **Activity**: Walking speed 2.43 mi/h · Yesterday; Exercise time 14 min · July 15,
  2026; Stand time 105 min · July 15, 2026; Stair ascent speed 0.6 mi/h · July 15,
  2026; Stair descent speed 0.88 mi/h · July 15, 2026; Sleep duration 9.8 h · July 8, 2026.
- **Heart**: Walking heart rate average 109/min · July 15, 2026; Heart rate
  variability (SDNN) 25.3 ms · July 15, 2026; Heart rate 127/min · July 15, 2026 (bar
  sparkline); Respiratory rate 19/min · July 9, 2026; Resting heart rate 55/min ·
  July 9, 2026.
- **Blood**: Oxygen saturation (SPO2) 100% · July 9, 2026 (bar sparkline).
- **Body Measurements**: Height 72 in · February 2026; Lean body mass 149.7 lb ·
  February 2026; Body fat percentage 22.4% · February 2026; Weight 192.9 lb ·
  February 2026.
- **Other**: Headphone audio exposure 61.3 dB · July 13, 2026.

This card taxonomy (Activity / Heart / Blood / Body Measurements / Other) closely
mirrors Apple's own Health app "Browse" categories — the Health tab is essentially
re-presenting the HealthKit data the user granted in `health-02`–`06`, inside
ChatGPT's own card+sparkline visual language.

### 1.2 Health navigation tree (reconstructed)

```
Health (top-level surface, own header replacing global ChatGPT chrome)
├─ Onboarding (first-run only, 4-step progress-dot flow)
│  ├─ Step 0: "Enable Apple Health" (custom pre-permission screen) → Continue
│  │   └─ Native iOS "Health Access" HealthKit sheet (~49 data types, all default-off)
│  ├─ Step 1/4: "Connect accounts" (search + provider list, each "+") → Continue
│  │   └─ per-provider OAuth ("epproxy.<system>.org") native consent sheet
│  ├─ Step 2/4: "Add conditions"
│  │   ├─ "Add new condition" → clinical-terminology search list (SNOMED-style)
│  │   └─ "Import from medical records" → re-enters "Connect accounts"
│  ├─ Step 3/4: "Add new medication" → RxNorm-style brand/generic search
│  └─ Step 4/4: "Add health issues in your family history"
│      ├─ curated grouped list: Cardiovascular / Cancer / Metabolic / Neurological
│      └─ "Add another health issue" free-text search → Done
├─ Home (sub-tab)
│  ├─ "Get started" suggestion carousel (dismissible), e.g. "Energy boost"
│  ├─ error/empty state: "Health data couldn't be loaded" + Try again
│  └─ populated state: dashboard cards — Activity, Heart, Blood, Body Measurements, Other
├─ Chats (sub-tab) — empty state: "Health chats will appear here"
├─ Records (sub-tab) — connect state: "Connect health records" + Connect
└─ Accounts (sub-tab)
   ├─ "+ Add account"
   └─ connected-provider rows (e.g. "Apple Health — Connected")

Global composer present on every Health sub-tab: "Ask ChatGPT" input + Health-only
disclaimer ("...isn't intended for diagnosis or treatment. Consult your doctor...").
```

### 1.3 Health control inventory

| Screen                   | Control                                         | Type                                     | What it appears to do                                                            |
| ------------------------ | ----------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------- |
| Enable Apple Health      | "Turn On All" (preview)                         | Link (non-interactive preview)           | Previews the bulk-enable action inside the real HealthKit sheet                  |
| Enable Apple Health      | Continue                                        | Primary button (black pill)              | Triggers the native HealthKit permission sheet                                   |
| Health Access (OS sheet) | "Turn On All"                                   | Link                                     | Bulk-enables all listed data-type toggles                                        |
| Health Access (OS sheet) | Per-category toggle (~49 rows)                  | iOS switch                               | Grants/denies read (and in some cases write/update) access to one HealthKit type |
| Health Access (OS sheet) | Allow / Don't Allow                             | Buttons                                  | Commits or rejects the permission grant                                          |
| Connect accounts         | Search                                          | Text input                               | Filters the provider list                                                        |
| Connect accounts         | "+" per provider row                            | Circular icon button                     | Starts OAuth connection to that health system                                    |
| Connect accounts         | Continue                                        | Primary button                           | Advances onboarding regardless of connections made                               |
| Provider sign-in sheet   | Cancel / Continue                               | Native buttons                           | Aborts or proceeds with the provider OAuth handoff                               |
| Add new condition        | Search                                          | Text input                               | Live search over a clinical condition/terminology list                           |
| Add new condition        | "+" per row                                     | Circular icon button                     | Adds that condition to the user's health profile                                 |
| Add conditions (landing) | Add new condition / Import from medical records | List rows with "+"                       | Two entry paths into condition capture                                           |
| Add conditions (landing) | Skip for now                                    | Button                                   | Skips the whole step                                                             |
| Add new medication       | Search                                          | Text input                               | Live search over an RxNorm-style medication/product database                     |
| Add new medication       | "+" per result                                  | Circular icon button                     | Adds that medication                                                             |
| Family history           | "+" per curated item                            | Circular icon button                     | Adds that condition to family history                                            |
| Family history           | "Add another health issue"                      | Search row                               | Free-text fallback beyond the curated list                                       |
| Family history           | Done                                            | Primary button                           | Completes onboarding                                                             |
| Health Home              | Home / Chats / Records / Accounts               | Segmented pill tabs                      | Switches the Health sub-surface                                                  |
| Health Home              | Get-started cards                               | Horizontally scrollable suggestion chips | Tapping likely pre-fills a prompt (e.g. "Energy boost")                          |
| Health Home              | "X" (Get started header)                        | Dismiss button                           | Hides the get-started carousel                                                   |
| Health Home (error)      | Try again                                       | Link                                     | Retries loading dashboard data                                                   |
| Health Records           | Connect                                         | Primary button                           | Starts health-records connection flow                                            |
| Health Accounts          | "+ Add account"                                 | List row                                 | Adds another connected account/source                                            |
| Health Accounts          | Account row (e.g. Apple Health)                 | List row, status text ("Connected")      | Shows connection status; presumably tappable to manage/disconnect                |
| Health Home (dashboard)  | Metric row (per card)                           | Static row + sparkline                   | Displays one HealthKit metric's latest value, date, and trend                    |
| All Health screens       | "Ask ChatGPT" composer                          | Text input + mic + send                  | Standard chat entry point scoped to the Health context                           |

### 1.4 Notable design decisions — Health

- **Pre-permission education screen before the OS dialog** — a deliberate extra
  step (`health-01`) purely to raise HealthKit opt-in conversion; not required by
  Apple.
- **Default-off toggles even under "Turn On All"** — every individual toggle in the
  native sheet was captured in the off position; "Turn On All" is a convenience
  link, not a pre-applied default, keeping the sheet's default posture privacy-
  conservative.
- **4-step, skippable onboarding with a persistent progress-dot indicator** —
  every step (Connect accounts / conditions / medications / family history) can be
  skipped or exited (Continue on non-terminal steps proceeds even empty; explicit
  "Skip for now" on the conditions landing), so the flow never blocks reaching the
  Health home.
- **Two different vocabularies for structurally similar data** — conditions and
  medications use long, free-text, clinical/coded search (SNOMED/RxNorm-flavored);
  family history uses a short, curated, plain-language, pre-grouped list. Likely
  because family history has a small enough closed set to hand-curate, while
  conditions/medications need full database coverage.
- **A screen reused across two onboarding paths** — "Connect accounts" is both its
  own step and the destination of "Import from medical records" inside the
  conditions step, rather than being a one-off single-purpose screen.
- **Health gets its own chrome, its own tabs, its own empty states per tab, and its
  own disclaimer** — it is architected as a semi-independent product surface
  layered on the chat shell, not a settings page or a single new message type.
- **Dashboard visual language matches Apple Health's own category taxonomy**
  (Activity/Heart/Body Measurements/etc.) with a light "reinterpretation" layer
  (card + sparkline) rather than inventing a new information architecture.

### 1.5 Capabilities visible here that docs wouldn't tell you

- The **exact list of ~49 HealthKit data types** requested (including sensitive
  ones: AFib History, ECG, Insulin Delivery, Menstruation, Ovulation Test Result,
  Sex, Date of Birth, Fitzpatrick Skin Type) and that **write/update** access is
  requested, not just read (native sheet literally says "would like to access and
  update your Health data").
- **Per-health-system OAuth proxy domains** (`epproxy.<healthsystem>.org` pattern)
  for connecting hospital/clinic patient portals — implies a health-data
  aggregation vendor/layer behind "Connect accounts," not a single unified API.
- The **condition search is almost certainly backed by SNOMED CT** (British
  spellings: Hyperlipidaemia, Hypercholesterolaemia, Anaemia,
  Gastrooesophageal reflux disease).
- The **medication search is almost certainly backed by RxNorm** (bracketed
  `generic [Brand]` naming convention, and the database indexes non-drug consumer
  products like medicated shampoo under the same schema as prescription drugs).
- Health has its **own persistent legal/safety disclaimer** distinct from the
  generic ChatGPT one, specifically addressing diagnosis/treatment.
- "Health data couldn't be loaded" is a **real, reachable error state**, not just
  a happy-path demo — the dashboard has a visible failure/retry path.

---

## 2. Advanced Voice Mode

**`voice-01` — "Meet Voice" onboarding (dark theme)**

- Close **"X"** top-right; centered gradient orb avatar (blue-to-white cloud);
  headline **"Meet Voice"**.
- Body: _"Say what's on your mind. ChatGPT listens, responds, and keeps the
  conversation flowing naturally."_
- Info row (ⓘ icon): _"Audio and video recordings are saved, and you can delete
  them at any time. **Learn more**"_ (underlined link). Explicitly mentions
  **video**, not just audio — implying Advanced Voice Mode's privacy disclosure
  covers an optional camera/video input, not purely microphone.
- CTA: **"Continue"** (white pill on dark background).

**`voice-02` — "Choose your voice"**

- Headline **"Choose your voice"**; same orb; voice name **"Spruce"** (bold) with
  descriptor **"Calm and affirming"**.
- **9-dot pagination** row under the name (first dot filled/white) — i.e. **9
  selectable voice personas** in this picker, only the first ("Spruce") shown in
  this capture.
- CTA: **"Start Voice"** (white pill).

**`voice-03` — live conversation, in progress**

- Full black background. Top bar: hamburger (left), **"ChatGPT"** pill label
  (center), sliders/filter icon (right).
- Scrolling transcript with **no chat bubbles for the assistant** (plain white text
  on black) but **dark rounded bubbles, right-aligned, for the user's spoken turns**.
- Visible turn: user bubble _"Hmm. Can you tell me what's happening in the AI world
  right now"_; assistant status line **"Thought for 4s"** (small grey text) directly
  above the streamed reply; reply opens with _"Hmm. Checking."_ then a paragraph
  naming specific things (AMD/Anthropic partnership, Google AI revenue, enterprise
  AI agents, OpenAI, a US government AI-for-science program), cut off mid-word at
  the bottom of the visible transcript.
- Smaller orb avatar anchored lower on screen (now a live indicator rather than a
  hero image).
- Bottom bar: collapsed **"Ask ChatGPT"** input pill (inactive/placeholder), mic
  icon, and a white circular **"X" end-call** button.

**`voice-05` — same conversation, continued ("reasoning status" continuation)**

- Same layout. Shows the reply completing: _"...US launching a large AI for science
  program."_ then a closing offer: _"If you want, I can zoom in on one of those
  areas, perhaps like models, open source, or even startups."_
- Directly under that assistant turn, an **inline action row** appears even in live
  voice mode: copy/duplicate (stacked-squares), thumbs-up/down (paired icon), and
  share/export (upload arrow) — i.e. **standard message-feedback controls are
  present on voice-mode transcript turns**, not just in text chat.
- Next user turn (bubble): _"Yeah, can you search various sources and then answer
  me the much more like the valuation and everything of the cloud right now"_ —
  informal, run-on spoken phrasing preserved verbatim (not cleaned up by an ASR
  post-processor).
- New status line **"Thought for 2s"**, then the reply begins: _"Sure. Let me check
  on that. Yes, based o[n...]"_, cut off.
- Same bottom bar (input pill / mic / end-call X).

### 2.1 Voice navigation/flow (reconstructed from this set)

```
Voice onboarding (first run)
├─ "Meet Voice" (privacy/consent framing, mentions audio AND video recording) → Continue
└─ "Choose your voice" (9-persona picker, e.g. Spruce = "Calm and affirming") → Start Voice
Live conversation
├─ Top bar: menu / "ChatGPT" label / filter-sliders icon
├─ Transcript: user turns as bubbles, assistant turns as plain streamed text
├─ Per-assistant-turn "Thought for Ns" status line before the reply text
├─ Per-assistant-turn action row (copy / thumbs up-down / share) even in voice mode
├─ Central orb avatar (live-state visual indicator)
└─ Bottom bar: collapsed text-input pill, mic, end-call "X"
```

### 2.2 Voice control inventory

| Screen                                 | Control                                | Type                   | What it appears to do                                                   |
| -------------------------------------- | -------------------------------------- | ---------------------- | ----------------------------------------------------------------------- |
| Meet Voice                             | "Learn more"                           | Link                   | Opens recording-retention/privacy details                               |
| Meet Voice                             | Continue                               | Primary button         | Advances to voice picker                                                |
| Choose your voice                      | 9-dot pager                            | Swipe/pagination       | Browses the 9 available voice personas                                  |
| Choose your voice                      | Start Voice                            | Primary button         | Begins the live session with the selected voice                         |
| Live conversation                      | filter/sliders icon (top right)        | Icon button            | Presumed session/voice settings (contents not shown in this set)        |
| Live conversation                      | "Ask ChatGPT" input pill               | Text input (collapsed) | Fallback to typed input during a voice session                          |
| Live conversation                      | mic icon                               | Icon button            | Presumed mic mute/unmute                                                |
| Live conversation                      | "X" (bottom right, circular)           | Icon button            | Ends the voice call                                                     |
| Live conversation (per assistant turn) | copy / thumbs up / thumbs down / share | Icon row               | Standard response-feedback and export, surfaced inline mid-conversation |

### 2.3 Notable design decisions — Voice

- **Text-first onboarding before audio starts** — two full-screen steps (consent
  framing, then persona choice) precede the first live turn, rather than dropping
  the user straight into a call.
- **"Thought for Ns" reasoning-status line surfaces latency/compute transparently**
  even in a low-chrome, voice-first UI that otherwise strips away nearly all visual
  elements (no avatars per-turn, no bubble for the assistant).
- **Standard text-chat affordances (copy/rate/share) are preserved in voice mode**
  rather than being dropped for a "pure audio" experience — the transcript is a
  first-class, interactable artifact, not a disposable captioning layer.
- **User's spoken phrasing is shown unedited/informal** in the transcript (filler
  words, run-ons kept), suggesting the visible transcript reflects a fairly raw ASR
  output rather than a cleaned-up paraphrase.

### 2.4 Capabilities visible here that docs wouldn't tell you

- Advanced Voice Mode's privacy disclosure explicitly covers **video** recording,
  not only audio — implying a camera-sharing capability tied to voice sessions.
- The **voice-persona picker has exactly 9 options** in this build (only "Spruce"
  is shown, described as "Calm and affirming" — the other 8 names/descriptors are
  not covered by these captures).
- Live voice turns can trigger **live tool use woven into spoken answers** (the
  content of the reply names very current, specific events — AMD/Anthropic,
  Google's AI revenue commentary — consistent with a live web-search tool call
  happening mid-voice-turn, though no explicit "searching the web" indicator is
  visible in these two frames).
- Message-level actions (copy/rate/share) exist **per assistant turn inside a live
  voice call**, which is a real backend/UI wiring decision, not just a text-chat
  feature.

---

## 3. Work mode / agent activity / Remote (desktop-pairing)

### 3.1 "Work" mode and expanded agent-activity trace

**`chatgpt-ios-work-01-expanded-agent-activity.png`**

- Background (dimmed): an ordinary chat thread about a WhatsApp channel/event
  ("For More Information: socials@suneragroup.com / Location: The Baltimore
  Convention Center, 1 W Pratt St, Baltimore, MD 21201, USA"), with a header edit
  icon and "•••" menu. Below the message, a **collapsed activity trace** appears
  inline in the thread as a short vertical list of steps, each with an icon +
  label: "Reviewed event details" (speech-bubble icon), "Searched 3 websites"
  (globe icon), "Clarifying the event details" (speech-bubble icon), "Searched 22
  websites" (globe icon, partially cut off).
- Foreground: tapping one of those collapsed rows opens a **bottom sheet titled
  "Thinking"** (drag handle at top) that shows the **same steps, expanded** with
  full rationale text under each:
  - **"Reviewing event details"** → _"I'm acknowledging the user's updates and
    thinking about how to incorporate the new info into my response. I'll
    double-check official sources for more current event info and clarify any
    discrepancies."_
  - **"Searching the web"** → three source chips (favicon + domain): `luma.com`,
    `ideabaazcontest.com`, `ataconference.org`.
  - **"Clarifying the event details"** → _"I'm updating the event info based on
    what the user provided. I'll confirm the timeline, adjust for pitch times, and
    mention estimates about track sizes. I'll clarify the $50k prize and stay
    factual."_
  - Next row starting **"Searching for $50K details on Ideabaazcontest"** (cut off
    at the bottom of the capture).
- This is the "agent activity expansion" UI: a tap on a collapsed reasoning/tool
  step in the main thread surfaces a modal bottom sheet with the full trace,
  mixing free-text rationale steps with structured "sources visited" chip lists.

**`076-chatgpt-ios-work-mode-task-list-github-suggested-tasks.png`**

- Header: hamburger (left), **"Work ⌄"** title with a dropdown chevron — "Work" is
  a switchable named context/mode, not a fixed screen title.
- Body (mostly blank above the fold), then a short list of **GitHub-sourced
  suggested tasks**, each row: GitHub octocat icon + task title, no visible chevron
  or secondary action: _"Prepare Clerk production migration"_, _"Audit chat
  persistence paths"_, _"Decide VS Code streaming"_.
- Composer: **"Work with ChatGPT"** placeholder (distinct copy from the default
  "Ask ChatGPT"), **"+"** attach, a model/reasoning pill reading **"5.6 Sol"**
  (see caveats — reported verbatim, not a confirmed real model ID), mic icon, and a
  disabled/grey send-arrow (no text entered).

### 3.2 "Remote" — Codex-mobile-to-desktop pairing (the `IMG_06xx` set)

This is a distinct, previously unlabeled surface. Below is the reconstructed flow.

**Discovery / entry point — `026-chatgpt-ios-promo-bottom-sheet-introducing-codex-mobile.png`**

- Background: ordinary ChatGPT screen (hamburger / "ChatGPT" pill / chat-history
  icon). Bottom sheet: gradient hero image with a blue "Codex" glyph icon, headline
  **"Introducing Codex mobile"**, body _"Access the power of Codex on your desktop
  computer from your mobile phone."_, CTA **"Get started"** (black pill), close
  "X" top-right of the sheet.

**`IMG_0618` — hamburger sidebar, "Remote" as a first-class nav item**

- Header: **"ChatGPT Pro"** (plan-tier label shown directly in the nav) + search
  icon.
- Nav list, each with an icon: **Library** (stacked panels), **Projects** (folder),
  **Scheduled** (clock), **Plugins** (@), **Remote** (laptop-with-signal icon),
  **More** (•••).
- **Recents** section below lists ordinary past chat titles (e.g. "AI Product
  Investment Research", "Research GitHub Project", "AI Platform Enterprise
  Comparison", "Gap Memo Best Practices", "India Expansion Strategy Guide", ...,
  "Pitch Strategy Research" with an unread blue dot).
- Floating bottom controls: **"Chat"** (blue pill, pencil-in-box icon) and a gear
  (settings) icon.
- Confirms **Remote is a peer of Library/Projects/Scheduled/Plugins** in the
  primary nav, not buried in settings.

**`IMG_0619` — Remote, disconnected/empty state**

- Header: **"Remote"** title, with a status-dot + laptop icon + the paired machine
  name **"Siddharthas-MacBook-Air-2.local"** as a persistent subtitle/breadcrumb;
  "•••" menu top-right.
- Body (centered empty state): laptop icon, machine name repeated in bold, status
  line **"Offline · Last seen 5 hours ago"**, instruction _"Make sure Codex is
  running on this computer."_, **"Reconnect"** button (outlined pill).
- Bottom: **"Search Chats"** field + **"Chat"** button (pencil-in-box icon).

**`IMG_0620` — Remote → Projects list**

- Same header, now with a **green** status dot (online). **"Projects"** section
  header, then a list of repo/folder rows — each: folder icon, project name,
  chevron `>`, and a per-row edit/compose icon: `agiworkforce`, `siddhartha`,
  `hermes-agent`, `claw-code`, `openclaw`, `opencode`, `codex-cli`, `gemini-cli`,
  `src`.

**`IMG_0621` — Remote → a project's session/chat history**

- The `agiworkforce` row is expanded (chevron flips to down + edit icon). Below,
  a scrollable list of named sessions/prompts scoped to that project: "Audit
  remediation — handoff Branch: fix/audit-re...", "Continue cloud chat parity",
  "CONTEXT HANDOFF — AGI Workforce tool/san...", "CONTEXT HANDOFF — AGI Workforce
  (agiwork...", "hi", "hi", "AGI Workforce Cloud parity — Codex continuati...",
  "ROLE You are a senior full-stack + Rust systems...", "Map repo architecture",
  "Find current logo", "Create investor presentation", "You are acting as a Senior
  Staff Software Engine...", "You are a startup accelerator application strateg..."
  _(cut off)_, "Investigate hosted runner failure" _(cut off at bottom)_.
- This is effectively a **per-repo coding-agent session list**, comparable in
  spirit to a Claude Code session/history browser, but exposed from ChatGPT's
  mobile "Remote" surface.

**`IMG_0622` — inside one Remote session, an agent build/test report**

- Header: session title "Audit remediation — handof[f]...", subtitle
  "agiworkforce · Siddharthas-MacBo...".
- Assistant turn is a structured report:
  - Bullets: _"Node standardized on Node 24.18.0 LTS"_ (linked), _"All 45
    TypeScript packages passed typecheck and lint"_, _"Web: 4,445 tests passed"_,
    _"Mobile: 2,121 passed, 1 skipped"_, _"Desktop: 1,895 passed, 1 skipped"_,
    _"Chrome extension: 1,168 passed"_, _"VS Code extension: 644 passed"_,
    _"Desktop and CLI Rust checks passed"_, _"Full pre-push operability/security
    guard passed"_.
  - Follow-up paragraph about Clerk skills being excluded from Git due to unpinned
    `latest` dependencies, referencing `skills-lock.json` remaining locally
    modified.
  - A **collapsible diff/changes card**: **"30 files changed +53 −52"** (green/red
    counts, expand chevron), listing sample changed paths with per-file diff
    counts (e.g. `.../useGeneratedImageSource.ts +1 −1`,
    `.../startup-recovery/README.md +13 −0`,
    `.../apps/cli/npm/package-lock.json +1 −1`), then **"View 27 more files"**
    with its own chevron.
  - Below that, an aggregate pill: **"143 files +14.3K −20"**.
  - Message action row: copy/duplicate, thumbs-up, thumbs-down, share.
- Composer: **"Work on Siddharthas-MacBook..."** placeholder + mic icon.

**`IMG_0623` — same session, scrolled to show the triggering turn**

- User turn: _"can you commit and push to github main?"_
- Assistant turn header: **"Worked for 27m 58s ›"** — an expandable, timed
  agent-run summary chip (elapsed wall-clock duration for an autonomous task run).
- Then: _"Committed and pushed successfully to GitHub main."_ with bullets
  _"Commit: 1171788f7 — fix: complete cross-surface audit remediation"_, _"Push:
  fast-forward, no force"_, followed by the same Node/tests bullet list as
  `IMG_0622`.

**`IMG_0625` — long-press context menu on a Remote session**

- Menu title shows the session name/branch again ("Audit remediation — handoff /
  Branch: fix/audit-remediation-2..."). Items, each with an icon: **Pin**,
  **Rename**, **Archive** (red text — destructive action), divider, **Changes**
  (git-branch icon), **Files** (folder icon).
- Reveals two dedicated jump-to views scoped to a coding session — a diff/changes
  view and a file browser — beyond the inline collapsible diff shown in `IMG_0622`.

**`IMG_0626` — Remote, new/empty session composer**

- Header device selector: **"Siddharthas-MacBook-Air-2.local ⌃⌄"** (tappable
  device picker), and below it a second picker row **"Chat ⌃⌄"** (mode/session-
  type picker).
- Composer placeholder: **"Work on Siddharthas-MacBook-Air-2.local"**.
- Bottom row: **"+"** attach, a **hand icon** (approval-mode indicator, see
  `IMG_0627`), a model/reasoning pill **"5.6 Sol High"** (bolt icon + model name +
  intelligence tag), mic, send arrow.

**`IMG_0627` — approval-mode picker (tapped from the hand icon)**

- Popover: **"How should Codex actions be approved?"** + **"Learn more"** link,
  then three options, each with an icon and description:
  - **"Ask for approval"** (hand icon, checkmark = currently selected) — _"Always
    ask to edit external files and use the internet."_
  - **"Approve for me"** (terminal-prompt icon) — _"Only ask for actions detected
    as potentially unsafe."_
  - **"Full access"** (warning-shield icon) — _"Full computer access (elevated
    risk)."_
- A three-tier autonomy/permission model for the remote coding agent, directly
  analogous to a local coding agent's ask/auto-approve-safe/full-access modes,
  with the riskiest tier explicitly labeled **"(elevated risk)"** in the UI copy
  itself.

**`IMG_0628` — model/reasoning pill tapped, inline picker surfaces**

- A horizontal pill control appears just above the keyboard: **"5.6 Sol High ›"**
  label plus a row of selectable pills (first filled/selected; three more
  represented as plain dots/collapsed options in this frame — their labels are not
  legible here).

**`IMG_0629` — full "Advanced" model-configuration sheet**

- Bottom sheet header: **"Advanced ›"** (chevron implies more settings exist below
  this sheet). Rows, each a tappable up/down-chevron picker:
  - **Model** — value **"5.6 Sol"**
  - **Intelligence** — value **"High"**
  - **Speed** — value **"Fast"** (in its own separate grouped section)
- Three independent axes (model choice, reasoning/intelligence level, and a
  speed/latency preset) for configuring the remote agent.

### 3.3 Work/Remote navigation tree (reconstructed)

```
Global sidebar
├─ Library / Projects / Scheduled / Plugins / Remote / More   (Remote = peer nav item)
└─ Recents (ordinary chat list)

Work (switchable context, dropdown next to title)
└─ Suggested tasks (auto-surfaced from connected GitHub) → each opens a task/chat
   Composer: "Work with ChatGPT" + model/reasoning pill + mic + send

In-thread agent activity (any chat, not just Work)
└─ Collapsed step list (icon + label) inline in the transcript
   └─ Tap → "Thinking" bottom sheet: expanded rationale text + "Searching the web"
       source-chip lists per step

Remote (desktop pairing)
├─ Disconnected state: machine name, "Offline · last seen", "Reconnect"
├─ Projects (list of local repo folders on the paired Mac)
│  └─ per-project session list (named prompts/handoffs, chat-history style)
│     └─ session detail: build/test report, collapsible diff card ("N files
│       changed +/-"), aggregate diff pill, "Worked for Xm Ys" run-duration chip,
│       message actions (copy/rate/share)
│        └─ long-press menu: Pin / Rename / Archive / Changes / Files
├─ New-session composer
│  ├─ device picker ("Siddharthas-MacBook-Air-2.local ⌃⌄")
│  ├─ mode picker ("Chat ⌃⌄")
│  ├─ approval-mode picker (hand icon) → Ask for approval / Approve for me / Full access
│  └─ model config pill ("<Model> <Intelligence>") → Advanced sheet
│      └─ Advanced: Model / Intelligence / Speed (three independent pickers)
```

### 3.4 Work/Remote control inventory

| Screen                   | Control                                         | Type                | What it appears to do                                                                                  |
| ------------------------ | ----------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------ |
| In-thread activity trace | Collapsed step row (e.g. "Searched 3 websites") | List row            | Tapping opens the "Thinking" detail sheet                                                              |
| Thinking sheet           | Drag handle                                     | Sheet affordance    | Dismiss/resize the sheet                                                                               |
| Thinking sheet           | Source chip (favicon + domain)                  | Chip                | Represents one site visited during a "Searching the web" step                                          |
| Work mode                | "Work ⌄" title                                  | Dropdown            | Switches named context/mode                                                                            |
| Work mode                | GitHub task row                                 | List row            | Opens a suggested task sourced from a connected GitHub repo                                            |
| Work mode                | "Work with ChatGPT" input                       | Text input          | Context-specific composer placeholder                                                                  |
| Work mode                | model/reasoning pill                            | Pill button         | Opens model/intelligence picker                                                                        |
| Codex-mobile promo sheet | Get started                                     | Primary button      | Enters the Remote onboarding/setup                                                                     |
| Remote (sidebar)         | "Remote" nav item                               | List row            | Opens the Remote surface                                                                               |
| Remote (disconnected)    | Reconnect                                       | Outlined button     | Attempts to reconnect to the paired Mac                                                                |
| Remote                   | Projects list row                               | List row            | Opens that repo's session list                                                                         |
| Remote session list      | Session/prompt title row                        | List row            | Opens that session's transcript                                                                        |
| Remote session detail    | "N files changed +X −Y"                         | Collapsible card    | Expands to show changed file paths + per-file diff stats                                               |
| Remote session detail    | "View N more files"                             | Row with chevron    | Expands the truncated file list                                                                        |
| Remote session detail    | "Worked for Xm Ys ›"                            | Expandable chip     | Shows/collapses the run's elapsed-time detail                                                          |
| Remote session detail    | copy / thumbs up / thumbs down / share          | Icon row            | Standard message actions on an agent-run turn                                                          |
| Remote (long-press menu) | Pin / Rename / Archive                          | Menu items          | Session-management actions (Archive shown in red/destructive styling)                                  |
| Remote (long-press menu) | Changes / Files                                 | Menu items          | Jump to a dedicated diff view / file browser for that session                                          |
| Remote composer          | device picker ("<machine> ⌃⌄")                  | Dropdown            | Chooses which paired desktop machine to target                                                         |
| Remote composer          | mode picker ("Chat ⌃⌄")                         | Dropdown            | Chooses a session/mode type (only "Chat" observed)                                                     |
| Remote composer          | hand icon                                       | Icon button         | Opens the approval-mode picker                                                                         |
| Approval-mode picker     | Ask for approval / Approve for me / Full access | Radio-style options | Sets how autonomously the remote agent may act, from always-confirm to full unattended computer access |
| Remote composer          | model/reasoning pill                            | Pill button         | Opens the Advanced model sheet                                                                         |
| Advanced sheet           | Model                                           | Chevron picker      | Chooses the underlying model                                                                           |
| Advanced sheet           | Intelligence                                    | Chevron picker      | Chooses a reasoning-effort tier (e.g. "High")                                                          |
| Advanced sheet           | Speed                                           | Chevron picker      | Chooses a latency/throughput preset (e.g. "Fast")                                                      |

### 3.5 Notable design decisions — Work/Remote/agent-activity

- **Agent reasoning/tool-use is collapsed by default in the main thread and
  expandable on demand** via a bottom sheet, keeping the primary transcript
  readable while preserving full auditability one tap away.
- **"Searching the web" steps render as favicon+domain chips**, not raw URLs —
  consistent, scannable source citation UI.
- **Remote is architected as a full desktop-agent remote control**, not just
  "send a message to my computer": it has its own project browser, per-project
  session history, diff/changes viewer, file browser, run-duration accounting,
  and — notably — an explicit **three-tier autonomy/approval model** with the most
  permissive tier carrying visible risk language ("Full computer access (elevated
  risk)") directly in the picker copy, not hidden in a settings/docs page.
- **Model configuration is split into three independent axes** (Model /
  Intelligence / Speed) rather than a single "pick a model" dropdown, exposing a
  speed-vs-quality tradeoff as a first-class, user-facing control for the remote
  agent specifically.
- **Device pairing is named/breadcrumbed everywhere** (machine hostname shown in
  the Remote header, in the composer placeholder, and in session subtitles) so the
  user always knows which physical machine a given agent run executed on.

### 3.6 Capabilities visible here that docs wouldn't tell you

- ChatGPT's mobile app can **pair with and remote-drive a Codex CLI session
  running on the user's own Mac**, including full read access to that machine's
  local git repos/folders, diff and file browsing, and prompt injection into a
  live coding-agent session — discovered only because "Remote" exists as a sidebar
  item and was explored; it is not implied by the Health/Voice/Work filenames at
  all.
- The remote agent supports an explicit **"Full access... (elevated risk)"**
  unattended-computer-control tier, selectable from the phone.
- Agent runs report **wall-clock elapsed time** ("Worked for 27m 58s") and full
  **CI-style test/build summaries** (per-platform test counts, lint/typecheck
  status, Rust checks, "pre-push operability/security guard") as structured,
  scannable bullet content — meaning the underlying agent harness emits a
  standardized run-report format that the mobile client knows how to render.
- Git operations (commit hash, "fast-forward, no force" push description) are
  narrated back to the user in plain language with the literal commit SHA
  surfaced inline.
- "Work" mode auto-surfaces **suggested tasks sourced from a connected GitHub**
  account/repo, independent of the Remote/desktop-pairing feature.

---

## 4. Auth / biometric / promo

**`031-chatgpt-ios-auth-biometric-prompt-faceid-faster-login-continue-skip.png`**

- White screen, close **"X"** top-right, Face ID glyph icon, headline **"Log in
  faster with Face ID"**, subhead _"Get back to ChatGPT faster, with a quicker,
  more secure sign in."_
- Large empty middle area (no illustration beyond the glyph).
- Bottom: **"Continue"** (primary, black pill) and **"Skip"** (plain text link)
  stacked below it — biometric enrollment is opt-in and skippable, not forced.

**`036-os-ios-system-auth-consent-dialog-chatgpt-auth-openai-signin.png`**

- Native iOS system alert over a blurred, backgrounded app view: **"ChatGPT" Wants
  to Use "auth.openai.com" to Sign In** / _"This allows the app and website to
  share information about you."_ / **Cancel** / **Continue**.
- Confirms the sign-in identity domain is literally **`auth.openai.com`** (an
  OIDC/Auth0-style hosted auth domain), visible only because the OS surfaces the
  real domain name in this system dialog — not obtainable from product docs.

**`026-chatgpt-ios-promo-bottom-sheet-introducing-codex-mobile.png`** — see §3.2
(promo entry point into the Remote feature).

### 4.1 Auth control inventory

| Screen             | Control         | Type           | What it appears to do                                  |
| ------------------ | --------------- | -------------- | ------------------------------------------------------ |
| Face ID prompt     | Continue        | Primary button | Enrolls Face ID for future ChatGPT sign-in             |
| Face ID prompt     | Skip            | Text link      | Declines biometric enrollment, no forced path          |
| Face ID prompt     | "X" (top right) | Icon button    | Dismisses the prompt (same effect as Skip, presumably) |
| System auth dialog | Continue        | Native button  | Proceeds with `auth.openai.com` web-based sign-in      |
| System auth dialog | Cancel          | Native button  | Aborts sign-in                                         |

### 4.2 Notable design decisions — Auth

- Biometric enrollment is pitched **after** account creation/sign-in, as a
  standalone "faster next time" upsell screen, not bundled into the initial
  sign-in form.
- Sign-in itself is implemented as a **native web-auth handoff to
  `auth.openai.com`**, i.e. an externally hosted, OS-level-consented auth flow
  rather than an in-app credential form.

---

## 5. Cross-cutting synthesis

- **Health, Voice, and Remote are each architected as semi-independent
  sub-products** layered on the shared ChatGPT chat shell, each with its own
  onboarding, its own chrome/nav (Health's tab bar; Voice's dark full-screen call
  UI; Remote's device/project/session hierarchy), and — in Health's case — its own
  legal disclaimer.
- **Progressive disclosure via bottom sheets is the dominant pattern** for
  "there's more detail if you want it": the Health HealthKit sheet, the agent
  "Thinking" trace sheet, the Codex-mobile promo sheet, the Remote approval-mode
  and Advanced-model sheets all use the same iOS bottom-sheet idiom rather than
  pushing to new full screens.
- **Autonomy/permission tiering appears twice with the same three-level shape**:
  the Health HealthKit sheet (per-category granular toggles defaulting off) and
  the Remote approval-mode picker (Ask for approval / Approve for me / Full access
  "elevated risk") both default to the most conservative, most-asks option and
  make the riskiest option explicit in its own label rather than hiding it behind
  a generic "advanced" toggle.
- **Real backend integrations are only visible through system-level chrome**, not
  in-app copy: the SNOMED-flavored condition list, the RxNorm-flavored medication
  list, the `epproxy.<healthsystem>.org` OAuth domains, and the `auth.openai.com`
  sign-in domain were all identifiable only because native iOS permission/auth
  sheets exposed literal domain names or included non-Americanized spellings that
  leak the underlying data source.

## 6. Explicit gaps in this assigned set

- `chatgpt-ios-voice-04-*` was not included in this assignment — not covered by
  these captures (whatever sits between "live-conversation" and
  "reasoning-status" is unknown from this set alone).
- `IMG_0624.PNG` does not exist in the source directory (confirmed via `ls`) — not
  a missed capture.
- The Remote "Changes" and "Files" jump-to views referenced in the `IMG_0625`
  context menu were never actually opened in this set (only the menu item itself
  was seen) — their contents are not covered by these captures.
- The Health "Records" connect flow (after tapping "Connect" in `health-20`) and
  the second, cropped "Get started" suggestion card on Health Home (label starting
  "H.../Su...") were not captured beyond what's visible/cropped here.
- The Voice live-conversation filter/sliders icon (top right, `voice-03`) was
  never tapped open in this set — its contents are unknown.
- `chatgpt-ios-health-24` label says "dashboard-blood-body-other" but the Blood
  card content is a repeat of what's already visible at the bottom of
  `health-23` (scroll overlap) — noted so the "Blood" section isn't miscounted as
  two different sets of data.
