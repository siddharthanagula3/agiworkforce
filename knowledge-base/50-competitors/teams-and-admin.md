---
id: "COMP-teams-and-admin"
type: "competitor-trace"
title: "Teams and admin"
competitor_evidence_reviewed: "2026-11-22"
basis: "official competitor pages saved 2026-11-22; AGI status from code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Teams and admin: competitors to requirements

Both leaders document a deep admin layer: roles, SSO, SCIM, audit and compliance feeds, model and connector policy, spend limits, analytics, managed settings. AGI's ledger (code reading only) shows most of these built on Web, which Desktop shows, with Mobile partial. Gaps are required SSO, per-user and group spend limits, dynamic groups, MDM for the apps, support access, and finished data residency. No admin flow was seen working by a person.

**How the products divide this topic.** Evidence reviewed 2026-11-22. Claude (claude.ai) admin pages are on support.claude.com and claude.com: Team and Enterprise plans, Primary Owner, Owner, Admin, User and Enterprise custom roles. Claude Code is a separate coding tool; its admin pages (code.claude.com: managed settings, server-managed settings, self-hosted gateway) connect to Claude chat through the same organisation and admin console, and Team or Enterprise plans. ChatGPT admin pages are on help.openai.com (Business, Enterprise, Edu workspaces plus a tenant Admin Console). Codex is a separate coding tool; pages on learn.chatgpt.com (requirements.toml, access tokens, service accounts, Work admin) show the same workspace console governing ChatGPT, Codex and Work. Plan limits matter: both leaders gate SSO, SCIM, audit export, custom roles and compliance APIs to Enterprise (ChatGPT Business has SSO but no SCIM; Claude Team has JIT). AGI ledger statuses come from code reading. The public Desktop shows the hosted web app, so Desktop status mirrors Web. The surface matrix doc (docs/product) disagrees with the ledger on Desktop administration; code ranks higher, and I did not re-verify per route.

Each capability below is traced: competitor evidence, AGI requirement, current implementation, gap, acceptance criteria, verification. Competitor behaviour comes only from the cited pages, reviewed 2026-11-22.

