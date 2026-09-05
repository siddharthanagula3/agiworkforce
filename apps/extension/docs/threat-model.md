# Chrome Extension Threat Model

Status: Current
Owner role: Extension lead, with security/privacy review for boundary changes
Last reviewed: 2026-08-13
Applies to: `apps/extension` source and the configured Manifest V3 build

This document describes the behavior implemented in this repository. It is not
a claim that the extension, a visited page, AGI Managed Cloud, Chrome, or the
Desktop host is compromise-proof. When this document and code disagree, code is
the evidence and this document must be corrected.

## Security objectives

- Keep Chrome conversations browser-local as the authoritative copy. A signed-in
  conversation whose every turn was inferred in Managed Cloud is automatically
  mirrored to the shared AGI account conversation store so it appears in Web,
  Mobile Cloud, Tauri Cloud, and Electron Cloud. A conversation containing any
  non-Managed-Cloud or unknown-provenance turn is never mirrored. The separate
  automatic WebMCP metadata bridge is limited to the bounded tool declarations
  documented below.
- Keep Chrome chat Managed-Cloud-only. A failed cloud turn must not silently
  fall back to Desktop, Local, or BYOK inference.
- Treat page text, page schemas, tool output, and model output as untrusted data.
- Restrict browser automation to user-approved origins and default every
  computer-use action to human approval.
- Authenticate privileged extension messages and native-messaging envelopes at
  their respective boundaries.
- Bound and runtime-validate data before persistence, network transmission, DOM
  mutation, or native handoff.

## Trust boundaries

| Boundary                                | Trust treatment                                                                                                                                              | Current enforcement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visited HTTP(S) page and content script | The page DOM and page-supplied metadata are untrusted. A content script is installed broadly, but that does not grant the page privileged background access. | [`background/policy.ts`](src/background/policy.ts) gates tab-originated messages by the device-local origin allowlist. DOM mutations are restricted to the sender's own tab. Extension-page-only operations reject content-script senders.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Side panel and options page             | Trusted extension UI, but all user, storage, page, model, and network data remains untrusted input.                                                          | The background authenticates the extension id and exact `chrome-extension://` document origin; id equality alone is insufficient.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Background service worker               | Privileged Chrome owner for tabs, cookies, scripting, debugger, alarms, network, and native messaging.                                                       | [`background.ts`](src/background.ts) validates message shape, sender class, tab ownership, origins, request bounds, and action plans before dispatch.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| AGI Managed Cloud                       | External service receiving an authenticated request only after the user sends a chat turn or starts computer use.                                            | Chat uses fixed AGI Web endpoints in [`freeTrialClient.ts`](src/features/cloud-bridge/freeTrialClient.ts). Computer use uses an exact HTTPS gateway allowlist from [`background/policy.ts`](src/background/policy.ts). Automatic account-backed mirroring for provenance-eligible Managed Cloud chats is confined to [`conversationSync.ts`](src/features/cloud-bridge/conversationSync.ts) and its transport [`conversationSyncClient.ts`](src/features/cloud-bridge/conversationSyncClient.ts); those persistence writes force `skipLlm: true` and therefore cannot trigger inference or billing. Server admission, plan, usage, and model routing remain authoritative.            |
| Local Desktop bridge                    | Separate native process; pairing or process locality alone is not treated as message integrity.                                                              | A native connect handshake must negotiate a 32-byte session secret. Subsequent request and response envelopes use HMAC-SHA256, and missing MACs after negotiation are rejected as a downgrade. Pairing itself is authorized out of band: `POST /pair/request` returns only an opaque request id while Desktop displays a short code in its own window, and `POST /pair/confirm` installs the native-messaging manifest only for the code the user typed back. The extension never receives anything over loopback that authorizes the install. The operator-provisioned `X-Bridge-Token` path remains the alternative for hosts where the Desktop window is not on the user's screen. |
| Chrome storage                          | Browser-profile storage, not an encrypted secrets vault. `local`, `session`, and `sync` have different disclosure lifetimes.                                 | Only the boolean allowlist in [`synced-preferences.ts`](src/features/background/synced-preferences.ts) is mirrored to Chrome Sync. Other current application data is local/session scoped as described below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## Manifest capability inventory

