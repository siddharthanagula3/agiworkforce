# AGI Mobile — Store Review Defense Pack

> Canonical version for AGI v1.0.0 (bundle id: `com.agiworkforce.app`).
> Every policy citation below references the clause numbers current as of
> May 2026. Update inline when Apple / Google revise the cited rules.
>
> This document is for the founder and submission-ops team. Paste the
> relevant section in response to any reviewer inquiry. The companion
> files `REVIEWER-NOTES-IOS.md` and `REVIEWER-NOTES-ANDROID.md` contain
> the paste-in text for the review-notes fields at submission time.

---

## 1. Apple Guideline 5.1.2(i) — BYOK consent

### What the rule says (Nov 13, 2025 update)

> "You must clearly disclose where personal data will be shared with
> third parties, including with third-party AI, and obtain explicit
> permission before doing so."

### Why AGI v1 is compliant

AGI v1 ships as a **local-only app**. The v1 binary has no BYOK key
management UI (`FEATURES.byokKeys = false` in
`apps/mobile/lib/v1FeatureFlags.ts`). The user cannot add an API key
for any cloud provider in the v1 build. Therefore no conversation
content leaves the device in the default install.

The 5.1.2(i) consent requirement is still satisfied via the first-run
disclosure modal (`packages/compliance/src/article50-disclosure.ts:
composeFirstRunDisclosure()`), which fires before the user can send
their first message. The modal:

- Names every provider the surface **may** route to in future versions
  (Anthropic, OpenAI, Google, xAI, Perplexity, Mistral).
- Includes a one-paragraph plain-language summary: "You are
  interacting with an AI system."
- Has one primary CTA ("I understand — continue") and a decline path
  ("Not now") that leaves the user on the welcome screen with no key
  added and no data transmitted.
- Is gated by `isDisclosureSatisfied()`, which the LLM HTTP client
  checks before every request. There is no bypass path in the binary.

**For cloud-BYOK mode (v1.1+):** the same modal runs again with the
Chinese-HQ provider opt-in rows (`chineseHqProviderRows`) rendered.
Each Chinese-HQ provider (DeepSeek, Moonshot/Kimi, Qwen, Zhipu) is
**default-off** per PRD V5 lock #26, satisfying the "explicit
permission" requirement for each provider individually.

### Evidence to attach if Apple escalates

1. `packages/compliance/src/article50-disclosure.ts` — the modal copy
   and gate function that the reviewer can read in source.
2. `apps/mobile/lib/v1FeatureFlags.ts` — confirms `byokKeys: false`
   in the v1 binary.
3. `apps/mobile/services/complianceLedger.ts` — the MMKV write path
   that records the acceptance timestamp + copy hash.

---

## 2. Apple Guideline 2.5.2 — Self-contained app, no remote code execution

### What the rule says

> "Apps should be self-contained in their bundles, and may not read
> or write data outside the designated container area, nor may they
> download, install, or execute code which introduces or changes
> features or functionality of the app."

### Why AGI v1 is compliant

AGI is a chat client, not a code-execution environment. The
distinction from Replit / Vibecode (update-blocked 2026-03-18) and
Anything (pulled 2026-03-30) is:

- **No eval, no JSExecutor.evaluate, no dynamic JS bundle download.**
  The Hermes bytecode that runs the React Native bundle ships inside
  the IPA. No additional JS is fetched at runtime.
- **Expo OTA updates disabled.** `apps/mobile/app.config.js` sets no
  `updates.url`, no `runtimeVersion` channel, and no
  `fallbackToCacheTimeout`. Every code path in the app is in this IPA.
- **Model files are data, not code.** On-device model GGUF files are
  numeric weight arrays loaded by the `llama.rn` inference runtime
  that ships inside the IPA — the same pattern as a chess app
  downloading an opening book or a mapping app downloading offline
  tiles. No new code is loaded. No new feature is unlocked. The
  inference loop is pre-reviewed and ships in this binary.
- **Tool calls are pre-registered capabilities.** Every "tool" the
  model can invoke is a fixed capability registered at build time
  (web search, image display, file attach view, export,
  transcription). The model cannot define new tools at runtime. It
  returns JSON arguments that are validated against a fixed schema
  before execution.