| ID | Capability | Claude | ChatGPT | AGI today | Verified |
|---|---|---|---|---|---|
| [CAP-teams-and-admin-01](#cap-teams-and-admin-01) | Workspace with members and invitations | yes | yes | built | code inspected only |
| [CAP-teams-and-admin-02](#cap-teams-and-admin-02) | Built-in roles and role changes | yes | yes | built | code inspected only |
| [CAP-teams-and-admin-03](#cap-teams-and-admin-03) | Primary owner and ownership transfer | yes | partly | built | code inspected only |
| [CAP-teams-and-admin-04](#cap-teams-and-admin-04) | Custom roles and delegated admin areas | yes | yes | built | code inspected only |
| [CAP-teams-and-admin-05](#cap-teams-and-admin-05) | Groups: manual, directory-synced, dynamic | yes | yes | partly built | code inspected only |
| [CAP-teams-and-admin-06](#cap-teams-and-admin-06) | Seat types and seat management | yes | yes | built | code inspected only |
| [CAP-teams-and-admin-07](#cap-teams-and-admin-07) | Domain verification, domain capture and join rules | yes | yes | partly built | code inspected only |
| [CAP-teams-and-admin-08](#cap-teams-and-admin-08) | Single sign-on (SAML and OIDC) | yes | yes | built | code inspected only |
| [CAP-teams-and-admin-09](#cap-teams-and-admin-09) | Required SSO, member exemptions and several identity providers | yes | yes | not built | code inspected only |
| [CAP-teams-and-admin-10](#cap-teams-and-admin-10) | Directory provisioning: SCIM and just-in-time | yes | yes | built | code inspected only |
| [CAP-teams-and-admin-11](#cap-teams-and-admin-11) | Network and session security: IP allowlist, MFA, session length | yes | yes | partly built | code inspected only |
| [CAP-teams-and-admin-12](#cap-teams-and-admin-12) | Model and provider access policy | yes | yes | partly built | code inspected only |
| [CAP-teams-and-admin-13](#cap-teams-and-admin-13) | Feature switches with role and group exceptions | yes | yes | built | code inspected only |
| [CAP-teams-and-admin-14](#cap-teams-and-admin-14) | Connector, app, MCP and per-tool policy | yes | yes | built | code inspected only |
| [CAP-teams-and-admin-15](#cap-teams-and-admin-15) | Skills, plugins and private marketplace | yes | yes | built | code inspected only |
| [CAP-teams-and-admin-16](#cap-teams-and-admin-16) | Sharing and publishing controls | yes | yes | built | code inspected only |
| [CAP-teams-and-admin-17](#cap-teams-and-admin-17) | Retention, legal holds and deletion | yes | yes | built | code inspected only |
| [CAP-teams-and-admin-18](#cap-teams-and-admin-18) | Data residency and customer-managed keys | partly | yes | partly built | code inspected only |
| [CAP-teams-and-admin-19](#cap-teams-and-admin-19) | Audit log viewer, export and streaming | yes | yes | built | code inspected only |
| [CAP-teams-and-admin-20](#cap-teams-and-admin-20) | Compliance API and eDiscovery export | yes | yes | partly built | code inspected only |
| [CAP-teams-and-admin-21](#cap-teams-and-admin-21) | Usage analytics and cost visibility | yes | yes | partly built | code inspected only |
| [CAP-teams-and-admin-22](#cap-teams-and-admin-22) | Spend limits and budgets | yes | yes | partly built | code inspected only |
| [CAP-teams-and-admin-23](#cap-teams-and-admin-23) | Billing administration | yes | yes | built | code inspected only |
| [CAP-teams-and-admin-24](#cap-teams-and-admin-24) | Admin API keys and service accounts | yes | yes | built | code inspected only |
| [CAP-teams-and-admin-25](#cap-teams-and-admin-25) | Managed configuration for apps and coding tools | yes | yes | partly built | code inspected only |
| [CAP-teams-and-admin-26](#cap-teams-and-admin-26) | Organization memory and workspace-wide instructions | yes | yes | partly built | code inspected only |
| [CAP-teams-and-admin-27](#cap-teams-and-admin-27) | Company gateway and corporate-managed inference | yes | unknown | not built | not verified |
| [CAP-teams-and-admin-28](#cap-teams-and-admin-28) | Member removal, leaving and workspace wind-down | yes | yes | built | code inspected only |

## CAP-teams-and-admin-01 Workspace with members and invitations

An organisation space where admins list members with role, invite by email, renew or revoke invites, and members accept.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13133750-manage-members-on-team-and-enterprise-plans](https://support.claude.com/en/articles/13133750-manage-members-on-team-and-enterprise-plans): Admins manage members and invites; shareable invite link, default on for Team, off for non-SSO Enterprise, unavailable under SSO; joiners get lowest seat tier. Plans: Team, Enterprise.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8542216-managing-members-seat-types-and-roles-in-chatgpt-business](https://help.openai.com/en/articles/8542216-managing-members-seat-types-and-roles-in-chatgpt-business): Owners manage members, seat types and roles in a Business workspace; owners can resend manual invitations (help.openai.com/en/articles/10479654). Plans: Business, Enterprise, Edu.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md W22; docs/product/commercial.md Enterprise Path). A workspace owner or admin can invite, list, renew, revoke and remove members, enforced by the server, on every app that shows the workspace.

**With different models, providers and the one subscription.** Membership is model and provider neutral. Seats come from the one AGI Subscription Team plan. Local mode: a Local chat needs no workspace and is never routed into one.

**Current implementation, as this trace read it on 2026-11-24: built.** Web done, Desktop done (shows web), Mobile done, CLI missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S87.01, S87.02, S87.03
- Comparison list ids: MP105, W360, W367, W411, W429; rows without an id: Team workspace with invited members (Same, no id); Resend or revoke pending invitations (Same, no id)
- Code: `apps/web/features/settings/sections/TeamSection.tsx:685`; `apps/web/app/api/settings/team/invitations/route.ts:92`; `apps/mobile/src/features/team/WorkspaceAdministration.tsx:75`

**Gap.** Missing: bulk invite by CSV, member-to-member invites, member list CSV export, mobile gaps (MP105 partial).

**Acceptance criteria**

1. Owner invites a member as member, then revokes; the invite link stops working.
2. A member-role user calling the invite API directly is refused.
3. Invitee accepts and appears in the member list with the chosen role.
4. Mobile shows the same member list as Web.

**Verification: code inspected only.** Ledger and code lines; no scorecard row or defect row covers workspace admin (web scorecard rows W-1 to W-19 are chat basics).

## CAP-teams-and-admin-02 Built-in roles and role changes

Fixed roles (owner, admin, member and others) that decide who can manage people, billing and settings.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13133750-manage-members-on-team-and-enterprise-plans](https://support.claude.com/en/articles/13133750-manage-members-on-team-and-enterprise-plans): Role catalog: Team has Owner, Admin, User; Enterprise adds Custom; Primary Owner is the single top role. Plans: Team, Enterprise.
- **ChatGPT: yes**
  - [https://learn.chatgpt.com/docs/enterprise/roles-and-workspace-permissions.md](https://learn.chatgpt.com/docs/enterprise/roles-and-workspace-permissions.md): Built-in roles Owner, Admin, Member and Analytics Viewer set admin authority; custom roles add feature permissions only. Plans: Enterprise, Edu, Business.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md W22). Built-in roles with server-enforced permissions, a role picker for owners, and an analytics-only viewer role.

**With different models, providers and the one subscription.** Roles gate admin screens, not model choice. Team seat type is part of the subscription record. Local mode: roles do not apply without sign-in.

**Current implementation, as this trace read it on 2026-11-24: built.** Web done, Desktop done, Mobile done, CLI missing. Roles in code: owner, admin, member, viewer. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S87.05
- Comparison list ids: WP314, WP338; rows without an id: Roles and custom roles (Same)
- Code: `apps/web/app/api/settings/team/[memberId]/route.ts:23`; `apps/web/features/workspace-console/components/WorkspaceRoles.tsx:261`

**Gap.** Analytics-viewer role and direct-role review are partial (WP314, WP338).

**Acceptance criteria**

1. Admin cannot promote themselves to owner.
2. Changing a member to viewer removes admin screens on next load.
3. Direct API call by a viewer to change roles returns refusal.

**Verification: code inspected only.** Ledger S87.05 and route code.

## CAP-teams-and-admin-03 Primary owner and ownership transfer

One accountable owner who can hand ownership to another member after confirmation.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13133750-manage-members-on-team-and-enterprise-plans](https://support.claude.com/en/articles/13133750-manage-members-on-team-and-enterprise-plans): Current Primary Owner transfers the single role by confirming the new owner's email; SCIM skips the Primary Owner. Plans: Team, Enterprise.
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/12844995-chatgpt-for-teachers](https://help.openai.com/en/articles/12844995-chatgpt-for-teachers): A sole owner cannot leave the workspace (Teachers workspace page); no general transfer procedure found in the catalogue lines read. Plans: Teachers.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md W22; AGENTS.md section 9 on confirming irreversible actions). Owner transfer is atomic, confirmed with a named consequence, and the last owner cannot leave.

**With different models, providers and the one subscription.** Billing ownership follows the owner on the subscription. Local mode: not applicable.

**Current implementation, as this trace read it on 2026-11-24: built.** Web done, Desktop done, Mobile done, CLI missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S87.08
- Comparison list ids: none matched; rows without an id: Leave workspace and ownership transfer (Same)
- Code: `apps/web/app/api/settings/organization/transfer-ownership/route.ts:29`; `apps/web/features/settings/sections/TeamSection.tsx:1079`

**Gap.** none known

**Acceptance criteria**

1. Transfer asks for confirmation naming the loss of owner rights.
2. After transfer the old owner is admin and the new owner holds billing.
3. Last owner sees Leave refused.

**Verification: code inspected only.** Ledger S87.08.

## CAP-teams-and-admin-04 Custom roles and delegated admin areas

Admin-built roles with per-feature permissions and delegated admin areas so someone can run billing or analytics without being owner.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13930452-manage-custom-roles-on-enterprise-plans](https://support.claude.com/en/articles/13930452-manage-custom-roles-on-enterprise-plans): Custom roles grant or restrict features, admin areas, connectors and models; some items (owners, API keys, Compliance API) stay owner-only. Plans: Enterprise.
- **ChatGPT: yes**
  - [https://learn.chatgpt.com/docs/enterprise/roles-and-workspace-permissions.md](https://learn.chatgpt.com/docs/enterprise/roles-and-workspace-permissions.md): Owners create custom roles with Default/On/Off per permission, assign by group or directly; roles combine additively. Plans: Enterprise, Edu.

**AGI requirement** (inferred; source: competitor parity). Owners create, edit and delete custom roles from a permission set and assign them to members or groups; permissions take effect on every surface.

**With different models, providers and the one subscription.** Permissions may include allowed models and providers, referenced by registry id not literal. Custom roles need an Enterprise entitlement. Local mode: not applicable offline.

**Current implementation, as this trace read it on 2026-11-24: built.** Web done, Desktop done, CLI missing; Mobile not listed. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S87.06
- Comparison list ids: W463, WP289; rows without an id: Admin permission areas on custom roles (Same)
- Code: `apps/web/features/workspace-console/components/WorkspaceRoles.tsx:330`; `apps/web/app/api/settings/organization/roles/route.ts:74`

**Gap.** Per-feature toggles for code, research, browser are partial (WP289).

**Acceptance criteria**

1. Create a role with one permission off; a member holding it is refused that feature by API and UI.
2. Two roles combine additively.
3. Delete a role in use asks first and names the affected members.

**Verification: code inspected only.** Ledger S87.06.

## CAP-teams-and-admin-05 Groups: manual, directory-synced, dynamic

Member groups used to carry roles, limits and sharing; can come from an identity provider or attribute rules.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13930452-manage-custom-roles-on-enterprise-plans](https://support.claude.com/en/articles/13930452-manage-custom-roles-on-enterprise-plans): Groups organise members for spend limits, custom-role access and sharing; created manually or by SCIM; up to 1000 groups. Plans: Enterprise.
- **ChatGPT: yes**
  - [https://learn.chatgpt.com/docs/enterprise/groups-and-provisioning.md](https://learn.chatgpt.com/docs/enterprise/groups-and-provisioning.md): Group types: manual, identity-provider managed (SCIM), dynamic from SCIM attributes (also learn.chatgpt.com/docs/enterprise/dynamic-groups.md). Plans: Enterprise.

**AGI requirement** (inferred; source: competitor parity). Admins create manual and directory-synced groups and grant roles to them; dynamic rule groups are a later option.

**With different models, providers and the one subscription.** Group grants may include model access. Group size and spend tie to subscription seats. Local mode: groups not applied offline.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web done, Desktop done, API done; dynamic groups missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S87.04
- Comparison list ids: W409, W418, W448, WP340; rows without an id: Manual groups and role assignment through groups (Same)
- Code: `apps/web/features/workspace-console/components/WorkspaceRoles.tsx:673`; `apps/web/lib/services/organization-role-service.ts:511`

**Gap.** No dynamic groups, ranked group configs or group visibility settings.

**Acceptance criteria**

1. A role granted to a group reaches its members.
2. Removing a member from a synced group removes the role after sync.
3. Group cannot grant owner.

**Verification: code inspected only.** Ledger S87.04.

## CAP-teams-and-admin-06 Seat types and seat management

Paid seats with tiers; admins see used and free seats, add seats, assign seat types.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13133750-manage-members-on-team-and-enterprise-plans](https://support.claude.com/en/articles/13133750-manage-members-on-team-and-enterprise-plans): Team has Premium or Standard seats; Enterprise adds Chat or Chat plus Claude Code seats; seat tier is visible to admins only. Plans: Team, Enterprise.
- **ChatGPT, Codex: yes**
  - [https://learn.chatgpt.com/docs/enterprise/user-lifecycle.md](https://learn.chatgpt.com/docs/enterprise/user-lifecycle.md): Workspaces may offer ChatGPT and Codex-only seats; converting to Codex-only hides chats without deleting data. Plans: Enterprise, Business.

**AGI requirement** (stated requirement; source: docs/product/definition.md (founder decision 2026-10-08)). Standard and Premium Team seats on one subscription; only the owner changes bill-altering seats; admin may assign a paid Premium seat.

**With different models, providers and the one subscription.** The seat decides usage and model access through the one AGI Subscription system on every app. Local mode: free local inference does not need a seat. Subscription sales are on hold before 2027-01-01 per owner decision.

**Current implementation, as this trace read it on 2026-11-24: built.** Web done, Desktop done, CLI missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S87.07
- Comparison list ids: W427, W433, WP290; rows without an id: Standard and Premium seat types (Same)
- Code: `apps/web/features/settings/sections/TeamSection.tsx:610`; `packages/contracts/types/src/billing-catalog.ts`

**Gap.** No park-a-member without a seat, no member request for a Premium seat; seat changes partial.

**Acceptance criteria**

1. Seat count shows licensed, used and free.
2. Adding a seat prorates and keeps the renewal date.
3. Admin cannot raise the bill by changing seat type.

**Verification: code inspected only.** Ledger S87.07; definition.md.

## CAP-teams-and-admin-07 Domain verification, domain capture and join rules

Prove a company domain by DNS, then control who may join, find the workspace or have personal accounts claimed.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/14625619-claim-and-migrate-accounts-on-your-domain](https://support.claude.com/en/articles/14625619-claim-and-migrate-accounts-on-your-domain): Enterprise domain capture needs DNS verification, enforced SSO and JIT or SCIM; 30-day migration window; one-way toggle. Plans: Enterprise.
  - [https://support.claude.com/en/articles/13566435-find-and-join-a-team-or-enterprise-organization](https://support.claude.com/en/articles/13566435-find-and-join-a-team-or-enterprise-organization): Discoverable toggle per domain; join approval automatic or by admin. Plans: Team, Enterprise.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10489721-troubleshooting-sso-workspace-access-and-domain-verification](https://help.openai.com/en/articles/10489721-troubleshooting-sso-workspace-access-and-domain-verification): Verify domains with a DNS TXT record; parent domain does not cover subdomains. Plans: Enterprise, Edu, Business.

**AGI requirement** (stated requirement; source: docs/product/commercial.md Enterprise Path (SSO/SCIM); ledger S87.09). DNS TXT domain verification before sign-in routing; allowed-domain joining and discovery as later options.

**With different models, providers and the one subscription.** Independent of model or provider. Local mode: domain rules never reach a signed-out Local chat.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web done, Desktop done; mobile and CLI not listed. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S87.09
- Comparison list ids: W364, W394, W424, W450, W466, WP319; rows without an id: Domain verification by DNS record (Same)
- Code: `apps/web/lib/server/sso/domain-verification.ts:101`; `apps/web/app/api/admin/sso/verify-domain/route.ts:120`

**Gap.** No domain capture, allowed-domain joining, discovery, or restrict-org-creation.

**Acceptance criteria**

1. Publish the TXT record and verification succeeds; wrong record fails with a clear reason.
2. Unverified domain cannot be routed to SSO.

**Verification: code inspected only.** Ledger S87.09.

## CAP-teams-and-admin-08 Single sign-on (SAML and OIDC)

Members sign in through the company identity provider; certificates and secrets can be updated or the connection removed.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13132885-set-up-single-sign-on-sso](https://support.claude.com/en/articles/13132885-set-up-single-sign-on-sso): Owners configure SAML or OIDC with Okta, Entra, Google and others; update certificate; delete connection signs everyone out. Plans: Team, Enterprise, Console.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/11489188-setting-up-single-sign-on-sso-for-chatgpt-business](https://help.openai.com/en/articles/11489188-setting-up-single-sign-on-sso-for-chatgpt-business): Business workspaces can require SSO; Business has no SCIM. Plans: Business, Enterprise, Edu.

**AGI requirement** (stated requirement; source: docs/product/definition.md (owner decision 2026-10-22: single sign-on stays on Enterprise)). Owners configure SAML or OIDC for a verified domain; single sign-on stays on Enterprise.

**With different models, providers and the one subscription.** Identity only, no model effect. Enterprise entitlement in the AGI Subscription catalogue. Local mode: sign-in is a separate matter from payment; SSO applies only when a user chooses the workspace.

**Current implementation, as this trace read it on 2026-11-24: built.** Web done, Desktop done, CLI missing (CLI has partial managed settings). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S87.10
- Comparison list ids: none matched; rows without an id: Single sign-on (SAML or OIDC) (Same); Update the SSO certificate or secret (Same)
- Code: `apps/web/app/api/admin/sso/route.ts:181`; `apps/web/lib/server/sso/sso-access.ts:73`

**Gap.** Mobile sign-in chooser is partial (MP109).

**Acceptance criteria**

1. Enterprise owner connects a test IdP and a member signs in through it.
2. Team-plan owner sees an Enterprise-required message, not a broken form.
3. Deleting the connection asks first and names who is signed out.

**Verification: code inspected only.** Ledger S87.10; plan gate text in apps/web/lib/server/sso/sso-access.ts.

## CAP-teams-and-admin-09 Required SSO, member exemptions and several identity providers

Force all members through SSO, exempt named outside members, support several providers for one domain.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13132885-set-up-single-sign-on-sso](https://support.claude.com/en/articles/13132885-set-up-single-sign-on-sso): Require SSO toggle hides email login; Console and Claude toggles; (support.claude.com/en/articles/18246779) multiple identity providers. Plans: Team, Enterprise.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10489721-troubleshooting-sso-workspace-access-and-domain-verification](https://help.openai.com/en/articles/10489721-troubleshooting-sso-workspace-access-and-domain-verification): Workspace SSO policy; per-member exemption Allow login without SSO for external members. Plans: Business, Enterprise, Edu.

**AGI requirement** (inferred; source: competitor parity). Owner can require SSO for the workspace and exempt chosen outside members, with a lock-out warning.

**With different models, providers and the one subscription.** Identity only. Local mode: requiring SSO must not block a Local-only session; owner choice needed.

**Current implementation, as this trace read it on 2026-11-24: not built.** Not built on any app. The enforceSSO setting is in the organization patch schema but settings patches are listed as unsupported. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W371, W446, W451, W455, W460, W461, WP293
- Code: `apps/web/app/api/settings/organization/route.ts:70`; `apps/web/app/api/settings/organization/route.ts:78`

**Gap.** No required-SSO enforcement, exemption list or multi-provider chooser.

**Acceptance criteria**

1. With Require SSO on, email sign-in is refused for members of the domain.
2. An exempt member can still sign in.
3. Warning names lock-out risk before saving.

**Verification: code inspected only.** Code shows field accepted by schema then in the unsupported list.

## CAP-teams-and-admin-10 Directory provisioning: SCIM and just-in-time

The identity provider creates, updates and removes members; JIT creates users at first SSO sign-in.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13133195-set-up-jit-or-scim-provisioning](https://support.claude.com/en/articles/13133195-set-up-jit-or-scim-provisioning): JIT creates users at first SSO login with User role; SCIM group mappings set roles and seat tiers; Primary Owner exempt. Plans: Team, Enterprise.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10011769-scim-provisioning-and-management](https://help.openai.com/en/articles/10011769-scim-provisioning-and-management): SCIM syncs users and groups from Okta, Entra, Google and others; independent of SSO; sync about every 30-40 minutes. Plans: Enterprise, Edu (not standalone Business).

**AGI requirement** (stated requirement; source: docs/product/commercial.md Enterprise Path (SSO/SCIM)). SCIM v2 with a bearer token creates, updates and deprovisions members; JIT with a default role.

**With different models, providers and the one subscription.** Deprovisioning must release the seat in the subscription. Local mode: deprovisioned users keep free Local use.

**Current implementation, as this trace read it on 2026-11-24: built.** Web done, Desktop done, API done; CLI missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S87.11
- Comparison list ids: W374, WP280, WP282; rows without an id: SCIM provisioning (Same); Just-in-time provisioning with default role (Same)
- Code: `apps/web/app/api/scim/v2/Users/route.ts:40`; `apps/web/lib/server/sso/jit-provisioning.ts`

**Gap.** Group-to-role and seat mapping partial; no sync preview or manual Sync now.

**Acceptance criteria**

1. IdP creates then disables a user; the member and seat follow.
2. A bad SCIM token is refused.
3. Removing a member in the IdP does not delete their data.

**Verification: code inspected only.** Ledger S87.11.

## CAP-teams-and-admin-11 Network and session security: IP allowlist, MFA, session length

Restrict access to listed IP ranges, require multi-factor sign-in, cap session length, sign members out everywhere.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13200993-restrict-access-to-claude-with-ip-allowlisting](https://support.claude.com/en/articles/13200993-restrict-access-to-claude-with-ip-allowlisting): Enterprise owners set an IP allowlist themselves (public beta). Plans: Enterprise.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes](https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes): IP allowlisting for ChatGPT and Compliance API keys; workspace MFA is not enforced by ChatGPT, use the identity provider (learn.chatgpt.com/docs/enterprise/work-admin-faq.md). Plans: Enterprise, Edu.

**AGI requirement** (inferred; source: competitor parity). Owner-set IP allowlist and workspace MFA requirement enforced at the API.

**With different models, providers and the one subscription.** Applies to AGI Cloud only. Local mode: nothing leaves the device, so an IP list cannot govern it; state this plainly.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web done, Desktop done (IP allowlist and MFA gates); CLI missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S87.26
- Comparison list ids: WP311, WP342; rows without an id: IP allowlist for workspace access (Same); Multi-factor authentication required (Better)
- Code: `apps/web/lib/ip-allow-list-gate.ts:30`; `apps/web/lib/mfa-policy-gate.ts:15`

**Gap.** Max session length and sign out everywhere are partial.

**Acceptance criteria**

1. A request from an unlisted IP gets refusal.
2. A member without MFA is stopped when MFA is required.
3. Owner locking themselves out is warned first.

**Verification: code inspected only.** Ledger S87.26; code lines.

## CAP-teams-and-admin-12 Model and provider access policy

Admins allow or block models per workspace and role, set a default model and an effort ceiling.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13930452-manage-custom-roles-on-enterprise-plans](https://support.claude.com/en/articles/13930452-manage-custom-roles-on-enterprise-plans): Org Models page enables or disables models; roles grant subsets; effort caps per role; smallest model cannot be disabled. Plans: Enterprise.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes](https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes): Owners manage which models are available per workspace and role; admins can cap reasoning per model. Plans: Enterprise, Edu.

**AGI requirement** (stated requirement; source: docs/product/commercial.md Enterprise Path (provider and connector policy)). Allow or block providers and models for the workspace; blocked requests refused server-side.

**With different models, providers and the one subscription.** Policy references registry ids or family slots, never inline literals. Applies to AGI-managed Cloud routes; Local models are unaffected unless the owner decides otherwise.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web done, Desktop done, CLI feature policy done; Mobile missing (no allow list read). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S87.13, S87.14
- Comparison list ids: M207, M209, V97, WP278, WP283, WP286; rows without an id: Model access per workspace and role (Same)
- Code: `apps/web/app/api/settings/organization/model-policy/route.ts:202`; `apps/web/lib/managed-compute-gate.ts:320`

**Gap.** Mobile and VS Code do not read the policy; effort caps partial.

**Acceptance criteria**

1. Block a provider; a request for its model returns refusal and picker hides it.
2. Mobile picker obeys the same list.
3. Policy edit is recorded in the audit log.

**Verification: code inspected only.** Ledger S87.13; comparison mobile row M207.

## CAP-teams-and-admin-13 Feature switches with role and group exceptions

Admins turn product features (code, research, browser, computer use, Remote Control, plugins) on or off for the workspace with exceptions.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13455879-use-claude-cowork-on-team-and-enterprise-plans](https://support.claude.com/en/articles/13455879-use-claude-cowork-on-team-and-enterprise-plans): Owners toggle Cowork and cloud runs; Enterprise can scope to groups with custom roles. Plans: Team, Enterprise.
- **ChatGPT, Codex: yes**
  - [https://learn.chatgpt.com/docs/enterprise/work-admin-faq.md](https://learn.chatgpt.com/docs/enterprise/work-admin-faq.md): Separate permissions for Work Cloud, Work Local and Codex Local; local computer access toggle. Plans: Enterprise, Edu.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md W22). Each switched-off feature is refused wherever it runs, with a policy diagnostic that says why.

**With different models, providers and the one subscription.** Independent of model. Local mode: a local-only feature switch needs an owner decision (see unresolved choices).

**Current implementation, as this trace read it on 2026-11-24: built.** Web done, Desktop done, CLI done (hourly policy fetch), Mobile and VS Code partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S87.14, S87.39
- Comparison list ids: CP343, D148, W463; rows without an id: Role or group overrides of workspace controls (Same); Check effective settings for a member (Same)
- Code: `apps/cli/src/cloud/workspace_policy.rs:13`; `apps/web/lib/services/organization-policy-gate.ts:365`

**Gap.** CLI reads only the hooks switch map; no desktop switches for dictation or voice (D148).

**Acceptance criteria**

1. Switch off Remote Control; the app refuses it and says it is admin-disabled.
2. Diagnostics page names the rule that refused a member.

**Verification: code inspected only.** Ledger S87.14, S87.39.

## CAP-teams-and-admin-14 Connector, app, MCP and per-tool policy

Admins allow or block connectors and custom MCP servers and set each tool to allow, approve or block.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12592343-enabling-and-using-the-desktop-extension-allowlist](https://support.claude.com/en/articles/12592343-enabling-and-using-the-desktop-extension-allowlist): Owners can allow only approved desktop extensions; Enterprise can block all; local policy keys override. Plans: Team, Enterprise.
  - [https://code.claude.com/docs/en/managed-mcp.md](https://code.claude.com/docs/en/managed-mcp.md): Managed MCP policy for Claude Code (Claude Code, separate tool). Plans: Team, Enterprise.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/11509118-admin-controls-security-and-compliance-for-plugins-and-apps](https://help.openai.com/en/articles/11509118-admin-controls-security-and-compliance-for-plugins-and-apps): Admin controls for plugins and apps; apps admin console with Enabled, Available, Draft tabs (release notes help.openai.com/en/articles/11391654). Plans: Business, Enterprise, Edu.

**AGI requirement** (stated requirement; source: docs/product/commercial.md Enterprise Path (provider/connector policy)). Blocked connectors are not offered or connectable; per-tool decisions enforced in the tool loop.

**With different models, providers and the one subscription.** Applies equally to every model. Connectors stay coming soon until released. Local mode: tools run on the device; a workspace tool policy reaches a Local session only if signed in, owner decision needed.

**Current implementation, as this trace read it on 2026-11-24: built.** Web done, Desktop done, CLI done; Mobile partial (MP107). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S87.15, S87.16
- Comparison list ids: W368, W372, W396, W437, WP277; rows without an id: Per-tool connector permissions (Same); Custom MCP servers allowed (Same)
- Code: `apps/web/app/api/settings/organization/connector-policy/route.ts:133`; `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts:177`; `apps/cli/src/agent/mod.rs:525`

**Gap.** No org-authorised connectors for all members, no company-domain account limits, no member request flow.

**Acceptance criteria**

1. Block a connector; it vanishes from the list and its tools are refused.
2. Set one tool to needs approval; the run pauses for approval.
3. Mobile follows the same rule.

**Verification: code inspected only.** Ledger S87.15, S87.16.

## CAP-teams-and-admin-15 Skills, plugins and private marketplace

Admins control which skills and plugins members may use and publish a private catalogue.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13119606-provision-and-manage-skills-for-your-organization](https://support.claude.com/en/articles/13119606-provision-and-manage-skills-for-your-organization): Owners provision skills org-wide, share to groups, with security scanning of uploads. Plans: Team, Enterprise.
  - [https://code.claude.com/docs/en/plugins/org.md](https://code.claude.com/docs/en/plugins/org.md): Org plugin distribution for Claude Code (separate tool). Plans: Team, Enterprise.
- **ChatGPT, Codex: yes**
  - [https://learn.chatgpt.com/docs/enterprise/admin-plugin.md](https://learn.chatgpt.com/docs/enterprise/admin-plugin.md): Admin plugin install policy (available, installed, by role, disabled). Plans: Business, Enterprise.

**AGI requirement** (inferred; source: competitor parity). Per-item skill and plugin policy with a private catalogue; product enforces it. Note AGENTS.md: skills marked product ship to customers.

**With different models, providers and the one subscription.** Skills are model neutral. Local mode: installed skills run locally; policy applies when a workspace account is signed in.

**Current implementation, as this trace read it on 2026-11-24: built.** Web done, Desktop done, CLI done; Mobile not listed. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S87.17, S87.18
- Comparison list ids: W401, W407, WP288, WP333, WP334; rows without an id: Plugin install states (Same); Publish org plugins from a ZIP with a security scan (Same)
- Code: `apps/web/lib/services/connector-policy-gate.ts:123`; `apps/web/app/api/settings/organization/plugins/route.ts:62`; `apps/cli/src/features/plugins/plugins.rs:235`

**Gap.** No bulk plugin availability, no GitHub marketplace sync (W407); review queue partial.

**Acceptance criteria**

1. Block a plugin by id; install is refused.
2. Private catalogue item appears only to that workspace.
3. Unsigned plugin refused when signing is required.

**Verification: code inspected only.** Ledger S87.17, S87.18.

## CAP-teams-and-admin-16 Sharing and publishing controls

Admins see shared projects, set access, and switch external sharing and public publishing on or off.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/16762496-share-a-chat-with-specific-people](https://support.claude.com/en/articles/16762496-share-a-chat-with-specific-people): Org sharing controls: master toggle, org-wide sharing, external sharing by email; audit records sharing events. Plans: Team, Enterprise.
- **ChatGPT: yes**
  - [https://learn.chatgpt.com/docs/enterprise/chatgpt-work-overview.md](https://learn.chatgpt.com/docs/enterprise/chatgpt-work-overview.md): Library sharing can be disabled per workspace or role (learn.chatgpt.com/docs/enterprise; Enterprise). Plans: Enterprise.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md W22 (sharing policy)). External sharing and public publishing switches refused server-side; admin sees and can stop shared projects.

**With different models, providers and the one subscription.** Model neutral. Local chats are private and never shared by policy; sharing a Local chat is an explicit fork.

**Current implementation, as this trace read it on 2026-11-24: built.** Web done, Desktop done, Mobile has sharing (matrix); CLI missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S87.19, S87.20, S87.21
- Comparison list ids: W406, WP292, WP325; rows without an id: Admin switch for external sharing (Same); Share links work only inside the organization (Same)
- Code: `apps/web/app/api/share/route.ts:141`; `apps/web/app/api/artifacts/publish/route.ts:202`; `apps/web/features/settings/sections/OrganizationSharingSection.tsx:179`

**Gap.** Disable sharing of connector chats missing (W406).

**Acceptance criteria**

1. Switch external sharing off; creating a share link is refused.
2. Admin lists shared projects and removes one.
3. Publishing artifact refused when off.

**Verification: code inspected only.** Ledger S87.19-21.

## CAP-teams-and-admin-17 Retention, legal holds and deletion

Set how long workspace conversations are kept; hold data for legal reasons.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/9970975-access-audit-logs](https://support.claude.com/en/articles/9970975-access-audit-logs): Enterprise custom retention; shortening deletes permanently (minimum 30 days) on save (support.claude.com article on winding down Enterprise). Plans: Enterprise.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8411955-managing-workspace-settings-in-chatgpt-enterprise](https://help.openai.com/en/articles/8411955-managing-workspace-settings-in-chatgpt-enterprise): Workspace retention policy; Library retention and compliance export per learn.chatgpt.com/docs/enterprise. Plans: Enterprise, Edu.

**AGI requirement** (stated requirement; source: AGENTS.md section 9 (irreversible actions ask first)). Scheduled retention sweep withholding legal holds; destructive changes ask first naming what is lost.

**With different models, providers and the one subscription.** Covers AGI Cloud data only. Local data stays on device and is not swept by a workspace policy.

**Current implementation, as this trace read it on 2026-11-24: built.** Web done, Desktop done, CLI missing. AGI marks this Better than leaders (leader sources silent). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S87.23, S87.37
- Comparison list ids: WP300, WP302; rows without an id: Workspace data controls: retention and legal holds (Better); Domain and retention policies (Same)
- Code: `apps/web/app/api/cron/enforce-workspace-retention/route.ts:62`; `apps/web/app/api/settings/organization/legal-holds/route.ts:113`

**Gap.** Zero data retention on request partial.

**Acceptance criteria**

1. A held conversation survives a retention sweep.
2. Shortening retention shows a warning naming deletion.
3. Release of a hold asks for confirmation.

**Verification: code inspected only.** Ledger S87.23, S87.37.

## CAP-teams-and-admin-18 Data residency and customer-managed keys

Choose the region where workspace data is stored and seal data under the customer's own key.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/16994751-artifacts-admin-guide-for-team-and-enterprise](https://support.claude.com/en/articles/16994751-artifacts-admin-guide-for-team-and-enterprise) (this address is not in the saved catalogue; treat as unverified): Customer-managed keys supported on Enterprise; no data residency for Design (artifact admin guide). Plans: Enterprise.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes](https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes): In-region data residency for sync connectors including Japan; EKM supported for agents. Plans: Enterprise, Edu.

**AGI requirement** (stated requirement; source: docs/decisions/2026-09-04-region-neutral-data-residency.md). US-only today; no residency claim until a second region exists for a signed customer.

**With different models, providers and the one subscription.** Inference pinning would ride the zero-retention override path. Local mode data never leaves the device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web partial, Desktop partial; keys done on Web and API. EU resources not provisioned. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S87.24, S87.25
- Comparison list ids: WP321, WP322, WP323
- Code: `apps/web/app/api/settings/organization/data-region/route.ts:117`; `apps/web/lib/server/data-region.ts:1`; `apps/web/features/workspace-console/components/WorkspaceEncryptionKey.tsx:403`

**Gap.** Region screen exists although the 2026-09-04 decision said no region UI before a second region; EU stack is owner-pending. The key seals one store only (WP321).

**Acceptance criteria**

1. No public page claims an unavailable region.
2. A requested region shows as pending, not active.
3. Revoking the key is confirmed and names what stops working.

**Verification: code inspected only.** Ledger S87.24 unfinished note; ADR.

## CAP-teams-and-admin-19 Audit log viewer, export and streaming

Browse and export admin and security events, and stream them to a SIEM.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/9970975-access-audit-logs](https://support.claude.com/en/articles/9970975-access-audit-logs): Enterprise owners export 180 days of audit logs by emailed link; schema lists actor, event, IP, device; chat contents excluded. Plans: Enterprise.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/12289294-managing-your-tenant-in-admin-console](https://help.openai.com/en/articles/12289294-managing-your-tenant-in-admin-console): Global admins see tenant audit logs; workspace audit logs cover Codex policy changes. Plans: Enterprise, Edu.

**AGI requirement** (stated requirement; source: docs/product/commercial.md Enterprise Path (audit logs)). Filterable audit trail, export that is itself recorded, and streaming to a SIEM.

**With different models, providers and the one subscription.** Records which model and provider acted but no secrets. Local mode: not recorded centrally.

**Current implementation, as this trace read it on 2026-11-24: built.** Web done, Desktop done, API done; CLI has only a local approval audit; Mobile missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S87.28, S87.29
- Comparison list ids: CP342, DP127, WP317; rows without an id: Audit logs and export (Same)
- Code: `apps/web/app/api/settings/organization/audit/route.ts:60`; `apps/web/app/api/settings/organization/audit/export/route.ts:83`; `apps/web/lib/services/audit-streaming-service.ts:43`

**Gap.** Streaming to an OpenTelemetry collector partial.

**Acceptance criteria**

1. Filter by action and time range.
2. Export appears in the log as an event.
3. Member role cannot open audit.

**Verification: code inspected only.** Ledger S87.28-29.

## CAP-teams-and-admin-20 Compliance API and eDiscovery export

Machine access to conversation and file content for security and legal review.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13015708-access-the-compliance-api](https://support.claude.com/en/articles/13015708-access-the-compliance-api): Programmatic access to activity, chat data, files and audit events; only the Primary Owner enables it. Plans: Enterprise.
- **ChatGPT, Codex: yes**
  - [https://learn.chatgpt.com/docs/enterprise/work-admin-faq.md](https://learn.chatgpt.com/docs/enterprise/work-admin-faq.md): Compliance Logs Platform keeps 30 days; logs Work and agent responses, not every action. Plans: Enterprise, Edu.

**AGI requirement** (inferred; source: competitor parity). Admin exports workspace content in a machine-readable format with the export recorded.

**With different models, providers and the one subscription.** Model neutral. Local content outside scope unless the user syncs it.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web done (legal-hold export), Desktop done, API done; third-party integrations missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S87.36
- Comparison list ids: WP274, WP275, WP276
- Code: `apps/web/app/api/settings/organization/legal-holds/[holdId]/export/route.ts:75`; `apps/web/lib/services/ediscovery-export-service.ts:52`

**Gap.** No vendor integrations (DLP, SIEM, archive) and no general content API (WP275-276 partial).

**Acceptance criteria**

1. Export creates a file and an audit event.
2. A non-admin key is refused.

**Verification: code inspected only.** Ledger S87.36.

## CAP-teams-and-admin-21 Usage analytics and cost visibility

Dashboards of adoption, seats, usage and spend by member, model and product, with export.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude, Claude Code: yes**
  - [https://support.claude.com/en/articles/12883420-view-usage-analytics-for-team-and-enterprise-plans](https://support.claude.com/en/articles/12883420-view-usage-analytics-for-team-and-enterprise-plans): Analytics for adoption and spend; Analytics API; member self-view; Claude Code dashboard (separate tool) shows lines accepted. Plans: Team, Enterprise.
- **ChatGPT, Codex: yes**
  - [https://help.openai.com/en/articles/10875114-workspace-analytics-for-chatgpt-enterprise-and-edu](https://help.openai.com/en/articles/10875114-workspace-analytics-for-chatgpt-enterprise-and-edu): Usage overview, workplace health, users view, CSV exports, analytics viewer role. Plans: Enterprise, Edu.

**AGI requirement** (stated requirement; source: docs/product/requirements.md section 5.3 (usage limits, audit trails)). Usage and spend by member, model, product area and provider over a period, exportable.

**With different models, providers and the one subscription.** Counts come from the one AGI Subscription ledger across apps. Local inference has no managed cost; show as local.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web done, Desktop done, CLI shows own usage only, Mobile missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S87.30
- Comparison list ids: W380, W386, W391, W395, WP272, WP298, WP299; rows without an id: Workspace usage analytics, spend limit and billing (Same)
- Code: `apps/web/features/workspace-console/components/WorkspaceUsageAnalytics.tsx:319`; `apps/web/lib/services/organization-usage-service.ts:92`

**Gap.** No group analytics, insights, surveys or analytics chat.

**Acceptance criteria**

1. Usage splits by member and model for a chosen range.
2. CSV matches on-screen totals.
3. Free users see Upgrade only, not meters.

**Verification: code inspected only.** Ledger S87.30.

## CAP-teams-and-admin-22 Spend limits and budgets

Caps on managed usage at organisation, group and member level, alerts, and requests for more.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/14782391-claude-enterprise-consumption-guide](https://support.claude.com/en/articles/14782391-claude-enterprise-consumption-guide): Spend limits at org, group, user and seat-type level; pooled group budgets with alerts; increase-request queue. Plans: Enterprise.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/12289294-managing-your-tenant-in-admin-console](https://help.openai.com/en/articles/12289294-managing-your-tenant-in-admin-console): Workspace usage limits with group and user overrides (also help.openai.com 10128477 notes). Plans: Enterprise, Edu.

**AGI requirement** (stated requirement; source: docs/product/commercial.md Enterprise Path (managed-credit ledger)). Monthly org budget with alert and enforcement; per-group and per-user limits as the leaders do.

**With different models, providers and the one subscription.** Enforced on the one subscription ledger so every app obeys. Local mode has no managed spend.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Org budget done on Web and Desktop; group and user limits missing on all six apps. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S87.31, S87.32, S87.33
- Comparison list ids: M213, W369, W377, W428, WP285, WP295, WP296
- Code: `apps/web/app/api/settings/organization/spend-limit/route.ts:81`; `apps/web/lib/services/managed-compute-access.ts:112`

**Gap.** Ledger says group and user limits missing; comparison rows say partial. Request-more flow missing.

**Acceptance criteria**

1. Exhausted org budget refuses managed usage with a clear message.
2. Alert fires at the set threshold.
3. Local chat still works at zero budget.

**Verification: code inspected only.** Ledger S87.31-33; ledger and comparison disagree on S87.31-32.

## CAP-teams-and-admin-23 Billing administration

Admin manages plan, seats, payment, invoices and contract.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13133750-manage-members-on-team-and-enterprise-plans](https://support.claude.com/en/articles/13133750-manage-members-on-team-and-enterprise-plans): Owners add seats under Billing, prorated; invoices via organization settings (support.claude.com 16607668). Plans: Team, Enterprise.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/8542216-managing-members-seat-types-and-roles-in-chatgpt-business](https://help.openai.com/en/articles/8542216-managing-members-seat-types-and-roles-in-chatgpt-business): Owners manage seats and billing for the workspace. Plans: Business, Enterprise.

**AGI requirement** (stated requirement; source: docs/product/commercial.md; owner decision 2026-11-15). Plan, seats, payment method and invoices managed in the console; no subscription sales before 2027-01-01.

**With different models, providers and the one subscription.** Same subscription record on every app.

**Current implementation, as this trace read it on 2026-11-24: built.** Web done, Desktop done, CLI missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S87.34
- Comparison list ids: WP300; rows without an id: Enterprise contract details (Same)
- Code: `apps/web/app/workspace/billing/page.tsx:12`; `apps/web/app/api/settings/organization/billing-contract/route.ts:111`

**Gap.** Cancel, deactivate, reactivate partial.

**Acceptance criteria**

1. Seat increase keeps renewal date.
2. Invoice downloads.

**Verification: code inspected only.** Ledger S87.34.

## CAP-teams-and-admin-24 Admin API keys and service accounts

Scoped, expiring admin keys and non-human accounts for automation and CI.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13015708-access-the-compliance-api](https://support.claude.com/en/articles/13015708-access-the-compliance-api): Admin and compliance keys, enabled by the Primary Owner; Enterprise Admin API spend limit endpoints (public beta). Plans: Enterprise.
- **ChatGPT, Codex: yes**
  - [https://learn.chatgpt.com/docs/enterprise/service-accounts.md](https://learn.chatgpt.com/docs/enterprise/service-accounts.md): Service accounts for headless Codex with roles, groups and audit attribution; pay-as-you-go plans. Plans: Enterprise, Business.

**AGI requirement** (inferred; source: competitor parity). Admin keys with scope and expiry, revocable, plus service accounts that outlive their creator.

**With different models, providers and the one subscription.** Service usage counts against the org subscription ledger.

**Current implementation, as this trace read it on 2026-11-24: built.** Web done, Desktop done, API done; CLI missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S87.12, S87.40
- Comparison list ids: W425, W465, WP271; rows without an id: Workspace API keys and service principals (Same); Access tokens with scopes, expiry and revoke (Same)
- Code: `apps/web/app/api/settings/organization/admin-api-keys/route.ts:102`; `apps/web/features/workspace-console/components/WorkspaceServicePrincipals.tsx:168`

**Gap.** No token lifetime cap, no Terraform management, member and invitation admin API partial.

**Acceptance criteria**

1. Expired key refused.
2. Disabled service account loses access.
3. Revoked key stops at once.

**Verification: code inspected only.** Ledger S87.12, S87.40.

## CAP-teams-and-admin-25 Managed configuration for apps and coding tools

IT pushes policy to installed clients by device management or a managed file, with fail-closed behaviour.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code, Claude: yes**
  - [https://code.claude.com/docs/en/admin-setup.md](https://code.claude.com/docs/en/admin-setup.md): Managed settings via admin console, plist, registry or file; precedence over developer settings; forced login method and organisation. Plans: Team, Enterprise.
  - [https://support.claude.com/en/articles/12622667-enterprise-configuration-for-claude-desktop](https://support.claude.com/en/articles/12622667-enterprise-configuration-for-claude-desktop): Enterprise configuration for the Claude Desktop app (chat product). Plans: Enterprise.
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/enterprise/agent-security.md](https://learn.chatgpt.com/docs/enterprise/agent-security.md): requirements.toml delivered by cloud, device or system for the Codex app, CLI and IDE (Codex, separate tool); policies with Requirements, Defaults, Overrides. Plans: Enterprise.

**AGI requirement** (inferred; source: competitor parity). CLI, VS Code and Chrome honour a managed policy; Desktop and Mobile later; fails closed.

**With different models, providers and the one subscription.** Policy may pin allowed models by registry id. Local mode: a managed file applies on the device even offline, which is the one admin lever that works there.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI done, Chrome done (managed schema), VS Code partial; Web, Desktop, Mobile missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S87.27, S87.38
- Comparison list ids: CP347, CP350, CP351, CP360, CP364, D138, D140, M211, V93, V94, X29
- Code: `apps/cli/src/platform/policy/managed.rs:100`; `apps/extension/managed-schema.json:5`; `apps/cli/src/features/hooks/managed.rs:137`

**Gap.** No MDM for Desktop or Mobile, no forced login method, no rollout controls (S87.38 missing), no company gateway.

**Acceptance criteria**

1. CLI with a managed file refuses a command the user config allows.
2. Invalid managed file stops start with a clear message.
3. Chrome extension honours a managed site list.

**Verification: code inspected only.** Ledger S87.27; ADR 2026-07-30 says Enterprise Local licensing is not shipped.

## CAP-teams-and-admin-26 Organization memory and workspace-wide instructions

Admin controls whether memory is available and sets instructions or a policy reminder for all members.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12622667-enterprise-configuration-for-claude-desktop](https://support.claude.com/en/articles/12622667-enterprise-configuration-for-claude-desktop): Org-level memory toggle in Organization settings > Capabilities (catalogue ch01:200). Plans: Team, Enterprise.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes](https://help.openai.com/en/articles/10128477-chatgpt-enterprise-and-edu-release-notes): General tab for name, logo, workspace-wide instructions and a recurring AI policy reminder. Plans: Enterprise, Edu.

**AGI requirement** (inferred; source: competitor parity). Admin memory switch, enforced; org instructions as an option.

**With different models, providers and the one subscription.** Instructions apply to every model equally. Local memory stays on device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Memory policy done on Web and Desktop; instructions missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S87.22
- Comparison list ids: W440, W442, WP301; rows without an id: Organization memory control (Same)
- Code: `apps/web/lib/services/managed-memory-context-service.ts:106`; `apps/web/features/settings/sections/WorkspacePolicySection.tsx:457`

**Gap.** No org instructions, no AI policy reminder.

**Acceptance criteria**

1. Memory off gives members no memory in chats.
2. Policy text reaches a new chat.

**Verification: code inspected only.** Ledger S87.22.

## CAP-teams-and-admin-27 Company gateway and corporate-managed inference

A company-run gateway gives SSO and per-group policy in front of a coding tool using the company's cloud provider.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/claude-apps-gateway.md](https://code.claude.com/docs/en/claude-apps-gateway.md): Self-hosted gateway with SSO sign-in, per-group policy and telemetry in front of Bedrock, Vertex, Foundry or the API (Claude Code and Desktop). Plans: Enterprise (via cloud providers).
- **Codex: unknown**
  - no page found in the saved documentation

**AGI requirement** (proposed; source: competitor parity). Not required today. Owner choice whether to match.

**With different models, providers and the one subscription.** Would fit provider-agnostic routing, but needs a new trust boundary decision.

**Current implementation, as this trace read it on 2026-11-24: not built.** VS Code row V94 missing; no company gateway on any app. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: V94, V95, V98
- Code: `QA comparison-vscode.csv row V94` (not found)

**Gap.** No gateway, OpenTelemetry export or custom CA settings.

**Acceptance criteria**

1. Only if owner chooses: sign-in through company gateway applies a per-group model list.

**Verification: not verified.** No code searched beyond the comparison row.

## CAP-teams-and-admin-28 Member removal, leaving and workspace wind-down

Removing a member ends access but keeps data; members can leave; the organisation can be deactivated or deleted.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13133750-manage-members-on-team-and-enterprise-plans](https://support.claude.com/en/articles/13133750-manage-members-on-team-and-enterprise-plans): Re-adding the same email restores chats and projects (catalogue ch01:251); removal does not delete data. Plans: Team, Enterprise.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10011769-scim-provisioning-and-management](https://help.openai.com/en/articles/10011769-scim-provisioning-and-management): Removing a user from the identity provider drops access after sync but does not delete their account. Plans: Enterprise, Edu.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md W22 (removing access closes subsequent reads)). Removal closes later reads and actions; data kept per policy; last owner cannot leave.

**With different models, providers and the one subscription.** Seat is released to the subscription. A removed member keeps free Local use.

**Current implementation, as this trace read it on 2026-11-24: built.** Web done, Desktop done; wind-down partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: WP300; rows without an id: Remove a member: access ends, data stays, re-adding restores it (Same); Member leaves the workspace; last owner cannot leave (Same); Winding down a workspace (Same)
- Code: `apps/web/app/api/settings/organization/leave`; `apps/web/app/api/settings/organization/deletion`

**Gap.** Reactivation partial.

**Acceptance criteria**

1. Removed member's next request is refused.
2. Re-adding restores their content.
3. Wind-down names what is deleted.

**Verification: code inspected only.** Comparison rows; route directories exist.

## Unresolved product choices

Decisions this topic needs from the owner. Nothing here has been decided.

- Do workspace policies (model, connector, tool, feature switches) apply to a signed-in user's Local-mode sessions, or only to AGI Cloud routes? Leaders have no Local mode to compare.
- Should required SSO be built, and may it ever block free Local use?
- Match features only one leader has: dynamic groups, group spend pooling, spend-increase requests, company gateway, surveys, analytics chat.
- Data residency: keep the US-only decision (2026-09-04) or finish the region screen the code already has.
- MDM and managed policy for Desktop and Mobile, given Enterprise Local licensing is not approved (ADR 2026-07-30).
- Whether Team stays at the current seat prices while subscription sales are on hold before 2027-01-01.

## Could not establish

- No person has driven any workspace or admin flow: web scorecard rows W-1 to W-19 and the problems CSV cover chat basics only. Experience-contract scenario W22 has no recorded run.
- Ledger and comparison disagree on per-user and group spend limits (S87.31-32 missing; WP295-296 partial); code not re-checked.
- Surface matrix says Desktop administration is absent; ledger says done. Desktop shows hosted web, but I did not drive it.
- Support-access controls (S87.35) and managed rollout (S87.38): no competitor line searched; has: unknown for both.
- Competitor surfaces per feature not recorded; catalogue was read for text, saved pages not opened.
- ChatGPT owner transfer: no catalogue line found, so has: partly.
- Mobile and VS Code policy enforcement was read from comparison rows, not from code.
