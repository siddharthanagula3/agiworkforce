---
id: "COMP-sharing-and-collaboration"
type: "competitor-trace"
title: "Sharing and collaboration"
competitor_evidence_reviewed: "2026-11-22"
basis: "official competitor pages saved 2026-11-22; AGI status from code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Sharing and collaboration: competitors to requirements

Claude and ChatGPT both share chats as snapshot links, share artifacts and projects with roles, and manage links centrally. ChatGPT adds Teams, Spaces and Pages with live co-editing and project links. Claude adds artifact comments and email invites to chats. AGI has chat links, project roles and artifact audiences on web, and a person saw chat share and revoke work. Co-editing, teams, named-person chat shares and artifact comment roles are missing.

**How the products divide this topic.** Claude (chat product, support.claude.com): chat snapshot links, named-person chat invites, project sharing (Team, Enterprise), artifact sharing with roles, Docs, Sheets and whiteboard co-editing. Claude Code (code.claude.com): cloud session sharing (Private/Team) and artifact comments that a Claude Code session answers; these connect to the chat product through shared artifacts at claude.ai. ChatGPT (help.openai.com, learn.chatgpt.com): conversation links, project sharing for all plans, Teams, Spaces and Pages, Sites, Library sharing, workspace agents. Codex: read-only snapshot share of a coding chat (Codex pages are the coding tool). Plan limits matter: Claude public chat links are on Free to Ultra and not on Team or Enterprise; named-person chat shares, org sharing and project sharing are Team or Enterprise; ChatGPT Teams, Library sharing and Sites co-editing are Business or Enterprise; project sharing in ChatGPT covers individual plans with collaborator caps. ChatGPT group chats were retired on 2026-07-09. All competitor facts are from the 2026-11-22 catalogue, reviewed 2026-11-22. AGI status comes from code reading in the comparison files plus one human run (web scorecard W-14).

Each capability below is traced: competitor evidence, AGI requirement, current implementation, gap, acceptance criteria, verification. Competitor behaviour comes only from the cited pages, reviewed 2026-11-22.

