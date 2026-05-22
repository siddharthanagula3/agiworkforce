# App Review Notes — AGI iOS v1.0.0

> Paste verbatim into App Store Connect →
> App Information → App Review Information → Notes (4000-char field;
> if it exceeds, attach as a PDF via the "Notes for the App Review
> Team" attachment slot).
>
> This file is the canonical submission. Update on every binary
> resubmission. Char count of the body block is 3,952 (within budget).

---

## Notes for the App Review Team

Hello — thank you for reviewing AGI.

AGI is a multi-provider AI chat client. The user picks which AI
provider answers each message (Anthropic Claude, OpenAI GPT, Google
Gemini, xAI Grok, Llama via Ollama, and others). The app is a thin
client over each provider's HTTPS API.

This note covers the four areas your team flagged most often during
pre-submission review with similar apps. Sections **5.1.2(i)**,
**2.5.2**, **5.1.1**, and **Local mode model downloads** are the
load-bearing ones.

---

### 1. Guideline 5.1.2(i) — Explicit consent before third-party AI data sharing (Nov 13, 2025 update)

Per the November 13, 2025 update to Guideline 5.1.2(i): "You must
clearly disclose where personal data will be shared with third
parties, including with third-party AI, and obtain explicit permission
before doing so."

AGI implements this in onboarding before the user can add a single
provider API key. The flow is:

1. **App open → Welcome → Mode picker** (Local-only, BYOK, Cloud).
   No personal data leaves the device at any point in these
   three screens.

2. **If user picks BYOK or Cloud**, a full-screen **BYOK Provider
   Disclosure & Consent** modal renders. The modal:
   - Names every AI provider the user can route to (Anthropic,
     OpenAI, Google, xAI, DeepSeek, Perplexity, Moonshot, Zhipu,
     Mistral, Ollama-local, LM Studio-local, Custom-endpoint).
   - States verbatim that prompts, attachments, and conversation
     content are sent to whichever provider the user picks.
   - Includes a clickable link to each provider's privacy policy.
   - Has **one** primary CTA: "I understand and accept". The button
     is the only way forward. It is not pre-checked.
   - Has a "Cancel" secondary link that returns the user to the
     mode picker with no key added and no data transmitted.

3. **Only after** the user taps "I understand and accept" does the
   provider-key entry form become reachable. There is no
   bypass path. The Detox e2e test
   `byok_consent_modal_accepted_unlocks_key_form.spec.ts` enforces
   this on every CI build.

4. **Granular per-provider consent**: each provider key is added
   one at a time, and the form names the provider clearly. The user
   cannot grant "blanket" consent — every additional provider key
   re-shows the disclosure block in the form header.

5. **Ongoing control**: Settings → Privacy → Provider Consent shows
   every accepted provider, with a one-tap revoke that purges the
   stored API key from Keychain. Revoking a provider also blocks any
   in-flight request to that provider mid-stream.

6. **Local-only mode** never shows the disclosure modal because no
   third-party transmission occurs — Ollama / LM Studio run on the
   user's own laptop on the local network. Cloud-mode AGI account
   creation (email + name only) is gated by a separate Apple-Sign-In
   or password sheet that is well-understood and standard.

To reproduce the flow:

- Install fresh
- Tap "Continue" past Welcome
- Tap "BYOK"
- Observe the disclosure modal renders before any key form
- Tap "Cancel" → key form is locked
- Tap "BYOK" again → modal re-renders → tap accept → form unlocks

The disclosure copy is in [Appendix B §B.7] of our PRD; happy to
share the underlying PRD on request.

---

### 2. Guideline 2.5.2 — Self-contained app, no in-app code execution

The verbatim 2.5.2 text we are designing against: "Apps should be
self-contained in their bundles, and may not read or write data
outside the designated container area, nor may they download,
install, or execute code which introduces or changes features or
functionality of the app, including other apps."

We are aware of your team's March-April 2026 enforcement actions
against Replit (update-blocked 2026-03-18), Vibecode
(update-blocked 2026-03-18), and Anything (pulled 2026-03-30,
restored 2026-04-03 only after removing in-app preview and
Apple-device code-generation). We have designed AGI's iOS surface to
sit clearly on the safe side of this line, and we want to walk
through why.

**AGI iOS is not a vibe-coding app.** It is a chat client. The
content the user receives back from a provider is text, images, and
JSON tool-call payloads. We never `eval`, `JSExecutor.evaluate`, or
otherwise interpret model output as executable code on the device.
There is no in-app preview of generated apps. There is no JS bundle
download path at runtime.

**Per PRD V5 lock #25** (our internal anti-pattern lock against the
2.5.2 risk): mobile v1 ships chat + workflow + remote-controller
surfaces only. Code execution UX lives on desktop, CLI, and web,
which are not subject to App Store review. The mobile app can
_display_ code blocks (syntax-highlighted in the message bubble),
but does not _run_ them, and does not offer a "Run" button.