The source manifest is [`manifest.json`](manifest.json). Production builds add
only the configured exact Clerk Frontend API and Sync Host origins to host
permissions and `connect-src`; [`scripts/manifest-config.mjs`](scripts/manifest-config.mjs)
validates those origins.

| Capability                                | Why it exists                                                                                   | Principal exposure                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activeTab`, `tabs`, `scripting`          | Read explicitly requested page context; inspect and operate tabs; inject bounded scripts.       | Page text, URL/title metadata, or DOM changes on the active/target page.                                                                                                                                                                                                                                                                                                  |
| `debugger`                                | Bounded Chrome DevTools Protocol computer-use actions.                                          | High privilege over an attached tab. `chrome.debugger.attach` takes a bare tab id and needs no host permission, so the reach is bounded instead by a Chrome-granted host permission for the target origin (below) plus the stored consent record; the driver detaches after the bounded action/run path, and Chrome's own Cancel on the debugging bar terminates the run. |
| `cookies`                                 | Explicit extension-UI cookie tools.                                                             | Cookie confidentiality and integrity. Cookie messages are extension-page-only.                                                                                                                                                                                                                                                                                            |
| `nativeMessaging`                         | Pair and exchange approved messages with AGI Desktop.                                           | Local-process boundary and native host installation/trust.                                                                                                                                                                                                                                                                                                                |
| `storage`                                 | Conversations, allowlist, tasks, shortcuts, preferences, profiles, and transient session state. | Browser-profile persistence and Chrome Sync for the explicit boolean preference set.                                                                                                                                                                                                                                                                                      |
| `alarms`, `notifications`, `contextMenus` | Scheduled tasks, completion notices, and user-invoked page actions.                             | Work can occur while the side panel is closed; task origin is checked again at fire time.                                                                                                                                                                                                                                                                                 |
| `sidePanel`, `tabGroups`                  | Primary UI and explicit tab organization features.                                              | Tab metadata and grouping state.                                                                                                                                                                                                                                                                                                                                          |

Source host permissions cover loopback (`localhost`, `127.0.0.1`) and the
documented AGI Web/API origins. Every other origin is reachable only through
`optional_host_permissions` (`http://*/*`, `https://*/*`), which grant nothing
at install: `requestBrowserControlHostPermission`
([`browserControlConsent.ts`](src/features/computer-use/browserControlConsent.ts))
raises Chrome's own site-access prompt for one exact origin at the moment the
user confirms "Grant full browser control", and the grant is visible and
withdrawable at `chrome://extensions`. Nothing is written to the consent record
unless Chrome grants first, and both revoke paths remove the host permission
alongside the record.

The content script matches all ordinary `http://*/*` and `https://*/*`
top-level frames. Incognito use is disabled. The broad content-script match is a
material attack-surface choice: it enables page discovery/context features, but
every visited page can observe the content script's page-world effects and can
attempt to exercise its message handlers. On an origin that is not on the
approved-sites list the content script now injects no UI and sends no startup
message, so an unapproved page neither sees extension chrome nor wakes the
service worker.

No extension resource is exposed to web pages: there is no
`web_accessible_resources` entry. Store-listing copy and the per-permission
justifications that must accompany `debugger` are versioned in
[`chrome-web-store-listing.md`](chrome-web-store-listing.md), and
[`__tests__/manifest-contract.test.ts`](__tests__/manifest-contract.test.ts)
freezes the permission and host lists against it.

Extension pages use a restrictive CSP for scripts and objects and disallow
framing. The current source CSP permits inline styles and `data:` images; code
review must not assume those two classes are blocked.