| ID | Capability | Claude | ChatGPT | AGI today | Verified |
|---|---|---|---|---|---|
| [CAP-sharing-and-collaboration-01](#cap-sharing-and-collaboration-01) | Share a chat as a public snapshot link | yes | yes | partly built | seen working by a person |
| [CAP-sharing-and-collaboration-02](#cap-sharing-and-collaboration-02) | Update a shared snapshot | yes | yes | built | seen working by a person |
| [CAP-sharing-and-collaboration-03](#cap-sharing-and-collaboration-03) | Revoke a link and manage all shared links | yes | yes | built | seen working by a person |
| [CAP-sharing-and-collaboration-04](#cap-sharing-and-collaboration-04) | Share a chat with specific people by email | yes | unknown | not built | not verified |
| [CAP-sharing-and-collaboration-05](#cap-sharing-and-collaboration-05) | Share a chat with the whole workspace | yes | yes | partly built | not verified |
| [CAP-sharing-and-collaboration-06](#cap-sharing-and-collaboration-06) | What a shared chat hides | yes | yes | built | seen failing by a person |
| [CAP-sharing-and-collaboration-07](#cap-sharing-and-collaboration-07) | Continue a shared chat as your own | unknown | yes | partly built | code inspected only |
| [CAP-sharing-and-collaboration-08](#cap-sharing-and-collaboration-08) | Share a single reply | unknown | yes | partly built | not verified |
| [CAP-sharing-and-collaboration-09](#cap-sharing-and-collaboration-09) | Link lifetime and expiry | unknown | yes | partly built | seen working by a person |
| [CAP-sharing-and-collaboration-10](#cap-sharing-and-collaboration-10) | Admin sharing controls | yes | yes | partly built | not verified |
| [CAP-sharing-and-collaboration-11](#cap-sharing-and-collaboration-11) | Artifact sharing: private by default, audiences by plan | yes | partly | built | code inspected only |
| [CAP-sharing-and-collaboration-12](#cap-sharing-and-collaboration-12) | Artifact roles: view, comment, edit | yes | yes | partly built | not verified |
| [CAP-sharing-and-collaboration-13](#cap-sharing-and-collaboration-13) | Invite people to an artifact by email | yes | yes | built | not verified |
| [CAP-sharing-and-collaboration-14](#cap-sharing-and-collaboration-14) | Comments on shared artifacts and agent replies | yes | yes | partly built | not verified |
| [CAP-sharing-and-collaboration-15](#cap-sharing-and-collaboration-15) | Embed a published artifact | yes | unknown | not built | not verified |
| [CAP-sharing-and-collaboration-16](#cap-sharing-and-collaboration-16) | Share a project with view or edit roles | yes | yes | partly built | not verified |
| [CAP-sharing-and-collaboration-17](#cap-sharing-and-collaboration-17) | Share a project with a group | yes | yes | not built | not verified |
| [CAP-sharing-and-collaboration-18](#cap-sharing-and-collaboration-18) | Project link for anyone invited, with collaborator caps | unknown | yes | not built | not verified |
| [CAP-sharing-and-collaboration-19](#cap-sharing-and-collaboration-19) | Chats inside a shared project: branch, leave and keep a copy | unknown | yes | not built | not verified |
| [CAP-sharing-and-collaboration-20](#cap-sharing-and-collaboration-20) | Share Library files and folders | unknown | yes | not built | not verified |
| [CAP-sharing-and-collaboration-21](#cap-sharing-and-collaboration-21) | Live co-editing of docs, pages, sheets and slides | yes | yes | not built | not verified |
| [CAP-sharing-and-collaboration-22](#cap-sharing-and-collaboration-22) | Live whiteboard with follow mode | yes | unknown | not built | not verified |
| [CAP-sharing-and-collaboration-23](#cap-sharing-and-collaboration-23) | Teams and shared Spaces | partly | yes | not built | not verified |
| [CAP-sharing-and-collaboration-24](#cap-sharing-and-collaboration-24) | Hosted sites: audience, outside viewers, editors | partly | yes | partly built | not verified |
| [CAP-sharing-and-collaboration-25](#cap-sharing-and-collaboration-25) | Share a scheduled task | unknown | yes | partly built | not verified |
| [CAP-sharing-and-collaboration-26](#cap-sharing-and-collaboration-26) | Share agents, plugins and skills | yes | yes | partly built | not verified |
| [CAP-sharing-and-collaboration-27](#cap-sharing-and-collaboration-27) | Share a coding session as a read-only snapshot | yes | yes | partly built | not verified |
| [CAP-sharing-and-collaboration-28](#cap-sharing-and-collaboration-28) | Group chats and mentions of people | unknown | partly | not built | not verified |
| [CAP-sharing-and-collaboration-29](#cap-sharing-and-collaboration-29) | Shareable public profile | unknown | yes | not built | not verified |

## CAP-sharing-and-collaboration-01 Share a chat as a public snapshot link

A person creates a link that shows a frozen copy of a chat, including artifacts. Anyone with the link can read it. Later messages stay private.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/16762437-public-links-for-shared-chats](https://support.claude.com/en/articles/16762437-public-links-for-shared-chats): Anyone with the link can view a view-only snapshot without a Claude account; later messages stay private. Catalogue ch05:59. Plans: Free, Pro, Max, Ultra; not Team or Enterprise (ch05:63). Apps: web.
  - [https://support.claude.com/en/articles/10593882-share-and-unshare-chats](https://support.claude.com/en/articles/10593882-share-and-unshare-chats): Share button on web, desktop, iOS, Android creates the snapshot link (ch01:77). Plans: All plans. Apps: web, desktop, ios, android.
  - [https://support.claude.com/en/articles/16762496-share-a-chat-with-specific-people](https://support.claude.com/en/articles/16762496-share-a-chat-with-specific-people): Creating shares is web only for now; shared chats open on any device (ch05:72). Apps: ios, android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/7925741-sharing-conversations-and-scheduled-tasks-in-chatgpt](https://help.openai.com/en/articles/7925741-sharing-conversations-and-scheduled-tasks-in-chatgpt): Share creates a link to the whole conversation, one response, images or uploaded files; mobile can use it too (oh08:62). Apps: web, ios, android.

**AGI requirement** (inferred; source: competitor parity; docs/product/definition.md:283 lists Shared chats in Privacy settings). A signed-in user on every app that has chat history can create, copy and open a view-only snapshot link of a chat. Creation on phone is allowed. Later messages do not appear in the snapshot.

**With different models, providers and the one subscription.** The snapshot shows the answer text whichever model or provider made it, with its label. Creating a link counts against no model quota but is gated by the AGI Subscription plan rules. Local mode: a Local chat lives only on the device, so sharing it needs an explicit consent step that uploads a copy and names the destination (AGENTS.md section 6). Not found in code whether this step exists.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: built, 1/7/30-day expiry. Mobile: built through shared-links. CLI: lists and revokes, cannot create. Chrome: share by link in side panel. Desktop and VS Code: no separate row found. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S107.11
- Comparison list ids: CP341, WP262; rows without an id: mobile Same row 'Share a chat as a link snapshot'
- Code: `apps/web/features/chat/components/share/ShareConversationDialog.tsx:29`; `apps/web/app/api/share/route.ts:32`; `apps/mobile/src/features/shared-links/shareConversation.ts:19`; `apps/cli/src/lib.rs:1023`; `apps/extension/src/side_panel.ts:12275`

**Gap.** Links always expire within 30 days, while both leaders' links last until unshared. CLI cannot create a link. Behaviour for Local chats not established.

**Acceptance criteria**

1. Create a link on web, open it signed out, and see only that chat with a read-only banner.
2. Send a new message after sharing; the signed-out viewer does not see it.
3. Create a link from a phone app and open it on web.
4. Try to share a chat that was made in Local mode; the app asks for consent and names where the copy goes, or refuses.

**Verification: seen working by a person.** Web scorecard W-14 free and subscribed (2026-11-24): stranger saw only the shared chat, later message stayed out. Seen failing: web-problems W-14 free shows markdown bullets as literal '- ' on the shared page; subscribed shows an Unavailable model badge on a failed turn. Other apps not verified.

## CAP-sharing-and-collaboration-02 Update a shared snapshot

The owner refreshes an existing link so it shows the chat as it is now.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/16762496-share-a-chat-with-specific-people](https://support.claude.com/en/articles/16762496-share-a-chat-with-specific-people): 'Update shared chat' replaces the snapshot with current content for everyone with access (ch05:67). Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/7925741-sharing-conversations-and-scheduled-tasks-in-chatgpt](https://help.openai.com/en/articles/7925741-sharing-conversations-and-scheduled-tasks-in-chatgpt): A personal share is a snapshot; Update link adds later messages. Workspace shares include later messages automatically (oh08:63). Plans: Workspace live behaviour: Business, Enterprise, Edu. Apps: web.

**AGI requirement** (inferred; source: competitor parity). The owner can update a link without changing its address, and the dialog says what viewers will see.

**With different models, providers and the one subscription.** Independent of model. Same plan gate as sharing. Local mode: updating re-uploads Local content, so it repeats the consent step.

**Current implementation, as this trace read it on 2026-11-24: built.** Web: Update link in dialog. Mobile and others: not separately established. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched; rows without an id: web row 'Update a shared link to the latest chat, and revoke it' (Same)
- Code: `apps/web/features/chat/components/share/ShareConversationDialog.tsx:195`

**Gap.** None known on web. Whether workspace links can stay live like ChatGPT's is not established.

**Acceptance criteria**

1. Share, add a message, press Update link; the signed-out viewer sees the new message at the same address.
2. Without pressing Update, the viewer does not see it.

**Verification: seen working by a person.** W-14 scorecard shows Update link offered and the snapshot excluding later messages; pressing Update itself was not recorded in the notes read.

## CAP-sharing-and-collaboration-03 Revoke a link and manage all shared links

The owner turns a link off at once and sees a list of everything shared, with a remove button for each.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/10593882-share-and-unshare-chats](https://support.claude.com/en/articles/10593882-share-and-unshare-chats): Settings > Privacy > Shared chats lists title, date and link with Unshare (ch01:80); setting visibility to Private kills the link (ch01:79). Plans: Free, Pro, Max, Ultra (list). Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/7925741-sharing-conversations-and-scheduled-tasks-in-chatgpt](https://help.openai.com/en/articles/7925741-sharing-conversations-and-scheduled-tasks-in-chatgpt): Settings > Data controls > Shared links > Manage lists conversation and task links, with delete per link or delete all (oh08:66). Apps: web.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md:45 (artifacts: share, revoke); docs/product/definition.md:283 (Shared chats in Privacy settings); AGENTS.md section 9 (irreversible actions ask first)). Revoke is one confirmed action that names what is lost. A Shared links list in Settings shows every link on every app and deleting a chat also kills its links.

**With different models, providers and the one subscription.** No model dependence. Available on every plan including Free. Local mode: nothing to revoke until a copy was uploaded.

**Current implementation, as this trace read it on 2026-11-24: built.** Web: revoke with confirmation and Shared links in Settings. Mobile: settings/shared-links screen. CLI: agi shares lists and revokes. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched; rows without an id: web Same row 'Manage everything you published or shared'
- Code: `apps/web/features/settings/sections/PublishedArtifactsSection.tsx:105`; `apps/mobile/app/(app)/settings/shared-links.tsx`; `apps/cli/src/lib.rs:1263`

**Gap.** Code audit web-D P2: expired links keep a full stored copy and Revoke all leaves copies behind (apps/web/app/api/share/route.ts:818). Revoke dialog is translucent (seen defect).

**Acceptance criteria**

1. Revoke a link; the old address says the conversation is unavailable at once.
2. Press Cancel on the revoke confirmation; the link still works.
3. Delete a chat; its link stops working.
4. Shared links in Settings lists each link and removes one.

**Verification: seen working by a person.** W-14 scorecard free and subscribed: revoke, cancel, second link create and revoke worked. Seen failing: translucent revoke dialog (6-defects W-14 cosmetic).

## CAP-sharing-and-collaboration-04 Share a chat with specific people by email

The owner invites named people. Only they, signed in, can open the snapshot. Invites expire if unused.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/16762496-share-a-chat-with-specific-people](https://support.claude.com/en/articles/16762496-share-a-chat-with-specific-people): Invites go to specific emails, view-only; invitees without an account sign up free; pending invites expire after 30 days; recipients cannot reply or download files (ch05:64-66). Plans: Free, Pro, Max, Ultra, Team, Enterprise. Apps: web.
- **ChatGPT: unknown**
  - [https://help.openai.com/en/articles/7925741-sharing-conversations-and-scheduled-tasks-in-chatgpt](https://help.openai.com/en/articles/7925741-sharing-conversations-and-scheduled-tasks-in-chatgpt): Shared links have no configurable expiry or recipient list (oh08:68). Catalogue shows no named-person chat share. Apps: web.

**AGI requirement** (proposed; source: only one competitor documents it; owner has not decided). Offer chat shares to named people with view-only access, a visible people list, remove and turn-off.

**With different models, providers and the one subscription.** No model dependence. Needs an AGI account for the recipient. Local mode: uploads a copy, so consent applies.

**Current implementation, as this trace read it on 2026-11-24: not built.** Web: chats are public or workspace-wide only; named invites exist for artifacts, not chats. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W350
- Code: `apps/web/app/api/share/route.ts:77`

**Gap.** No named-person chat share on any app.

**Acceptance criteria**

1. Invite an email; only that signed-in account opens the chat.
2. Remove the person; their next open is refused.
3. An unused invite stops working after its stated time.

**Verification: not verified.** Code reading only (comparison-web.csv W350).

## CAP-sharing-and-collaboration-05 Share a chat with the whole workspace

The owner limits a link to signed-in members of the same organization.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/16762496-share-a-chat-with-specific-people](https://support.claude.com/en/articles/16762496-share-a-chat-with-specific-people): On Team/Enterprise choose 'Anyone at [org]' so signed-in members with the link can view, unless an admin disables it (ch05:69). Plans: Team, Enterprise. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8798634-managing-data-sharing-and-privacy-in-chatgpt-business](https://help.openai.com/en/articles/8798634-managing-data-sharing-and-privacy-in-chatgpt-business): Business members create links viewable only by workspace members; outsiders are redirected (oh09:99). Plans: Business. Apps: web.

**AGI requirement** (inferred; source: competitor parity). A workspace audience option exists on chat links, works even when public links are off for that workspace, and shows who can read it.

**With different models, providers and the one subscription.** Seats and workspace come from the AGI Subscription Team plan. Local mode: consent as above.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: audience switch to workspace exists. Phone and CLI not established. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: WP263
- Code: `apps/web/features/chat/components/share/ShareConversationDialog.tsx:180`; `apps/web/app/api/share/route.ts:578`

**Gap.** Code audit web-D P2: a workspace with Public sharing off cannot share a chat even to its own members. Needs a workspace.

**Acceptance criteria**

1. With public links off, create a workspace-only link; a member opens it and an outsider does not.
2. The dialog states who can read the link.

**Verification: not verified.** Not in W-14 notes; code and audit rows only.

## CAP-sharing-and-collaboration-06 What a shared chat hides

A shared page leaves out attached files, raw tool data and secrets, and is not meant for search engines.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/10593882-share-and-unshare-chats](https://support.claude.com/en/articles/10593882-share-and-unshare-chats): Attached files and raw MCP tool-call data are not in the snapshot; Personal Finance figures can appear on public links (ch01:78, ch05:62). Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/7925741-sharing-conversations-and-scheduled-tasks-in-chatgpt](https://help.openai.com/en/articles/7925741-sharing-conversations-and-scheduled-tasks-in-chatgpt): Pages are not meant for search indexing; links have no expiry (oh08:68). Apps: web.

**AGI requirement** (inferred; source: competitor parity; AGENTS.md section 6 (minimum data)). Snapshots strip files, tool traces, local paths and known secret patterns, and the dialog tells the owner what viewers will and will not see.

**With different models, providers and the one subscription.** Applies to output from any model or provider. Tool output from connectors must be hidden. Local mode: local file paths are stripped.

**Current implementation, as this trace read it on 2026-11-24: built.** Web: stripping of local paths and tool data in the share route. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched; rows without an id: web Same row 'What a shared chat hides'
- Code: `apps/web/app/api/share/route.ts:96`; `apps/web/app/api/share/route.ts:114`; `apps/web/app/share/[token]/page.tsx:85`

**Gap.** Shared page renders markdown as literal text (seen defect).

**Acceptance criteria**

1. Share a chat with a file and a tool call; the viewer sees neither.
2. The page carries a no-index signal.
3. Bullet lists render as bullets on the shared page.

**Verification: seen failing by a person.** 6-defects W-14 free: shared page shows '- ' lines instead of bullets. Hiding itself not recorded as tested.

## CAP-sharing-and-collaboration-07 Continue a shared chat as your own

A viewer copies a shared chat into their account to keep working.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - [https://support.claude.com/en/articles/16762496-share-a-chat-with-specific-people](https://support.claude.com/en/articles/16762496-share-a-chat-with-specific-people): Recipients of a named share cannot reply, copy to their account or download files (ch05:65). Public-link behaviour not shown. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): May 24, 2023: recipients can view a shared conversation or copy it into their own chats to continue (oh08:393). Apps: web.

**AGI requirement** (inferred; source: competitor parity; ledger S107.11). A signed-in viewer of a public snapshot can copy it into their own account.

**With different models, providers and the one subscription.** The copy continues on the viewer's chosen model; their own plan pays for new turns. Local mode: the copy starts as Cloud unless the viewer picks Local.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: built. Mobile: missing in ledger. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S107.11
- Comparison list ids: none matched; rows without an id: web Same row 'Continue a shared chat as your own'
- Code: `apps/web/app/share/[token]/page.tsx:9`; `apps/web/app/chat/from-share/[token]/page.tsx:5`

**Gap.** Mobile cannot copy a shared chat.

**Acceptance criteria**

1. Open a link signed in and press continue; a new chat holds the messages.
2. Signed out, continue asks for sign-in then returns.

**Verification: code inspected only.** Ledger S107.11 web done; not in scorecards.

## CAP-sharing-and-collaboration-08 Share a single reply

The user shares one answer, image or file by link instead of the whole chat.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/7925741-sharing-conversations-and-scheduled-tasks-in-chatgpt](https://help.openai.com/en/articles/7925741-sharing-conversations-and-scheduled-tasks-in-chatgpt): Share creates a link to the whole conversation, one assistant response, images or uploaded files (oh08:62). Apps: web, ios, android.

**AGI requirement** (proposed; source: one competitor documents it). A reply menu offers a link to that one reply.

**With different models, providers and the one subscription.** Label shows the model route. Local mode: consent applies.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and mobile send the answer text to the system share sheet or clipboard; no link. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: MP104, WP269
- Code: `apps/web/features/chat/components/messages/MessageBubble.tsx:4017`; `apps/web/features/chat/components/messages/MessageBubble.tsx:2287`

**Gap.** No link to one reply.

**Acceptance criteria**

1. From a reply's menu create a link; it shows only that reply.

**Verification: not verified.** Code reading only.

## CAP-sharing-and-collaboration-09 Link lifetime and expiry

How long a shared link lasts and whether the owner picks it.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - [https://support.claude.com/en/articles/16762496-share-a-chat-with-specific-people](https://support.claude.com/en/articles/16762496-share-a-chat-with-specific-people): Pending invites expire after 30 days (ch05:66). Chat link lifetime not stated in catalogue. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/7925741-sharing-conversations-and-scheduled-tasks-in-chatgpt](https://help.openai.com/en/articles/7925741-sharing-conversations-and-scheduled-tasks-in-chatgpt): Shared links have no configurable expiry; they last until unshared (oh08:68). Apps: web.

**AGI requirement** (proposed; source: AGI offers 1, 7 or 30 days; owner has not decided on no-expiry). Owner chooses an expiry or no expiry for each link.

**With different models, providers and the one subscription.** Storage cost of kept snapshots is a plan matter under the one subscription system.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: 1, 7 or 30 days only. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: WP262
- Code: `apps/web/features/chat/components/share/ShareConversationDialog.tsx:28`

**Gap.** No no-expiry option. Stored copies outlive expiry (audit web-D P2).

**Acceptance criteria**

1. Pick each expiry; the dialog shows the date.
2. After expiry the link is unavailable and the stored copy is gone.

**Verification: seen working by a person.** W-14 scorecard: 7-day link, 1/7/30 offered, expiry text shown on the shared page.

## CAP-sharing-and-collaboration-10 Admin sharing controls

Workspace admins turn sharing on or off and limit it to the org or to outside people.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/16762496-share-a-chat-with-specific-people](https://support.claude.com/en/articles/16762496-share-a-chat-with-specific-people): Org settings > Data and privacy > Sharing: master toggle, org-wide sharing (default on), external sharing by email (ch05:70). Plans: Team, Enterprise. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8411955-managing-workspace-settings-in-chatgpt-enterprise](https://help.openai.com/en/articles/8411955-managing-workspace-settings-in-chatgpt-enterprise): Admin control to share chats and scheduled tasks in the workspace; off blocks task links (oh09:25). Plans: Enterprise. Apps: web.
  - [https://learn.chatgpt.com/docs/enterprise/higher-education-roles-and-permissions.md](https://learn.chatgpt.com/docs/enterprise/higher-education-roles-and-permissions.md): Role toggles for sharing chats, files, pages, folders, spaces and workspace links (cl04:15, cl04:26). Plans: Edu. Apps: web.

**AGI requirement** (inferred; source: competitor parity; docs/product/requirements.md:850 lists Team/admin console as a later suite requirement). Admins control chat, artifact, project and site sharing per workspace and per role, and members see why a Share option is off.

**With different models, providers and the one subscription.** Team plan feature in the one subscription system. Local mode: admin policy also blocks Local-to-cloud shares.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: OrganizationSharingSection and WorkspaceFeatureControls exist. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched; rows without an id: web row 'Share a project with a group' notes OrganizationSharingSection
- Code: `apps/web/features/settings/sections/OrganizationSharingSection.tsx:196`

**Gap.** Per-role and per-feature scope not established.

**Acceptance criteria**

1. Turn public sharing off; members cannot create public links and see a clear message.
2. Existing shares keep working or are revoked as the dialog says.

**Verification: not verified.** Code reading only.

## CAP-sharing-and-collaboration-11 Artifact sharing: private by default, audiences by plan

Artifacts start private. The owner publishes to a link, to the org or to named people.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/9547008-share-artifacts](https://support.claude.com/en/articles/9547008-share-artifacts): Private by default; Share with link (Pro and up), org-wide or named people (Team, Enterprise); legacy publish gives a public link usable without an account (ch06:193, ch06:197). Plans: Free to Enterprise, varying. Apps: web, desktop.
  - [https://code.claude.com/docs/en/artifacts.md](https://code.claude.com/docs/en/artifacts.md): Claude Code view: new artifacts private; public links need no sign-in and are off until an Owner enables them (cc01:171). Separate coding tool, same claude.ai artifacts. Plans: Pro to Enterprise. Apps: web.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes](https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes): Canvas assets share like a conversation (oh01:322). Plans: Enterprise, Edu. Apps: web.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md:45; ledger S26.31 and S26.32). Every artifact shows private, workspace or public state, and the owner picks the audience and can take it down.

**With different models, providers and the one subscription.** Independent of model. Public hosting is a server feature, gated by plan. Local mode: a Local artifact stays on the device until the owner publishes with consent.

**Current implementation, as this trace read it on 2026-11-24: built.** Web, desktop, CLI: share controls done. Mobile: state shown, controls partial. VS Code: state shown. Chrome: unverified. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S26.16, S26.31, S26.32
- Comparison list ids: MP102; rows without an id: web Same row 'Publish an artifact to a link: public, workspace or invited people'
- Code: `packages/contracts/cloud-contracts/src/artifact-index.ts:54`; `apps/web/app/shared-artifact/[token]/InviteOnlyAr` (not found); `apps/mobile/app/(app)/settings/shared-links.tsx`

**Gap.** Audit web-D P2: a suspended owner's content stays readable through invited and workspace links (apps/web/lib/services/published-site-viewer-service.ts:148).

**Acceptance criteria**

1. New artifact shows Private.
2. Publish to each audience; a matching outsider opens it and a non-matching one is refused.
3. Take it down; the link fails.

**Verification: code inspected only.** Ledger and comparison status; no scorecard covers artifact publish.

## CAP-sharing-and-collaboration-12 Artifact roles: view, comment, edit

Invited people hold a role on an artifact: view, comment or edit.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/9547008-share-artifacts](https://support.claude.com/en/articles/9547008-share-artifacts): Access levels Can view, Commenter, Can edit; editors cannot manage sharing (ch06:194). Plans: Pro to Enterprise. Apps: web, desktop.
  - [https://code.claude.com/docs/en/artifacts.md](https://code.claude.com/docs/en/artifacts.md): Team and Enterprise viewers can be promoted to editors who republish through Claude; stale publishes are refused and merged (cc01:174). Plans: Team, Enterprise. Apps: web, cli.
- **ChatGPT: yes**
  - [https://learn.chatgpt.com/docs/space/collaboration.md](https://learn.chatgpt.com/docs/space/collaboration.md): Pages and spaces share with View, Comment or Edit roles (cl07:67). Apps: web, desktop.

**AGI requirement** (inferred; source: competitor parity; ledger S23.22 for project roles). Artifacts support view, comment and edit roles enforced on the server, and stale edits are refused rather than overwritten.

**With different models, providers and the one subscription.** Assistant edits in a shared artifact run under the requester's permissions and the requester's model route and quota. Local mode: not applicable until published.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: invited viewers are view-only. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S26.16
- Comparison list ids: W355, WP266
- Code: `apps/web/app/api/artifacts/publish/[token]/viewers/route.ts:43`; `apps/web/features/sites/components/SiteViewersEditor.tsx`

**Gap.** No commenter or editor role.

**Acceptance criteria**

1. Invite a commenter; they can comment and cannot edit.
2. Invite an editor; they save a new version; a stale save is refused with a clear message.

**Verification: not verified.** Code reading only.

## CAP-sharing-and-collaboration-13 Invite people to an artifact by email

The owner invites named people; the invitee must sign in with that email.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/9547008-share-artifacts](https://support.claude.com/en/articles/9547008-share-artifacts): Owner invites by email (beta); invitee needs a Claude account with that address (ch06:195). Plans: Pro to Enterprise. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://learn.chatgpt.com/docs/sites/publishing-and-sharing.md](https://learn.chatgpt.com/docs/sites/publishing-and-sharing.md): Share > Only those invited lets you add outside emails as Viewers who sign in with the invited account (cl07:56). This is for Sites, not chat artifacts. Plans: Plus, Pro, Business, Enterprise. Apps: web, desktop.

**AGI requirement** (inferred; source: competitor parity). Owner invites named people, sees who has access, and removes them.

**With different models, providers and the one subscription.** Recipient needs an AGI account; viewing costs the owner no model quota. Local mode: publish consent applies.

**Current implementation, as this trace read it on 2026-11-24: built.** Web: invite-only artifact and site viewers. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S26.31
- Comparison list ids: none matched; rows without an id: web row 'Publish an artifact to a link'
- Code: `apps/web/app/api/artifacts/publish/[token]/viewers/route.ts:43`

**Gap.** None known for view role.

**Acceptance criteria**

1. Invite an email; only that account opens it.
2. Remove the person; access ends at once.

**Verification: not verified.** Code reading only.

## CAP-sharing-and-collaboration-14 Comments on shared artifacts and agent replies

Viewers comment on a shared artifact. The assistant reads and answers a comment thread.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/artifacts.md](https://code.claude.com/docs/en/artifacts.md): Org viewers comment; Send to Claude or @claude activates a thread for Claude to read, reply or resolve; public-link viewers cannot comment. A watching session replies, capped at 60 per hour (cc01:176, cc01:177). This page is Claude Code; the artifacts are claude.ai pages. Plans: Team, Enterprise (comments); Pro and up (auto-reply). Apps: web, cli.
- **ChatGPT: yes**
  - [https://learn.chatgpt.com/docs/space/pages.md](https://learn.chatgpt.com/docs/space/pages.md): Real-time co-editing, comments and @mentions on Pages (cl07:78). Apps: web, desktop.
  - [https://help.openai.com/en/articles/20001605-creating-and-collaborating-on-slides-in-ch](https://help.openai.com/en/articles/20001605-creating-and-collaborating-on-slides-in-ch) (this address is not in the saved catalogue; treat as unverified): Slides editors co-edit with shared comments and @mentions; @mention ChatGPT to request edits (oh07:78). Plans: Plus, Pro, Business, Enterprise. Apps: web, desktop.

**AGI requirement** (stated requirement; source: ledger S26.18 inline comments and S26.19 pending edit-request collection). Viewers with comment role leave comments on an artifact. The author or assistant can answer or turn comments into one batch of requested changes.

**With different models, providers and the one subscription.** The assistant's reply runs on the author's chosen model and counts against the author's quota and rate cap. Local mode: a Local artifact has no other viewers.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: comments route and select-an-element change requests for the author. CLI: does not watch comments. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S26.18, S26.19
- Comparison list ids: C609, WP267, WP270
- Code: `apps/web/app/api/artifacts/[artifactId]/comments/route.ts`; `apps/web/features/chat/components/artifacts/ArtifactEditRequestLayer.tsx:13`

**Gap.** Viewer comments with an assistant thread not found; inline comments missing on all apps.

**Acceptance criteria**

1. A commenter adds a comment; the owner sees it.
2. The assistant answers an activated thread.
3. Public-link viewers cannot comment.

**Verification: not verified.** Ledger says missing on every app; no scorecard.

## CAP-sharing-and-collaboration-15 Embed a published artifact

The owner copies an embed snippet that shows a published artifact on another site.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12138966-release-notes](https://support.claude.com/en/articles/12138966-release-notes): Free, Pro and Max users can generate an embed code for shared published artifacts (ch01:319). Plans: Free, Pro, Max. Apps: web.
  - [https://support.claude.com/en/articles/9547008-share-artifacts](https://support.claude.com/en/articles/9547008-share-artifacts): Legacy publish has an Allowed domains embed code (ch06:197). Apps: web, desktop.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: only Claude documents it). Owner can copy an embed snippet limited to allowed domains.

**With different models, providers and the one subscription.** Hosting is a server feature, gated by plan. Local mode: not applicable until published.

**Current implementation, as this trace read it on 2026-11-24: not built.** Web: link only. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W344
- Code: `searched: embed code in apps/web/features/chat/components/artifacts` (not found)

**Gap.** No embed code.

**Acceptance criteria**

1. Copy snippet; it shows the artifact only on allowed domains.

**Verification: not verified.** Code searched in comparison.

## CAP-sharing-and-collaboration-16 Share a project with view or edit roles

The owner shares a project with named people or the organization with Can view or Can edit.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/9517075-what-are-projects](https://support.claude.com/en/articles/9517075-what-are-projects): Creators share by email, bulk list or the whole org; Can edit changes instructions and knowledge (ch06:181). Plans: Team, Enterprise. Apps: web.
  - [https://support.claude.com/en/articles/9519189-manage-project-visibility-and-sharing](https://support.claude.com/en/articles/9519189-manage-project-visibility-and-sharing): General access: Everyone at org or Only people invited (ch06:187). Plans: Team, Enterprise. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10169521-projects-in-chatgpt](https://help.openai.com/en/articles/10169521-projects-in-chatgpt): Invite individuals (Business and up also groups) with chat or edit access, or share links (oh01:131). Plans: Free, Go, Plus, Pro, Business, Enterprise. Apps: web, ios, android.

**AGI requirement** (stated requirement; source: ledger S23.21, S23.22, S23.23, S23.24, S23.34; docs/product/requirements.md:850 defers full collaboration to later suite work). Project owners share with named people at view or edit, the server enforces roles, owner can remove people, and the project says what is shared (instructions, files) and what stays personal (chats, memory).

**With different models, providers and the one subscription.** Each member's chats use their own model choice and quota. Members get shared instructions and files only. Local mode: a project with Local files cannot be shared without consent.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and desktop: done. Mobile: owner can share to workspace or invited people with view or edit. CLI, VS Code, Chrome: missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S23.21, S23.22, S23.23, S23.24, S23.34
- Comparison list ids: MP103, WP265
- Code: `apps/web/features/projects/components/ProjectSharingControls.tsx:42`; `apps/web/features/projects/components/ProjectShareDialog.tsx:79`; `apps/mobile/src/features/projects/projectSharing.ts:12`

**Gap.** A single account with no workspace cannot share. Audit web-D P1: a member cannot chat inside a shared project because chat creation accepts only owned projects (apps/web/app/api/chat/conversations/route.ts:236). Members who are Viewers cannot be given edit.

**Acceptance criteria**

1. Share with Can view; the member reads but cannot edit.
2. Share with Can edit; the member edits instructions.
3. A member starts a chat inside the shared project and it uses the project's instructions.
4. Remove the member; the project disappears from their list.

**Verification: not verified.** No project scorecard row; audit lists a P1 break.

## CAP-sharing-and-collaboration-17 Share a project with a group

Access follows group membership instead of named people.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/9519189-manage-project-visibility-and-sharing](https://support.claude.com/en/articles/9519189-manage-project-visibility-and-sharing): Share to a group so access follows membership; an admin must enable it; Enterprise beta (ch06:188). Plans: Enterprise. Apps: web.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10169521-projects-in-chatgpt](https://help.openai.com/en/articles/10169521-projects-in-chatgpt): Business and up can invite groups; the higher of group and individual access wins (oh01:131). Plans: Business, Enterprise. Apps: web.

**AGI requirement** (inferred; source: competitor parity). Projects, agents and plugins share with workspace groups.

**With different models, providers and the one subscription.** Team plan feature; group member count follows seats in the one subscription system.

**Current implementation, as this trace read it on 2026-11-24: not built.** Web: whole workspace only. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W341
- Code: `apps/web/features/settings/sections/OrganizationSharingSection.tsx:225`

**Gap.** No group target.

**Acceptance criteria**

1. Share to a group; a new member of the group gains access; a removed one loses it.

**Verification: not verified.** Code reading only.

## CAP-sharing-and-collaboration-18 Project link for anyone invited, with collaborator caps

The owner picks Only those invited or Anyone with a link (signed in). Collaborator counts are capped by plan.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10169521-projects-in-chatgpt](https://help.openai.com/en/articles/10169521-projects-in-chatgpt): Owner picks Only those invited or Anyone with a link (logged-in users); caps such as Pro 100 collaborators (oh01:132). Plans: Free to Enterprise, caps vary. Apps: web, ios, android.

**AGI requirement** (proposed; source: only ChatGPT documents it; owner has not decided). Link-based project sharing with a visible collaborator cap per plan.

**With different models, providers and the one subscription.** Caps are plan configuration in the one subscription system, never constants.

**Current implementation, as this trace read it on 2026-11-24: not built.** Web and mobile: workspace members and invited workspace people only. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: M203, W351
- Code: `apps/web/features/projects/components/ProjectShareDialog.tsx:60`

**Gap.** No anyone-with-link option, no cap.

**Acceptance criteria**

1. Owner sets anyone-with-link; a signed-in outsider joins.
2. At the cap the next join is refused with the cap shown.

**Verification: not verified.** Code searched.

## CAP-sharing-and-collaboration-19 Chats inside a shared project: branch, leave and keep a copy

Members see who started a chat, branch another's chat, and keep a copy of their own chats when they leave.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - [https://support.claude.com/en/articles/9519189-manage-project-visibility-and-sharing](https://support.claude.com/en/articles/9519189-manage-project-visibility-and-sharing): Chats inside a project follow the project's visibility setting (ch06:187). Plans: Team, Enterprise.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10169521-projects-in-chatgpt](https://help.openai.com/en/articles/10169521-projects-in-chatgpt): Members open another's chat and branch it without altering the original; leaving offers a copy into a new project; a link to one chat shows only that chat (oh01:133-135). Apps: web, ios, android.

**AGI requirement** (proposed; source: only ChatGPT documents it). Members can start chats in a shared project, branch others' chats, leave and keep a copy.

**With different models, providers and the one subscription.** Each member's turns bill that member. Branches use the branching member's model.

**Current implementation, as this trace read it on 2026-11-24: not built.** Web: shared files and instructions only. Mobile: recipients can only hide a sharer. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S23.35
- Comparison list ids: M199, W342, W346
- Code: `apps/mobile/src/features/projects/hiddenSharers.ts:40` (not found)

**Gap.** No branch, leave-and-copy. Project activity history missing everywhere (S23.35).

**Acceptance criteria**

1. Leave a shared project; a copy of my chats exists.
2. Branch a teammate's chat; the original is unchanged.

**Verification: not verified.** Code searched.

## CAP-sharing-and-collaboration-20 Share Library files and folders

Files and folders in the user's library are shared as Viewer or Editor.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001052-using-library-to-manage-files-in-chatgpt](https://help.openai.com/en/articles/20001052-using-library-to-manage-files-in-chatgpt): Share files and folders with specific people or the workspace as Viewer or Editor (oh03:118). Plans: Enterprise, Edu (release notes oh01:176). Apps: web, ios, android.

**AGI requirement** (proposed; source: only ChatGPT documents it). Library items share with roles and revoke.

**With different models, providers and the one subscription.** Files are readable by any model; storage counts to the owner's plan quota.

**Current implementation, as this trace read it on 2026-11-24: not built.** Web: only artifacts, sites, projects and agents share. Mobile: only the system share sheet. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: M200, W352
- Code: `apps/mobile/app/(app)/library/index.tsx:49`

**Gap.** No library sharing.

**Acceptance criteria**

1. Share a file as Viewer; the recipient opens but cannot change it.

**Verification: not verified.** Code searched.

## CAP-sharing-and-collaboration-21 Live co-editing of docs, pages, sheets and slides

Several people edit one document at once with the assistant, with presence and comments.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/16923645-get-started-with-claude-docs](https://support.claude.com/en/articles/16923645-get-started-with-claude-docs): Editors work simultaneously with Claude and each other; viewer, commenter, editor levels (ch05:91-92). Plans: All plans. Apps: web, desktop.
  - [https://support.claude.com/en/articles/18324300-get-started-with-claude-sheets](https://support.claude.com/en/articles/18324300-get-started-with-claude-sheets): Share with Can edit so others work in the same cells live (ch06:23). Plans: Pro to Enterprise. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001549-ge](https://help.openai.com/en/articles/20001549-ge) (this address is not in the saved catalogue; treat as unverified): Share a page or space with view or edit rights; editors collaborate live; subpages inherit access; no public links (oh07:41). Plans: Plus, Pro, Business, Enterprise. Apps: web, desktop, ios, android.

**AGI requirement** (proposed; source: competitor parity; owner has not decided whether to match). Documents and sheets support live multi-person editing with presence, or at minimum safe turn-taking with conflict messages.

**With different models, providers and the one subscription.** Assistant turns in a shared document use the requester's model and quota. Local mode: co-editing needs a server, so a Local document must be published first.

**Current implementation, as this trace read it on 2026-11-24: not built.** Web: one person edits an artifact at a time. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: M202, W340, WP270
- Code: `searched: co-edit, collaborative, presence, yjs, crdt in apps/web/features` (not found)

**Gap.** No shared live editing or presence.

**Acceptance criteria**

1. Two accounts edit one document and see each other's changes.
2. Two simultaneous saves never silently lose text.

**Verification: not verified.** Code searched.

## CAP-sharing-and-collaboration-22 Live whiteboard with follow mode

Everyone draws on one canvas and can follow a teammate's view.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/18324319-get-started-with-](https://support.claude.com/en/articles/18324319-get-started-with-) (this address is not in the saved catalogue; treat as unverified): Everyone edits live and can follow a teammate's view; Share invites people including outside the organization (ch06:31). Plans: Pro to Enterprise. Apps: web, desktop, ios, android.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: only Claude documents it). Not decided.

**With different models, providers and the one subscription.** Same as co-editing.

**Current implementation, as this trace read it on 2026-11-24: not built.** Web and mobile: no whiteboard. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: M201, W347
- Code: `searched: whiteboard in apps/web/features` (not found)

**Gap.** Feature absent.

**Acceptance criteria**

1. Two people draw at once and one follows the other.

**Verification: not verified.** Code searched.

## CAP-sharing-and-collaboration-23 Teams and shared Spaces

A team groups coworkers so a Page, Space or task is shared once with the team. A Space holds shared files and Pages.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://code.claude.com/docs/en/claude-projects.md](https://code.claude.com/docs/en/claude-projects.md): Claude Tag is team Slack Claude where everyone in a channel steers shared work; Projects are single-user on some plans (cc03:67). Claude Code docs, not the chat product. Plans: Team, Enterprise.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001541-teams-in-chatgpt](https://help.openai.com/en/articles/20001541-teams-in-chatgpt): A team groups coworkers so a page or Space is shared once; members invite coworkers or copy a join link (oh07:1, oh07:6). Plans: Business, Enterprise. Apps: web.
  - [https://learn.chatgpt.com/docs/enterprise/teams.md](https://learn.chatgpt.com/docs/enterprise/teams.md): Created from Settings > Teams; invites, join links, ownership (cl04:93-94). Plans: Enterprise. Apps: web.
  - [https://chatgpt.com/pricing](https://chatgpt.com/pricing): ChatGPT Space is available on Pro among individual plans (cl08-pr01:37). Plans: Pro, Business, Enterprise. Apps: web.

**AGI requirement** (proposed; source: ChatGPT only; docs/product/requirements.md:850 defers collaboration and Team/admin console). Not decided. If built, a team object owns shared items and members keep personal chats and memory private.

**With different models, providers and the one subscription.** Seats and team size come from the AGI Subscription Team plan; each member's turns bill their own quota.

**Current implementation, as this trace read it on 2026-11-24: not built.** Web: groups and roles exist; invitation acceptance only for teams. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: M202, W358
- Code: `apps/web/features/teams/components`

**Gap.** No team object, no Space or Page.

**Acceptance criteria**

1. Create a team, add two people, share an item once with the team, and a new member sees it.

**Verification: not verified.** Code searched.

## CAP-sharing-and-collaboration-24 Hosted sites: audience, outside viewers, editors

Pages the assistant builds are hosted. The owner picks who sees them and who can edit.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/14604416-get-started-with-claude-design](https://support.claude.com/en/articles/14604416-get-started-with-claude-design): Design sharing is private by default with view, comment or edit; settings cannot be changed on iOS or Android (ch04:44). Apps: web, ios, android.
  - [https://support.claude.com/en/articles/14729249-use-live-artifacts-in-claude-co](https://support.claude.com/en/articles/14729249-use-live-artifacts-in-claude-co) (this address is not in the saved catalogue; treat as unverified): Live artifact sharing stays within the org; no public links (ch04:78). Plans: Team, Enterprise.
- **ChatGPT: yes**
  - [https://learn.chatgpt.com/docs/sites/publishing-and-sharing.md](https://learn.chatgpt.com/docs/sites/publishing-and-sharing.md): New Sites limited to owner and admins; options include selected users, groups, invited outside viewers, workspace or public; owners promote members to Can edit (cl07:55-57). Plans: Plus, Pro, Business, Enterprise. Apps: web, desktop.
  - [https://help.openai.com/en/articles/20001339-creating-and-using-chatgpt-sites](https://help.openai.com/en/articles/20001339-creating-and-using-chatgpt-sites): Site URL, owner transfer, take down (oh05:122). Apps: web, desktop.

**AGI requirement** (stated requirement; source: ledger S26.31, S107.05; docs/product/experience-contract.md:45). Sites have an audience choice, outside viewers by email, and a stated owner for each.

**With different models, providers and the one subscription.** Hosting use is plan-limited. Visitors consume no model quota.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: audiences and invited viewers exist; editors and ownership transfer missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S107.05, S26.31
- Comparison list ids: W355, W356
- Code: `apps/web/features/sites/components/SiteViewersEditor.tsx`; `apps/web/features/sites/components/SiteDetail.tsx`

**Gap.** No site editor role, no owner transfer. Public gallery missing on mobile.

**Acceptance criteria**

1. Publish with each audience.
2. Invite an outside viewer; they sign in with that email.
3. An editor publishes an update to the same address.

**Verification: not verified.** Code reading only.

## CAP-sharing-and-collaboration-25 Share a scheduled task

A link shares a task's title, instructions and schedule without credentials. The recipient makes their own copy.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt](https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt): Active or paused tasks can be shared as a snapshot without chat history; personal links open to anyone, workspace links only to members (oh01:57-58). Plans: Free to Enterprise. Apps: web, ios, android.
  - [https://help.openai.com/en/articles/11145903-connecting-github-to-chatgpt](https://help.openai.com/en/articles/11145903-connecting-github-to-chatgpt): Shared task links expose instructions, not credentials; recipients connect their own account (oh02:31). Apps: web.

**AGI requirement** (inferred; source: competitor parity). A shared schedule exposes instructions only; recipients bring their own connections.

**With different models, providers and the one subscription.** The recipient's run uses their model and quota. Local mode: a Local schedule's device-only tools do not travel.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: built. Mobile: missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: M204; rows without an id: web Same row 'Share a scheduled task'
- Code: `apps/web/app/share/schedules/[token]/page.tsx:12`; `apps/web/app/api/schedule-shares/[token]/route.ts:11`; `apps/web/lib/services/schedule-share-service.ts:75`

**Gap.** Audit web-D P1: deleting a shared schedule leaves its link working and the owner cannot revoke it. Mobile cannot share.

**Acceptance criteria**

1. Open a schedule link signed in; a copy with no credentials is offered.
2. Delete the schedule; its link stops.

**Verification: not verified.** Code and audit row only.

## CAP-sharing-and-collaboration-26 Share agents, plugins and skills

The owner shares an agent, plugin or skill with people, groups or the workspace, with roles such as Can chat and Can edit.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13837440-use-plugins-in-claude](https://support.claude.com/en/articles/13837440-use-plugins-in-claude): Authors share plugins with named colleagues or groups and publish to the org with review (ch03:43-44). Plans: Team, Enterprise. Apps: web, desktop.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001143-chatgpt-workspace-agents-for-enterprise-and-business](https://help.openai.com/en/articles/20001143-chatgpt-workspace-agents-for-enterprise-and-business): Owner invites Can chat or Can edit; simultaneous edits give a save conflict, not a merge (oh04:23-25). Plans: Business, Enterprise. Apps: web.
  - [https://help.openai.com/en/articles/20001066-skills-in-chatgpt](https://help.openai.com/en/articles/20001066-skills-in-chatgpt): Skills share with people, groups or the workspace (oh03:135). Plans: Business, Enterprise, Edu. Apps: web.

**AGI requirement** (inferred; source: competitor parity; ledger S107.20). Agents, plugins and skills share with the workspace and named people, with a clear role.

**With different models, providers and the one subscription.** A shared agent runs on the user's chosen model and bills the user. Credentials never travel.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web: agent audience and skill/plugin workspace sharing exist; no named people or edit role. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S107.20
- Comparison list ids: DP87, W345, W349, WP264
- Code: `apps/web/features/agents/components/AgentPublishPanel.tsx:217`; `apps/web/features/skills/components/SkillEditorDialog.tsx:52`

**Gap.** No named-person or group sharing; no review queue.

**Acceptance criteria**

1. Share an agent with one person; they can chat but not edit.
2. A skill shared to the workspace appears for members.

**Verification: not verified.** Code reading only.

## CAP-sharing-and-collaboration-27 Share a coding session as a read-only snapshot

A coding session is shared by link as a frozen view of messages and diffs, without tool output or secrets.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/claude-code-on-the-web.md](https://code.claude.com/docs/en/claude-code-on-the-web.md): Cloud sessions are Private or Team (Team, Enterprise) or Private or Public; settings can require repo access and hide the name (cc03:27-28). Session link goes into commit and PR text (cc04:122 at cloud-environments.md). Plans: Pro to Enterprise. Apps: web.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/use-chatgpt.md](https://learn.chatgpt.com/docs/use-chatgpt.md): On macOS desktop, Share or /share uploads a snapshot with no tool output (cl07:96). Plans: All Codex plans. Apps: desktop.
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Aug 20, 2026: personal link, static, known secret patterns redacted (oh08:196). Workspace links only for authenticated members (oh01:193). Apps: desktop, web, cli.

**AGI requirement** (stated requirement; source: docs/product/definition.md:187 (shareable developer-task snapshots set the current floor)). A developer session can be shared as a read-only snapshot with secrets redacted and can be revoked.

**With different models, providers and the one subscription.** Works with any provider route. Local developer sessions are device-only; sharing them is an explicit upload with consent and a visible provider label.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Desktop and web code: read-only snapshot link. CLI: list and revoke only. Mobile: not applicable. CLI lacks session trailer. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: C610, CP341, DP86
- Code: `apps/web/features/code/code-surface.ts:352`; `packages/contracts/types/src/cloud-code.ts:134`; `apps/web/features/code/CloudCodePage.tsx:1341`

**Gap.** CLI cannot create. No require-repo-access or hide-name switches (W335). No session link in commits.

**Acceptance criteria**

1. Share a code session; the viewer sees messages and diffs but no tool output or secrets.
2. Revoke; the link fails.

**Verification: not verified.** Code reading only.

## CAP-sharing-and-collaboration-28 Group chats and mentions of people

Several people chat with the assistant in one thread; typing @ mentions people, agents or files.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/12703475-retiring-group-chats-in-chatgpt](https://help.openai.com/en/articles/12703475-retiring-group-chats-in-chatgpt): Since 2026-07-09 users cannot create or join group chats; existing history stays viewable (oh03:71). Apps: web, ios, android.
  - [https://learn.chatgpt.com/docs/space/pages.md](https://learn.chatgpt.com/docs/space/pages.md): @ mentions people, agents, Space files and chats on Pages (cl07:78). Apps: web, desktop.

**AGI requirement** (proposed; source: competitor evidence only). Not decided. ChatGPT has retired group chats, so parity does not require them.

**With different models, providers and the one subscription.** Shared turns would need one billing owner per message.

**Current implementation, as this trace read it on 2026-11-24: not built.** Web: no group chat. Composer @ lists library files, folders, connectors only. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S106.12
- Comparison list ids: WP268; rows without an id: web 'Live multi-person chat or group chat' (no id)
- Code: `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:644`

**Gap.** No people mentions, no group chat.

**Acceptance criteria**

1. Not set until the owner decides.

**Verification: not verified.** Code searched.

## CAP-sharing-and-collaboration-29 Shareable public profile

A profile page with bio, activity and chosen Sites that the owner can make public.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/20001539-shareable-profiles-in-chatgpt](https://help.openai.com/en/articles/20001539-shareable-profiles-in-chatgpt): Profile at chatgpt.com/profile or /u/username; private by default, shareable; shows activity stats and chosen Sites (oh06:141, oh06:143). Plans: all plans. Apps: web, desktop.

**AGI requirement** (proposed; source: only ChatGPT documents it; ledger S107.08 creator profiles is missing on web, desktop and mobile). Not decided.

**With different models, providers and the one subscription.** Activity stats would come from the one usage ledger and must not reveal plan units.

**Current implementation, as this trace read it on 2026-11-24: not built.** No profile page. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S107.08
- Comparison list ids: W354
- Code: `searched: profile share, /u/ in apps/web/app` (not found)

**Gap.** Absent.

**Acceptance criteria**

1. Not set until the owner decides.

**Verification: not verified.** Code searched.

## Unresolved product choices

Decisions this topic needs from the owner. Nothing here has been decided.

- Whether links may have no expiry (both leaders' chat links last until unshared; AGI caps at 30 days).
- Whether to build named-person chat sharing, which only Claude documents.
- Whether to build live co-editing of documents, sheets and slides, and the whiteboard, and on which apps.
- Whether to build Teams, Spaces and Pages as ChatGPT has them, or keep workspace groups only; the requirements file defers full project collaboration and the team console.
- Whether projects may be shared by link outside a workspace, and what the per-plan collaborator caps are.
- Whether a single account with no workspace may share a project.
- Whether Local chats and files may be shared at all, and what the consent step names.
- Whether to match ChatGPT's shareable profile and Claude's embed code, each documented by one competitor.
- Whether group chats are wanted, given ChatGPT retired them.
- Whether phone apps may create shares (Claude is web only; ChatGPT allows it).

## Could not establish

- Whether any app blocks or warns when sharing a Local-mode chat; the share route was searched for the word but no consent step was found.
- Whether Claude chat links ever expire; the catalogue is silent.
- Whether ChatGPT offers named-person chat shares; the catalogue shows none, so recorded as unknown.
- Desktop, VS Code and Chrome have no sharing rows in the comparison files other than the Chrome chat share and the desktop session snapshot; their other behaviour was not read.
- Artifact, project, schedule and workspace-link sharing have no scorecard row, so none is seen by a person; only chat share on web (W-14) is.
- Scorecard W-14 notes were read in part; the Update link press is not recorded.
- Several saved competitor urls were shortened in the catalogue (for example the Slides, Whiteboard and Pages articles); the quoted urls are as the catalogue shows them.
- Claude Code session sharing detail on iOS, Android and CLI, and the page cloud-environments.md line cc04:122, was taken from the catalogue only.