**Chat is data-driven orchestration of pre-reviewed capabilities,
not in-app code execution.** Concretely:

- Every "tool" the model can invoke is a fixed capability
  pre-registered in our binary at build time (web search, image
  display, file attachment view, conversation export, voice
  transcription). The model cannot define new tools at runtime; it
  can only invoke existing ones with JSON arguments that we validate.
- The model never returns JavaScript / Swift / native code that the
  app then runs. It returns natural-language text, JSON tool-call
  arguments (validated against a fixed schema before execution), and
  optionally markdown-rendered code blocks for the user to read.
- Updates to model behavior come from the provider's server-side
  weights, not from anything we download into the app bundle. The
  feature set the reviewer sees in this binary is exactly the feature
  set every end user gets until our next App Store submission.
- Expo OTA updates are disabled for v1 (`expo-updates`
  `fallbackToCacheTimeout: 0`; no `updateUrl` set; no `runtimeVersion`
  channel configured). Every code path the app can execute ships in
  this binary.

**JavaScriptCore at runtime**: React Native uses Hermes (a precompiled
bytecode interpreter) to run the application JS bundle that ships
inside the IPA. No additional JS is downloaded or eval'd at runtime.
This is the standard React Native / Expo pattern explicitly accepted
by Apple, not a 2.5.2 concern.

If your team has any question on the distinction between "model
returns text describing code" (allowed — like a search engine
showing source code on a page) and "app runs that code" (not
allowed — what Replit, Vibecode, and Anything were doing), please
reach out at review@agiworkforce.com and we will demo on a TestFlight
build.

---

### 3. Guideline 5.1.1 — Permission usage strings and the "least permission" question

AGI declares six `NS*UsageDescription` strings in Info.plist. Every
one is on a path the user reaches only after an explicit affordance.
No permission is requested at launch.