`connect-src` also allows `https://*.ingest.sentry.io` and
`https://*.ingest.us.sentry.io` unconditionally. This is a static allowlist
entry rather than a build-time or runtime-conditioned one: CSP is fixed at
package time, so there is no way to add the host only when a user has opted
in. Whether anything is ever sent to it is instead gated at runtime by
[`errorReportingConsent.ts`](src/features/observability/errorReportingConsent.ts),
default off, and by the presence of a configured DSN
([`errorReporting.ts`](src/features/observability/errorReporting.ts)). Every
payload is scrubbed by [`@agiworkforce/observability`](../../packages/platform/observability)
before it reaches this host: message text, file paths, and URLs never leave
the browser, only the error's type name and bare function names from its
stack.

## Data flows

### Managed Cloud chat

1. The user enters a prompt and may explicitly attach captured page text or
   image data in the side panel.
2. Page text is stripped of hidden Unicode control characters, passed through
   the shared secret redactor, bounded, and fenced as untrusted data. This is a
   mitigation, not proof that every sensitive value or prompt injection is
   removed.
3. The background accepts `CHAT_MESSAGE` only from a trusted extension page,
   validates the request, verifies a fresh Clerk session and authenticated model
   admission, and resolves Auto/Quick to a concrete catalog model. The Clerk
   account id plus session id form a non-secret owner boundary carried through
   chat, resume, approval, cancellation, and stream broadcasts. A request whose
   owner no longer matches the fresh session is rejected before network egress.
4. A requested reasoning effort is validated as a known value and reconciled
   against the concrete model's catalog-supported values. Unsupported or
   effort-less models never receive an invented effort.
   Quick is a per-request routing overlay: its resolved economy route is marked
   on that assistant turn and cannot replace the conversation's durable Auto or
   manually selected route/effort.
5. The request is sent to `https://agiworkforce.com/api/llm/v1/chat/completions`
   with the Chrome surface label. Model access and usage are read from the AGI
   Web model/usage endpoints. There is no Local, BYOK, or native-chat fallback.
6. Public answer text, the exact catalog model and canonical provider resolved
   for that assistant turn, validated durable run references, display-safe agent
   events, generated-file descriptors, and interactive-card envelopes are stored
   in browser-local conversation history under that exact account/session owner.
   Generated bytes are not embedded. Active-conversation and notification
   pointers carry the same owner, and legacy unowned records are discarded rather
   than adopted after sign-in. Private reasoning deltas are not persisted into
   the visible activity log.
7. Each admitted stream captures its bearer credential. Sign-out or an owner
   change aborts the old operation; any best-effort server cancellation uses the
   captured credential rather than the newly ambient account token. Delayed
   chunks and result notifications are ignored unless their owner still matches.

Image attachments are request-scoped today: the composer keeps bounded data
URLs in memory long enough to send the admitted turn, then discards them. The
prompt text and answer can enter browser/account conversation history, but the
image bytes and durable attachment references do not. The composer states this
limitation beside attached images. Closing this gap requires the shared
conversation-message contract and account store to own authenticated attachment
asset references, upload authorization, retention, and deletion; copying large
data URLs into Chrome's bounded history or inventing a Chrome-only cloud schema
would be unsafe and incompatible with the readers on Web, Mobile, Tauri, and
Electron.

The optional in-page assistant is available only on a device-local approved
origin. Its non-modal panel keeps a persistent notice next to the composer that
names the page host, the bounded visible-text character count, and the Managed
Cloud destination. The content script strips invisible Unicode, applies the
shared pattern-based secret redactor, caps visible page text at 30,000
characters, and sends the user's question separately from the `pageContext`
field. The background binds platform context to the authenticated sender tab,
then fences page context as untrusted data through the same Managed Cloud chat
handler. Redaction is mitigation rather than a promise to identify every
sensitive value. Sign-in, plan, usage, account, rate-limit, cancellation, and
provider failures return typed UI outcomes; the panel must not render them as a
successful assistant answer. There is no Local, BYOK, or Desktop-chat fallback.

Pixel screenshots and pasted images are not text-redacted. They can contain
credentials, health information, private messages, or other sensitive pixels.
The onboarding copy warns users not to use screenshot-capable flows on
sensitive sites. A user clicking **Take a screenshot**, or starting a
screenshot-using computer-use run, remains a disclosure decision.

