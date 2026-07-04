# Play Console Review Notes — AGI Android v1.2.0

> Paste verbatim into Play Console →
> App content → App access → Instructions for reviewers.
>
> Play Console allows a freeform text field plus optional username /
> password fields for demo accounts. AGI requires no demo account —
> leave username/password blank and explain below.
>
> Recount this body's character count before pasting — content below has
> changed since the ~2,800-char v1.0.0 count and has not been re-measured.

---

## Instructions for Google Play reviewers

Hello — thank you for reviewing AGI (package: com.agiworkforce.app).

AGI is an AI chat client with a Local Mode path that runs without an
account. Reviewer access can use Local Mode without login, API keys, or
Google Play Billing. AGI Cloud is in public alpha and open to any
signed-in user — there is no invite code or waitlist gate in this
binary. Signing in (free, self-service, via Clerk) unlocks Cloud chat,
image generation, and web search on a free tier, with an in-app row
that opens a web checkout (agiworkforce.com/pricing) to view paid
plans. There is no Play Billing purchase in this build — native IAP is
feature-flagged off pending real product IDs and server-side receipt
verification.

---

### No account needed — how to get past the first screen

There is no sign-in, registration, or Google account connection
required for Local Mode. First launch shows a 3-screen onboarding:

1. Hero slide → tap "Get started"
2. Disclosure modal (EU AI Act Article 50 + provider consent) → tap
   "I understand — continue"
3. Model setup → Qwen3-4B-Instruct-2507 (~2.4 GB) downloads, or the
   reviewer can pick AGI Lite (Llama 3.2 1B, ~1.1 GB) from the catalog

After step 3 the app opens to the chat screen. No credentials needed.

---

### GenAI policy — in-app report/flag mechanism

Google Play's GenAI policy requires apps that generate or process
AI content to provide a mechanism for users to flag problematic
output.

In AGI: long-press any assistant message bubble → "Report this
response" → sheet with three options ("Harmful or dangerous", "False
or misleading", "Other") → submit. In Local Mode the report is stored
locally; in AGI Cloud (public alpha, any signed-in user) it routes
through the AGI backend.

---

### Data Safety form — what was submitted and why

Local Mode collects **no data**. The Data Safety form
(`LISTING-METADATA-ANDROID.json` → `data_safety`, mirrored in
`android/data-safety.md`) declares:

- "Data Linked to You": Email address and Name (App functionality
  purpose), collected only when the user signs in to AGI Cloud
  (public alpha, any signed-in user — free, self-service, no invite
  code). Name is collected only if provided by the sign-in method.
- Data is not shared with third parties, not sold, and not used for
  advertising.
- No advertising IDs (GAID). No device fingerprinting. No analytics
  by default (opt-in toggle in Settings → Privacy).
- API keys stored in Android Keystore, hardware-backed. AGI never
  sees them.

---

### On-device model download

After the disclosure modal, the app downloads the recommended model:

- Model: Qwen3-4B-Instruct-2507, ~2.4 GB (Apache 2.0 license)
- CDN: Software Mansion (HTTPS)
- Pre-download sheet shows: model name, file size, free space
  required, license, link to model card on Hugging Face
- Progress bar with cancel button; insufficient-disk-space check
  prevents download if space is unavailable
- Model files live in app-internal storage (`getFilesDir()/models/`)
  and can be deleted at any time from Settings → Models → long-press
  → Delete

The model file is a numeric weight array — data, not code. No new
feature is unlocked. The inference loop ships in this APK.

---

### Children's privacy — age-gate

AGI is designed for users 18+. On first launch, the app asks for
birth year:

- Under 13: hard-stop screen "This app is for users 13 and older."
  No data collected. No further navigation possible.
- 13–17: minor-safe mode enabled (restricts certain outputs, disables
  image gen and voice cloning).
- 18+: full experience.

Target audience declared in Data Safety: 18+. "Appeal to children:
No." AGI is not in the Play Families program.

---

### DSAR export (right to data access)

Settings → Storage → Export all my data produces a JSON file of all
local conversations, memory facts, custom instructions, and compliance
ledger records. Shared via Android share sheet. API keys are never
included (Keystore-only). This satisfies India DPDP Act 2023 §11
and LGPD Art. 15 right-of-access requirements.

---

### Permissions declared

| Permission          | When requested                                              | Purpose                                                           |
| ------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------- |
| `CAMERA`            | User taps the camera icon in the chat composer or scan tool | Take a photo to attach to a chat message, or scan a code/document |
| `RECORD_AUDIO`      | User holds the mic button in the chat composer              | On-device voice transcription                                     |
| `READ_MEDIA_IMAGES` | User taps the photo-picker icon in composer                 | Attach image to chat message                                      |
| `READ_CALENDAR`     | User enables Calendar connector in Settings → Integrations  | Read events when user asks model to do so                         |
| `READ_CONTACTS`     | User enables Contacts connector in Settings → Integrations  | Read contacts when user asks model to do so                       |

No permission is requested at launch. Camera / mic / photo are
lazy-requested on the user's tap of the relevant affordance.
Calendar / Contacts are behind optional connector opt-in toggles.
Note: the desktop-companion QR pairing flow (`FEATURES.companion`) is
disabled in this build — camera use in the shipped binary is for photo
attachment and the in-app scan tool only. `app.config.js`'s
`NSCameraUsageDescription` string still mentions "desktop pairing";
flag to engineering to update that string before submission so it
matches actual v1.2.0 camera usage.

---

### Demo flows

| Demo             | Steps                                                                 | Expected result                                          |
| ---------------- | --------------------------------------------------------------------- | -------------------------------------------------------- |
| Local chat       | Launch → complete 3-screen onboarding → type "Hello"                  | Model responds on-device; no network call to AGI servers |
| Disclosure modal | Fresh install → tap "Get started"                                     | Disclosure modal appears before step 2                   |
| Report/flag      | Send a message → long-press assistant bubble → "Report this response" | Report sheet with 3 options appears                      |
| Model delete     | Settings → Models → long-press Qwen3 → Delete                         | Model removed; app offers re-download                    |
| DSAR export      | Settings → Storage → Export all my data                               | Android share sheet opens with JSON file                 |

---

### Contact

- Review questions: review@agiworkforce.com (9–5 PT, same-day)
- Founder: Siddhartha Nagula, siddharthanagula3@gmail.com
- Privacy policy: https://agiworkforce.com/privacy
- Support: support@agiworkforce.com

Thank you for the review.