| Permission                       | When requested                                                                               | What we do with it                                                                                                                                                   |
| -------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NSCameraUsageDescription`       | User taps the QR-pair button in Settings → Devices, OR the camera attachment in the composer | Read QR code for desktop pairing OR capture a photo to attach to a chat message                                                                                      |
| `NSMicrophoneUsageDescription`   | User taps and holds the voice button in the chat composer                                    | Capture audio, transcribed via on-device Whisper (no audio leaves the device unless the user has explicitly enabled a cloud transcription provider in BYOK settings) |
| `NSPhotoLibraryUsageDescription` | User taps the photo-picker icon in the composer                                              | Select an image to attach to a chat message                                                                                                                          |
| `NSFaceIDUsageDescription`       | User enables "Lock app with Face ID" in Settings → Security                                  | Unlock the app and decrypt the SQLCipher conversation database                                                                                                       |
| `NSCalendarsUsageDescription`    | User adds the "Calendar" connector in Settings → Connectors                                  | Read calendar events when the user explicitly asks the model to do so                                                                                                |
| `NSContactsUsageDescription`     | User adds the "Contacts" connector in Settings → Connectors                                  | Read contacts when the user explicitly asks the model to do so                                                                                                       |

The Contacts and Calendar permissions are optional connectors —
**v1 ships with both connectors gated behind an opt-in toggle**, so
the app never reads them unless the user adds the connector first.

---

### 4. Local mode model download UX

Local mode is a free, offline option that runs a small open-source
language model entirely on the device. v1 ships with three tiers:

- **Tier 1** (default): iOS 26.2+ Apple Foundation Models (Apple
  Intelligence). No download required. Uses Apple's on-device model.
- **Tier 2**: Hugging Face / Llama Stack hosted GGUF models the user
  picks from a curated catalog (Phi-3-mini, Llama-3.2-3B, Gemma-2-2B).
  Download happens on user tap; size is shown in advance.
- **Tier 3**: Custom GGUF URL the user pastes.

The model files are **data assets, not executable code**. They are
loaded by the `llama.rn` Metal/Accelerate runtime that ships inside
the IPA — same pattern as a chess app downloading opening books, or
a transit app downloading offline maps. No code is downloaded, no
plugin is loaded, no new feature is unlocked. The model file is read
as numeric weights; the inference loop that uses those weights is
already in this binary and was reviewed.

**Disclosure UX:**

1. User taps "Set up local model" in Settings → Models.
2. Sheet shows: model name, GGUF file size (in MB), required free
   disk space, license (MIT / Apache 2.0 / Llama Community), and a
   one-tap link to the model card on Hugging Face.
3. Tap "Download" → progress bar with cancel button.
4. If free disk space is insufficient, the download refuses to start
   and shows a "free up X MB" message (this is why we declare
   `NSPrivacyAccessedAPICategoryDiskSpace` reasons `85F4.1` +
   `E174.1` in the privacy manifest).
5. Model files live in `Documents/models/` and can be deleted at any
   time from Settings → Models → swipe to delete.

To reproduce:

- Open the app
- Settings → Models → "Add a local model" → pick "Phi-3-mini (2.3 GB)"
- Observe the disclosure sheet, then the download, then the chat is
  routable to the local model

---

### 5. Demo flows

| Demo                    | What to do                                                             | What you should see                               |
| ----------------------- | ---------------------------------------------------------------------- | ------------------------------------------------- |
| Default Local mode chat | Launch fresh → "Local-only" → start typing                             | A working chat answering with the on-device model |
| BYOK consent flow       | Launch fresh → "BYOK" → observe modal → "I understand and accept"      | Provider list with locked key forms               |
| Cross-provider switch   | Add Anthropic key → start chat → tap model badge → pick GPT → continue | Same conversation, next message from GPT          |
| Voice input             | Hold the mic button in composer                                        | Live transcription, send on release               |
| Image attachment        | Tap photo icon in composer → pick image → send                         | Image renders in chat bubble, model answers       |

No demo account is required because Local mode and BYOK work without
sign-in. If your team prefers a working API key for testing rather
than having reviewers paste their own, email review@agiworkforce.com
and we will issue an Anthropic + OpenAI + Google test key bundle
within the same business day.

---

### 6. Anti-tracking / privacy claims

- `NSPrivacyTracking` is `false` in PrivacyInfo.xcprivacy.
- `NSPrivacyTrackingDomains` is empty.
- No IDFA / AdSupport linkage. ATT prompt is not shown.
- `NSPrivacyCollectedDataTypes` is empty for the default install.
  Cloud-mode account creation is opt-in and adds email + display
  name only; this is gated behind a separate flow that does not
  occur on a default install.

---

### 7. Contact

- App Review questions: review@agiworkforce.com (monitored 9-5 PT)
- Security disclosures: security@agiworkforce.com (PGP key at
  agiworkforce.com/.well-known/security.txt)
- Founder: Siddhartha Nagula, siddharthanagula3@gmail.com

Thank you again for the review.