### Automatic account-backed conversation mirroring

1. The signed-in Chrome chat uses Managed Cloud for inference. Because the same
   content has already crossed that boundary for inference, the extension
   automatically mirrors the eligible transcript to the signed-in account's
   shared conversation store (founder decision, 2026-08-13).
2. Each turn is stamped `runtime: 'managed-cloud'`
   at the point of dispatch. A conversation is eligible only when _every_
   message carries that stamp; a message with no stamp (any record written
   before this feature) fails closed and is never mirrored. A Local or BYOK turn
   sets a sticky `blockedReason: 'non-cloud-runtime'` that can never be cleared.
3. The MV3 service worker debounces the write (2.5 s, plus a one-minute
   catch-up sweep alarm so an evicted worker cannot strand it) and re-resolves
   the Clerk session and owner at the transport boundary on every attempt,
   including the shared client's internal retries.
4. It sends `POST https://agiworkforce.com/api/chat/conversations` and then
   `POST /api/chat/conversations/{id}/messages` with `Authorization: Bearer`
   and `X-AGI-Surface: chrome`. Both carry client-minted UUIDs so a retry
   upserts instead of duplicating. The create response binds the replica to its
   server-confirmed organization id (or explicit Personal scope); every later
   message, title, and delete mutation carries that scope and the server
   re-proves current membership. A legacy binding whose workspace cannot be
   proven fails closed and is never re-created.
5. The local record is stamped as accepted (`cloudMessageId`, `cloudSyncedAt`,
   `cloudSyncedChars`, and a compact fingerprint of every mirrored field). A
   later metadata-only change is therefore re-sent under the same id rather than
   mistaken for an already-synced turn. `chrome.storage.local` stays
   authoritative; nothing is ever read back from the account into Chrome. The
   shared account copy is then visible to Web, Mobile Cloud, Tauri Cloud, and
   Electron Cloud through their existing `/api/chat/conversations` readers.

The mirrored copy contains the prompt text and answer stored in the browser
conversation, plus the assistant turn's exact catalog model/provider and any
validated, metadata-bounded generated-file descriptors or interactive-card
envelopes. Request-only page context and attachment image bytes are not
serialized into that record, so they are not included in the account copy. The
account copy is retained under server-side policy, not this document's 30-day
browser TTL, and deleting it requires deleting the conversation, local eviction
does not remove it.

Local eviction never issues a cloud delete. The 30-day TTL, the 1 MiB
per-entry cap, and the 4 MiB store cap are quota pressure, not user intent, so
they are deliberately not wired to any deletion path. A cloud delete originates
only from an explicit deletion in the history drawer, which queues a durable
tombstone (`agi_cloud_sync_tombstones_v1`). Tombstones have no age expiry and
remain until an exactly scoped server delete succeeds or reports the row
already absent. At the 100-entry safety bound, a new deletion is refused and
the visible local row is retained rather than silently dropping an older
pending delete.

### Browser automation and computer use

- A site must be present in `chrome.storage.local.agi_site_allowlist` before its
  content script can invoke privileged background behavior. Computer use also
  re-reads the target tab and revalidates its origin before starting.
- Allowlisting alone does not grant protocol-level control. Computer use
  additionally requires two independent grants for the origin, and
  `hasBrowserControlConsent` returns true only when both hold:
  1. `chrome.storage.local.agi_cu_browser_control_consent`, a record written
     only by the options-page confirmation that names the risk in plain words
     ("This grants full DevTools-Protocol control": attach the CDP debugger and
     click, type, navigate, read the DOM, and screenshot inside the signed-in
     session on that origin); and
  2. a Chrome-enforced host permission for that exact origin, checked with
     `chrome.permissions.contains`. The extension's own storage is invisible to
     Chrome and to `chrome://extensions`, so it must never be the only thing
     authorizing DevTools-Protocol reach.

  `AGI_START_COMPUTER_USE` refuses before any lease, CDP attach, or paid cloud
  call when either half is absent, and refuses the same way when the record or
  the permission cannot be read, so a storage or API failure denies rather than
  grants. Removing an origin from the allowlist, from the current-site button
  or the per-entry remove, revokes its browser-control record and removes the
  host permission in the same step, so a re-added site is confirmed again.
  Non-http(s) and malformed entries are dropped on read, so a poisoned record
  cannot widen the grant.