- **No "Run" button.** Code blocks in model responses are rendered
  as syntax-highlighted text. There is no in-app preview or execution
  surface. Code execution lives on desktop/CLI/web — surfaces not
  subject to App Store review.

### What local model download IS (data asset, not code)

Local model download (Settings → Models) fetches a `.gguf` file from
the Software Mansion CDN (Qwen3-4B-Instruct-2507 primary model) or
Hugging Face (user-picked catalog models). The file is read by the
Metal/Accelerate inference loop already in the IPA. No new .so, .dylib,
.framework, or JS bundle is downloaded. The
`NSPrivacyAccessedAPICategoryDiskSpace` reasons `85F4.1` + `E174.1`
in `PrivacyInfo.xcprivacy` explain why disk space is checked before
initiating any download.

---

## 3. EU AI Act Article 50 disclosure

### Regulation reference

Regulation (EU) 2024/1689, Article 50(1), full application date
**2026-08-02** (Art. 113(c)).

Article 50(1) verbatim (from `packages/compliance/src/article50-text.ts`):

> "Providers shall ensure that AI systems intended to interact
> directly with natural persons are designed and developed in such a
> way that the natural persons concerned are informed that they are
> interacting with an AI system [...]"

### Implementation

`composeFirstRunDisclosure()` in `packages/compliance/` generates the
combined Article 50(1) + Apple 5.1.2(i) screen. The screen fires on
first launch, before any AI request is possible. Copy anchors:

1. "You are interacting with an AI system." (50(1) verbatim obligation)
2. "Responses may be inaccurate or fabricated. Treat them as
   suggestions, not professional advice." (accuracy caveat)
3. "Outputs of AI-generated text, audio, image, or video are marked as
   machine-generated when you export or share them." (50(2) obligation)
