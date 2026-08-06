# Agent Authority and Connector Scopes

Status: Current
Owner: Legal/compliance + Platform lead
Last updated: 2026-08-05
Purpose: the source-of-truth matrix that `/acceptable-use` and `/agent-permissions`
are written against. Every public sentence on those pages must trace to a row here,
and every row cites the implementing file. If you change the tool loop, the approval
gate, the connector surface, or an OAuth scope list, update this file and the two
pages in the same change.

## Why this file exists

A prior audit found that marketing copy described a permission model the code did
not implement. The fix is not "write more careful copy" — it is to keep a single
matrix that copy is rendered against, so a behaviour change is visibly a copy
change. Do not add a row you cannot cite.

---

## 1. Managed Cloud — default tool authority

The gate is `resolveToolCallGate()` in
`apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` (~L1466-1486).
Precedence, highest first:

| Rank | Condition                                         | Verdict | Machine reason               |
| ---- | ------------------------------------------------- | ------- | ---------------------------- |
| 1    | User saved `deny` for the tool                    | deny    | `blocked_by_user_permission` |
| 2    | User saved `allow`, and the trifecta triple holds | ask     | `lethal_trifecta`            |
| 3    | User saved `allow`                                | allow   | `always_allow`               |
| 4    | User saved `ask`                                  | ask     | `user_requires_approval`     |
| 5    | `approvalMode === 'manual'`                       | ask     | `manual_approval_mode`       |
| 6    | Trifecta triple holds                             | ask     | `lethal_trifecta`            |
| 7    | otherwise                                         | allow   | `auto_approval_mode`         |

`approvalMode` is set in `tool-loop-routing.ts` (L63):
`approvalMode: hasMcpTools ? 'manual' : 'auto'`.

**Consequence, and the single most important honest statement on the public
pages:** a turn that carries no connector/MCP tool runs in `auto` mode. In `auto`
mode, with no saved verdict, the built-in tools execute with no approval prompt.

| Tool                     | Runs without approval by default?        | Declared metadata (`tool-metadata.ts`)                           |
| ------------------------ | ---------------------------------------- | ---------------------------------------------------------------- |
| `web_search`             | yes                                      | read, reversible, acceptsUntrustedContent, createsEgressPath     |
| `url_fetch`              | yes                                      | read, reversible, acceptsUntrustedContent, createsEgressPath     |
| `execute_code`           | yes                                      | execute, **not** reversible, createsEgressPath                   |
| `write_file`             | yes                                      | write, **not** reversible, no egress                             |
| `create_folder`          | yes                                      | write, reversible, no egress                                     |
| `create_office_file`     | yes                                      | write, reversible, no egress                                     |
| skill tool               | yes                                      | —                                                                |
| any connector / MCP tool | **no** — forces `approvalMode: 'manual'` | per-tool; undeclared defaults to the conservative classification |

`write_file` / `create_folder` / `create_office_file` / `execute_code` act inside
the conversation's own E2B sandbox workspace, not on the user's device. Public
copy must say so in the same breath as "no approval", or the sentence reads worse
than the reality.

### 1a. Lethal-trifecta escalation and its published limits

Escalates auto-approval to a human ask when all three hold at once: untrusted
content in context (U) + a sensitive source reachable (S) + the pending call
creates an egress path (E). Documented in-file (`tool-loop.ts` ~L1418-1441) as a
mitigation, not a proof. The limits are published verbatim on `/agent-permissions`
because a security reviewer will find them anyway:

- U is raised by **tool-fetched** third-party content. Content the user **pasted
  or attached is not counted** — a real injection vector the heuristic does not see.
- S is derived from the offered catalog, not from what was actually read, so it
  over-triggers rather than under-triggers (deliberate).
- E is per-tool metadata, so an MCP server that exfiltrates through an undeclared
  channel is invisible. Undeclared tools are therefore classified as having egress.
- It gates auto-approval only. It cannot stop a user who approves.

### 1b. A Block is absolute — with the accurate scope of "absolute"

A saved `deny` is enforced server-side before any side effect, on the tool loop
(`tool-loop.ts` L2444) and on the approve/resume path
(`approve/route.ts` L267, `tool-loop.ts` L2078) — so an approving client, or a
hand-rolled POST, cannot execute a blocked tool.