- A run terminates when the user dismisses Chrome's debugging bar. The driver's
  `chrome.debugger.onDetach` listener treats `canceled_by_user` as a
  cancellation and aborts the run's `AbortController`; it does not re-attach.
  Any other detach reason (an eviction, a target close) still re-attaches,
  because that is not the user withdrawing consent.
- An index the model acts through addresses exactly one element. The page-side
  snapshot only assigns an index to an element whose structural path is proven,
  in that same pass, to resolve to that element and nothing else, and every
  resolution re-checks both uniqueness and a signature captured at snapshot
  time. A stale, ambiguous or changed index fails the tool call loudly instead
  of acting on the first match, so a misclick cannot land silently inside the
  user's signed-in session.
- Job-application autofill is an egress of the stored `agi_autofill_profile`
  (name, contact, location, profile URLs, employment, work authorization,
  salary, cover-letter and resume text, custom answers) into page-controlled
  DOM inputs. Both `AGI_RUN_AUTOFILL` and `AUTO_FILL_JOB_APPLICATION` refuse
  before reading storage unless `window.location.origin` is on
  `agi_site_allowlist`. ATS platform detection is a second, independent gate:
  it matches the parsed hostname with exact-or-suffix comparison against the
  real ATS hosts, so a page whose path or query merely contains
  `boards.greenhouse.io`, `jobs.lever.co`, `linkedin.com/jobs/`, or
  `jobs.ashbyhq.com` is not treated as an application form.
- `AGI_START_COMPUTER_USE` is extension-page-only. Allowlisted page JavaScript
  cannot start the paid CDP loop through the message router.
- `REPLAY_SHORTCUT` is extension-page-only. Its prompt branch dispatches a
  `CHAT_MESSAGE`, so leaving it web-reachable would have let an allowlisted page
  spend a paid run through a verb that is itself gated, and its actions branch
  replays recorded DOM actions against the active tab rather than the sender's.
  `LIST_SHORTCUTS` stays allowlisted-tab and still discloses shortcut ids and
  names to an allowlisted page; the replay gate is what makes that inert.
- Ask-before-acting defaults on. Only an explicit stored `false` enables full
  access. Approval requests use random ids, accept responses only from trusted
  extension pages, and deny after 30 seconds without a response. The panel
  rehydrates this authoritative stored preference and rolls its toggle back if
  a write fails, so the visible gate cannot claim an opt-in or opt-out the
  background never received. Pending approval UI is announced and focused;
  decision or expiry returns focus to a live run control instead of leaving a
  visually active but inert approval affordance.
- The background owns at most one tracked computer-use lease. The lease binds a
  random run id, a monotonic run generation, the target tab/window/exact URL
  intent, and the Managed Cloud account plus auth-session incarnation. Those
  values are reasserted before every cloud and CDP cycle; a replacement account,
  sign-out, superseding run, panel close/clear/Stop, target-tab removal, active-tab
  switch, or non-agent URL change aborts the lease.
- The trusted panel generates that run id before asking the worker for admission
  and shows Stop immediately. A matching Stop, Clear, or panel teardown therefore
  invalidates a deferred tab/auth/storage admission before it can become a lease;
  a stale panel id cannot cancel a newer pending or active run.
- The same AbortSignal reaches DOM-stability waits, approval waits, and streaming
  Managed Cloud fetches. Progress events carry the run id/generation and are
  published only while that lease is current; the side panel independently drops
  stale events. Cloud sends use a credential resolved only after confirming it
  still belongs to the captured account/session. There is no invented server-side
  computer-use cancellation API; client abort is the available cleanup boundary.
- DOM-mutating message types are same-tab-only. Navigation URLs are bounded,
  HTTP(S)-only, and reject executable/local schemes. Action plans and fields
  are allowlisted and size-bounded.
