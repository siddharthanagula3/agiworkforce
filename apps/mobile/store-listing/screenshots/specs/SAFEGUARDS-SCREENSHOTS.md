# Safeguards Screenshots — capture spec

> These screenshots are NOT part of the public store listing screenshot
> sequence (that's `README.md` in this directory). These are **review
> evidence screenshots** — captures that demonstrate compliance features
> to App Review / Play Console reviewers, attached as PDF or
> supplemental screenshots when responding to policy questions.
>
> Capture with the same device classes as the store listing: iPhone 17
> Pro Max (6.7", portrait) for iOS; Pixel 9 Pro (1080 × 2400) for Android.
> File format: PNG, 72 DPI, actual pixel dimensions.

---

## Capture list

### S-01 — Cloud mode locked (waitlist gate)

**Purpose:** Shows that Cloud mode is not active in v1; the user is
on a waitlist, not a paying subscriber with access to cloud routing.

**What should be visible:**

- The mode toggle in the chat header, set to "Local" (on-device shield
  icon, "Local" label, green indicator).
- Cloud option in the drawer showing "Join waitlist" instead of a
  switch the user can flip.
- The CloudWaitlistSheet open (if possible), showing the waitlist
  queue position and the "Notify me when Cloud is available" copy.

**Navigation path:** Chat → hamburger menu → "Cloud mode" row →
tap to open CloudWaitlistSheet.

**Filename:** `S-01-cloud-locked-waitlist.png`

---

### S-02 — Age-gate screen (under-13 hard-stop)

**Purpose:** Demonstrates COPPA / Utah SAFE Kids Act / Louisiana CASA
compliance. Shows that under-13 users cannot proceed.

**What should be visible:**

- The age-gate entry screen (birth year picker or "I am 18+" toggle).
- With birth year set to 2014 (age 12): the hard-stop screen reading
  "This app is for users 13 and older."
- No navigation affordance past the hard-stop screen (no "Continue"
  button).

**Navigation path:** Fresh install → skip to age-gate step during
onboarding → enter birth year that results in age < 13 → confirm.

**Filename:** `S-02-age-gate-under-13-hardstop.png`

**Note:** Capture both the entry screen and the hard-stop screen; two
PNGs are acceptable here, named `-a` and `-b`.

---

### S-03 — Minor-safe mode active badge (age 13–17)

**Purpose:** Shows that 13–17 users see a persistent badge indicating
restricted mode is active.

**What should be visible:**

- The chat header with a "Minor-safe mode" badge or indicator visible
  alongside the model name.
- The chat input is functional (the user can type and send).
- No image generation or voice cloning affordances visible in the
  composer action sheet.

**Navigation path:** Fresh install → enter birth year resulting in
age 13–17 → complete onboarding → open chat → tap "+" in composer
to show action sheet.

**Filename:** `S-03-minor-safe-mode-badge.png`

---

### S-04 — In-app report/flag sheet

**Purpose:** Demonstrates the GenAI Play Policy report/flag mechanism.

**What should be visible:**

- A chat thread with at least one assistant message visible.
- The long-press context menu on the assistant message, with
  "Report this response" as one of the options.
- OR (second screenshot): the report sheet open, showing the three
  report reason options: "Harmful or dangerous", "False or misleading",
  "Other".

**Navigation path:** Chat → send any message → wait for response →
long-press the assistant message bubble → observe context menu →
tap "Report this response" → observe report sheet.

**Filename:** `S-04a-report-context-menu.png`, `S-04b-report-sheet.png`

---

### S-05 — On-device shield badge in chat header

**Purpose:** Shows that the app visually communicates local-only
operation to the user. Useful for demonstrating privacy-first design
to reviewers.

**What should be visible:**

- The chat header with the Local mode indicator (shield icon + "Local"
  label + green dot or "On-device" label).
- The model name badge showing the on-device model name
  (e.g., "Qwen3-4B").
- No network activity indicator or "Cloud" indicator visible.

**Navigation path:** Any active chat in v1 (all chats are local-only).

**Filename:** `S-05-ondevice-shield-badge.png`

---

### S-06 — Privacy → DPDP information screen

**Purpose:** Shows the in-app privacy disclosure that satisfies DPDP
Act 2023 (India) Section 5 Notice requirement.

**What should be visible:**

- Settings → Privacy (or the first-run disclosure modal, if reachable
  from settings).
- The privacy screen should show: data controller identity ("AGI
  Automation LLC, Delaware, USA"), DPDP Act 2023 disclosure, purpose
  of data processing, and rights (access, erasure, grievance).
- The "Export my data" button and "Delete my account" button visible
  (or their entry points).

**Navigation path:** Chat → Settings → Privacy (scroll to DPDP
section) OR Settings → Storage → (Export / Delete visible).

**Filename:** `S-06-privacy-dpdp-screen.png`

---

### S-07 — First-run disclosure modal (Article 50 + 5.1.2(i))

**Purpose:** Documents the combined EU AI Act Article 50 and Apple
5.1.2(i) consent screen that fires before the first AI request.

**What should be visible:**

- The modal title "Before you start".
- The plain-language summary: "You are interacting with an AI system."
- Named providers list (Anthropic, OpenAI, Google, xAI, Perplexity,
  Mistral).
- Chinese-HQ provider rows (DeepSeek, Moonshot/Kimi, Qwen, Zhipu),
  each shown as **off** by default.
- "I understand — continue" primary button.
- "Not now" secondary link.

**Navigation path:** Fresh install → tap "Get started" on the hero
screen → disclosure modal appears.

**Filename:** `S-07-first-run-disclosure-modal.png`

---

### S-08 — HealthKit permission sheet (iOS only)

**Purpose:** Shows that the HealthKit permission sheet is triggered by
the user's explicit tap (not at launch), and that the
`NSHealthShareUsageDescription` string is visible.

**What should be visible:**

- Settings → Integrations → Health → tap "Connect".
- The standard iOS HealthKit permission sheet is visible, showing the
  AGI usage string: "AGI reads health data you choose to share with it.
  This data is used only within your conversation on this device. AGI
  is not a medical device and does not provide medical advice."
- The sheet shows the individual health categories (Step Count, Heart
  Rate, Sleep Analysis, Active Energy) and the "Allow" / "Don't Allow"
  options.

**Navigation path:** Settings → Integrations → Health → Connect.

**Filename:** `S-08-healthkit-permission-sheet.png` (iOS only)

---

## File organization

Place all captures in:

```
apps/mobile/store-listing/screenshots/safeguards/
├── S-01-cloud-locked-waitlist.png
├── S-02a-age-gate-entry.png
├── S-02b-age-gate-under-13-hardstop.png
├── S-03-minor-safe-mode-badge.png
├── S-04a-report-context-menu.png
├── S-04b-report-sheet.png
├── S-05-ondevice-shield-badge.png
├── S-06-privacy-dpdp-screen.png
├── S-07-first-run-disclosure-modal.png
└── S-08-healthkit-permission-sheet.png   (iOS only)
```

Android equivalents (where HealthKit doesn't apply): S-01 through S-07.

---

## When to attach these

- **App Store Connect:** If Apple sends a "Resolution Center" message
  citing 5.1.2(i), 2.5.2, 5.1.3 (health), or 1.1.1 (content), reply
  with the relevant screenshots from this set attached to the reply.
  S-07 and S-05 are the most commonly needed.

- **Play Console:** If a Google reviewer requests evidence of the
  GenAI report/flag mechanism, attach S-04a and S-04b. For age-gate
  evidence, attach S-02a, S-02b, S-03.

- **Pre-submission review consult:** If doing a pre-submission review
  call with an Apple / Google Partner Manager, share S-01 through
  S-07 as a PDF compiled in order.