**Do NOT claim** blocked tools are withheld from the model's offered catalog. No
code filters the catalog by verdict; enforcement is at execution. Verified
2026-08-05: no caller of `isDenied` / `levelForConnectorTool` exists in the
catalog-assembly path.

---

## 2. What Managed Cloud can actually connect

`apps/web/lib/user-connector-tools.ts` (module header L1-51). Exactly three sources:

| Source                               | Gate                                                        | Credential location                                                       |
| ------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| GitHub App built-in                  | a usable GitHub App installation                            | `github_installations.access_token_enc`, resolved per request             |
| Operator-mapped remote MCP servers   | active `user_connectors` row + `CONNECTOR_MCP_SERVERS_JSON` | operator config, server-side                                              |
| User's own custom remote MCP servers | `user_custom_connectors` row                                | URL + optional bearer token, encrypted (`lib/custom-connector-crypto.ts`) |

`user_connectors` holds only `connector_id + auth_type + is_active`. **No tokens,
no endpoint URLs.** `POST /api/connectors` returns 501 for every branded catalog
connector and for device-local ids (`route.ts` L289, L306, L332).

GitHub built-in tools, complete list (`user-connector-tools.ts` L180-240):
`get_pull_request_diff`, `post_issue_comment`, `post_pull_request_review`.

The GitHub App's **installation permission set is configured on GitHub and is not
declared anywhere in this repository.** Public copy must say that rather than
guess a permission list.

Per-user connector tool count is capped per plan (`getPlanMaxConnectorTools`,
falling back to `MAX_CONNECTOR_TOOLS_PER_USER`). Remote endpoints pass
DNS-resolution SSRF validation (`assertResolvedPublicHostname`).

---

## 3. Desktop (Local) — the only place real OAuth scopes are requested

User's **own** OAuth client id/secret, PKCE, tokens encrypted with a
machine-derived key into local SQLite.

| Provider         | File                                                                                 | Scopes requested                                                                     |
| ---------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Gmail            | `apps/desktop/src-tauri/src/features/communications/gmail_oauth.rs` L47-51, L124-129 | `gmail.readonly`, `gmail.send`, `gmail.modify`, `userinfo.email`, `userinfo.profile` |
| Google Calendar  | `apps/desktop/src-tauri/src/features/calendar/google_calendar.rs` L15-19, L36-39     | `auth/calendar` (full), `calendar.readonly`, `calendar.events`                       |
| Outlook Calendar | `apps/desktop/src-tauri/src/features/calendar/outlook_calendar.rs` L15-17, L34-37    | `User.Read`, `Calendars.Read`, `Calendars.ReadWrite`                                 |

Two of these are broader than the advertised capability and are disclosed as such
on `/agent-permissions`:

- `gmail.modify` permits changing and deleting mail, not only reading and sending.
- `auth/calendar` is the unrestricted calendar scope; it is requested **alongside**
  the two narrower scopes, which makes those two redundant.

Narrowing either is a behaviour change and is tracked as a gap, not a copy fix.

---

## 4. Chrome extension — computer use

| Fact                                                                                                      | Citation                                                                                  |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Ask-before-acting defaults ON; autopilot is an explicit opt-out (only a stored `false` disables the gate) | `apps/extension/src/background.ts` L3905-3919                                             |
| Unanswered approval denies after 30 s (fail-closed)                                                       | `background.ts` L3943, L3964, L3990                                                       |
| Navigation destinations gated by the user's `agi_site_allowlist`                                          | `cdpDriver.ts`; `background.ts` L2542-2563                                                |
| Text egress (DOM summaries, field readbacks) is redacted by `cdpDriver`                                   | `agentLoop.ts` L20-22                                                                     |
| **Screenshots are NOT and cannot be redacted** and reach the cloud gateway                                | `agentLoop.ts` L24-35 — "Do not claim screenshots are redacted anywhere in this codebase" |
| Computer use requires Managed Cloud auth and posts from the extension to the cloud gateway                | `background.ts` L3889-3902; `cloudAgentClient.ts`                                         |

---

## 5. Enforcement machinery a "what happens on violation" section may cite