- Recorded workflows capture selectors only by default. Optional value capture
  omits password values, replaces declared card/password/OTP fields, and runs
  remaining values through secret redaction before local persistence.
- Scheduled tasks created from a page origin are rechecked against the allowlist
  at fire time and removed if that origin is no longer allowed. Extension-UI
  tasks use a distinct origin sentinel.

An allowlisted page is still untrusted content. The allowlist grants a bounded
automation capability; it does not make page instructions safe or accurate.

### WebMCP metadata to Desktop

An allowlisted page may publish WebMCP tool declarations. The content script
reports changes to the background, which treats the page-controlled names,
descriptions, input schemas, and URL as untrusted. The background accepts at
most 64 uniquely named tools, bounds names/descriptions and each serialized
schema, requires declared sources, and derives a credential/query/fragment-free
HTTP(S) origin+path from the authenticated sender tab. A conflicting
page-reported URL is rejected.

When an authenticated AGI Desktop native session is already connected, the
normalized metadata is sent automatically in the same HMAC-authenticated
request envelope used by other post-handshake native traffic. Chrome does not
present those declarations as Managed Cloud chat tools: that execution path
does not carry a WebMCP tool contract, and inserting a tool name into a prompt
would not wire the capability. Background per-tab navigation generations
invalidate delayed results even when only a query or fragment changes and the
redacted origin+path remains identical. Navigation clears the Desktop catalog
with an authenticated empty update before a replacement is eligible.
Background discovery and tool-call requests are extension-page-only,
so an allowlisted page cannot use the message router to invoke a tool in another
tab. This flow does not include prompt text, conversation history, selected
text, general page text, cookies, tool arguments, tool results, or an automatic
tool invocation. The metadata can still disclose which page path is open and
which capabilities the page advertises; there is no per-update prompt after the
user has allowlisted the origin and paired Desktop.

### Explicit Chrome to Desktop context handoff

The only current user-content handoff is selected text:

1. The user selects visible text and requests a handoff.
2. Chrome removes hidden Unicode, applies secret redaction, limits text to 2,000
   characters, strips URL credentials/query/fragment by retaining only
   origin+path, and stores a five-minute session-only preview.
3. The side panel names **AGI Desktop**, shows the exact payload, and requires
   **Send redacted context**. Implicit `SYNC_PAGE_CONTEXT` is rejected.
4. The background consumes the exact pending id and requires an authenticated
   native session before sending it.
5. Desktop rejects unknown fields, invalid/stale timestamps, hidden Unicode,
   oversized text, and unsafe URLs. It stages rather than inserts the context.
   The Desktop UI displays a second review and permits acceptance only while
   Desktop is in Local privacy mode.

The HMAC envelope provides per-session integrity and request/response binding;
it does not make a compromised Desktop process trustworthy. The five-minute TTL
limits stale reuse but does not prevent disclosure after both user approvals.

## Storage and retention

