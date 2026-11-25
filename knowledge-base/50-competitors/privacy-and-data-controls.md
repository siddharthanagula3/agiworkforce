---
id: "COMP-privacy-and-data-controls"
type: "competitor-trace"
title: "Privacy and data controls"
competitor_evidence_reviewed: "2026-11-22"
basis: "official competitor pages saved 2026-11-22; AGI status from code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Privacy and data controls: competitors to requirements

Privacy and data controls: 29 capabilities compared with Claude, Claude Code, ChatGPT and Codex pages saved 2026-11-22. AGI is ahead on opt-in training switches, voice audio, and recoverable deletion (code reading only). Gaps: locked chats, retention schedule text, CLI and extension controls, HIPAA and zero retention, cloud browser data. No privacy settings were run by a person. One live finding contradicts the recovery claim.

**How the products divide this topic.** Review date for all competitor evidence: 2026-11-22. Claude (support.claude.com): consumer training choice, incognito chat, memory controls, export, account deletion, sessions, voice audio, Enterprise retention, CMEK, US-only inference, Compliance API. Claude Code (code.claude.com) is the separate coding tool: local transcript retention, purge, telemetry opt-outs, sandbox, HIPAA setup. Its consumer data-usage page links it to the chat product: Free, Pro, Max and Ultra choose training at the claude.ai privacy controls and Claude Code follows (cc05:241, cc05:245). ChatGPT (help.openai.com): training toggle, Temporary Chat, Locked chats, Privacy Center, export, deletion, MFA, passkeys, Advanced Account Security, Lockdown Mode, active sessions, residency, EKM. Codex (learn.chatgpt.com) is the separate coding tool: history persistence, Computer History (local, 48-hour events, clearable), approvals; its training preference is set in ChatGPT Data controls (oh08:49, help.openai.com). Many controls are plan-limited: training toggle is Free, Plus, Pro only; retention, residency, CMEK, Compliance API and HIPAA are Enterprise, Edu or Healthcare; export and deletion are not self-serve for Business or Enterprise. Claude MFA, passkeys, Lockdown and locked chats do not appear in the catalogue, so Claude is unknown there, not no. AGI ledger statuses and comparison rows come from code reading; a person has seen only memory (W-12) and sharing (W-14) work on web, and saw chat delete with no recovery (W-13). Desktop public app shows the hosted web app, so its code evidence is the web files. Age policy is 18+ by owner decision, so teen and parental controls are off by decision and not listed. Line numbers in code evidence come from the ledger and comparison files; I opened only PrivacySection.tsx, temporary-chat-policy.ts, config.rs, delete-account and export routes to confirm they exist.

Each capability below is traced: competitor evidence, AGI requirement, current implementation, gap, acceptance criteria, verification. Competitor behaviour comes only from the cited pages, reviewed 2026-11-22.