| Control                                                                            | Value                                                     | Citation                                                    |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------- |
| Suspend / ban enforced on every authenticated request, fail-CLOSED after one retry | `profiles.account_status` in (`suspended`,`banned`) → 403 | `apps/web/lib/api-auth.ts` L45-93                           |
| Admin actions that write that column                                               | suspend / ban / reinstate                                 | `apps/web/app/api/admin/security/route.ts` L240, L299, L367 |
| LLM requests per user                                                              | 30 / min, failClosed                                      | `apps/web/lib/rate-limit.ts` L233-236                       |
| LLM requests per IP (pre-auth abuse ceiling)                                       | 1500 / min, failClosed                                    | `rate-limit.ts` L228-231                                    |
| Conversation operations                                                            | 60 / min                                                  | `rate-limit.ts` L207-210                                    |
| Public API scopes — the complete set                                               | `models:read`, `inference:write`, `usage:read`            | `apps/web/lib/api-key-scopes.ts` L1                         |
| Crawler policy; Common Crawl blocked                                               | `CCBot: disallow /`                                       | `apps/web/app/robots.ts` L47                                |
| Connector add/remove audited                                                       | `connector_added` / `connector_removed`                   | `lib/security-audit.ts`, `api/connectors/route.ts` L437     |

---

## 6. Sandbox limits

`apps/web/lib/e2b/gate.ts` — fail-closed: provisioning requires **both**
`AGI_E2B_EXECUTION=1` and `E2B_API_KEY`.

`apps/web/lib/e2b/runtime.ts`:

- ephemeral sandbox timeout 60 s (`E2B_SANDBOX_TIMEOUT_MS` L56); conversation
  sandbox 10 min (`E2B_CONVERSATION_TIMEOUT_MS` L65); per-command 60 s (L66).
- per-plan concurrent sandbox allowance (`getPlanMaxSandboxes`, L97).
- network: none, or an allowlist of `TRUSTED_CODE_HOSTS` (L68-76) —
  `github.com`, `api.github.com`, `raw.githubusercontent.com`,
  `objects.githubusercontent.com`, `registry.npmjs.org`, `npmjs.com`,
  `pypi.org`, `files.pythonhosted.org`.

---

## 7. Revocation paths — the complete set

| Path                                             | Mechanism                                                                                                         | Also clears saved per-tool verdicts?                          |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Disconnect a connector                           | `DELETE /api/connectors?connectorId=`                                                                             | yes — `clearConnectorToolPermissions` (`route.ts` L436, L466) |
| Reset one tool's verdict, or a whole connector's | `DELETE /api/connectors/permissions`                                                                              | n/a — this _is_ the verdict store                             |
| Set a tool back to "ask"                         | `PUT /api/connectors/permissions` with `level: "ask"`                                                             | —                                                             |
| Unlink GitHub                                    | `DELETE /api/connectors?connectorId=github` deletes the user's `github_installations` rows                        | yes                                                           |
| Fully uninstall the GitHub App                   | github.com/settings/installations — **the app stays installed on GitHub until you do this** (`route.ts` L428-430) | —                                                             |
| Remove a custom MCP connector                    | `DELETE /api/connectors/custom?id=`                                                                               | —                                                             |
| Extension: remove a site                         | `agi_site_allowlist` in extension options                                                                         | —                                                             |
| Extension: re-enable the gate                    | turn ask-before-acting back on                                                                                    | —                                                             |
| Desktop: per-tool policy                         | Always allow / Needs approval / Blocked in `ConnectorDetailView.tsx`                                              | —                                                             |

---

## 8. Known gaps this file deliberately records rather than papers over

1. **No OAuth flow exists on web for any branded catalog connector**, while the
   public consent dialog previously implied stored OAuth tokens. Copy fixed
   2026-08-05; the underlying directory still lists connectors that cannot connect.
2. **`gmail.modify` and the full `auth/calendar` scope** are broader than the
   advertised capability. Narrowing is a behaviour change.
3. **The GitHub App installation permission set is not declared in this repo**, so
   it cannot be documented from code.
4. **`ToolPermissionsPanel.tsx` has no importer** — there is no standing per-tool
   permission UI on web. The only web control is the in-chat approval card
   (`ToolTimeline.tsx` ~L630-640), reachable only while a tool is asking.
   Marketing copy claiming a standing per-tool web UI is unsupported.
5. **`CONNECTOR_TOOLS` in `features/connectors/config/connector-logos.ts`** lists
   tool names for connectors with no runtime implementation. Only the `github`
   entry (L564) mirrors real wire names.