| Area                     | Current data                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Boundary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `chrome.storage.local`   | Browser conversations (`agi_browser_conversations_v2`, capped by age/count plus a 4 MiB aggregate serialized budget; each record may additionally carry per-conversation `cloudSync` bookkeeping and per-message provenance, per-turn model/provider, bounded generated-file/card metadata, and cloud acceptance fields), the bounded cloud-deletion tombstone queue (`agi_cloud_sync_tombstones_v1`, max 100 entries, retained until acknowledged), site allowlist, the per-origin browser-control consent record (`agi_cu_browser_control_consent`, origins only), autofill profile, memories, shortcuts, scheduled tasks, recorded actions, statistics, bridge/gateway configuration, onboarding state, local preference mirrors, and a manual `agi_dev_bearer_token` only in development builds. | Device/browser-profile scoped. Conversation entries and their active pointer are partitioned by exact Managed Cloud account/session owner; cloud replicas and deletions additionally retain their server-confirmed organization or Personal scope. Legacy unowned or unscoped records fail closed. The extension does not encrypt these records itself. Autofill profile writes are local; a one-time migration removes any legacy sync copy. The autofill profile (`agi_autofill_profile`) is erasable on demand from the options page and is removed from both `storage.local` and any legacy sync copy by the shared sign-out path, so logging out leaves no identity or employment profile behind. Production builds neither expose nor read the manual development token. |
| `chrome.storage.session` | The desktop-issued pair token and fingerprint (`agi_pair_token`, `agi_pairing_fingerprint`), the separate operator-supplied desktop bridge secret (`agi_bridge_secret`), the opaque id of an open pairing request (`agi_pair_request`; the confirmation code itself is displayed by Desktop and never stored here), pending context handoff, owner-bound notification/result pointers, owner-bound panel conversation ownership, and pending context-menu chat.                                                                                                                                                                                                                                                                                                                                      | Cleared with the browser session/service lifetime according to Chrome semantics; not a durable vault. Managed Cloud pointers require an exact account/session match before use.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `chrome.storage.sync`    | Only `agi_task_notifications`, `agi_thinking_enabled`, `agi_quick_mode`, `agi_cu_ask_before_acting`, and `agi_in_page_panel_enabled`. Cloud-mirror tombstones are local-only and are deliberately not mirrored to Chrome Sync.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Boolean preferences can leave the device through the user's Chrome Sync account. Conversation text, allowlists, autofill profile, memories, task payloads, native tokens, and handoff previews are not current sync writes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

Managed Cloud request retention, provider handling, account deletion, and server
logs are controlled by server-side policy and are outside this extension-only
document. This file makes no retention promise for those systems.

## Threats, mitigations, and residual risk