| ID | Capability | Claude | ChatGPT | AGI today | Verified |
|---|---|---|---|---|---|
| [CAP-privacy-and-data-controls-01](#cap-privacy-and-data-controls-01) | Training opt-out for personal content | yes | yes | partly built | code inspected only |
| [CAP-privacy-and-data-controls-02](#cap-privacy-and-data-controls-02) | Training exceptions: feedback, safety flags and trusted programs | yes | yes | partly built | not verified |
| [CAP-privacy-and-data-controls-03](#cap-privacy-and-data-controls-03) | Business and workspace data not trained on by default | yes | yes | unknown | not verified |
| [CAP-privacy-and-data-controls-04](#cap-privacy-and-data-controls-04) | Retention periods stated and honoured | partly | yes | partly built | not verified |
| [CAP-privacy-and-data-controls-05](#cap-privacy-and-data-controls-05) | Admin-set retention period | yes | yes | built | not verified |
| [CAP-privacy-and-data-controls-06](#cap-privacy-and-data-controls-06) | Zero data retention and health-data agreements | yes | yes | partly built | not verified |
| [CAP-privacy-and-data-controls-07](#cap-privacy-and-data-controls-07) | Temporary or incognito chat | yes | yes | partly built | not verified |
| [CAP-privacy-and-data-controls-08](#cap-privacy-and-data-controls-08) | Temporary chat: personalization choice and save | partly | yes | partly built | not verified |
| [CAP-privacy-and-data-controls-09](#cap-privacy-and-data-controls-09) | Memory controls: view, edit, delete, pause, reset, per-chat off | yes | yes | built | seen working by a person |
| [CAP-privacy-and-data-controls-10](#cap-privacy-and-data-controls-10) | Sensitive topics and never-remembered data | yes | partly | partly built | not verified |
| [CAP-privacy-and-data-controls-11](#cap-privacy-and-data-controls-11) | Delete chats: single, bulk, all | yes | yes | partly built | seen failing by a person |
| [CAP-privacy-and-data-controls-12](#cap-privacy-and-data-controls-12) | Recoverable deletion (Recently deleted) | unknown | partly | partly built | seen failing by a person |
| [CAP-privacy-and-data-controls-13](#cap-privacy-and-data-controls-13) | Export your data | yes | yes | partly built | not verified |
| [CAP-privacy-and-data-controls-14](#cap-privacy-and-data-controls-14) | Workspace and member export controls | yes | yes | partly built | not verified |
| [CAP-privacy-and-data-controls-15](#cap-privacy-and-data-controls-15) | Delete account | yes | yes | partly built | not verified |
| [CAP-privacy-and-data-controls-16](#cap-privacy-and-data-controls-16) | Privacy rights requests and personal-data removal | partly | yes | partly built | not verified |
| [CAP-privacy-and-data-controls-17](#cap-privacy-and-data-controls-17) | Privacy Center hub | partly | yes | partly built | not verified |
| [CAP-privacy-and-data-controls-18](#cap-privacy-and-data-controls-18) | Voice and dictation audio handling | yes | yes | partly built | not verified |
| [CAP-privacy-and-data-controls-19](#cap-privacy-and-data-controls-19) | Shared links: manage, revoke, search-engine privacy | yes | partly | built | seen working by a person |
| [CAP-privacy-and-data-controls-20](#cap-privacy-and-data-controls-20) | Locked chats behind a PIN or device check | unknown | yes | not built | not verified |
| [CAP-privacy-and-data-controls-21](#cap-privacy-and-data-controls-21) | Active sessions and sign out everywhere | yes | yes | partly built | not verified |
| [CAP-privacy-and-data-controls-22](#cap-privacy-and-data-controls-22) | Multi-factor sign-in, passkeys and recovery | unknown | yes | partly built | not verified |
| [CAP-privacy-and-data-controls-23](#cap-privacy-and-data-controls-23) | Advanced account security mode | unknown | yes | built | not verified |
| [CAP-privacy-and-data-controls-24](#cap-privacy-and-data-controls-24) | Security activity log and sign-in alerts | unknown | yes | partly built | not verified |
| [CAP-privacy-and-data-controls-25](#cap-privacy-and-data-controls-25) | Lockdown mode | unknown | yes | built | not verified |
| [CAP-privacy-and-data-controls-26](#cap-privacy-and-data-controls-26) | Connected app data sharing and approvals | yes | yes | built | not verified |
| [CAP-privacy-and-data-controls-27](#cap-privacy-and-data-controls-27) | Execution boundary disclosure and Local-to-Cloud crossing | no | unknown | partly built | not verified |
| [CAP-privacy-and-data-controls-28](#cap-privacy-and-data-controls-28) | Local data controls: clear, keep local, no history | yes | yes | partly built | not verified |
| [CAP-privacy-and-data-controls-29](#cap-privacy-and-data-controls-29) | Diagnostics and telemetry opt-outs | yes | partly | partly built | not verified |
| [CAP-privacy-and-data-controls-30](#cap-privacy-and-data-controls-30) | Data residency | yes | yes | partly built | not verified |
| [CAP-privacy-and-data-controls-31](#cap-privacy-and-data-controls-31) | Customer-managed encryption keys | yes | yes | partly built | not verified |
| [CAP-privacy-and-data-controls-32](#cap-privacy-and-data-controls-32) | Admin audit log and compliance export | yes | yes | partly built | not verified |
| [CAP-privacy-and-data-controls-33](#cap-privacy-and-data-controls-33) | Browser and computer agent data handling | yes | yes | partly built | not verified |
| [CAP-privacy-and-data-controls-34](#cap-privacy-and-data-controls-34) | Secret and payment-data protection | yes | partly | partly built | not verified |

## CAP-privacy-and-data-controls-01 Training opt-out for personal content

A setting that lets a person stop their chats being used to improve the provider's models, with the default and exceptions stated.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (and Claude Code under consumer accounts): yes**
  - [https://support.claude.com/en/articles/8325621-i-would-like-to-input-sensitive-data-into-my-chats-with-claude-who-can-view-my-conversations](https://support.claude.com/en/articles/8325621-i-would-like-to-input-sensitive-data-into-my-chats-with-claude-who-can-view-my-conversations): When chats help improve Claude the data is de-linked from user ID and filtered; incognito chats are never used; safety-flagged chats may still be used; setting can be changed any time. [2026-11-22] Plans: Free, Pro, Max, Ultra. Apps: web.
  - [https://code.claude.com/docs/en/data-usage.md](https://code.claude.com/docs/en/data-usage.md): Free, Pro, Max and Ultra accounts choose whether data, including Claude Code, trains future models; Team, Enterprise and API are not trained on unless the customer opts in. [2026-11-22] Plans: Free, Pro, Max, Ultra. Apps: cli, desktop.
- **ChatGPT (Codex follows the same switch): yes**
  - [https://help.openai.com/en/articles/5722486-how-your-data-is-used-to-improve-model-performance](https://help.openai.com/en/articles/5722486-how-your-data-is-used-to-improve-model-performance): Free, Plus and Pro content may train models unless Improve the model for everyone is turned off in Data controls or Do not train on my content is chosen in the Privacy Portal; covers ChatGPT and Codex; Business, Enterprise, Edu and API not used by default. [2026-11-22] Plans: Free, Plus, Pro. Apps: web, ios, android.
  - [https://help.openai.com/en/articles/7730893-data-controls-in-chatgpt](https://help.openai.com/en/articles/7730893-data-controls-in-chatgpt): Toggle is on by default for personal workspaces; turning it off keeps history; parent or workspace controls may lock it. [2026-11-22] Plans: Free, Plus, Pro. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/decisions/2026-11-13-founder-decisions.md D-2026-11-13-03; docs/product/definition.md privacy settings list). Every app with an account has a plainly worded content-for-model-improvement choice, off until the user turns it on, readable by any future use, and a missing or unreadable choice counts as no. Separate from the switch that limits which outside providers a chat may reach.

**With different models, providers and the one subscription.** Choice is per account, not per model or provider, and applies equally on any plan. The provider limiting switch is separate. In Local mode nothing leaves the device, so the switch has no effect and the app should say so. A lawyer review of wording is open.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop, mobile have both switches (off by default). CLI prints privacy mode only (CP276 partial). VS Code and Chrome: no choice found in the ledger. Nothing uses customer content today. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S41.18, S85.12
- Comparison list ids: CP276, M181; rows without an id: Help improve the models with your chats (web)
- Code: `apps/web/features/settings/sections/PrivacySection.tsx:54-80`; `apps/web/lib/server/side-call-training-policy.ts:31`; apps/mobile/src/features/settings/cloud-privacy/TrainingPreferenceGroup.tsx (not found) (not found); `apps/cli/src/claude_parity.rs:443-456`

**Gap.** No reader of the choice exists because nothing trains yet; CLI, VS Code and Chrome have no switch; lawyer review of wording open; note the 'Only use models that do not train' switch is easy to confuse with it.

**Acceptance criteria**

1. On a new account both Use my chats and Use my voice are off on web, desktop and mobile.
2. Turning a switch on, reloading and signing in on a second app shows it on there too.
3. If the preference read fails, the app shows it as off and says it could not load.
4. CLI and extensions either show the same choice or state that they follow the account choice.

**Verification: code inspected only.** Defaults confirmed in PrivacySection.tsx; no scorecard row or defect row covers it.

## CAP-privacy-and-data-controls-02 Training exceptions: feedback, safety flags and trusted programs

Documented cases where content may still be used after a person opts out.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/8325621-i-would-like-to-input-sensitive-data-into-my-chats-with-claude-who-can-view-my-conversations](https://support.claude.com/en/articles/8325621-i-would-like-to-input-sensitive-data-into-my-chats-with-claude-who-can-view-my-conversations): Chats flagged by safety classifiers may still be used for trust and safety models and research, even with the setting off. [2026-11-22] Plans: Free, Pro, Max, Ultra. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/7730893-data-controls-in-chatgpt](https://help.openai.com/en/articles/7730893-data-controls-in-chatgpt): Thumbs feedback can send the whole conversation for training even after opt-out; Trusted Access sessions may use content despite opt-out. [2026-11-22] Plans: Free, Plus, Pro (feedback exception not for Business, Enterprise, Edu). Apps: web.

**AGI requirement** (inferred; source: competitor parity). Any case where content is kept or used despite a switch (feedback, safety review, abuse handling) is named next to the switch, and feedback with a conversation attached asks first.

**With different models, providers and the one subscription.** Applies to every route. Provider-side exceptions must come from verified provider metadata or show provider policy unknown. In Local mode there is no feedback upload unless the user sends one.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Privacy copy says nothing is used today. No list of feedback sent (W309 missing). Safety-review exceptions not stated in the pane. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S85.13
- Comparison list ids: W309
- Code: `apps/web/features/settings/sections/PrivacySection.tsx:70-90`

**Gap.** No exceptions text and no feedback record; ledger marks feedback-data choice not applicable.

**Acceptance criteria**

1. Privacy pane states what is kept for safety or abuse review.
2. Sending thumbs feedback shows whether the conversation is attached and asks before sending it.
3. The user can see feedback they sent.

**Verification: not verified.** Comparison row W309 is code search only.

## CAP-privacy-and-data-controls-03 Business and workspace data not trained on by default

Commercial and workspace plans are excluded from training unless the customer opts in.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/9267385-does-anthropic-act-as-a-data-processor-or-controller](https://support.claude.com/en/articles/9267385-does-anthropic-act-as-a-data-processor-or-controller): For Team and Enterprise the customer controls membership and export; Anthropic processes data and does not train on it unless the customer joins the Development Partner Program. [2026-11-22] Plans: Team, Enterprise. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8542115-chatgpt-business-general-faq](https://help.openai.com/en/articles/8542115-chatgpt-business-general-faq): Business data is not used for training. [2026-11-22] Plans: Business. Apps: web.
  - [https://help.openai.com/en/articles/5722486-how-your-data-is-used-to-improve-model-performance](https://help.openai.com/en/articles/5722486-how-your-data-is-used-to-improve-model-performance): Business, Enterprise, Edu and API data is not used by default. [2026-11-22] Plans: Business, Enterprise, Edu. Apps: web.

**AGI requirement** (inferred; source: competitor parity). Workspace content is never used for model improvement, and the workspace admin can see that.

**With different models, providers and the one subscription.** Must hold on every provider route; providers whose terms allow training are excluded from workspace routing (already a rule in docs/decisions/2026-09-15-founder-decisions.md, data_collection deny).

**Current implementation, as this trace read it on 2026-11-24: unknown.** Workspace provider rules exist; whether the in-app text states no training for workspaces was not established. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: WP231
- Code: `apps/web/features/settings/sections/WorkspacePolicySection.tsx:664-670`

**Gap.** Not established.

**Acceptance criteria**

1. Workspace policy page states workspace content is not used for model improvement.
2. A workspace chat never routes to a provider that may train.

**Verification: not verified.** No scorecard coverage.

## CAP-privacy-and-data-controls-04 Retention periods stated and honoured

The product states how long chats, files and deleted content are kept, including safety copies.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code (consumer data page); Claude (Enterprise): partly**
  - [https://code.claude.com/docs/en/data-usage.md](https://code.claude.com/docs/en/data-usage.md): Consumer accounts: 5 years if model improvement is allowed, 30 days if not; commercial 30 days or zero retention for qualified Enterprise; changeable in claude.ai privacy controls. [2026-11-22] Plans: Free, Pro, Max, Ultra, Team, Enterprise. Apps: cli, web.
  - [https://support.claude.com/en/articles/9796617-can-you-delete-data-that-i-sent-via-team-and-enterprise-plans](https://support.claude.com/en/articles/9796617-can-you-delete-data-that-i-sent-via-team-and-enterprise-plans): Deleting chats removes them from visible history while backend retention rules still apply. [2026-11-22] Plans: Team, Enterprise. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8983778-chat-and-file-retention-in-chatgpt](https://help.openai.com/en/articles/8983778-chat-and-file-retention-in-chatgpt): Chats stay until deleted or workspace policy removes them; deletion purges within 30 days; temporary chats may be kept 30 days for safety; Library files persist separately. [2026-11-22] Plans: all. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 4.4 (Is this stored locally, synced, or provider-retained? Can I delete it?) and 7.4 (retention disclosure)). Each data type (chat, file, memory, voice, deleted item, safety copy) shows its retention period and where it is stored (device, AGI cloud, named provider).

**With different models, providers and the one subscription.** Provider retention is shown from verified metadata or as provider policy unknown. Local chats are on-device only and have no server period. Same disclosure on every plan.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Per-feature processing location listed on all six apps; purge schedule for deleted chats not stated in the pane (WP228 partial). CLI has no transcript retention setting (C461, C491 missing). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S41.08, S41.20
- Comparison list ids: C461, C491, WP228
- Code: `apps/web/features/settings/sections/DeletedChatsSection.tsx`; `apps/web/features/settings/sections/PrivacySection.tsx:526-545`

**Gap.** Purge schedule text missing; CLI cannot age out local sessions.

**Acceptance criteria**

1. Deleted chats page states the day count before permanent removal and a test chat is gone after that.
2. Each processing-location row names where the data lives and for how long.
3. CLI has a retention setting that removes older local sessions.

**Verification: not verified.** Code reading only.

## CAP-privacy-and-data-controls-05 Admin-set retention period

Workspace owners choose how long content is kept before permanent deletion.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/10440198-configure-custom-data-retention-controls-for-enterprise-plans](https://support.claude.com/en/articles/10440198-configure-custom-data-retention-controls-for-enterprise-plans): Owners set a period (minimum 30 days), default indefinite; project retention overrides chat; expired data permanently deleted; changes written to audit logs. [2026-11-22] Plans: Enterprise. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/7730893-data-controls-in-chatgpt](https://help.openai.com/en/articles/7730893-data-controls-in-chatgpt): Managed workspaces have org retention, memory and compliance settings. [2026-11-22] Plans: Business, Enterprise. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 5 (Data retention, Export/delete controls, Audit trails for team users)). Workspace admins set a retention period per data domain, enforced and logged.

**With different models, providers and the one subscription.** Applies regardless of model; provider-held copies need provider terms that match. Gated by workspace plan under the one subscription system.

**Current implementation, as this trace read it on 2026-11-24: built.** Web workspace console sets retention days per data domain. Other apps not applicable. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched; rows without an id: Custom data retention period for workspaces (web)
- Code: `apps/web/features/workspace-console/components/WorkspaceDomainRetention.tsx:5`

**Gap.** none known

**Acceptance criteria**

1. Admin sets 30 days; a seeded older chat is purged and the purge is in the audit log.
2. A non-admin cannot change the period.

**Verification: not verified.** Code reading only.

## CAP-privacy-and-data-controls-06 Zero data retention and health-data agreements

Configurations or contracts for regulated customers: no retention, business associate agreement, features switched off when configured.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude; Claude Code: yes**
  - [https://support.claude.com/en/articles/13296973-hipaa-ready-enterprise-plans](https://support.claude.com/en/articles/13296973-hipaa-ready-enterprise-plans): HIPAA-ready Enterprise plan with BAA and feature coverage tiers. [2026-11-22] Plans: Enterprise. Apps: web.
  - [https://code.claude.com/docs/en/hipaa-setup.md](https://code.claude.com/docs/en/hipaa-setup.md): Under HIPAA, WebFetch, cloud sessions, Remote Control, feedback and artifact publishing are off. [2026-11-22] Plans: Enterprise. Apps: cli.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001069-hipaa-eligible-products-and-functionality](https://help.openai.com/en/articles/20001069-hipaa-eligible-products-and-functionality): HIPAA-eligible products and covered features; some features not covered by BAA are off by default. [2026-11-22] Plans: Healthcare, Enterprise. Apps: web.

**AGI requirement** (inferred; source: competitor parity). Workspaces can require zero-retention providers; HIPAA claims are made only if a BAA is actually signed.

**With different models, providers and the one subscription.** Routing filters out providers without zero-retention terms; unsupported features are hidden, not degraded. Local mode is unaffected. Needs owner decision on regulated-market scope.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web admins can require zero-retention providers; individuals cannot. No HIPAA offering; trust and privacy pages say no BAA signed. CLI has no ZDR or HIPAA mode. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: C425, D125, W298, WP231
- Code: `apps/web/features/settings/sections/WorkspacePolicySection.tsx:664-670`; `apps/web/app/privacy/page.tsx:1576`; `apps/web/app/trust/page.tsx:103-107`

**Gap.** No HIPAA path; no individual zero-retention switch; none on CLI.

**Acceptance criteria**

1. With the policy on, a chat never routes to a provider without zero-retention terms.
2. Pages do not claim HIPAA support while no BAA exists.

**Verification: not verified.** Code reading only.

## CAP-privacy-and-data-controls-07 Temporary or incognito chat

A chat not saved to history, search or memory and not used for training.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12260368-use-incognito-chats](https://support.claude.com/en/articles/12260368-use-incognito-chats): Ghost icon starts a chat not saved to history, memory, training or recap; cannot be converted or reopened; kept 30 days by default and visible in Team and Enterprise exports and the Compliance API. [2026-11-22] Plans: all. Apps: web, desktop, ios, android.
  - [https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context): Incognito chat excluded from search and memory. [2026-11-22] Plans: all. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8914046-temporary-chat-in-chatgpt](https://help.openai.com/en/articles/8914046-temporary-chat-in-chatgpt): Not saved to history, not used for model improvement while temporary, no memories created; a copy may be kept up to 30 days for safety; Enterprise Compliance API can read temporary chats. [2026-11-22] Plans: all; Compliance API Enterprise. Apps: web, ios, android.
  - [https://help.openai.com/en/articles/9295248-temporary-chats-on-the-chatgpt-macos-app](https://help.openai.com/en/articles/9295248-temporary-chats-on-the-chatgpt-macos-app): macOS app has a Temporary Chat toggle with a banner. [2026-11-22] Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 6.2 (Temporary/private chat in universal chat concepts); docs/product/experience-contract.md (temporary chats neither read nor write memory)). Every chat surface offers temporary or private chat, shows a banner, says exactly what is kept, and writes nothing to history, search, memory or Library.

**With different models, providers and the one subscription.** Works on any model or provider; the explanation must also name any provider-side copy. Chats with an on-device model are already temporary and not saved in a project. Quota is counted the same.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop, mobile done. CLI, VS Code, Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S41.01, S41.02, S41.03, S41.05, S41.08, S85.16
- Comparison list ids: none matched; rows without an id: Temporary or incognito chat (web); Temporary or incognito chat (mobile)
- Code: `apps/web/lib/temporary-chat-policy.ts:1-70`; `apps/web/features/settings/sections/PrivacySection.tsx:695-725`; `apps/mobile/app/(app)/(tabs)/chat.tsx:1178`

**Gap.** No temporary mode in CLI, VS Code or Chrome.

**Acceptance criteria**

1. Start a temporary chat: banner visible; message absent from history and search after reload.
2. No memory read or written from it.
3. Attached files absent from Library.
4. Ending it asks first and discards everything.

**Verification: not verified.** No scorecard or defect row covers temporary chat.

## CAP-privacy-and-data-controls-08 Temporary chat: personalization choice and save

Choose at start whether a temporary chat uses memory and instructions, and optionally keep it.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/12260368-use-incognito-chats](https://support.claude.com/en/articles/12260368-use-incognito-chats): Incognito cannot be converted or reopened; profile preferences still apply; ghost icon absent in projects. [2026-11-22] Plans: all. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/7039943-how-openai-handles-data-in-consumer-services](https://help.openai.com/en/articles/7039943-how-openai-handles-data-in-consumer-services): Choice of personalized or not is made before starting; saving a temporary chat turns it into a regular chat that follows account settings. [2026-11-22] Apps: web, ios, android.

**AGI requirement** (stated requirement; source: ledger S41.04, S41.06, S41.10, S41.11 (area brief 041)). A person can choose whether a temporary chat reads memory and instructions, and can keep it, with a review of what will be kept.

**With different models, providers and the one subscription.** Independent of model. Keeping a chat that used an on-device model must not upload it without the Local-to-Cloud consent steps.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and desktop done; mobile lacks save and review (S41.10, S41.11 missing). CLI, VS Code, Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S41.04, S41.06, S41.10, S41.11
- Comparison list ids: none matched; rows without an id: Temporary chat: choose personalized or not (web); Save a temporary chat as a regular chat (web)
- Code: `apps/web/features/chat/pages/WebChatPage.tsx:905-925`; `apps/web/features/chat/pages/WebChatPage.tsx:7366-7374`

**Gap.** Mobile cannot save a temporary chat; end-confirmation says nothing can be restored, so save must come before ending.

**Acceptance criteria**

1. Unpersonalized temporary chat ignores saved memory.
2. Turning temporary off keeps the messages in history.
3. Mobile offers the same save path or states it cannot.

**Verification: not verified.** Code reading only.

## CAP-privacy-and-data-controls-09 Memory controls: view, edit, delete, pause, reset, per-chat off

Control over what the assistant remembers, including turning memory off for one chat.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context): Pause keeps memory but stops use; Reset permanently deletes all memories; view, edit and delete topics; memory off per chat; export and import (experimental). [2026-11-22] Plans: Free, Pro, Max, Ultra. Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8590148-memory-in-chatgpt](https://help.openai.com/en/articles/8590148-memory-in-chatgpt): Memory controls in Settings, Personalization; memory summary; Sources shown under replies; project-only memory. [2026-11-22] Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md (each memory entry needs scope, provenance, update time, user controls, deletion, export, incognito exclusion)). Memory is inspectable and editable by topic, with provenance, delete, export, pause and incognito exclusion.

**With different models, providers and the one subscription.** Memory belongs to the account, not a model, so a model switch keeps it. Local memory stays on device. Extraction calls to a provider follow the provider-training switch.

**Current implementation, as this trace read it on 2026-11-24: built.** Saved memory done on all six apps; project memory preferences web and desktop only; import memory web, desktop, mobile, CLI. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S41.16, S85.05, S85.06, S85.07, S85.22
- Comparison list ids: none matched; rows without an id: Memory preferences in Privacy (web)
- Code: `apps/mobile/app/(app)/settings/memory.tsx:98`; `apps/cli/src/cloud/personalization.rs:274`; `apps/web/features/settings/sections/PrivacySection.tsx:845`

**Gap.** Web Memory switch shown as on while greyed when persistent memory is off (cosmetic defect seen).

**Acceptance criteria**

1. Add, edit and delete a memory; the next chat uses the change.
2. Turn memory off: asking to remember gives a clear message and saves nothing.
3. Each entry shows its source.

**Verification: seen working by a person.** scorecards/web.csv W-12 Free pass (memory off by default, add and delete persisted); subscribed partial because chat failed on a lapsed plan; defect row W-12 cosmetic on greyed switch.

## CAP-privacy-and-data-controls-10 Sensitive topics and never-remembered data

Rules that keep health, finance, ID numbers and similar content out of memory unless the person opts in.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context): Health, politics, religion not saved by default (opt-in setting); government ID numbers, criminal history, financial account numbers and immigration status are never saved. [2026-11-22] Apps: web, desktop, ios, android.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/20001036-health-in-chatgpt](https://help.openai.com/en/articles/20001036-health-in-chatgpt): Health data not used for training or ads, extra encryption, disconnect deletes synced data within 30 days. [2026-11-22] Plans: Free, Go, Plus, Pro. Apps: web, ios, android, desktop.
  - [https://help.openai.com/en/articles/12429613-customer-responsibilities-in-safeguarding-financial-data](https://help.openai.com/en/articles/12429613-customer-responsibilities-in-safeguarding-financial-data): Cardholder data must not be placed in conversations or files. [2026-11-22] Apps: web.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md (sensitive categories require explicit controls); docs/product/definition.md (sensitive topics explicit)). Sensitive categories need explicit controls; a fixed list is never remembered; bank and health reads stay out of memory.

**With different models, providers and the one subscription.** Enforced in the AGI memory layer before any provider call, so it holds for every model. Local memory uses the same rules.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: bank and health reads never saved; user never-remember list; no fixed system list. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: WP235; rows without an id: Linked bank accounts: disconnect and keep out of memory (web)
- Code: `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:539`

**Gap.** No fixed never-remember classes; no sensitive-topics opt-in found.

**Acceptance criteria**

1. Telling the assistant a government ID number and asking it to remember saves nothing.
2. Sensitive-topic opt-in off by default; turning it off removes saved items.

**Verification: not verified.** Code reading only.

## CAP-privacy-and-data-controls-11 Delete chats: single, bulk, all

Remove one chat, many, or every chat, with a confirmation that names the consequence.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/8230524-delete-or-rename-a-conversation](https://support.claude.com/en/articles/8230524-delete-or-rename-a-conversation): Bulk delete on web with Select and Select all; long-press on iOS; multi-delete on Android. [2026-11-22] Plans: Free, Pro, Max, Ultra. Apps: web, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8809935-deleting-and-archiving-chats-in-chatgpt](https://help.openai.com/en/articles/8809935-deleting-and-archiving-chats-in-chatgpt): Data controls offers Archive all and Delete all chats including project chats; delete all cannot be undone. [2026-11-22] Apps: web, ios, android.
  - [https://help.openai.com/en/articles/7039943-how-openai-handles-data-in-consumer-services](https://help.openai.com/en/articles/7039943-how-openai-handles-data-in-consumer-services): Cleared chats leave systems within 30 days except what must be kept for security or legal reasons. [2026-11-22] Apps: all.

**AGI requirement** (stated requirement; source: AGENTS.md section 9 (chat moved to Recently deleted; permanent removal only from explicit user action naming what is lost); ledger S85.18). A user can delete one chat, a selection or all chats; copy states truthfully whether it can be restored; an agent never destroys data without a prior copy in Recently deleted.

**With different models, providers and the one subscription.** Deletion also reaches provider-side copies where AGI controls them and says where it cannot. On-device chats delete locally.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Delete-all done on web, desktop, mobile; CLI and Chrome missing. Per-chat sidebar delete on web was seen to be unrecoverable. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S85.17, S85.18
- Comparison list ids: none matched; rows without an id: Archive all chats and delete all chats (web)
- Code: `apps/web/features/settings/components/BulkConversationControls.tsx:95-130`; `apps/web/features/settings/sections/PrivacySection.tsx:303`

**Gap.** Defect W-13 (Free and subscribed): sidebar Delete says it cannot be undone and shows no Recently deleted or undo, which conflicts with code-read claim of recovery.

**Acceptance criteria**

1. Delete one chat from the sidebar: it appears in Recently deleted and can be restored, or the dialog says it cannot.
2. Delete all asks first and names the consequence.
3. CLI offers delete of all sessions.

**Verification: seen failing by a person.** 6-defects/web-problems-seen-in-browser.csv rows W-13 free and subscribed (minor, unclear): delete dialog says cannot be undone, no Recently deleted. Scorecard W-13 notes delete confirm worked and chat left list and search.

## CAP-privacy-and-data-controls-12 Recoverable deletion (Recently deleted)

Deleted items sit in a recovery area before permanent removal.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - [https://support.claude.com/en/articles/16923645-get-started-with-claude-docs](https://support.claude.com/en/articles/16923645-get-started-with-claude-docs): Deleting a doc has no trash and removes access for everyone it was shared with. Catalogue shows no chat trash. [2026-11-22] Apps: web.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/20001052-using-library-to-manage-files-in-chatgpt](https://help.openai.com/en/articles/20001052-using-library-to-manage-files-in-chatgpt): Library files have Recently deleted restore with permanent removal within 30 days; chat delete does not restore. [2026-11-22] Apps: web.

**AGI requirement** (stated requirement; source: AGENTS.md section 9). Anything an agent or user removes goes to Recently deleted first for chats and the OS Trash for files; permanent removal only from an explicit action that names what is lost.

**With different models, providers and the one subscription.** Independent of model. Recovery window counts against storage not the subscription meter.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web Recently deleted exists for bulk and archive paths; purge schedule not stated. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S85.17
- Comparison list ids: WP228; rows without an id: Recently deleted chats (recover) (web)
- Code: `apps/web/features/settings/sections/DeletedChatsSection.tsx`; `apps/web/features/settings/sections/PrivacySection.tsx:671`

**Gap.** Sidebar delete path unrecoverable (W-13); no stated window.

**Acceptance criteria**

1. Every delete path ends in Recently deleted, restorable.
2. The window length is shown.
3. After the window the item is gone and the page says so.

**Verification: seen failing by a person.** defect rows W-13 as above.

## CAP-privacy-and-data-controls-13 Export your data

Download a copy of chats and account data.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/9450526-export-your-claude-data](https://support.claude.com/en/articles/9450526-export-your-claude-data): Chats, account data and shared voice recordings, emailed link valid 24 hours, not from mobile apps, no original uploaded files, cannot import into another account. [2026-11-22] Plans: Free, Pro, Max, Ultra. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data](https://help.openai.com/en/articles/7260999-exporting-your-chatgpt-history-and-data): Request in Data controls on web, iOS, Android; link by email valid 24 hours; ZIP with local viewer and JSON; one request at a time; not for Business, Enterprise, Healthcare. [2026-11-22] Plans: Free, Go, Plus, Pro, Edu. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md test W21). Export covers the maintained data inventory across permitted workspaces, files retrievable, failed sections fail or show incomplete, no foreign data or credentials.

**With different models, providers and the one subscription.** Export content includes model and provider labels per message, not provider secrets. Local-only data is exported from the device. Available on every plan.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop, mobile, CLI done; Chrome missing; VS Code not listed. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S85.20, S88.16
- Comparison list ids: none matched; rows without an id: Export your data (web)
- Code: `apps/web/features/settings/components/DataExportRow.tsx:205`; `apps/cli/src/cloud/data_export.rs:52`; `apps/mobile/services/cloudDataExport.ts:28`; `apps/web/app/api/user/export/route.ts:133`

**Gap.** Chrome has no export; completeness against inventory not verified.

**Acceptance criteria**

1. Export a seeded account; the archive opens and has chats, memory and files.
2. A file reference in the archive downloads the stored bytes.
3. A forced section failure shows incomplete with retry.

**Verification: not verified.** No scorecard row.

## CAP-privacy-and-data-controls-14 Workspace and member export controls

Owners export organization data; owners decide whether members may export their own.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13346720-export-your-organization-s-data](https://support.claude.com/en/articles/13346720-export-your-organization-s-data): Primary Owners export conversation and user data; link expires in 24 hours; owners can allow members to export their own data. [2026-11-22] Plans: Team, Enterprise. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8798634-managing-data-sharing-and-privacy-in-chatgpt-business](https://help.openai.com/en/articles/8798634-managing-data-sharing-and-privacy-in-chatgpt-business): Business data export by owner only. [2026-11-22] Plans: Business. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 5 (Admin controls, Export/delete controls, Audit trails)). Workspace owner can export workspace data and switch member self-export on or off, with audit entries.

**With different models, providers and the one subscription.** Role-based, not model-based; tied to workspace plan.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: owner records export under legal hold; no member-export toggle. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: WP224, WP225, WP238
- Code: `packages/contracts/types/src/enterprise/permissions.ts:27-43`; `apps/web/app/api/user/export/route.ts:133`

**Gap.** No toggle.

**Acceptance criteria**

1. Owner turns member export off: member export is refused with a reason.
2. Owner export is logged.

**Verification: not verified.** Code reading only.

## CAP-privacy-and-data-controls-15 Delete account

Permanent removal of the account and data, with plan and recovery consequences named.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/9028421-delete-your-claude-account](https://support.claude.com/en/articles/9028421-delete-your-claude-account): Irreversible on web, iOS and Android; loses chats, projects and credits; paid plans cancel first. [2026-11-22] Apps: web, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6378407-deleting-your-chatgpt-account](https://help.openai.com/en/articles/6378407-deleting-your-chatgpt-account): Permanent; data removed within 30 days; not reactivatable; unavailable self-serve for Business, Enterprise, Edu, Healthcare; Privacy Portal if you cannot sign in. [2026-11-22] Plans: Free, Go, Plus, Pro. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md test W21; AGENTS.md section 9). Account deletion names what is lost, shows status, offers cancel before it runs, and purges database, objects and identity records; partial failure never reports complete.

**With different models, providers and the one subscription.** Billing cancels per the one subscription system before deletion; provider copies follow provider terms and are named.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop, mobile done (24-hour pending state with cancel); CLI and Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S85.26
- Comparison list ids: none matched; rows without an id: Delete your account (web); Delete account from Settings (web)
- Code: `apps/web/features/settings/sections/AccountSection.tsx:385-466`; `apps/web/app/api/user/delete-account/route.ts:416`; `apps/mobile/src/features/settings/cloud-account/index.tsx:370`

**Gap.** No deletion in CLI or Chrome; purge completeness not verified.

**Acceptance criteria**

1. Start deletion: pending status with deadline shown; cancel restores the account.
2. After the deadline the account, chats and files are gone.
3. Billing lookup failure stops deletion with a message.

**Verification: not verified.** No scorecard row; owner approval needed for a live deletion test.

## CAP-privacy-and-data-controls-16 Privacy rights requests and personal-data removal

A route to ask for access, correction, erasure, objection or removal of personal data from outputs.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/10035659-where-can-i-learn-more-about-anthropic-s-privacy-practices](https://support.claude.com/en/articles/10035659-where-can-i-learn-more-about-anthropic-s-privacy-practices): Points users to a Privacy Center for privacy practices. [2026-11-22] Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001057-right-to-be-forgotten-and-personal-data-removal-from-chatgpt](https://help.openai.com/en/articles/20001057-right-to-be-forgotten-and-personal-data-removal-from-chatgpt): Anyone, with or without an account, can request removal of personal data from responses via the Privacy Portal; case-by-case review. [2026-11-22] Apps: web.
  - [https://help.openai.com/en/articles/7842364-how-chatgpt-and-our-foundation-models-are-developed](https://help.openai.com/en/articles/7842364-how-chatgpt-and-our-foundation-models-are-developed): Objection and rights requests via Privacy Portal. [2026-11-22] Apps: web.

**AGI requirement** (stated requirement; source: ledger S88.16). Users can file access, correction and erasure requests and see status.

**With different models, providers and the one subscription.** Requests also cover provider-held copies where AGI is the controller; name where it is not.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop, mobile done; CLI missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S88.16, S88.27
- Comparison list ids: WP242; rows without an id: Privacy requests: access, correct or erase data (web)
- Code: `apps/web/app/privacy/requests/page.tsx:133`; `apps/mobile/src/features/settings/cloud-privacy/index.tsx:170`

**Gap.** No removal-from-outputs request for non-users; state-by-state disclosures partial.

**Acceptance criteria**

1. Submit an erasure request and see its status.
2. A signed-out visitor can reach the request form.

**Verification: not verified.** Code reading only.

## CAP-privacy-and-data-controls-17 Privacy Center hub

One place that explains privacy options and links to the real settings.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/10035659-where-can-i-learn-more-about-anthropic-s-privacy-practices](https://support.claude.com/en/articles/10035659-where-can-i-learn-more-about-anthropic-s-privacy-practices): A Privacy Center is referenced; its in-app form is not described. [2026-11-22] Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001488-privacy-center-in-chatgpt](https://help.openai.com/en/articles/20001488-privacy-center-in-chatgpt): Hub opened from Help or Settings covering memory and ads, temporary and locked chats, apps, MFA, model improvement, export or delete; does not change settings itself. [2026-11-22] Plans: Free, Go, Plus, Pro, Business (rolling out). Apps: web, ios, android, desktop.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md (Privacy is a destination); docs/product/definition.md (first-class Privacy Center)). Privacy is one destination covering memory, history, connected accounts, retention, export, deletion, temporary work and account switching.

**With different models, providers and the one subscription.** Lists provider routes and the Local, BYOK and Cloud label per feature; same on every plan.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Settings Privacy carries controls and explanations; no separate hub page. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S41.19, S41.20
- Comparison list ids: WP226
- Code: `apps/web/features/settings/sections/PrivacySection.tsx:423-548`

**Gap.** No hub page; CLI and VS Code reach privacy through commands.

**Acceptance criteria**

1. Every item in the contract list is reachable from Privacy in two clicks on web and mobile.

**Verification: not verified.** Code reading only.

## CAP-privacy-and-data-controls-18 Voice and dictation audio handling

What happens to audio after transcription and whether recordings may be shared for training.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/17644704-share-your-voice-recordings-with-anthropic](https://support.claude.com/en/articles/17644704-share-your-voice-recordings-with-anthropic): Audio deleted after transcription by default; opt-in sharing on mobile; shared recordings kept 30 days, deletable, included in export. [2026-11-22] Plans: Free, Pro, Max, Ultra (not Team, Enterprise, ZDR). Apps: ios, android.
  - [https://support.claude.com/en/articles/11101966-use-voice-mode](https://support.claude.com/en/articles/11101966-use-voice-mode): Recordings discarded after transcription; transcript kept. [2026-11-22] Apps: web, desktop, ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001274-chatgpt-voice](https://help.openai.com/en/articles/20001274-chatgpt-voice): Live and advanced audio and video clips kept 30 days with transcript; standard audio deleted after transcription; opt-in sharing for training. [2026-11-22] Plans: Free, Plus, Pro. Apps: web, ios, android.
  - [https://help.openai.com/en/articles/12168547-voice-dictation-faq](https://help.openai.com/en/articles/12168547-voice-dictation-faq): Turning the toggle off stops sharing dictation and voice audio. [2026-11-22] Apps: all.

**AGI requirement** (stated requirement; source: docs/decisions/2026-11-13-founder-decisions.md D-2026-11-13-03 (voice switch off until turned on)). Audio is not kept after transcription; any sharing is opt-in, separately controlled, deletable.

**With different models, providers and the one subscription.** On-device dictation never leaves the device; hosted voice routes to a named speech provider whose retention is shown or marked unknown.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: audio never stored, Use my voice off by default. Mobile has a switch but no delete-shared button or per-chat ask (MP95); ledger marks voice retention n/a. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S85.12, S85.15
- Comparison list ids: M181, MP95; rows without an id: Voice audio is not kept, transcript is (web); Share voice recordings for training (opt-in) (web)
- Code: `apps/web/app/privacy/page.tsx:248-262`; `apps/web/features/settings/sections/PrivacySection.tsx:80-92`

**Gap.** No stated provider retention for hosted speech; mobile lacks consent sheet and delete.

**Acceptance criteria**

1. After a voice turn only the transcript exists.
2. Voice switch off by default; on-device dictation makes no network call.

**Verification: not verified.** Voice scorecard W-10 blocked or partial on test-machine microphone; privacy not examined.

## CAP-privacy-and-data-controls-19 Shared links: manage, revoke, search-engine privacy

List shared chats, revoke them, and keep shared pages unindexed and unguessable.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/10593882-share-and-unshare-chats](https://support.claude.com/en/articles/10593882-share-and-unshare-chats): Settings, Privacy, Shared chats lists each link with Unshare; Team and Enterprise share only inside the org. [2026-11-22] Plans: all. Apps: web.
  - [https://support.claude.com/en/articles/16762437-public-links-for-shared-chats](https://support.claude.com/en/articles/16762437-public-links-for-shared-chats): Shared pages ask search engines not to index and use long random links. [2026-11-22] Apps: web.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/7925741-sharing-conversations-and-scheduled-tasks-in-chatgpt](https://help.openai.com/en/articles/7925741-sharing-conversations-and-scheduled-tasks-in-chatgpt): Enterprise: shared-link metadata appears in exports; Compliance API covers tasks. [2026-11-22] Plans: Enterprise. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md test W10). Users list and revoke shared links; shares are snapshots, noindex, unguessable, and revocation stops access.

**With different models, providers and the one subscription.** Share excludes attached files and tool payloads. A Local chat cannot be shared without the Local-to-Cloud steps.

**Current implementation, as this trace read it on 2026-11-24: built.** Web, desktop, mobile, CLI done; VS Code and Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S85.19
- Comparison list ids: none matched; rows without an id: Manage shared chats and artifacts (web); Shared links are noindex and unguessable (web)
- Code: `apps/web/features/settings/sections/SharedLinksSection.tsx:82`; `apps/web/app/share/[token]/page.tsx:85-96`

**Gap.** Defect: shared page showed markdown as literal text (W-14 cosmetic).

**Acceptance criteria**

1. Share, open signed out, see only that chat; revoke and the link stops.
2. Shared page is noindex.

**Verification: seen working by a person.** scorecards/web.csv W-14 free: share, stranger view and revoke worked; defect row W-14 markdown shown literally.

## CAP-privacy-and-data-controls-20 Locked chats behind a PIN or device check

Hide chosen chats from history and search until unlocked.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - [https://support.claude.com/en/articles/12260368-use-incognito-chats](https://support.claude.com/en/articles/12260368-use-incognito-chats): Catalogue shows incognito only; no locked-chat feature found. [2026-11-22]
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001411-using-locked-chats-in-chatgpt](https://help.openai.com/en/articles/20001411-using-locked-chats-in-chatgpt): Locked chats sit in Projects, hidden from history, pins and search, opened with a 4-digit account PIN or device unlock; not encryption; retention and training unchanged; relock on idle. [2026-11-22] Plans: Free, Go, Plus, Pro, Business, Enterprise, Edu. Apps: web, desktop, ios, android.

**AGI requirement** (proposed; source: competitor parity (one competitor)). Offer a per-chat lock only if the owner chooses to match; if built it must state that it is not encryption.

**With different models, providers and the one subscription.** Lock is local UI; locked chats still obey the same retention and routing.

**Current implementation, as this trace read it on 2026-11-24: not built.** No locked chats on web or mobile; mobile locks the whole app with the device. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: M175, M179, W300, W305
- Code: `apps/mobile/src/features/settings/safety-security/index.tsx:25`

**Gap.** Not built; owner decision needed.

**Acceptance criteria**

1. If built: locked chat absent from search until PIN or device check; relocks on idle.

**Verification: not verified.** Comparison rows are search-only.

## CAP-privacy-and-data-controls-21 Active sessions and sign out everywhere

See signed-in devices and end one or all sessions.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude (Claude Code tokens included): yes**
  - [https://support.claude.com/en/articles/13124001-managing-your-active-sessions](https://support.claude.com/en/articles/13124001-managing-your-active-sessions): Active sessions list with location, last active, per-session terminate. [2026-11-22] Apps: web.
  - [https://support.claude.com/en/articles/10310342-how-do-i-log-out-of-all-active-sessions](https://support.claude.com/en/articles/10310342-how-do-i-log-out-of-all-active-sessions): Log Out signs out every browser, mobile, desktop app, Claude Code and tools; API keys unaffected; not offered in mobile apps. [2026-11-22] Apps: web, desktop, cli, chrome.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001257-managing-active-sessions-in-chatgpt](https://help.openai.com/en/articles/20001257-managing-active-sessions-in-chatgpt): Security settings list sessions; log out one or all (up to 30 minutes); excludes third-party apps and Codex CLI. [2026-11-22] Plans: all. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: docs/product/definition.md (logout all devices, active sessions, device, location, created, updated)). Account settings list sessions with device, location, created, last active, and sign out one or all, including CLI, extension and API credentials.

**With different models, providers and the one subscription.** Account-level; independent of model or plan.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop, mobile done; CLI and VS Code have no session list; sign out all missing on CLI, VS Code, Chrome. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S86.06, S86.07, S86.09, S86.10
- Comparison list ids: none matched; rows without an id: Active sessions list with sign-out per session (web); Active sessions list and log out of all devices (web)
- Code: `apps/web/features/settings/sections/AccountSection.tsx:530`; `apps/web/app/api/settings/sessions/route.ts:183`; `apps/mobile/src/features/settings/account-security/index.tsx:501`

**Gap.** CLI, VS Code and Chrome credentials not shown or revocable from one list.

**Acceptance criteria**

1. Log out of all devices ends web, mobile and CLI sessions within a stated time.
2. Revoking one session logs only that device out.

**Verification: not verified.** No scorecard row.

## CAP-privacy-and-data-controls-22 Multi-factor sign-in, passkeys and recovery

A second factor, passkeys and recovery codes for the account.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - [https://support.claude.com/en/articles/12684923-microsoft-365-connector-security-guide](https://support.claude.com/en/articles/12684923-microsoft-365-connector-security-guide): Catalogue mentions MFA only for the Microsoft connector; no Claude account MFA page found. [2026-11-22]
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/7967234-managing-multi-factor-authentication-mfa](https://help.openai.com/en/articles/7967234-managing-multi-factor-authentication-mfa): MFA by authenticator, push, SMS or WhatsApp, or passkey; admins cannot enforce MFA for workspace. [2026-11-22] Apps: web.
  - [https://help.openai.com/en/articles/20001039-passkeys-to-secure-your-openai-account](https://help.openai.com/en/articles/20001039-passkeys-to-secure-your-openai-account): Add passkeys including hardware keys; acts as MFA under SSO. [2026-11-22] Apps: web.

**AGI requirement** (stated requirement; source: ledger S86.03-S86.05; docs/product/definition.md account settings). Account holders can add a second factor, passkeys and recovery codes; workspace admins can require MFA.

**With different models, providers and the one subscription.** Account-level only.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop, mobile: MFA and recovery codes done; passkeys not on mobile; admin MFA requirement exists. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S86.03, S86.04, S86.05
- Comparison list ids: WP12; rows without an id: Add and manage passkeys (web); Admin-required MFA and IP allow list (web)
- Code: `apps/web/features/settings/components/Settings/PasskeysPanel.tsx:46`; `apps/web/app/api/settings/2fa/backup-codes/route.ts:42`; `apps/mobile/src/features/settings/account-security/TwoFactorSection.tsx:102`

**Gap.** Passkeys missing on mobile; passkey sign-in on login depends on a provider setting (WP12 partial).

**Acceptance criteria**

1. Enable MFA, sign out, sign in with the code.
2. Use a recovery code once.
3. Add and remove a passkey.

**Verification: not verified.** Scorecards cover sign-in basics only.

## CAP-privacy-and-data-controls-23 Advanced account security mode

Hardened mode: passkeys or keys only, recovery keys, no password or email codes.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - [https://support.claude.com/en/articles/10310342-how-do-i-log-out-of-all-active-sessions](https://support.claude.com/en/articles/10310342-how-do-i-log-out-of-all-active-sessions): Not found in catalogue for Claude. [2026-11-22]
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001221-advanced-account-security](https://help.openai.com/en/articles/20001221-advanced-account-security): Passkey-only sign-in with recovery keys; conversations not used for training while enrolled; can be disabled; not for managed accounts. [2026-11-22] Plans: Free, Go, Plus, Pro. Apps: web.

**AGI requirement** (inferred; source: competitor parity; ledger S86.26). Offer a hardened account mode with an undo window.

**With different models, providers and the one subscription.** Account-level.

**Current implementation, as this trace read it on 2026-11-24: built.** Panel on web, emails 48-hour undo link; ledger done on all six apps. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S86.26
- Comparison list ids: none matched; rows without an id: Advanced Account Security (passkeys and keys only, recovery keys) (web)
- Code: `apps/web/features/account-security/components/AdvancedAccountSecurityPanel.tsx:182`; `apps/web/lib/server/account-security/undo.ts:18`

**Gap.** none known

**Acceptance criteria**

1. Turn on; password sign-in refused; undo link restores it.

**Verification: not verified.** Code reading only.

## CAP-privacy-and-data-controls-24 Security activity log and sign-in alerts

A history of sign-ins and account changes, with alerts on unusual activity.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - [https://support.claude.com/en/articles/13124001-managing-your-active-sessions](https://support.claude.com/en/articles/13124001-managing-your-active-sessions): Only the active sessions list is documented in the catalogue. [2026-11-22] Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8304786-keeping-your-openai-account-secure](https://help.openai.com/en/articles/8304786-keeping-your-openai-account-secure): Security history of sign-ins, sign-outs, password and MFA changes. [2026-11-22] Apps: web.
  - [https://help.openai.com/en/articles/10471992-why-am-i-receiving-a-suspicious-activity-alert](https://help.openai.com/en/articles/10471992-why-am-i-receiving-a-suspicious-activity-alert): Suspicious Activity Alerts exist. [2026-11-22] Apps: web.

**AGI requirement** (stated requirement; source: ledger S86.11). Show a filterable security log and notify on new sign-in, password or MFA change.

**With different models, providers and the one subscription.** Account-level.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and desktop done; no in-product alert banner; CLI, VS Code, Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S86.11
- Comparison list ids: WP241; rows without an id: Security history of sign-ins and account changes (web)
- Code: `apps/web/features/settings/components/AuditLogPanel.tsx:44-152`; `apps/web/lib/services/account-activity-notifications.ts:48`

**Gap.** No in-product alert.

**Acceptance criteria**

1. A new sign-in emails the owner and appears in the log.

**Verification: not verified.** Code reading only.

## CAP-privacy-and-data-controls-25 Lockdown mode

A switch that cuts outbound access (web, connectors, code execution) to reduce data leaving.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - [https://support.claude.com/en/articles/12902428-use-claude-in-chrome-safely](https://support.claude.com/en/articles/12902428-use-claude-in-chrome-safely): No account-level lockdown page found; Chrome page lists classifiers and approval modes. [2026-11-22] Apps: chrome.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001061-lockdown-mode](https://help.openai.com/en/articles/20001061-lockdown-mode): Cached-only browsing, agent and deep research off, no file downloads for analysis; Codex network access unaffected. [2026-11-22] Plans: Free, Go, Plus, Pro, Business, Enterprise, Edu. Apps: web.

**AGI requirement** (proposed; source: competitor parity (one competitor)). A lockdown switch that blocks connector tools, web search and code execution.

**With different models, providers and the one subscription.** Must apply to every provider route and tell the user which features are off; Local mode already offline.

**Current implementation, as this trace read it on 2026-11-24: built.** Web and mobile have the switch. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S86.26
- Comparison list ids: none matched; rows without an id: Lockdown mode (web); Lockdown mode (mobile)
- Code: `apps/web/features/settings/components/LockdownModePanel.tsx:62-90`; `apps/mobile/src/features/settings/account-security/index.tsx:828`

**Gap.** Not on desktop, CLI or extensions per comparison files reviewed.

**Acceptance criteria**

1. With it on, a prompt asking to search the web is refused with a reason.

**Verification: not verified.** Code reading only.

## CAP-privacy-and-data-controls-26 Connected app data sharing and approvals

Disclosure of what apps and connectors receive, and prompts before sensitive actions.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/10166901-use-google-workspace-connectors](https://support.claude.com/en/articles/10166901-use-google-workspace-connectors): Access limited to the account's permissions; retrieved data stored with the chat and deleted with it; not used for training. [2026-11-22] Apps: web, desktop.
  - [https://support.claude.com/en/articles/15183774-connect-to-microsoft-365](https://support.claude.com/en/articles/15183774-connect-to-microsoft-365): Asks before sending or changing; Always allow per tool. [2026-11-22] Plans: Free through Enterprise. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/11487775-connected-apps-in-chatgpt](https://help.openai.com/en/articles/11487775-connected-apps-in-chatgpt): Enabled apps can see conversation and Memory context plus IP, device, language, approximate location; business app data not trained on. [2026-11-22] Apps: web.
  - [https://help.openai.com/en/articles/20001495-managing-app-permissions-in-chatgpt](https://help.openai.com/en/articles/20001495-managing-app-permissions-in-chatgpt): Financial transactions always need provider confirmation. [2026-11-22] Apps: web.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 4.4 (Will a third party receive this file or prompt?)). Before a connector or provider receives content, say what it receives; approval prompts for sending, paying or deleting; temporary chats ignore saved Always allow.

**With different models, providers and the one subscription.** Applies on every route. Connector actions are not Local-mode actions.

**Current implementation, as this trace read it on 2026-11-24: built.** Web: processing lists providers, named-provider switches, always-allow card. Mobile apps-with-access partial; payments or signing approvals partial (MP90). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S41.20, S86.12, S86.13, S86.23
- Comparison list ids: MP90, MP92; rows without an id: Information shared with apps (web); Connector actions ask first with Always allow rules (web)
- Code: `apps/web/features/chat/components/approvals/ToolApprovalCard.tsx:34`; `apps/web/app/agent-permissions/page.tsx:47-51`

**Gap.** Mobile lacks a privacy row for apps with access; no approvals for payments or signatures.

**Acceptance criteria**

1. Always allow is ignored in temporary chat.
2. Connector approval card names connector and tool.

**Verification: not verified.** Code reading only.

## CAP-privacy-and-data-controls-27 Execution boundary disclosure and Local-to-Cloud crossing

Showing, per feature and message, whether data stays on the device, goes to AGI cloud, or goes to a named provider, and asking before it crosses.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code (nearest): no**
  - [https://code.claude.com/docs/en/data-usage.md](https://code.claude.com/docs/en/data-usage.md): Documents what Claude Code sends and stores, but a per-message device versus cloud label is not described. [2026-11-22] Apps: cli.
- **ChatGPT: unknown**
  - [https://help.openai.com/en/articles/11487775-connected-apps-in-chatgpt](https://help.openai.com/en/articles/11487775-connected-apps-in-chatgpt): Only app context sharing is documented. [2026-11-22] Apps: web.

**AGI requirement** (stated requirement; source: docs/product/requirements.md sections 4.4, 7.1, 7.4). Crossing from Local to BYOK or Cloud needs user action, context selection, secret scan, payload preview, route label, retention disclosure, consent, and a new branch keeping the Local original. Local fails closed.

**With different models, providers and the one subscription.** Labels name provider, model and route for any model; free local inference stays free and needs no account; BYOK is never labelled private like Local.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Per-feature processing disclosure done on all six apps; Local-only chats on mobile, CLI, VS Code, Chrome; CLI blocks Local sessions from using non-local providers; whether all seven crossing steps exist everywhere was not established. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S41.14, S41.20
- Comparison list ids: none matched; rows without an id: Information shared with apps (web)
- Code: `apps/cli/src/agent/mod.rs`; `apps/mobile/src/features/chat/utils/conversationMode.ts:34`

**Gap.** Full crossing flow not verified on each app.

**Acceptance criteria**

1. A Local chat asked to use a cloud-only tool shows the requirement and offers a fork, never silent routing.
2. The fork shows payload preview and provider label before consent.

**Verification: not verified.** Code reading only.

## CAP-privacy-and-data-controls-28 Local data controls: clear, keep local, no history

Control over data kept on the device: clear it, keep chats only local, skip saving transcripts, purge by project.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/claude-directory.md](https://code.claude.com/docs/en/claude-directory.md): Transcripts deleted after cleanupPeriodDays (default 30); claude purge removes a project's local data; skip-persistence option. [2026-11-22] Apps: cli.
- **Codex and ChatGPT desktop: yes**
  - [https://learn.chatgpt.com/docs/customization/computer-history.md](https://learn.chatgpt.com/docs/customization/computer-history.md): Computer History stored locally with 48-hour events, clearable by last 10 minutes, hour, day, all, or single item. [2026-11-22] Apps: desktop.

**AGI requirement** (stated requirement; source: ledger S41.14-S41.17, S85.23; docs/product/requirements.md section 7.1 (local storage by default)). One action clears all data kept on this device; a retention period for local transcripts; option to not save history.

**With different models, providers and the one subscription.** This is the Local-mode privacy basis; on-device models need no account.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Mobile done (clear, local-only memory); CLI has keep_history off and --no-session-persistence but no retention sweep or purge (C461, CP279, CP294 partial); desktop and web missing clear local data; VS Code has no switch (VP72). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S41.14, S41.15, S41.16, S41.17, S85.23
- Comparison list ids: C461, C491, CP279, CP288, CP294, VP72
- Code: `apps/mobile/app/(app)/settings/storage.tsx:173`; `apps/cli/src/config.rs:1459`; `apps/cli/src/conversations.rs:220`

**Gap.** Desktop clear-local missing; CLI no retention or purge; VS Code no switch.

**Acceptance criteria**

1. Clear local data on mobile removes chats, memory and cache; app starts empty.
2. CLI retention setting removes sessions older than N days.
3. With history off no transcript file is written.

**Verification: not verified.** Code reading only.

## CAP-privacy-and-data-controls-29 Diagnostics and telemetry opt-outs

Choice over crash reports, analytics and diagnostic sharing, with a reviewable bundle.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/data-usage.md](https://code.claude.com/docs/en/data-usage.md): Metrics and error reports can be turned off separately; telemetry defaults off on third-party providers; transcript upload to feedback is chosen per submission. [2026-11-22] Apps: cli.
- **Codex: partly**
  - [https://learn.chatgpt.com/docs/agent-approvals-security.md](https://learn.chatgpt.com/docs/agent-approvals-security.md): Opt-in OpenTelemetry export and history persistence settings. [2026-11-22] Apps: cli, desktop.

**AGI requirement** (stated requirement; source: ledger S85.14, S88.07). Crash and diagnostics sharing is a visible choice, off by default; support bundle can be reviewed before sharing.

**With different models, providers and the one subscription.** Telemetry carries no prompt content; independent of model.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web (off by default), desktop, CLI, VS Code, Chrome done; CLI product analytics on by default and no single disable-all switch (CP293, CP283). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S85.14, S88.07
- Comparison list ids: CP283, CP293; rows without an id: Crash and error report sharing (web)
- Code: `apps/web/features/settings/sections/PrivacySection.tsx:56-60`; `apps/cli/src/config.rs:82-100`

**Gap.** CLI analytics default on; no DO_NOT_TRACK support.

**Acceptance criteria**

1. Fresh install sends no crash report.
2. CLI analytics can be turned off with one setting.

**Verification: not verified.** Code reading only.

## CAP-privacy-and-data-controls-30 Data residency

Choice of where customer content is stored or processed.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/15422948-enable-us-only-inference-for-your-organization](https://support.claude.com/en/articles/15422948-enable-us-only-inference-for-your-organization): Enterprise toggle keeps all model processing in the US; inference only, not storage. [2026-11-22] Plans: Enterprise. Apps: web, desktop, cli.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/9903489-data-residency-and-inference-residency-for-chatgpt](https://help.openai.com/en/articles/9903489-data-residency-and-inference-residency-for-chatgpt): Stored at rest in ten listed regions; inference residency separate; some data may leave the region. [2026-11-22] Plans: Enterprise, Edu. Apps: web.

**AGI requirement** (stated requirement; source: docs/decisions/2026-09-04-region-neutral-data-residency.md). Workspaces can pick a storage region and the product states what stays in-region, per the region-neutral decision.

**With different models, providers and the one subscription.** Routing filters providers by region; if no in-region route exists the feature is unavailable, not rerouted.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web workspaces choose United States or European Union storage; personal accounts US; CLI no choice (C438). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: C438, WP223
- Code: `packages/contracts/compliance/src/data-residency.ts:77-90`

**Gap.** No inference-region guarantee stated; personal accounts fixed.

**Acceptance criteria**

1. EU workspace content is stored in EU; pane lists what may leave the region.

**Verification: not verified.** Comparison file only.

## CAP-privacy-and-data-controls-31 Customer-managed encryption keys

Enterprise keys held in the customer's cloud used to encrypt content.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/15505325-what-are-customer-managed-encryption-keys-cmek](https://support.claude.com/en/articles/15505325-what-are-customer-managed-encryption-keys-cmek): Customer provisions a key in AWS, Google or Azure KMS; chats, projects and files encrypted with it; operations logged. [2026-11-22] Plans: Enterprise. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20000943-openai-enterprise-key-management-ekm-overview](https://help.openai.com/en/articles/20000943-openai-enterprise-key-management-ekm-overview): Master key in customer's AWS, GCP, Azure or OCI KMS; OpenAI holds only encrypted data keys. [2026-11-22] Plans: Enterprise. Apps: web.

**AGI requirement** (inferred; source: competitor parity). Enterprise workspaces can bring a key that protects stored content; unsupported features are named.

**With different models, providers and the one subscription.** Applies to AGI-stored content; provider copies follow provider terms.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: a workspace key seals only the audit-stream destination secret. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: WP221, WP222
- Code: `apps/web/features/workspace-console/components/WorkspaceEncryptionKey.tsx:357`

**Gap.** Chats and files not covered by the key.

**Acceptance criteria**

1. Revoking the key makes covered content unreadable; the pane lists what the key covers.

**Verification: not verified.** Comparison file only.

## CAP-privacy-and-data-controls-32 Admin audit log and compliance export

Exports of admin and content activity for workspace owners.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/9970975-access-audit-logs](https://support.claude.com/en/articles/9970975-access-audit-logs): Owners export 180 days of audit logs; contents excluded; Compliance API for content. [2026-11-22] Plans: Enterprise. Apps: web.
  - [https://support.claude.com/en/articles/15167101-get-started-with-claude-compliance-api-integrations](https://support.claude.com/en/articles/15167101-get-started-with-claude-compliance-api-integrations): Compliance API exposes chats, files, projects and session content plus activity feed. [2026-11-22] Plans: Enterprise. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes](https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes): Compliance Logs Platform with audit, authentication and Codex logs as JSONL exports. [2026-11-22] Plans: Enterprise. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 5 (Audit trails)). Workspace audit export and event streaming; content-level access only with legal hold.

**With different models, providers and the one subscription.** Logs name model and provider per event; no content in logs by default.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: JSONL export and signed SIEM streaming; no content-level compliance API. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: C420, WP217; rows without an id: Compliance and audit log export (web)
- Code: `apps/web/features/workspace-console/components/WorkspaceAuditStreaming.tsx:106`

**Gap.** No content-level API; CLI writes no audit export.

**Acceptance criteria**

1. Admin export contains a settings change within one minute.
2. Non-admin cannot export.

**Verification: not verified.** Comparison file only.

## CAP-privacy-and-data-controls-33 Browser and computer agent data handling

What screenshots, cookies and sign-ins the agent keeps, and controls to clear them.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12902428-use-claude-in-chrome-safely](https://support.claude.com/en/articles/12902428-use-claude-in-chrome-safely): Screenshots capture visible tab content and enter the conversation; side-panel sessions stored in history. [2026-11-22] Plans: Pro, Max, Ultra, Team, Enterprise. Apps: chrome.
  - [https://support.claude.com/en/articles/18442783-use-the-cloud-browser-in-claude](https://support.claude.com/en/articles/18442783-use-the-cloud-browser-in-claude): Claude sees open pages; sign-in persists for the task; passwords hidden best-effort. [2026-11-22] Plans: Pro, Max, Ultra. Apps: web, desktop, ios, android.
- **ChatGPT; Codex: yes**
  - [https://help.openai.com/en/articles/20001280-using-cloud-browser-in-chatgpt](https://help.openai.com/en/articles/20001280-using-cloud-browser-in-chatgpt): Settings clears cloud browser cookies per site or all. [2026-11-22] Plans: Paid plans. Apps: web, ios, android.
  - [https://learn.chatgpt.com/docs/customization/computer-history.md](https://learn.chatgpt.com/docs/customization/computer-history.md): Codex Computer History: local, clearable, prompt-injection and token notices. [2026-11-22] Apps: desktop.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 4.4 (browser/computer-use actions know their trust boundary)). State what screenshots and browser data are kept, where, and offer clearing; browsing requires site grants.

**With different models, providers and the one subscription.** Screenshots sent to a provider are labelled; Local computer use stays on device unless a crossing is consented.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Chrome: browser sites grants done; desktop: computer apps grants done; no hosted cloud browser on web or mobile (W295, M173 missing). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S41.13, S85.10, S86.17, S86.18
- Comparison list ids: M173, W295
- Code: `apps/extension/src/features/observability/automationAudit.ts:16`

**Gap.** No private browser session (S41.13 missing); no cookie clearing.

**Acceptance criteria**

1. A browsing task shows which sites it may use; screenshot retention is stated; the user can clear browser data.

**Verification: not verified.** Code reading only.

## CAP-privacy-and-data-controls-34 Secret and payment-data protection

Keeping credentials and card data out of prompts, transcripts and spawned commands.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/env-vars.md](https://code.claude.com/docs/en/env-vars.md): Subprocess scrub strips credentials from shell, hook and MCP environments. [2026-11-22] Apps: cli.
  - [https://code.claude.com/docs/en/claude-code-on-the-web.md](https://code.claude.com/docs/en/claude-code-on-the-web.md): GitHub credentials stay server-side behind a proxy in cloud sessions. [2026-11-22] Apps: web.
- **ChatGPT; Codex: partly**
  - [https://help.openai.com/en/articles/12429613-customer-responsibilities-in-safeguarding-financial-data](https://help.openai.com/en/articles/12429613-customer-responsibilities-in-safeguarding-financial-data): Cardholder data must not be entered in chats or files. [2026-11-22] Apps: web.
  - [https://learn.chatgpt.com/docs/config-file/config-basic.md](https://learn.chatgpt.com/docs/config-file/config-basic.md): shell_environment_policy controls variables for spawned commands. [2026-11-22] Apps: cli, ide.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 7.4 step 3). A secret scan and redaction warning before any Local-to-Cloud crossing; credentials scrubbed from child processes.

**With different models, providers and the one subscription.** Scan runs before the provider call so it holds for every model.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI scrubs and redacts credentials but has no credential-swapping proxy (C473); users cannot set env include or exclude lists (CP280); VS Code keeps secret-looking names out of snapshots (VP71). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: C473, CP280, VP71, WP233
- Code: `apps/cli/src/secret_redaction.rs:1-10`; `apps/cli/src/sandbox.rs:630-640`

**Gap.** No user policy; no card-data warning found.

**Acceptance criteria**

1. A prompt containing an API key prompts a warning before leaving the device.
2. Spawned commands do not inherit provider credentials.

**Verification: not verified.** Code reading only.

## Unresolved product choices

Decisions this topic needs from the owner. Nothing here has been decided.

- Whether to build locked chats behind a PIN or device check (only ChatGPT documents it).
- Whether to add a per-account zero data retention switch and a HIPAA or BAA offering, or keep stating that none exists.
- Whether to match Claude's fixed never-remembered data classes and sensitive-topics opt-in, or keep a user-managed never-remember list.
- Whether Free and Plus-style consumer retention periods should be stated as day counts in the pane, and which numbers.
- Whether chat deletion from the sidebar should go to Recently deleted like other paths, or stay permanent with its current copy.
- Whether CLI, VS Code and Chrome should get their own training, temporary-chat and delete-all controls or defer to the account setting.
- Whether to build a private or cloud browser session with cookie clearing.
- Whether to offer Lockdown mode on desktop, CLI and extensions.
- Whether to add a feedback record and a statement of feedback-upload exceptions to training.
- Whether Business admins can enforce MFA, which ChatGPT documents it cannot.

## Could not establish

- Whether Claude has account MFA, passkeys, Lockdown, locked chats, a security activity log or Recently deleted chats: the catalogue shows none of these, so Claude is marked unknown, not no.
- Claude consumer chat retention periods on the chat product pages: the 5 years versus 30 days figures come only from the Claude Code data-usage page.
- Whether the AGI workspace policy states no training for workspace content.
- Whether all seven Local-to-Cloud crossing steps exist on every app.
- Any person-seen result for training switches, temporary chat, export, account deletion, sessions, MFA, passkeys or Lockdown: the web scorecard has no privacy row, only memory (W-12), sharing (W-14) and chat delete (W-13).
- Comparison rows marked 'searched' record a code search, not a product test; ledger status words come from code reading.
- Exact line numbers in code evidence were not each re-opened; only PrivacySection.tsx, temporary-chat-policy.ts, config.rs and the delete-account and export routes were opened.
- Mobile, desktop, CLI, VS Code and Chrome scorecards were not read for privacy rows.