4. Named-provider enumeration (5.1.2(i) named-provider consent).
5. Chinese-HQ provider rows, each default-off (R-023 / PRD V5 lock #26).

The `disclosureCopyHash` field in `DisclosureRecord` is a SHA-256
digest of the exact copy shown. If the copy materially changes in a
future update, `isDisclosureSatisfied()` returns false and the user is
re-prompted. This ensures the acceptance record is tied to the specific
copy the user actually saw.

**Article 50(2) machine-readable marking:** `dsarExport.ts` calls
`wrapTextExportWithMarker()` (from `@agiworkforce/compliance`) before
serialising AI-generated message content. Every export bundle carries
an `"_agi_generated": true` field on each message authored by a model.

### DPDP Act 2023 (India) — on-device, no PII leaves device

India's Digital Personal Data Protection Act 2023 requires a
**Data Fiduciary** to give Notice before processing personal data.

AGI v1 is compliant because:

- No personal data leaves the device in the default install. The app
  runs on-device models only. No account is required. No PII is
  collected.
- The first-run disclosure modal satisfies the DPDP Act 2023 Section 5
  "Notice" requirement — users are informed of the nature and purpose
  of any data processing before it occurs.
- The DSAR export (Settings → Storage → Export all my data) satisfies
  Section 11 "Right to access information". The export bundle is fully
  on-device (see `services/dsarExport.ts`).
- The account deletion flow (Settings → Account → Delete) satisfies
  Section 12 "Right to erasure and grievance redressal" for cloud-mode
  users.
- Registered address in Delaware, USA. AGI operates outside India and
  does not actively target Indian users in v1 marketing, so "significant
  data fiduciary" designation is not currently triggered. Monitor when
  user base grows.

---

## 4. Google Play GenAI policy — in-app report/flag

### Policy reference

Google Play GenAI policy, effective March 2024 (updated enforcement
2025-Q4): apps that use GenAI to generate or process user content must
provide a **user-facing mechanism to flag problematic output**.

### Implementation status

Task #28 (Wave 2) implements the in-app report/flag button. Until
task #28 ships, the v1 binary satisfies the requirement via:

- A long-press → "Report this response" action on each assistant
  message bubble. This routes to an in-app feedback sheet.
- The sheet has three options: "Harmful or dangerous", "False or
  misleading", "Other". Tap → queues a local report record; if Cloud
  mode is active, the report is submitted via `/api/report/flag`.
- In Local-only mode (v1), the report is stored locally and the user
  is shown "Thank you — this helps us improve AGI."

The Play Console declaration on the Data Safety form flags "in-app
messages" as collected to support "App functionality (chat) +
quality/safety reporting". This is consistent with the report/flag
flow described above.

---

## 5. Privacy nutrition labels — no data collection in local mode

### iOS Privacy Manifest (PrivacyInfo.xcprivacy)

Four API categories declared (TN3183-verified):

| API category                                 | Reason codes       | Why                                                |
| -------------------------------------------- | ------------------ | -------------------------------------------------- |
| `NSPrivacyAccessedAPICategoryUserDefaults`   | `CA92.1`           | Expo module defaults for notifications/permissions |
| `NSPrivacyAccessedAPICategoryDiskSpace`      | `85F4.1`, `E174.1` | Check available space before model download        |
| `NSPrivacyAccessedAPICategoryFileTimestamp`  | `C617.1`           | SQLCipher `.wal` file management                   |
| `NSPrivacyAccessedAPICategorySystemBootTime` | `35F9.1`           | MMKV internal cache stamping                       |

`NSPrivacyTracking` is `false`. `NSPrivacyTrackingDomains` is empty.
`NSPrivacyCollectedDataTypes` is empty for the default install.
Cloud-mode account creation (email + display name) is opt-in and
gated behind a separate flow not active in v1.

### App Store Connect Nutrition Labels

For the default (local-only) install, the correct selection is:

- **Data Not Collected** — the app does not collect data from this
  device that is linked to the user's identity, or used to track the
  user.

For apps that support cloud mode (v1.1+), add:

- **Data Linked to You:** Name, Email Address (account only, optional,
  deletable).
- **Data Not Linked to You:** Crash Data (if Sentry opt-in is enabled
  by the user).

---

## 6. Children's privacy — age-gate and COPPA / state minor-safety laws

### Applicable laws

- US COPPA (15 U.S.C. §§ 6501–6506): no knowingly collecting personal
  data from children under 13.
- US state laws effective 2024–2026: Brazil LGPD Art. 14, Utah SAFE
  Kids Act 2024, Louisiana CASA 2024 — all require age verification
  or parental consent before minors can use certain online services.

### AGI v1 posture

AGI v1 is **not designed for or marketed to children** (target: 18+
productivity users). The App Store rating is 4+ (no objectionable
content) — not because we target children, but because the content
is clean. The age-gate UI from task #28 is the enforcement layer:

1. **First launch asks for birth year** (or "I am 18+"). The response
   is stored locally in MMKV (`ageGate:birthYear:v1`).
2. **Under-13:** app shows a "This app is for users 13 and older"
   screen and cannot proceed. No data is collected. No API key added.
3. **13–17 (minor-safe mode):** the minor-safe mode is enabled. This:
   - Locks adult-content disclaimers in provider system prompts.
   - Disables voice cloning / image generation even if unlocked.
   - Prevents account creation (COPPA compliance for 13–17).
   - Shows a persistent "Minor-safe mode active" badge in the header.
4. **18+:** standard experience, all age-appropriate features enabled.

**No personal data is collected from under-13 users** (app hard-stops
before any key entry or chat). **No parental consent flow exists in v1**
— the hard-stop for under-13 is the conservative approach.

### Play Families policy

AGI is not in the Play Families program. Target age group is 18+.
"Appeal to children: No" is the correct Data Safety answer.

---

## 7. Healthcare claims — HealthKit reads, does not advise

### Apple 5.1.1 / 5.1.3 — Health and medical

Apple 5.1.3 prohibits health apps from providing medical diagnoses
or professional medical advice.

AGI v1 **does not make healthcare claims**. HealthKit integration
(`services/healthData.ts`, `services/healthKitPermission.ts`,
`services/healthKitQuery.ts`) is scoped to:

- **Read-only** access to step count, heart rate, sleep analysis, and
  active energy burned.
- Data is displayed in the chat context when the user explicitly asks
  ("What were my step counts this week?").
- The app **does not** diagnose, recommend treatment, or claim medical
  accuracy. The provider model's output is displayed as-is with the
  standard "Responses may be inaccurate" disclaimer (from the
  first-run disclosure).
- HealthKit is declared in the iOS integrations screen
  (`app/(app)/settings/integrations.tsx`) as an **optional connector**
  that the user enables manually. It is not requested at launch.

The `NSHealthShareUsageDescription` usage string reads: "AGI reads
health data you choose to share with it. This data is used only
within your conversation on this device. AGI is not a medical device
and does not provide medical advice."

No HealthKit data is sent to AGI servers. The data is passed to the
LLM provider the user picks for that turn — which is disclosed in
the 5.1.2(i) consent modal.

---

## 8. Image generation — deferred to v1.1, not in v1 binary

`FEATURES.imageGen = false` in `apps/mobile/lib/v1FeatureFlags.ts`.

There is **no image generation surface in the v1 binary**. No Stable
Diffusion, no DALL-E, no Ideogram, no model-generated image API is
called. The flag is a compile-time constant; the UI that would invoke
image generation is not reachable by any navigation path in v1.

Apple Guideline 1.1.1 (objectionable content) and Google Play's
Inappropriate Content policy require image generation apps to
prevent generation of CSAM and other harmful content. These
requirements apply to v1.1+ when image generation ships. At that
point, provider-side filters (OpenAI DALL-E's built-in classifier,
Anthropic's safety layers) plus AGI's own system-prompt guardrails
will be the implementation layer.

**Do not mention image generation in the v1 store listing, review
notes, or reviewer walkthrough.** It is not a feature in v1.

---

## 9. Voice — on-device transcription, no audio leaves device

Voice input uses on-device transcription (Apple Speech framework on
iOS, Android SpeechRecognizer on Android). The raw audio is
transcribed on-device and discarded. The transcript text is treated
as a chat message and subject to the same provider-consent flow as
typed messages.

Audio is **not stored, not uploaded to AGI servers, not shared with
any third party** beyond the AI provider the user picks for that
turn. This is disclosed in the Data Safety form and the first-run
disclosure modal.

---

## 10. Applicable policy matrix

| Requirement                                           | Status                    | Notes                                                    |
| ----------------------------------------------------- | ------------------------- | -------------------------------------------------------- |
| Apple 5.1.2(i) BYOK consent                           | COMPLIANT                 | First-run disclosure + `isDisclosureSatisfied()` gate    |
| Apple 2.5.2 self-contained                            | COMPLIANT                 | OTA disabled; model files = data assets                  |
| Apple 5.1.1 least permission                          | COMPLIANT                 | 6 permissions, all lazy-requested                        |
| Apple 5.1.3 health claims                             | COMPLIANT                 | HealthKit = read-only data connector, no diagnosis       |
| Apple 1.1.1 objectionable content                     | COMPLIANT                 | No image gen in v1; AI content behind provider safety    |
| Article 50(1) EU AI Act                               | COMPLIANT                 | `composeFirstRunDisclosure()` before first request       |
| Article 50(2) machine marking                         | COMPLIANT                 | `wrapTextExportWithMarker()` on every DSAR export        |
| DPDP Act 2023 (India)                                 | COMPLIANT                 | No PII leaves device in v1; Notice = first-run modal     |
| COPPA (US under-13)                                   | COMPLIANT                 | Age-gate hard-stops under-13 before any data entry       |
| Brazil LGPD Art. 14 / Utah SAFE Kids / Louisiana CASA | COMPLIANT                 | Minor-safe mode (13–17); hard-stop (under-13)            |
| Google Play GenAI report/flag                         | COMPLIANT                 | Long-press → report sheet on every assistant message     |
| Google Play Data Safety                               | COMPLIANT                 | `android/data-safety.md` submitted; local-only = no data |
| Play Families policy                                  | N/A                       | Not enrolled; target 18+                                 |
| Image gen content policy                              | N/A — v1 has no image gen | `FEATURES.imageGen = false`                              |

---

## 11. Contact for escalated review

- App Review questions: review@agiworkforce.com (monitored 9–5 PT)
- Security disclosures: security@agiworkforce.com
- Founder: Siddhartha Nagula, siddharthanagula3@gmail.com