| Threat                                                                              | Implemented mitigation                                                                                                                                                                                                                                                                                                                                                                                                  | Residual risk                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A hostile page invokes privileged extension operations.                             | Origin allowlist, explicit sender classes, extension-page authentication, and same-tab mutation checks.                                                                                                                                                                                                                                                                                                                 | Broad content-script injection remains observable; an allowlisted compromised origin has the bounded capabilities the user granted.                                                                                                                                                                                                                      |
| Prompt injection in captured page content controls the model.                       | Sanitization, secret redaction, size bounds, unpredictable untrusted-content fencing, and explicit page attachment.                                                                                                                                                                                                                                                                                                     | Semantic prompt injection can survive text sanitization; generated actions still require policy and, by default, user approval.                                                                                                                                                                                                                          |
| Cross-tab screenshot or DOM exfiltration.                                           | Content-script screenshots bind to the sender tab; DOM mutations reject a different target tab; extension-page captures resolve an explicit/active tab.                                                                                                                                                                                                                                                                 | Screenshots contain raw pixels and extension pages hold broad tab privileges. UI/source confusion is still possible if the user changes tabs.                                                                                                                                                                                                            |
| Model/effort UI claims unsupported capability.                                      | Authenticated admission is intersected with bundled model metadata; Auto waits for a route; the background reconciles effort after concrete routing.                                                                                                                                                                                                                                                                    | Catalog or server admission can become stale between extension releases; unknown models remain hidden/fail closed in this build.                                                                                                                                                                                                                         |
| Sign-out or account switching exposes or controls an earlier account's run.         | Conversation/session records, active pointers, stream broadcasts, durable resume/approval, and result pointers require an exact account plus auth-incarnation match. Owner changes abort old operations; cancellation uses the credential captured at admission.                                                                                                                                                        | A compromised extension process or Chrome profile can still read local records and bearer credentials while they are live. Old account-scoped history remains on device until normal expiry/deletion even though another owner cannot hydrate it.                                                                                                        |
| Native response shuffling or unsigned downgrade.                                    | Per-session HMAC over id, timestamp, and body; strict MAC requirement after negotiation; secret reset on disconnect.                                                                                                                                                                                                                                                                                                    | A compromised native host participates in the handshake and remains trusted as the local endpoint.                                                                                                                                                                                                                                                       |
| A page forges, floods, or misattributes WebMCP metadata.                            | Allowlisted sender gate, sender-authoritative tab/safe URL, tool/count/string/schema bounds, active-tab UI matching/refresh, normalized clone, and authenticated tab-scoped native request.                                                                                                                                                                                                                             | An allowlisted page can advertise misleading capabilities within those bounds, and paired Desktop receives metadata changes without a per-update prompt.                                                                                                                                                                                                 |
| Persistent sensitive browser data leaks.                                            | Sensitive categories stay out of Chrome Sync, values are bounded/redacted where implemented, and conversations expire/cap.                                                                                                                                                                                                                                                                                              | Local Chrome profile compromise, extension compromise, backups, screenshots, and redaction false negatives can expose data.                                                                                                                                                                                                                              |
| Automatic cloud mirroring copies an eligible transcript beyond the browser profile. | Every turn must carry Managed Cloud provenance; any local/unknown turn stickily disqualifies the conversation; the account owner is re-checked at the transport boundary before egress; local eviction never issues a cloud delete; egress is confined to the cloud-bridge gate and enforced by `check:no-cloud-ipc`; persistence writes force `skipLlm: true`; rich metadata is contract-validated and length-bounded. | Once mirrored, the stored prompt/answer, exact per-turn model/provider, and durable descriptor/card copy are subject to server-side retention and account-deletion policy, not this extension. Request-only page context and image bytes are not part of the mirrored record. Deleting the conversation is the supported way to remove its account copy. |
| A structured result card smuggles arbitrary outbound links into the panel.          | Chrome advertises only display-only `map-search.v1` support (`canRespond: false`); card envelopes and typed bodies are runtime-validated and bounded before persistence; unknown/newer/malformed kinds render only server-authored plain text; Chrome repeats the exact Google Maps/OpenStreetMap URL allowlist at render and click time; no card URL is fetched automatically.                                         | A user who explicitly opens an allowed provider search leaves AGI for that provider, whose normal request and privacy policy then apply. Chrome has no card-response continuation path and therefore does not advertise clarification support.                                                                                                           |
| Autonomous action proceeds without review.                                          | Ask-before-acting defaults on and times out to deny; permissive mode is visibly labeled and requires explicit opt-out.                                                                                                                                                                                                                                                                                                  | A user can choose Full access; model mistakes and page-driven deception are then acted on within the approved origin and action set.                                                                                                                                                                                                                     |
| A delayed computer-use run continues after Stop or as another account/tab.          | One tracked run lease, captured account/session ownership, exact foreground-tab intent, AbortSignal propagation, exact-run cancellation, and stale run-generation filtering.                                                                                                                                                                                                                                            | A CDP command already accepted by Chrome at the instant of cancellation cannot be recalled; cleanup prevents subsequent commands, captures, cloud cycles, and UI events.                                                                                                                                                                                 |

## Verification and change control

Relevant executable checks include message-policy/security tests, privacy and
context-handoff tests, conversation-history tests (including the cloud-mirror
eligibility, carry-forward, and "eviction never deletes cloud data" cases),
conversation-sync tests, computer-use approval tests,
computer-use cancellation/ownership and Stop-UI tests, native pairing tests,
manifest contract tests, `check:no-cloud-ipc`, the
extension unit suite, typecheck, lint, build, and the unpacked-extension UI
smoke in [`e2e/smoke.mjs`](e2e/smoke.mjs).

The offline Chromium smoke proves that signed-out or owner-mismatched history
stays hidden and cannot emit Managed Cloud work. The authenticated release gate
must use production-configured Clerk test accounts: start history and a durable
run as account A, sign out, sign in as account B, verify that A's history and
chunks never render, and verify that cancellation uses A's credential captured
at admission. The offline harness cannot mint or rotate real Clerk sessions and
does not claim to prove this live-auth transition.

Any change to permissions, host matches, content-script reach, capture,
cookies, debugger/CDP, native messaging, storage/sync, Clerk origins, Managed
Cloud endpoints, automation approvals, or context handoff must update this file
and receive the path-required security/privacy review. A build passing alone is
not review evidence; inspect the configured `dist/manifest.json`, the relevant
source diff, and the real extension UI.
