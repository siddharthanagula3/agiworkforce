# AGI Workforce — "Not Built Yet" Inventory (2026-07-21)

Exhaustive, code-verified list of everything not-built / stubbed / dead / gated across
all six surfaces + shared platform. Source: this session's audits + a 7-agent
reference-vs-code reuse sweep (claims cross-checked against real code, not parroted
from the parity docs). For each ❓ item, send reference documentation and I'll build it.

**Legend**
🔴 not built (no implementation) · 🟠 stub / "coming soon" (scaffolding only) ·
🟡 built-but-dead (needs _wiring_, not building) · 🔑 needs credentials/provisioning
(founder — external accounts/OAuth/keys) · ❓ needs your reference docs (intent unclear)

---

## 0. CROSS-SURFACE / SHARED PLATFORM

- [ ] 🟡 **Web chat not on the shared `ChatInterface`** — desktop consumes the shared shell; web `/chat` forks bespoke `WebChatPage` (6,858 LOC). The shared path `UnifiedChatPage → WebShellV3 → ChatInterface` exists but is routed to nothing. `apps/web/app/chat/page.tsx`
- [ ] 🔴 **Durable run journal** — `run_events` / `run_commands` / `domain_outbox` tables, restart-survival, cross-surface replay, exactly-once approval. Not built.
- [ ] 🔴 **Vector / semantic RAG** — project-knowledge retrieval + memory search are keyword-only (`ILIKE`); no embeddings/chunking anywhere.
- [ ] 🔴 **Anthropic `pause_turn` not resumed** — long server-tool turns terminate as `end_turn` instead of resuming.
- [ ] 🔴 **Checkpoints & worktrees** — hardcoded unsupported in the canonical developer host (blocks CLI + VS Code + Desktop Code parity at once).
- [ ] 🔴 **No shared auth/account package** — Clerk is wired independently per surface (web heavy, mobile/extension thin, desktop/vscode via REST).
- [ ] 🟡 **Dead duplicate settings shell** — `@agiworkforce/unified-chat` exports `SettingsShell`/`SettingsModal` with zero importers, parallel to the live `@agiworkforce/ui` `SettingsModal`. Delete.

## 1. WEB (`apps/web`)

- [ ] ❓🔴 **Mobile-responsive `/chat`** — agiworkforce.com/chat on a phone browser should render like the AGI mobile app / chatgpt.com mobile web. **NEW requirement — needs your reference for the target mobile-web layout.**
- [ ] 🟠 **Document attachments** — composer accepts images only; PDF/DOCX/CSV/TXT are rejected. The doc-ingest pipeline (20 files / 500 MB) is unbuilt on web.
- [ ] 🔴 **Global search doesn't index Artifacts** — results cover Chats/Projects/Files only.
- [ ] 🔴 **Workspace / organization switcher** — no multi-org account switcher in the account menu.
- [ ] 🟠 **Knowledge files** — "require Cloud Managed (not yet available)".
- [ ] 🟠 **MCP / connector directory** — "a full browsable, searchable directory is coming soon".
- [ ] 🟠 **Stale marketing copy** — "Desktop, Mobile, CLI, Chrome, VS Code are coming soon" (desktop + mobile already exist).

## 2. DESKTOP (`apps/desktop`)

- [ ] 🟠 **Cloud artifact publish** — local publish works; cloud path returns a `WaitlistPublishResult` → "coming soon". Web has `/api/artifacts/publish` to reuse. _(was mid-wiring this session)_
- [ ] 🟡 **Native terminal/console UI** — `terminalStore` + xterm panels exist but `SidecarPanel` is never mounted in the v3 shell (no live terminal surface).
- [ ] 🟡 **Computer-use observability UI** — `ActionLog`/`ScreenPreview`/`ComputerUseMonitor` exist but their only importer (`DynamicSidecar`) is orphaned → unreachable.
- [ ] 🟡 **~74% of `features/` orphaned** — old pre-v3 chat shell + hosted panels, unreachable from the single entry. Decide delete vs. re-wire (esp. native panels).
- [ ] 🟡 **Settings is a bespoke fork** — Local `SettingsPanel` doesn't use the shared `SettingsModal` shell (needs a deferred-save footer prop first). Sidebar is a forked 824-LOC copy vs. shared `<Sidebar>`.
- [ ] 🟠 **Directory picker** — "will be available after Rust command is wired".
- [ ] 🟠 **Redo** — undo has no redo stack.
- [ ] 🟠 **Memory search backend** — "not yet wired".
- [ ] 🟠 **Google Batch API** — "not yet available in this release".
- [ ] 🟠 **Midjourney image provider** — "integration not yet available".
- [ ] 🟡 **EmailTriggerService** — start deferred ("async runtime not yet available").

## 3. MOBILE (`apps/mobile`)

