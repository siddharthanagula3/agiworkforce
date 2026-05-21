# Google Play Data Safety form — AGI v1.0.0

> Paste verbatim into Play Console → App content → Data safety.
>
> Locked posture: **AGI's default install collects NO data**. The user
> can opt into a Cloud-mode account (email + display name) which is
> the only first-party collection path. BYOK API keys never leave the
> device. Provider keys, when used, send conversation content to the
> provider the user picked — that is a **third-party** transmission
> (user-initiated, with explicit Apple 5.1.2(i)-equivalent consent),
> not data collection by AGI.

---

## Section 1 — Does your app collect or share any of the required user data types?

**Answer: Yes** (limited to opt-in account creation; everything else
is processed on-device or routed by the user to a third party they
chose).

The remaining sections expand each disclosed item.

---

## Section 2 — Data collection (what AGI collects from users)

### Personal info

| Data type         | Collected                                        | Shared     | Purpose                                       | Required | Encrypted in transit | User can delete                   |
| ----------------- | ------------------------------------------------ | ---------- | --------------------------------------------- | -------- | -------------------- | --------------------------------- |
| **Name**          | Optional (Cloud mode only)                       | Not shared | Account management                            | No       | Yes                  | Yes (Settings → Account → Delete) |
| **Email address** | Optional (Cloud mode only)                       | Not shared | Account management, magic-link login, support | No       | Yes                  | Yes (Settings → Account → Delete) |
| **User ID**       | Generated only when user creates a Cloud account | Not shared | Account management                            | No       | Yes                  | Yes (Settings → Account → Delete) |

### Messages (chat / SMS / email)

| Data type           | Collected                                                                                                                                                | Shared                                                                                                                                                                                                                                                                                        | Purpose                                      | Required                                                       | Encrypted in transit | User can delete                                                                |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------ |
| **In-app messages** | YES — when Cloud sync is enabled, conversations sync to the user's row in our database so the same chat is available across iPhone, Android, and desktop | **Shared with the AI provider the user picks for each message**, on a per-message basis (Anthropic, OpenAI, Google, etc.) so the provider can generate a response. The user explicitly picks the provider per message and is shown a consent disclosure before adding the first provider key. | App functionality (chat) + cross-device sync | No (Local mode and BYOK without Cloud sync skip this entirely) | Yes (TLS)            | Yes (Settings → Account → Delete; deletes conversations from cloud and device) |

### Photos and videos

| Data type  | Collected                                              | Shared                                                                                       | Purpose                                    | Required | Encrypted in transit | User can delete                                                                          |
| ---------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------ | -------- | -------------------- | ---------------------------------------------------------------------------------------- |
| **Photos** | Only when the user attaches an image to a chat message | Sent to the vision-capable AI provider the user picked, on the user's explicit attach action | App functionality (image analysis in chat) | No       | Yes                  | Yes (delete the message; image is removed from device cache and from any cloud sync row) |

### Files and documents

| Data type               | Collected                                            | Shared                                                             | Purpose                                       | Required | Encrypted in transit | User can delete |
| ----------------------- | ---------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------- | -------- | -------------------- | --------------- |
| **Files and documents** | Only when the user attaches a file to a chat message | Sent to the AI provider the user picked, on explicit attach action | App functionality (document analysis in chat) | No       | Yes                  | Yes             |

### Audio files

| Data type                     | Collected                                                                                                                                  | Shared                                                                                                                                       | Purpose                         | Required | Encrypted in transit               | User can delete          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | -------- | ---------------------------------- | ------------------------ |
| **Voice or sound recordings** | Only during a voice-input session; the raw audio is transcribed on-device and discarded. The transcript text is treated as a chat message. | Audio itself: **not shared** (on-device transcription). Transcript text: shared with the AI provider the user picked, like any chat message. | App functionality (voice input) | No       | Yes (transcript shipping uses TLS) | Yes (delete the message) |

### App activity

| Data type            | Collected                                                                                                                                                                                                                    | Shared                                                                          | Purpose                         | Required | Encrypted in transit | User can delete                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------- | -------- | -------------------- | ----------------------------------------------------------------- |
| **App interactions** | Only if the user opts into "Help improve AGI" in Settings → Privacy. Default: **off**. Telemetry events are aggregate counters (e.g., `chat_message_sent`, `provider_switched`) with no message content, no user ID linkage. | Not shared with third parties; processed by our analytics pipeline on Supabase. | Analytics (product improvement) | No       | Yes                  | Yes (turn off the toggle; backfill is purged on next purge cycle) |

### Device or other identifiers

**Not collected.** AGI does not log device IDs, advertising IDs,
or stable hardware identifiers. No IDFA / GAID / Android ID
collection.

### Location, contacts, calendar, health, financial, etc.

**Not collected.** The Calendar and Contacts permissions in the
Android manifest are wired to optional connectors gated behind a
Settings opt-in. If the user adds the connector, AGI reads the data
locally and sends to the AI provider only when the user asks the
model to use that data. AGI itself does not retain it.

---

## Section 3 — Data sharing (with whom, and how)

### Third parties data is shared with

| Recipient                                                                                                                                                                                                   | Data                                              | Purpose                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **The AI provider the user picked for a given message** (one of Anthropic, OpenAI, Google, xAI, DeepSeek, Mistral, Perplexity, Moonshot, Zhipu, or a custom OpenAI-compatible endpoint the user configured) | Chat message content, attachments, system prompts | Generate the model's response — this is the core app function. The user explicitly consents to this in onboarding (BYOK Provider Disclosure & Consent modal) and picks the provider per message. |
| **Supabase** (our cloud backend, when Cloud mode is enabled)                                                                                                                                                | Account email + name, conversation rows           | Cross-device sync, account management. Row-level security enforces that only the authenticated user can read their own rows.                                                                     |
| **No advertising or analytics third parties**                                                                                                                                                               | n/a                                               | n/a                                                                                                                                                                                              |

### What is **not** shared

- AGI never sells personal data.
- AGI never shares data with advertising networks.
- AGI never shares data with data brokers.
- AGI never shares anything for cross-app tracking.

---

## Section 4 — Security practices

| Question                               | Answer                                                                                          |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Data is encrypted in transit           | **Yes** (TLS 1.3 enforced; HSTS preload eligible)                                               |
| Users can request data deletion        | **Yes** (in-app at Settings → Account → Delete, plus email request to support@agiworkforce.com) |
| Independent security review            | **Pending**. Plan to commission a third-party SOC 2 Type I audit pre-paid-tier launch.          |
| Encryption at rest for cloud-side data | **Yes** (Supabase pgcrypto + database-level encryption + row-level security)                    |
| BYOK keys storage                      | **Keychain (iOS) / Android Keystore (Android)** with hardware-backed protection where available |

---

## Section 5 — Children's data and Play Families policy

- AGI is not designed for or marketed to children.
- AGI is not part of the Play Families program.
- Target audience: 18+.

---

## Section 6 — Reset / submission steps

1. In Play Console → App content → Data safety, answer "Yes" to data
   collection.
2. Add each data type from §2 above with the same parameters.
3. Add each recipient from §3 above.
4. Confirm security answers from §4.
5. Save and submit.
6. The summary card on the Play Store listing should read:
   - "Data shared with third parties": message content + attachments
     are shared with the AI provider the user picks.
   - "Data the developer collects": email + name (account only).
   - "Data is encrypted in transit": Yes.
   - "You can request that data be deleted": Yes.

This mirrors what an end user sees and gives them the correct
mental model.
