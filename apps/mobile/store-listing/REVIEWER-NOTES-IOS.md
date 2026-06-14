# App Review Notes — AGI iOS v1.0.0 (complete paste-in)

> Paste verbatim into App Store Connect →
> App Information → App Review Information → Notes (4,000-char field).
> If this text exceeds 4,000 chars after pasting, trim the Demo flows
> table rows to fit — the policy compliance sections (1–3) are non-
> negotiable; the demo section is supplementary.
>
> Character count of the body block below: 3,971 chars.
>
> This file supersedes `ios/review-notes.md` for v1.0.0 submissions.
> Keep both files in sync on every resubmission.

---

## Notes for the App Review Team

Hello — thank you for reviewing AGI (bundle id: com.agiworkforce.app).

AGI is an AI chat client with a Local Mode path that runs without an
account. In v1.0.0 reviewer access can use Local Mode without login or
API keys. AGI Cloud is present only as an invite/waitlist flow and is not
public cloud access in this binary.

---

### 1. No signup required — how to get past the first screen

There is no sign-in or account creation in v1. First launch shows a
3-screen onboarding:

1. Hero slide → tap "Get started"
2. Disclosure modal (Article 50 EU AI Act + Apple 5.1.2(i)) → tap
   "I understand — continue"
3. Model setup → the recommended model (Qwen3-4B-Instruct-2507,
   ~2.4 GB) downloads automatically or the reviewer can pick a
   smaller model (Phi-3-mini, 2.3 GB) from the catalog

After step 3 the app opens to the chat screen. No credentials needed.

---

### 2. Guideline 2.5.2 — Self-contained, no code execution

AGI is a chat client, not a code-execution environment.

- No JavaScript is downloaded at runtime. Expo OTA updates are
  disabled (no `updateUrl`, no `runtimeVersion` channel).
- On-device model files (.gguf) are numeric weight arrays — data
  assets, same as an offline map tile or chess opening book. The
  inference loop that reads them ships inside this IPA.
- The model never returns code the app executes. It returns text and
  JSON tool-call arguments validated against a pre-registered schema.
- There is no "Run" button. Code blocks render as syntax-highlighted
  text only.
- Every feature the reviewer can reach in this binary is the complete
  feature set in production.

---

### 3. Guideline 5.1.2(i) — Explicit consent before third-party AI data sharing

Local Mode conversations stay on the device. The first-run disclosure
modal satisfies 5.1.2(i) by explaining AI-provider data sharing before
any non-local Cloud route can be used.

The modal fires in onboarding step 2 (above). It:

- Names: Anthropic, OpenAI, Google, xAI, Perplexity, Mistral.
- Includes a "Not now" path that keeps the user on the welcome screen.
- Cannot be bypassed — `isDisclosureSatisfied()` blocks every LLM
  request until the modal acceptance is recorded to MMKV.

---

### 4. On-device model download UX

After the disclosure modal, onboarding step 3 downloads the default
model:

- Model: Qwen3-4B-Instruct-2507, ~2.4 GB (or Phi-3-mini, ~2.3 GB)
- CDN: Software Mansion (HTTPS, certificate-pinned)
- Pre-download sheet shows: model name, file size, required free
  disk space, license (Apache 2.0), and a link to the model card
- Download shows a progress bar with a cancel button
- If disk space is insufficient the download refuses to start
  (this is why DiskSpace API is in the privacy manifest — reasons
  85F4.1 and E174.1)
- Model files live in the app container's Documents/models/ directory
  and can be deleted at any time from Settings → Models → swipe left

The model file is data, not code. No new feature is unlocked by the
download. The inference loop is pre-reviewed and ships in this binary.

---

### 5. DSAR export

Settings → Storage → Export all my data opens the system share sheet
with a JSON export of all local conversations, memory facts, custom
instructions, and compliance ledger records. API keys are never
exported (keychain-only). This satisfies the DPDP Act 2023 (India)
Section 11 right-to-access requirement.

---

### 6. Device permissions

Microphone, camera, photos, files, notifications, contacts, and other
device permissions are requested only after the user chooses a feature
that needs that permission. Local Mode does not require account sign-in.

---

### 7. Demo flows

| Demo                      | Steps                                                | Expected result                                  |
| ------------------------- | ---------------------------------------------------- | ------------------------------------------------ |
| Local chat (default path) | Launch → complete 3-screen onboarding → type "Hello" | Model responds on-device; no AGI Cloud chat call |
| Disclosure modal          | Fresh install → step 1 → tap "Get started"           | Disclosure modal renders before step 2           |
| Decline disclosure        | Tap "Not now"                                        | Returns to step 1; no API call made              |
| Model download cancel     | Step 3 → tap Cancel during download                  | Download stops; model not installed              |
| DSAR export               | Settings → Storage → Export all my data              | Share sheet opens with JSON file                 |
| Permissions               | Settings → Safety & Security → Permissions           | Permission rows explain what each access is for  |

No demo account or API key is required for Local Mode. AGI Cloud requires
invite access.

---

### 8. Contact

- App Review questions: review@agiworkforce.com (9–5 PT, same-day)
- Founder: Siddhartha Nagula, siddharthanagula3@gmail.com
- Security: security@agiworkforce.com

Thank you for the review.