- [ ] 🟠 Assorted "Coming Soon" surfaces (enumerate on a focused pass).
- [ ] 🔑 Connectors return 501 (backend-gated, per prior QA).
- [ ] 🔴 Shares logic/contracts but forks all UI by design (RN can't render DOM) — parity gaps are per-screen, need the mobile benchmark spec mapped screen-by-screen.

## 4. CLI (`apps/cli`)

- [ ] 🔴 **Built-in local-UX commands absent** — `/cd`, `/goal`, `/scroll-speed`, `/radio`.
- [ ] 🔴 **Zero bundled skills** — the skill channel exists but ships no built-ins: `/deep-research`, `/simplify`, `/dataviz`, `/code-review`, `/run`, `/verify`, `/loop`, `/run-skill-generator`.
- [ ] 🔴 **7 hook events missing** — `ConfigChange`, `CwdChanged`, `InstructionsLoaded`, `MessageDisplay`, `PostToolUseFailure`, `TaskCompleted`, `TaskCreated`.
- [ ] 🔴 **~10 agent-callable tools have no CLI wrapper** — `PushNotification`, `RemoteTrigger`, `ScheduleWakeup`, `Monitor`, `Workflow`, `Artifact`, `SendUserFile`, `WaitForMcpServers`, plus plan-mode + MCP-resource tool-forms.
- [ ] 🔑 **Cloud/CI handoff commands** — `/teleport`, `/autofix-pr`, `/ultraplan`, `/web-setup`, `/setup-bedrock`, `/setup-vertex` (infra/provider-gated).

## 5. VS CODE + CHROME EXTENSIONS

- [ ] 🔴 **No connector/MCP/plugin management UI** — VS Code targets `MCPToolsIDE` (9-state MCP lifecycle + PKCE OAuth) + Plugin Manager + Skills discovery; Chrome targets Settings › Connectors/Bridge tab + native-host connector setup. Only stringly-typed stubs exist today.
- [ ] 🟠 **VSIX distribution** — "coming soon".
- [ ] 🔑 **Chrome native-host connector setup** — needs the native messaging host.

## 6. CONNECTORS (cross-surface — mostly 🔑 credential-gated)

- [ ] 🔑 **~40 connectors show "Coming soon"** — web `/api/connectors` `available` = `LOCAL_CONNECTOR_IDS` + `CONNECTOR_MCP_SERVERS_JSON` (operator MCP config, currently unset) + GitHub. **Composio is not wired anywhere.** Desktop already _reuses_ web's API, so desktop mirrors web. Making these real needs one of: (a) a Composio key + integration, (b) per-provider OAuth credentials, or (c) self-hosted MCP servers. The _plumbing exists_; the blocker is provisioning. Catalog: `apps/desktop/src/features/connectors/connectorDefinitions.ts` (canva, atlassian, outlook, jira, asana, monday, clickup, airtable, salesforce, snowflake, databricks, …).

## 7. SMALL / THIS SESSION

- [ ] 🔴 **"Get notified for stable releases" opt-in** — repurpose the removed waitlist into a notify signup (you asked for this; not built yet).
- [ ] 🟡 **Desktop cloud live round-trip unverified** — DCL-4 flip is code-complete + unit-green, but create-cloud-chat → reload → still-there has never run once. Needs your sign-in on a running build.

---

## ❓ NEEDS YOUR REFERENCE DOCS (intent unclear — send docs, I'll build)

1. **Mobile-web `/chat` target** — exact responsive layout for agiworkforce.com/chat on phones (mirror the mobile app? chatgpt.com mobile web?).
2. **Web chat convergence direction** — flip `/chat` onto the shared `ChatInterface`, or keep `WebChatPage` canonical and upgrade the package from it? (affects sidebar regression risk.)
3. **AGI Work "Home"** — should Work grow a dedicated goal-composer + deliverables-as-objects surface beyond the composer toggle + `/tasks`?
4. **Chrome safety modes** — "Watch Mode" / "Takeover Mode" + server-side prompt-injection classifier architecture.
5. **VS Code Plugin Marketplace + Skill/Plugin authoring** (`SkillPluginCreationIDE`) — scaffold + hot-reload semantics.
6. **CLI `/goal`** — persistent-goal-across-turns semantics; and whether the headless NDJSON event stream is the same versioned contract as web/mobile SSE.
7. **Full SCIM directory-sync** provisioning schema / push-provisioning completeness.
8. **`SessionKind` canonical enum values** for new cross-surface work.
9. **Desktop legacy `features/chat/` fork** — delete the 177-file orphan, or is any of it the intended future shell?
10. **Canonical terminal implementation** — should the native PTY panel be re-wired into the active desktop shell, and where do the computer-use observability panels live?
11. The **`claude-vscode.md` / `claude-chrome.md` architecture dossiers** (1.8 MB / 1.3 MB) referenced as `[CAS:*]` anchors — not in the bundles I have.
