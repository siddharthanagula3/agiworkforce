# AGI Workforce - Enterprise-Grade Master Build Checklist

Status: Current as of 2026-09-16, HEAD `bfc0ada75`
Owner: Repository maintainers

Every item verified three times: code audit, independent re-check, and a ships-and-runs check (production env names, CI gating, releases, live site). `[x]` done · `[ ]` not done (🟡 partial, 🔴 missing, ⚪ external/N/A) · _(revised)_ changed by a later check · ⛔ **not live**: built on main but in no release or deployment users run.

**2097 items: 1258 done, 456 partial, 360 missing, 23 external or N/A; 321 built items not live.**

---

# 0. Rules for every AI coding agent

Every feature is incomplete unless it has:

- [ ] Architecture defined - 🔴 Missing
      <br>_No guard checks a new feature has an architecture doc; ARCHITECTURE.md is prose, `check-doc-freshness.mjs` checks staleness only, not presence per feature_
- [ ] Canonical data contract _(revised)_ - 🟡 Partial
      <br>_package.json:122-123 guards run only in repo-operability.yml:161; deploy-production.yml:4-5 waits on CI only; GitHub shows no active ruleset/branch protection._
- [ ] Backend/API implementation - 🔴 Missing
      <br>_No guard asserts every domain has a backend route; `check-surface-reachability.mjs` checks reachability of existing code, not coverage of features_
- [ ] Frontend implementation where applicable - 🟡 Partial
      <br>_`check-ui-gaps.mjs` tracks a manual `audit/ui-gaps.csv` ledger (monotonic ratchet), not static detection of missing UI_
- [ ] Persistence where applicable - 🟡 Partial
      <br>_`check-neon-migrations.mjs`, `check-migration-dependencies.mjs` gate schema changes but not "every stateful feature has persistence"_
- [ ] Authentication - 🟡 Partial
      <br>_`check-clerk-bot-protection.mjs` covers bot/Clerk wiring only, not a repo-wide "every route requires auth unless allowlisted" gate_
- [ ] Authorization _(revised)_ - 🟡 Partial
      <br>_org-role/rls-boundary/policy-gate-scope only in check:llm-operability (repo-operability.yml:161, non-gating); only ci.yml:251 rls-probe blocks deploy._
- [ ] Loading state - 🔴 Missing
      <br>_grep found no lint/test asserting components render a loading state; `check-web-ui-invariants.mjs` covers other invariants (see §7/§9), not this_
- [ ] Empty state - 🟡 Partial
      <br>_`audit/ui-gaps.csv` ledger can track empty-state gaps (rule cites sidebar empty-state CTA in `.claude/rules/ui-colour-and-interaction.md`) but no static enforcement_
- [ ] Error state - 🟡 Partial
      <br>_`check-raw-error-to-user.mjs` stops raw errors reaching users, which implies an error state exists, but does not verify one is rendered_
- [ ] Retry/recovery behavior - 🟡 Partial
      <br>_`check-llm-failure-guardrails.mjs` (`:staged`/`:changed`/`:strict` variants) targets LLM-call failure paths only, not all retry/recovery_
- [ ] Offline/degraded behavior where relevant - 🟡 Partial
      <br>_`apps/web/app/offline` route exists; `scripts/check-connector-scopes.mjs`/`check-structure-conventions.mjs` reference "offline" incidentally, no dedicated gate_
- [ ] Accessibility - 🟡 Partial
      <br>_Real enforcement exists but only for web routes: `apps/web/scripts/__tests__/a11y-audit.test.ts` drives Playwright+axe over `PRODUCT_ROUTE_PREFIXES`, wired into `ci.yml`; desktop has …_
- [ ] Responsive behavior _(revised)_ - 🟡 Partial
      <br>_apps/web/e2e/qa-05-responsive.spec.ts:9 and responsive-interaction-regressions.spec.ts assert mobile/tablet/desktop layouts, but need QA sign-in and no CI workflow runs them._
- [ ] Telemetry - 🔴 Missing
      <br>_"telemetry" only appears incidentally in `check-rust-egress-boundary.mjs`/`check-trust-boundaries.mjs` (checking telemetry vendors are NOT silently wired for privacy), not a check that telemetry exists per feature_
- [ ] Logging - 🔴 Missing
      <br>_No repo-wide guard found requiring structured logging on new code paths_
- [x] Security review
      <br>_`check-security-gates.mjs`, `check-semgrep-findings.mjs`, CodeQL (`codeql.yml`), `claude-security:scan` skill_
- [ ] Unit tests - 🟡 Partial
      <br>_`vitest.config.ts` runs coverage (`v8` provider, text/json/html reporters) but sets no coverage thresholds, so absence of unit tests is not gated_
- [ ] Integration tests - 🟡 Partial
      <br>_CI (`ci.yml`) runs `pnpm test:affected` against a real Postgres service, but no gate requires a new feature add one_
- [ ] E2E test where user-facing - 🟡 Partial
      <br>_`check-vacuous-e2e.mjs` bans no-op/trivial specs once they exist; `check-surface-reachability.mjs` checks reachability; neither forces a new user-facing feature to ship an E2E spec_
- [ ] Documentation _(revised)_ - 🟡 Partial
      <br>_all six doc guards run only in check:llm-operability (repo-operability.yml:161); deploy-production.yml:4-5 gates on CI only; no branch protection._
- [ ] Feature flag where rollout risk exists - 🔴 Missing
      <br>_grep for feature-flag guard found nothing repo-wide except a mobile hygiene reference; no gate ties "risky rollout" to a flag requirement_
- [x] Migration path when persistent schema changes
      <br>_`check-migration-dependencies.mjs`, `check-neon-migrations.mjs` (both with `.test.mjs` companions) block schema changes without a migration path_
- [x] Backwards-compatible protocol behavior ⛔ **not live**
      <br>_`crates/agiworkforce-protocol` ships `LEGACY_DEVELOPER_SESSION_PROTOCOL_VERSION` fallback (`developer_session.rs:37`) with a dedicated `tests/developer_session_protocol.rs`_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [ ] No mocks or stubs in production paths _(revised)_ - 🟡 Partial
      <br>_scripts/check-mock-exports.mjs:173 validates vi.mock factories in tests, not production code; only production ban is a regex marker scan in scripts/check-llm-failure-guardrails.mjs:83._
- [ ] No dead buttons - 🟡 Partial
      <br>_Covered only via the manual `audit/ui-gaps.csv` ledger type list (`ui-gaps-lib.mjs` `UI_GAP_TYPES`), not a static "onClick with no effect" detector_
- [ ] No fake success state - 🔴 Missing
      <br>_No guard or lint rule found targeting fake/optimistic success UI; relies on the same manual ledger at best_
- [ ] No duplicated business logic across surfaces _(revised)_ - 🟡 Partial
      <br>_apps/web/shared/lib/error-utils.ts:8 ErrorCodes duplicates packages/contracts/types/src/errors.ts:12 and is imported by WebChatPage; guards cover boundaries and plan-tier predicates only._
- [ ] No hardcoded vendor-specific assumptions where an abstraction exists _(revised)_ - 🟡 Partial
      <br>_TS model-id/endpoint guards only in repo-operability.yml:161 (non-gating); only Rust check-no-hardcoded-models.sh blocks, ci.yml:114._

_§0: 3 of 29 done._

---

# 1. Product domains (explicit boundaries)

- [x] AGI Chat
      <br>_`apps/web/app/chat`, `apps/web/features/chat`_
- [x] AGI Work _(revised)_
      <br>_AGI Work is a composer mode with task dock (apps/web/features/chat/lib/agi-work.ts:13-19) and run history page apps/web/app/tasks/page.tsx rendering TasksPage._
- [x] AGI Code
      <br>_`apps/web/app/agi-code`, `apps/web/app/code`, `apps/web/features/code` (`CloudCodePage.tsx`) - gating variable AGI_E2B_EXECUTION is set in production (value not read)_
- [x] Research
      <br>_apps/web/app/features/deep-research/page.tsx is marketing; real feature is apps/web/app/api/research/reports/route.ts plus ResearchPanel.tsx rendered from WebChatPage.tsx._
- [x] Projects
      <br>_`apps/web/features/projects`, nav entry `projects` in `app-nav-items.ts:96`_
- [x] Library
      <br>_`apps/web/features/library`, nav entry `library` in `app-nav-items.ts:113`_
- [x] Artifacts
      <br>_`apps/web/app/chat/artifacts` (redirects into Library per `app-nav-items.ts:106-112`), `packages/ui/unified-chat/src/components/ArtifactRenderer.tsx`_
- [x] Generated files
      <br>_`GeneratedFile` contract type at `packages/contracts/types/src/suite-contracts.ts:607`, `GeneratedFileCard.tsx`_
- [x] Voice
      <br>_`apps/web/app/settings/voice`, `apps/web/app/api/voice`, `VoiceChatDock.tsx`_
- [x] Image generation
      <br>_ImageGenCard is exported but has no consumer; real path apps/web/app/api/media/image/generate/route.ts driven by apps/web/lib/hooks/useMediaGeneration.ts._
- [x] Browser use ⛔ **not live**
      <br>_BrowserActivityBadge has no consumer; real browser use is apps/extension/src/features/computer-use/debuggerSession.ts, extension browser-tools, apps/cli/src/browser_bridge.rs:234._
      <br>⛔ Release check: The Chrome extension has never been published (release workflow never run; no v-ext tag). Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] Computer use
      <br>_`ComputerAction` contract (`suite-contracts.ts:1090`), desktop `ComputerUseSettings`/`ComputerUseConsentDialog` (dist chunks confirm shipped)_
- [x] Remote Control ⛔ **not live**
      <br>_`apps/desktop/src/lib/remoteControlSupport.ts`, `MobileCompanionPanel.tsx`, `CompanionApprovalRequestEvent` contract_
      <br>⛔ Release check: The only desktop release is Tauri v1.2.0 (4 May 2026), Linux assets only.
- [x] Schedules
      <br>_`apps/web/features/schedules`, nav entry `schedules` in `app-nav-items.ts:132`_
- [x] Connectors
      <br>_`apps/web/features/connectors`, `ConnectorPolicy` contract (`enterprise/index.ts:132`)_
- [x] MCP
      <br>_`apps/web/app/connectors/mcp-directory`, `PluginManifestMcpServer` contract, `crates/agiworkforce-mcp`_
- [x] Skills
      <br>_`apps/web/features/skills`, `SkillInterface.ts`/`SkillScope.ts` bindings in `crates/agiworkforce-protocol/bindings` Third pass: built-in skills work; only personal skill authoring is gated off (AGI_USER_SKILL_AUTHORING …_
- [x] Plugins
      <br>_`apps/web/features/plugins`, `packages/contracts/types/src/plugins.ts`_
- [x] Hooks _(revised)_ ⛔ **not live**
      <br>_apps/cli/src/features/hooks/hooks.rs:70-81 implements SessionStart/PreToolUse/UserPromptSubmit lifecycle hooks; /hooks command at crates/agiworkforce-command-registry/src/lib.rs:257._
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [ ] Notifications ⛔ **not live** - 🟡 Partial
      <br>_Desktop has in-app feed apps/desktop/src/features/notifications/NotificationCenter.tsx rendered at v3/Sidebar.tsx:994; web public.notifications table has no reader (0153 header)._
      <br>⛔ Release check: The only desktop release is Tauri v1.2.0 (4 May 2026), Linux assets only.
- [x] Memory
      <br>_`apps/web/app/settings/memory`, `apps/web/app/features/memory`, `packages/contracts/types/src/memory.ts`_
- [x] Personalization _(revised)_
      <br>_packages/ui/ui/src/settings-nav.ts:105 Personalization settings section; server reads personalization namespace apps/web/lib/server/user-identity.ts:136._
- [x] Search
      <br>_`GlobalSearchDialog.tsx`, `apps/web/app/api/search`, `places-search.ts` contract_
- [x] Admin
      <br>_`apps/web/app/admin`, `apps/web/features/admin`, nav entry `admin` (`app-nav-items.ts:146`)_
- [x] Billing
      <br>_`apps/web/features/billing`, `billing-catalog.ts` contract_
- [x] Usage
      <br>_`apps/web/app/settings/usage`, `apps/web/app/workspace/usage`, `UsageLedgerEntry` contract_
- [x] Enterprise governance
      <br>_`packages/contracts/types/src/enterprise/index.ts` (`Organization`, `AdminPolicy`, `ScimUser`, `IdentityProviderConfig`), `apps/web/app/admin/directory-sync`_

_§1: 26 of 27 done._

---

# 2. Supported application surfaces

- [x] Web
      <br>_`apps/web`_
      <br>⛔ Release check: Production web is the 11 Sep 2026 deployment (about 1,000 commits behind main); every production deploy since errored or awaits approval.
- [x] iOS ⛔ **not live**
      <br>_`apps/mobile` (Expo/React Native, iOS target)_
      <br>⛔ Release check: The mobile app has never been released (release-mobile.yml never run; no App Store or Google Play listing).
- [x] Android _(revised)_ ⛔ **not live**
      <br>_apps/mobile/android native project exists; .github/workflows/release-mobile.yml:299 release-android job builds and submits to Play Internal._
      <br>⛔ Release check: The mobile app has never been released (release-mobile.yml never run; no App Store or Google Play listing).
- [x] Electron Desktop ⛔ **not live**
      <br>_`apps/desktop/electron`, `electron-builder.yml`, `dist:electron`/`dev:electron` scripts in `apps/desktop/package.json:16-18`_
      <br>⛔ Release check: The Electron desktop has never been released (release-desktop-cloud.yml never run).
- [x] Tauri Desktop
      <br>_`apps/desktop/src-tauri`, `tauri dev`/`tauri build` scripts, same `package.json:8-13` - both shells coexist in one app dir_
      <br>⛔ Release check: The only desktop release is Tauri v1.2.0 (4 May 2026), Linux assets only.
- [x] CLI
      <br>_`apps/cli`_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] VS Code ⛔ **not live**
      <br>_`apps/extension-vscode`_
      <br>⛔ Release check: The VS Code extension has never been published (Marketplace and Open VSX return nothing; release workflow never run).
- [x] Chrome Extension ⛔ **not live**
      <br>_`apps/extension`_
      <br>⛔ Release check: The Chrome extension has never been published (release workflow never run; no v-ext tag).
- [x] Mobile Remote ⛔ **not live**
      <br>_`apps/desktop/src/features/mobile-companion/MobileCompanionPanel.tsx`, `apps/mobile/src/features/companion`_
      <br>⛔ Release check: The only desktop release is Tauri v1.2.0 (4 May 2026), Linux assets only.
- [ ] Web Remote _(revised)_ - 🔴 Missing
      <br>_apps/web/app/pair/pair-body.tsx:29 says pairing cannot be completed in a browser; no web remote-control surface found under apps/web._
- [x] Admin Console
      <br>_`apps/web/app/admin`, gated by `AGI_PLATFORM_ADMIN_USER_IDS` per `apps/web/shared/components/layout/app-nav-items.ts:143`_
- [x] Background cloud workers
      <br>_signaling-server is WebRTC signaling; background work runs in apps/web/lib/workflows/cloud-agent-workflow.ts (use workflow) and apps/web/app/api/cron/\* jobs._
- [ ] Device runtime - 🟡 Partial
      <br>_No single "device runtime" artifact; the concept is implied by desktop/mobile native runtimes but not separately named or documented_
- [x] Browser runtime ⛔ **not live**
      <br>_Chrome extension content/background scripts (`apps/extension/src/background.ts`)_
      <br>⛔ Release check: The Chrome extension has never been published (release workflow never run; no v-ext tag).
- [x] Developer runtime ⛔ **not live**
      <br>_DeveloperSessionSurface is only a type; runtime is crates/agiworkforce-app-server/src/developer_sessions.rs serve_developer_session_io, hosted by apps/cli/src/app_server._
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.

Each surface must document:

- [ ] Which domains it supports - 🔴 Missing
      <br>_No per-surface domain matrix found; `docs/generated/trust-mode-surface-matrix.md` and `docs/architecture/trust-boundaries.md` both document trust modes and capabilities, not which product domains (§1) a surface supports_
- [x] Which trust modes it supports
      <br>_Docs are not evidence; code source is packages/ai/model-registry/catalog/harnesses.json runtimeProfiles (surface plus trustMode per profile), verified by check:doc-matrices._
- [ ] Which capabilities are native - 🟡 Partial
      <br>_Code source is packages/ai/model-registry/catalog/harnesses.json runtimeProfiles features map, covering 6 surfaces only._
- [ ] Which capabilities require another host - 🟡 Partial
      <br>_requiresEnvironment gating exists in ModelCatalogue.tsx:452 but ComposerFooter.tsx:282 says no model sets it; SessionHostRequirement contract at sessions/taxonomy.ts:123._
- [x] Which data is local ⛔ **not live**
      <br>_StorageScope local_device suite-contracts.ts:30; routing_logic_tests.rs:143 local excludes managed cloud; apps/mobile/**tests**/trust-boundary.test.ts:59, run by check-trust-boundaries in CI._
      <br>⛔ Release check: The mobile app has never been released (release-mobile.yml never run; no App Store or Google Play listing).
- [x] Which data is Cloud
      <br>_packages/contracts/trust-boundaries/src/egress-policy.ts OUR_CLOUD_HOSTS and StorageScope managed_compute/synced_app_cloud suite-contracts.ts:30._
- [x] Which data is synced
      <br>_SyncedAppSurface web/desktop/mobile suite-contracts.ts:26; desktop-cloud-sync proof send_message_setup.rs in scripts/check-trust-boundaries.mjs._
- [x] Which data must never sync ⛔ **not live**
      <br>_apps/extension/**tests**/trust-boundary.test.ts:54 no API keys in extension storage; routing_logic_tests.rs:200 byok rejects managed providers._
      <br>⛔ Release check: The Chrome extension has never been published (release workflow never run; no v-ext tag).

_§2: 18 of 23 done._

---

# 3. Canonical terminology (exactly one vocabulary)

- [x] Chat _(revised)_
      <br>_Conversation is the canonical entity (packages/contracts/types/src/conversation.ts), not a Chat rename; ChatConversationBoundary.tsx:22 fallbackRender shows ChatFailureNotice, not boundary default copy._
- [ ] Work _(revised)_ - 🟡 Partial
      <br>_Web run history is titled Tasks (apps/web/app/tasks/page.tsx:7) and dock label Task (agi-work.ts:13), competing with AGI Work._
- [x] Code
      <br>_`apps/web/app/code`, `apps/web/app/agi-code`; no alternate ("Coding"/"Dev") found used as a section label distinct from these routes_
- [x] Project
      <br>_`apps/web/features/projects`, nav label `Projects` (`app-nav-items.ts:98`); grepped for "Folder" across web/mobile/desktop/extension - only hit is a `lucide-react-native` icon import named `Folder` used as an icon …_
- [x] Library
      <br>_`apps/web/features/library`, nav label `Library` (`app-nav-items.ts:116`); grepped for "Assets" - only hit is marketing copy "the assets and boilerplate at..." (`apps/web/app/founder/page.tsx:84`), unrelated to the …_
- [x] Artifact
      <br>_`packages/ui/unified-chat/src/components/ArtifactRenderer.tsx`; grepped for "Canvas" - only hit is `LeafletMapCanvas.tsx` (a map-rendering component's own generic "canvas" naming), not a rename of Artifact_
- [x] Generated file
      <br>_`GeneratedFile` contract (`packages/contracts/types/src/suite-contracts.ts:607`), `GeneratedFileCard.tsx`; no "Output" used as a competing user-facing label found in the same feature files_
- [x] Research
      <br>_`apps/web/app/features/deep-research`; no alternate term checked found competing with it in the six app surfaces_
- [x] Schedule
      <br>_`apps/web/features/schedules`, nav label `Schedules` (`app-nav-items.ts:135`); `TriggerType`/`EventTriggerDefinition` (`packages/contracts/types/src/event-triggers.ts:16,195`) is internal plumbing for the same feature, …_
- [x] Connector
      <br>_`apps/web/features/connectors`; grepped for "Integration" - hits are `apps/mobile/src/features/integrations` (OS-level permission/integration status for notifications, a different concept) and desktop test-config paths, …_
- [x] MCP
      <br>_`apps/web/app/connectors/mcp-directory`, `PluginManifestMcpServer` - acronym used consistently, no alternate name found_
- [x] Skill
      <br>_`apps/web/features/skills`, `SkillInterface.ts` (Rust-generated); grepped for "Capability" - hits are the unrelated tool/lockdown "Capabilities" settings section (`CapabilitiesSection.tsx:32`, already established as a …_
- [x] Plugin
      <br>_`apps/web/app/plugins/page.tsx:21,54,59` ("Plugins bundle skills and connectors..."); grepped for "Extension" across all six surfaces - hits are the Chrome/VS Code Extension surfaces themselves (a legitimately …_
- [x] Hook _(revised)_ ⛔ **not live**
      <br>_User-visible /hooks Manage hooks configuration at crates/agiworkforce-command-registry/src/lib.rs:257; Hook\* protocol bindings; no competing term found._
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] Tool
      <br>_`SuiteToolEvent`, `ToolCallCard.tsx`, `ToolApprovalDefaultsPanel.tsx` - consistent; no competing "Action" label found in the same components_
- [ ] Approval _(revised)_ - 🟡 Partial
      <br>_Approval policy page titled Agent permissions (apps/web/app/agent-permissions/page.tsx:19); CLI command permissions with alias approvals (command-registry lib.rs:251-255)._
- [ ] Remote ⛔ **not live** - 🟡 Partial
      <br>_`RemoteControlEvent`-equivalent types (`CompanionApprovalRequestEvent`, `cross-device.ts:201`) and `apps/desktop/src/lib/remoteControlSupport.ts` use "Remote", but the user-visible heading in …_
      <br>⛔ Release check: The only desktop release is Tauri v1.2.0 (4 May 2026), Linux assets only.
- [x] Local
      <br>_`PrivacyMode`/`DeveloperSessionTrustMode` both use `'local'` consistently (`suite-contracts.ts:18`, generated `DeveloperSessionTrustMode.ts`); no "On-Device" alternate found replacing it as a trust-mode label_
- [x] BYOK
      <br>_Used consistently as the acronym across `PrivacyMode`, `ProviderMode.DirectByok`, and `docs/architecture/trust-boundaries.md`_
- [ ] Managed Cloud - 🟡 Partial
      <br>_Canonical in contracts (`ChatExecutionMode.cloud_managed`, `ProviderMode.ManagedGateway`/`ManagedNative`) and in `docs/architecture/trust-boundaries.md`'s table headers; but `apps/web/app/layout.tsx:62` marketing copy …_
- [ ] Workspace _(revised)_ - 🟡 Partial
      <br>_Mixed, not absent: Workspace in WorkspaceMenuItems.tsx and /workspace routes, Team in settings-nav.ts:290; same severity as rows 96 and 99._
- [x] Organization
      <br>_`Organization`/`OrganizationRole`/`OrganizationMember` (`enterprise/index.ts:18,52,61`); grepped for "Company" - only hit is a beta-application-form field asking the visitor's employer name …_
- [x] Device ⛔ **not live**
      <br>_`DevicePairing` (`cross-device.ts:277`); grepped for "Machine" - only hit is `apps/desktop/electron/shellIdentity.ts:61` describing a CLI credential tied to "this machine", a hardware-identity comment, not a user-facing …_
      <br>⛔ Release check: The Electron desktop has never been released (release-desktop-cloud.yml never run).
- [x] Developer session
      <br>_`DeveloperSession` (`suite-contracts.ts:431`), `DeveloperSessionSurface`/`DeveloperSessionTrustMode` (Rust-generated) - used consistently in both TS and Rust_
- [ ] Work session - 🟡 Partial
      <br>_Term is in use: CloudWorkSession sessions/taxonomy.ts:198 and AGI Work session label agi-work.ts:19; competes with Task/Tasks labels._

_§3: 19 of 25 done._

---

# 4. Trust modes

- [x] Local
      <br>_`PrivacyMode`/`ChatExecutionMode`/`DeveloperSessionTrustMode` all define `'local'` (`suite-contracts.ts:18,24`; generated `DeveloperSessionTrustMode.ts`)_
- [x] BYOK
      <br>_Same enums define `'byok'`; `ProviderMode.DirectByok` (`suite-contracts.ts:20`)_
- [x] Managed Cloud
      <br>_`ChatExecutionMode.cloud_managed`, `ProviderMode.ManagedGateway`/`ManagedNative` (`suite-contracts.ts:20,24`), `DeveloperSessionTrustMode` value `'managed'`_

Check:

- [x] Visible current trust mode ⛔ **not live**
      <br>_ChatExecutionModeDisplayCopy has no consumer; visible mode is apps/mobile/src/features/chat/components/ModeToggle.tsx rendered in app/(app)/(tabs)/chat.tsx._
      <br>⛔ Release check: The mobile app has never been released (release-mobile.yml never run; no App Store or Google Play listing).
- [x] Provider identity
      <br>_`ProviderPolicy` (`enterprise/index.ts:120`), `provider.ts` contract; `docs/architecture/trust-boundaries.md` requires BYOK to show "a visible provider label"_
- [x] Storage scope
      <br>_`StorageScope` type (`suite-contracts.ts:30`)_
- [x] Network destination
      <br>_`packages/contracts/trust-boundaries/src/egress-policy.ts` (`OUR_CLOUD_HOSTS`), enforced by `check-rust-egress-boundary.mjs`_
- [ ] Usage implications - 🟡 Partial
      <br>_`ManagedComputeEligibility`/`ManagedUsageReservation` (`enterprise/index.ts:343,356`) cover Managed Cloud usage/cost; no equivalent usage-implication copy contract found for Local/BYOK_
- [x] No silent trust-mode fallback
      <br>_`check-trust-boundaries.mjs` runs `trust-boundary.test.ts` for web/extension/mobile/vscode/types plus Rust `routing_logic_tests`/`send_message_setup::tests` for desktop_
- [x] Local never silently becomes Cloud
      <br>_Same guard; also statically bans Sentry/telemetry wiring in desktop native diagnostics (`desktopNativeDiagnosticSources` check in `check-trust-boundaries.mjs`); documented as invariant 1 in …_
- [x] BYOK never silently uses Managed Cloud
      <br>_Covered by the same per-surface `trust-boundary.test.ts` suite; documented as invariant 2 ("BYOK is private and surface-scoped")_
- [ ] Managed never silently exposes user credentials - 🟡 Partial
      <br>_No test file in `check-trust-boundaries.mjs`'s proof list is specifically named for credential exposure; inferred coverage only via the separate `check-secrets.mjs` guard, not a dedicated trust-boundary test_
- [x] Explicit transition UI ⛔ **not live**
      <br>_`HandoffDraft` (`suite-contracts.ts:473`) carries `consentRequired`/`consentedAt`/`expiresAt`, consumed by real UI: `apps/desktop/src/features/context-handoff/CloudFolderAttachSheet.tsx`, …_
      <br>⛔ Release check: The only desktop release is Tauri v1.2.0 (4 May 2026), Linux assets only. The VS Code extension has never been published (Marketplace and Open VSX return nothing; release workflow never run).
- [x] Context preview before boundary crossing
      <br>_Preview UI packages/ui/unified-chat/src/components/LocalByokHandoffDialog.tsx (previewHashSha256), gated in apps/web/features/chat/pages/WebChatPage.tsx:3182._
- [x] Secret scan before boundary crossing
      <br>_packages/platform/utils/src/privacyHandoff.ts:147 blocks on findings; enforced at WebChatPage.tsx:3182 and CloudFolderAttachSheet.tsx:232._
- [x] User consent where appropriate ⛔ **not live**
      <br>_consentedAt field has no consumer; consent enforced in apps/desktop/src/features/context-handoff/CloudFolderAttachSheet.tsx (consent test) and LocalByokHandoffDialog.tsx._
      <br>⛔ Release check: The only desktop release is Tauri v1.2.0 (4 May 2026), Linux assets only.
- [ ] Audit event _(revised)_ - 🟡 Partial
      <br>_createAuditEvent (audit.ts:91) has no caller; no audit write in context-handoff or localByokHandoff paths; EnterpriseAuditEvent only serves org audit route._

_§4: 14 of 17 done._

---

# 5. Canonical contracts package

- [x] User
      <br>_`packages/contracts/types/src/user.ts`_
- [ ] Account - 🔴 Missing
      <br>_Searched `packages/contracts/types/src` for `Account` entity - not found as a distinct type from `User`/`Organization`_
- [x] Organization
      <br>_`enterprise/index.ts:52`_
- [ ] Workspace - 🟡 Partial
      <br>_No standalone `Workspace` type; `/workspace` routes and `useIsWorkspaceAdmin` hook treat Workspace as a UI alias for `Organization` (`OrganizationRole`, `enterprise/index.ts:18`)_
- [x] Membership
      <br>_`OrganizationMember` (`enterprise/index.ts:61`), `ProjectMember` (`suite-contracts.ts:519`)_
- [x] Role
      <br>_`OrganizationRole` (`enterprise/index.ts:18`), `ProjectMemberRole` (`suite-contracts.ts:517`)_
- [x] Device _(revised)_
      <br>_DeviceInfo at packages/contracts/types/src/pairing.ts:73; device inventory persisted in desktop_devices/mobile_devices/device_pairings tables (apps/web/db/neon/0013_devices.sql)._
- [x] Entitlement
      <br>_`subscription-entitlement.ts`, `ManagedComputeEligibility` (`enterprise/index.ts:343`)_
- [x] Subscription
      <br>_`subscription-entitlement.ts`, billing types in `billing-catalog.ts`_
- [x] Usage
      <br>_`usage-vocabulary.ts`, `UsageLedgerEntry` (`enterprise/index.ts:290`)_
- [x] Conversation
      <br>_`conversation.ts`, `SyncedAppConversation` (`suite-contracts.ts:358`)_
- [x] Message
      <br>_`SyncedAppMessage` (`suite-contracts.ts:374`), `chat.ts`_
- [x] Project
      <br>_`ProjectRecord` (`suite-contracts.ts:493`)_
- [x] File
      <br>_`file-input.ts`, `ProjectKnowledgeFile` (`suite-contracts.ts:535`)_
- [x] Artifact
      <br>_`artifacts.ts`_
- [x] Generated file
      <br>_`GeneratedFile` (`suite-contracts.ts:607`)_
- [x] Chat intent
      <br>_`ChatIntent` (`suite-contracts.ts:268`)_
- [x] Work session _(revised)_
      <br>_CloudWorkSession (kind cloud_work) at packages/contracts/types/src/sessions/taxonomy.ts:198, part of the AppSession union._
- [x] Developer session ⛔ **not live**
      <br>_`DeveloperSession` (`suite-contracts.ts:431`), Rust `developer_session.rs`, generated `DeveloperSessionTrustMode.ts`_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] Tool event
      <br>_SuiteToolEvent has no consumer; canonical ToolEvent Started/Progress/Completed at packages/contracts/types/src/tool-events.ts:151._
- [x] Approval
      <br>_`tool-approval-policy.ts`, `PermissionDecision` (`suite-contracts.ts:318`)_
- [x] Model
      <br>_`model.ts`, `model-catalog.ts`_
- [x] Provider
      <br>_`provider.ts`, `provider-adapter.ts`_
- [x] Connector
      <br>_`ConnectorStatusSnapshot` (`suite-contracts.ts:307`), `ConnectorPolicy` (`enterprise/index.ts:132`)_
- [x] Skill
      <br>_`SkillInterface.ts`/`SkillScope.ts` (Rust-generated, `crates/agiworkforce-protocol/bindings`) - lives in the protocol crate, not `packages/contracts/types`_
- [x] Plugin
      <br>_`plugins.ts` (`PluginManifest`, `PluginRegistryEntry`)_
- [x] MCP server
      <br>_`PluginManifestMcpServer` (`plugins.ts:113`)_
- [x] Hook _(revised)_ ⛔ **not live**
      <br>_ts-rs generated crates/agiworkforce-protocol/bindings/HookEventName.ts, HookRunSummary.ts, HookStartedEvent.ts, same location accepted for Skill in row 146._
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] Browser action
      <br>_`browser-bridge.ts`_
- [x] Computer action
      <br>_`ComputerAction` (`suite-contracts.ts:1090`)_
- [x] Remote-Control event
      <br>_`CompanionApprovalRequestEvent`/`ControlReceiptEvent` (`cross-device.ts:201,239`)_
- [ ] Notification - 🔴 Missing
      <br>_No Notification contract confirmed; but a notifications table does exist (apps/web/db/neon/0016_misc.sql, RLS 0153) with no reader._
- [x] Schedule
      <br>_`scheduler.ts`_
- [x] Audit event
      <br>_`AuditEvent` (`audit.ts:41`), `EnterpriseAuditEvent` (`enterprise/index.ts:171`)_
- [x] Generate TypeScript, Rust and native bindings where practical
      <br>_`crates/agiworkforce-protocol/bindings/*.ts` (ts-rs generated, `check:protocol-types` guard) plus hand-written TS contracts; native (Swift/Kotlin) bindings not found for mobile - Partial in practice but ts-rs …_

_§5: 32 of 35 done._

---

# 6. Protocol versioning

- [x] Protocol version ⛔ **not live**
      <br>_`InitializeParams.protocolVersion?: number` (generated `InitializeParams.ts`), `LEGACY_DEVELOPER_SESSION_PROTOCOL_VERSION = 7` (`crates/agiworkforce-protocol/src/developer_session.rs:37`)_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [ ] Schema version - 🟡 Partial
      <br>_`computeCapabilityDocumentVersion`/`CAPABILITY_DOCUMENT_VERSION_UNRESOLVED` (`packages/contracts/types/src/capability-handshake/versioning.ts:37,58`) versions the entitlement document only, not a general wire-schema …_
- [ ] Minimum supported client version _(revised)_ - 🟡 Partial
      <br>_No minimum client version number, but apps/web/app/api/chat/sync/route.ts:754 rejects legacy clients with requiredProtocolVersion 2 (also memory/sync, uploads/presign)._
- [ ] Minimum supported runtime version _(revised)_ ⛔ **not live** - 🟡 Partial
      <br>_apps/extension-vscode/src/integrations/localRuntimeClient.ts:52 MINIMUM_SUPPORTED_CLI_VERSION 1.7.1 enforced at :1252; no other surface enforces a runtime minimum._
      <br>⛔ Release check: The VS Code extension has never been published (Marketplace and Open VSX return nothing; release workflow never run).
- [x] Client identification
      <br>_`AppServerClientInfo` referenced by `InitializeParams.clientInfo`_
- [x] Capability negotiation _(revised)_ ⛔ **not live**
      <br>_initialize negotiates against SUPPORTED versions and returns AppServerCapabilities (crates/agiworkforce-app-server/src/developer_sessions.rs:683-718); VS Code checks them at localRuntimeClient.ts:1132._
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [ ] Experimental capability negotiation _(revised)_ - 🟡 Partial
      <br>_experimental_api field (developer_session.rs:238) is never read by app-server or CLI; only a test asserts it is omitted._
- [x] Graceful old client ⛔ **not live**
      <br>_`developer_session.rs:31` doc comment + fallback to `LEGACY_DEVELOPER_SESSION_PROTOCOL_VERSION`, asserted at `developer_session.rs:1315`_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [ ] Graceful old server - 🟡 Partial
      <br>_The same fallback constant is bidirectional by construction, but no test was found exercising the client-sees-old-server direction specifically_
- [ ] Unknown enum handling - 🟡 Partial
      <br>_`DeveloperSessionTrustMode` reserves an explicit `'unknown'` variant (generated `DeveloperSessionTrustMode.ts`) - confirmed for this one enum; not verified as a repo-wide pattern applied to every protocol enum_
- [ ] Unknown event handling _(revised)_ - 🟡 Partial
      <br>_VS Code parseRuntimeEvent drops unrecognised notifications (localRuntimeClient.ts:600 returns undefined); SessionSource has serde(other) protocol.rs:2332; agent event enums stay closed._
- [x] Optional field handling
      <br>_`InitializeParams.experimentalApi?`/`protocolVersion?` are optional; ts-rs mirrors Rust `Option<T>` throughout the generated bindings_
- [ ] Unsupported feature hidden - 🟡 Partial
      <br>_developer_session.rs:268 v8 capability flags are documented as hide-when-false, but no client reads account/skills/hooks/plugins flags._
- [x] Explicit upgrade required _(revised)_
      <br>_SYNC_PROTOCOL_UPGRADE_REQUIRED Upgrade this client (apps/web/app/api/chat/sync/route.ts:758); VS Code shows version 1.7.1 or newer is required (localRuntimeClient.ts:1128)._
- [x] Migration tests ⛔ **not live**
      <br>_`crates/agiworkforce-protocol/tests/developer_session_protocol.rs`_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] Cross-language contract tests ⛔ **not live**
      <br>_`crates/agiworkforce-protocol/tests/export_bindings.rs` (exports and diffs generated TS bindings against the committed tree), enforced by `check:protocol-types` in CI_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] No malformed fallback behavior
      <br>_`apps/cli/src/config.rs:398` ("malformed, treat as remote (safer)") and `crates/agiworkforce-protocol/src/permissions.rs:277` ("fail closed on malformed deny patterns") both fail to a safe state rather than silently …_

_§6: 9 of 17 done._

---

# 7. Design system

- [x] Typography
      <br>_`packages/ui/design-tokens/src/foundation.css` type tokens_
- [x] Font fallback
      <br>_`apps/web/app/globals.css` font stacks_
- [x] Type scale
      <br>_`foundation.css`_
- [x] Spacing
      <br>_`foundation.css`_
- [x] Radius
      <br>_`packages/ui/design-tokens/src/chat.css:119-124` (`--chat-radius-sm..2xl`), `foundation.css:173` "one radius ladder for every surface"_
- [x] Borders
      <br>_`chat.css:117-118` (`--chat-warning-border`, role-specific border tokens)_
- [x] Elevation
      <br>_`foundation.css:231-234` (`--elevation-1..4`), dark variant `:347-350`, referenced via `chat.css:47`_
- [x] Surface hierarchy
      <br>_`--surface-selected`/`--surface-active` (`foundation.css:141,144,320,321`), `--chat-surface-hover` (`chat.css:49,150`)_
- [x] Accent colors
      <br>_`--chat-accent-primary*` token family (`chat.css`)_
- [x] Semantic colors
      <br>_`chat.css:113-118,192-196` define the `--chat-info/success/warning(+bg/border/fg)` family; `foundation.css:156-158,331-333` define `--danger-text/fill/on-fill`_
- [x] Success
      <br>_`--chat-success` (`chat.css:114,193`)_
- [x] Warning
      <br>_`--chat-warning`/`--chat-warning-bg`/`--chat-warning-border`/`--chat-warning-fg` (`chat.css:115-118,194-196`)_
- [x] Error
      <br>_`--danger-text`/`--danger-fill`/`--danger-on-fill` (`foundation.css:156-158,331-333`) - implements the error semantic under the name "danger", matching the fill/text/on-fill role split the rules file names as the …_
- [x] Info
      <br>_`--chat-info` (`chat.css:113,192`)_
- [x] Focus
      <br>_`--chat-focus-ring` (`chat.css:90,179`)_
- [x] Disabled
      <br>_`--text-disabled` (`foundation.css:133,312`)_
- [x] Selected
      <br>_`--surface-selected` (`foundation.css:144,321`)_
- [x] Hover
      <br>_`--chat-surface-hover`, `--chat-code-copy-hover-bg`/`-fg` (`chat.css:49,57-58,150,158-159`)_
- [x] Pressed
      <br>_`--surface-active` (`foundation.css:141,320`), distinct from `--chat-surface-hover`_
- [ ] Loading - 🟡 Partial
      <br>_`Spinner.tsx`/`Skeleton.tsx` primitives exist (§8) and use surface/muted tokens, but no color token specifically named for a loading state was found (e.g. no `--chat-loading*` family distinct from `--surface-*`)_

_§7: 19 of 20 done._

---

# 8. Shared frontend components

- [x] Button
      <br>_`primitives/Button.tsx`_
- [x] Icon button _(revised)_
      <br>_packages/ui/ui/src/primitives/Button.tsx:25 shared Button has an icon size variant, which is the icon button._
- [x] Input
      <br>_`primitives/Input.tsx`_
- [x] Textarea
      <br>_`primitives/Textarea.tsx`_
- [ ] Search - 🟡 Partial
      <br>_No standalone `Search` input primitive; `GlobalSearchDialog.tsx` implements search as a feature, not a shared primitive_
- [x] Select
      <br>_`primitives/Select.tsx`_
- [ ] Combobox _(revised)_ - 🟡 Partial
      <br>_primitives/Command.tsx (cmdk) exists as the combobox list base; only combobox is apps/web/shared/components/CommandPalette/CommandPalette.tsx:371 role=combobox._
- [x] Menu
      <br>_`primitives/DropdownMenu.tsx`, `primitives/ContextMenu.tsx`, `primitives/useMenuKeyboard.ts` (the mandated primitive per `.claude/rules/ui-colour-and-interaction.md`)_
- [x] Context menu
      <br>_`primitives/DropdownMenu.tsx`, `primitives/ContextMenu.tsx`, `primitives/useMenuKeyboard.ts` (the mandated primitive per `.claude/rules/ui-colour-and-interaction.md`)_
- [x] Popover
      <br>_`primitives/Popover.tsx`_
- [x] Tooltip
      <br>_`primitives/Tooltip.tsx`_
- [x] Modal
      <br>_`primitives/Dialog.tsx`, `primitives/AccessibleDialog.tsx`_
- [x] Drawer
      <br>_`primitives/Drawer.tsx`_
- [x] Sheet
      <br>_`primitives/Sheet.tsx`_
- [x] Toast
      <br>_`primitives/SonnerToaster.tsx`_
- [x] Banner _(revised)_
      <br>_primitives/Alert.tsx:7 default/destructive/success/warning variants with aria-live is the shared banner, used e.g. TwoFactorEnrollment.tsx._
- [x] Tabs
      <br>_`primitives/Tabs.tsx`_
- [ ] Segmented control - 🟡 Partial
      <br>_`primitives/ToggleGroup.tsx` is the closest match; no component named "segmented control"_
- [x] Badge
      <br>_`primitives/Badge.tsx`_
- [x] Avatar
      <br>_`primitives/Avatar.tsx`_
- [x] Skeleton
      <br>_`primitives/Skeleton.tsx`_
- [x] Spinner
      <br>_`primitives/Spinner.tsx` (the mandated primitive per `.claude/rules/ui-colour-and-interaction.md`)_
- [x] Progress bar
      <br>_`primitives/Progress.tsx`_
- [x] Code block
      <br>_`packages/ui/unified-chat/src/components/markdown/codeBlock.css` + `HighlightedCode.tsx`_
- [x] Tool card
      <br>_`unified-chat/src/components/ToolCallCard.tsx`_
- [x] File card
      <br>_`unified-chat/src/components/DownloadCard.tsx` (closest match; no component literally named "FileCard")_
- [x] Source card
      <br>_`unified-chat/src/components/WebSearchCard.tsx`_
- [ ] Approval card - 🟡 Partial
      <br>_No dedicated `ApprovalCard`; approval UI is embedded in `ToolCallCard.tsx` and code-surface components (`CodeTranscript.tsx`, `LocalSessionPanel.tsx`)_
- [x] Artifact card
      <br>_ArtifactPanel.tsx lives in apps/desktop/src/features/artifacts, not unified-chat; web card apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx; shared ArtifactRenderer.tsx._
- [x] Generated-file card
      <br>_`unified-chat/src/components/GeneratedFileCard.tsx`_
- [ ] Model badge - 🟡 Partial
      <br>_No dedicated `ModelBadge`; model identity likely rendered inline in composer/model-catalogue components, not confirmed as a shared badge primitive_
- [x] Provider badge
      <br>_`packages/ui/ui/src/ProviderMark.tsx`_
- [ ] Privacy/trust badge - 🟡 Partial
      <br>_No dedicated trust-badge component found; trust-mode display copy exists as data (`ChatExecutionModeDisplayCopy`, §4) but no confirmed shared badge component renders it_

_§8: 27 of 33 done._

---

# 9. Theme system

- [x] Light
      <br>_`foundation.css` light block (e.g. `:156-158`)_
- [x] Dark
      <br>_Dark palette is the .dark class block at packages/ui/design-tokens/src/foundation.css:296, not a prefers-color-scheme guard._
- [x] System
      <br>_System is a next-themes option in apps/web/features/settings/sections/GeneralSection.tsx:39, not implied by the CSS split._
- [x] High contrast
      <br>_`apps/web/app/__tests__/high-contrast-css.test.ts`, `GeneralSection.tsx` toggle, `appearance-namespace.ts`_
- [x] Reduced motion
      <br>_`packages/ui/unified-chat/src/hooks/useReducedMotion.ts`, used in `VideoGenCard.tsx`/`ChartArtifact.tsx`; CSS in `foundation.css`/`globals.css`_
- [x] Code theme
      <br>_`HighlightedCode.tsx` (syntax highlighting theme)_
- [x] Chart theme _(revised)_
      <br>_Chart colours derive from design tokens agiPalette[mode] in packages/ui/unified-chat/src/components/artifact-components/chart-spec.ts:94-119._
- [x] Map theme _(revised)_
      <br>_Map feature exists: apps/web/features/chat/components/messages/cards/map/LeafletMapCanvas.tsx:93 mapTileStyle(tile, dark) themes tiles._
- [x] Artifact theme
      <br>_`ArtifactRenderer.tsx`/`ArtifactPanel.tsx` consume the same `chat.css`/`foundation.css` tokens (design-system tokens are shared, not artifact-specific)_
- [x] Extension theme adaptation ⛔ **not live**
      <br>_No onDidChangeActiveColorTheme in src; VS Code webviews use --vscode-\* vars (sidebar-webview/webviewContent.ts), guarded by apps/extension-vscode/scripts/check-vscode-theme-tokens.mjs._
      <br>⛔ Release check: The VS Code extension has never been published (Marketplace and Open VSX return nothing; release workflow never run).
- [x] Desktop native chrome adaptation ⛔ **not live**
      <br>_`apps/desktop/electron/windowChrome.ts`, `quickAsk.ts`_
      <br>⛔ Release check: The Electron desktop has never been released (release-desktop-cloud.yml never run).
- [x] Mobile status bar ⛔ **not live**
      <br>_`apps/mobile/src/ui/theme/useTheme.ts` and StatusBar usage across `settings/common.tsx`, `feedback/index.tsx`, `reminders/index.tsx`_
      <br>⛔ Release check: The mobile app has never been released (release-mobile.yml never run; no App Store or Google Play listing).
- [x] No hardcoded component colors
      <br>_`check-css-tokens.mjs` (per-surface stylesheet check), `check-theme-only-text-colours.mjs`, `check-no-hex-colors-mobile.mjs` - all wired with `.test.mjs` companions into `check:llm-operability`_

_§9: 13 of 13 done._

---

# 10. Global navigation

- [x] Chat
      <br>_`app-nav-items.ts:86-92` (`chat-home`, non-hideable)_
- [x] Projects
      <br>_`app-nav-items.ts:96-104`_
- [x] Library
      <br>_`app-nav-items.ts:113-122`_
- [ ] Work - 🟡 Partial
      <br>_AGI Work is reached as a composer/chat mode (`agi-work.ts`), not a rail destination_
- [ ] Code where appropriate - 🟡 Partial
      <br>_No `code` entry in `APP_NAV_DESTINATIONS`; AGI Code is reached via `/agi-code`/`/code` routes outside the rail array_
- [ ] Research ⛔ **not live** - 🟡 Partial
      <br>_/features/deep-research is a marketing page; web rail lacks Research, desktop has sidebar.nav.research in apps/desktop/src/features/v3/Sidebar.tsx._
      <br>⛔ Release check: The only desktop release is Tauri v1.2.0 (4 May 2026), Linux assets only.
- [x] Schedules
      <br>_`app-nav-items.ts:132-140`_
- [x] Models
      <br>_`app-nav-items.ts:123-131`_
- [x] Admin
      <br>_`app-nav-items.ts:145-154` (`adminOnly`, gated on org admin/owner)_
- [x] Settings
      <br>_`WebAppShell.tsx:104,379` (`openSettings('general')` via account menu, not the primary rail)_
- [x] Search
      <br>_`WebAppShell.tsx:73,117,158,219-221` (`GlobalSearchDialog`, also bound to an `open-search` app command)_
- [x] New Chat
      <br>_`WebAppShell.tsx:217` (`handleNewChat`)_
- [ ] Account switch _(revised)_ - 🔴 Missing
      <br>_onManageWorkspace opens team settings; no multi-account switch (useSessionList/setActive session appear only in e2e harness)._
- [x] Workspace switch
      <br>_Switcher is apps/web/features/workspaces/components/WorkspaceMenuItems.tsx:60 inside AccountMenuItems.tsx:75, not the team settings link._
- [x] Usage
      <br>_`WebAppShell.tsx:225-226` (`openSettings('usage')`)_
- [ ] Notifications _(revised)_ ⛔ **not live** - 🟡 Partial
      <br>_Desktop sidebar renders NotificationCenter (apps/desktop/src/features/v3/Sidebar.tsx:994); web shell has no notification entry._
      <br>⛔ Release check: The only desktop release is Tauri v1.2.0 (4 May 2026), Linux assets only.
- [x] Help/support
      <br>_`WebAppShell.tsx:380` (`onOpenHelp={() => router.push('/help')}`)_

_§10: 12 of 17 done._

---

# 11. Chat home

- [x] Empty state
      <br>_`apps/web/features/chat/pages/WebChatPage.tsx:5262` isEmptyChat branch renders GreetingBanner + centered composer_
- [x] Composer
      <br>_`apps/web/features/chat/components/Composer/ChatComposerNew.tsx` mounted at `WebChatPage.tsx:5277`_
- [x] Model
      <br>_`onModelChange={handleConversationModelChange}` at `WebChatPage.tsx:5300`; ModelCatalogue.tsx present_
- [x] Mode
      <br>_apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3854 mode buttons call handleWorkModeChange (:1919) setting Chat/AGI Work; the cited AgiWorkAutonomyNotice is only a notice._
- [x] Attachments
      <br>_`droppedFiles={restoredAttachments}` + ComposerFilesMenu.tsx, AttachmentPreview.tsx_
- [x] Web search
      <br>_apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1126,2366 webSearchEnabled derived per model and sent with the turn; cited search types are not the feature._
- [x] Research
      <br>_`ResearchActivity.tsx`, `ResearchPanel.tsx` mounted via MessageBubble; plan/awaiting_approval phases_
- [x] Voice
      <br>_`onEnterVoiceMode={enterVoiceSession}`, `VoiceModeSurface` at `WebChatPage.tsx:5273`_
- [x] Image
      <br>_`onGenerateImage={handleGenerateImage}` at `WebChatPage.tsx:5301`_
- [x] Connector picker
      <br>_`ConnectorToggleRow.tsx`, `use-connectors` hook wired into ComposerPlusMenu_
- [x] Skill invocation
      <br>_apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2008,2067,2549 skill mention items, selection and skillName sent; packages SkillMentionPicker is not used by web._
- [x] Plugin access
      <br>_apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:759,956-985 Plugins submenu loads installed plugins and selects their skills; ComposerPluginsMenu is actually a connector toggle menu, AGI Work bar only._
- [x] Project context
      <br>_`projectPicker={composerProjectPicker}` at `WebChatPage.tsx:5303`_
- [x] Temporary Chat
      <br>_`onSetTemporaryChat={handleSetTemporaryChat}` at `WebChatPage.tsx:5304`; see §18_
- [ ] Draft persistence - 🟡 Partial
      <br>_`ChatComposerNew.draftRestore.test.tsx` exists but draft store scope/cross-device persistence not verified server-side_

_§11: 14 of 15 done._

---

# 12. Composer

- [x] Multiline
      <br>_`ComposerInput.tsx` contentEditable/textarea editor_
- [x] Auto-resize
      <br>_`ChatComposerNew.tsx` editor grows with content (tested via editorArm test)_
- [x] Large paste
      <br>_`packages/platform/utils/src/composerPaste.ts` `LARGE_PASTE_THRESHOLD=10_000`; `ChatComposerNew.largePaste.test.tsx`_
- [ ] Code paste - 🟡 Partial
      <br>_Paste falls through to plain-text insert; no dedicated code-fence auto-wrap detection found_
- [x] File drag/drop
      <br>_`DragDropOverlay.tsx`, `filesFromDataTransfer` in composerPaste.ts_
- [x] Image paste
      <br>_`decideComposerPaste` returns `{kind:'files'}` for clipboard files, same path as drop_
- [x] File picker
      <br>_`ComposerFilesMenu.tsx`_
- [x] Folder picker where supported
      <br>_`useCoworkFolderStore`/`supportsDirectoryPicker`, `ChatComposerNew.tsx:416-421` - explicitly desktop/working-directory-only, web omits it as documented_
- [x] Voice input
      <br>_`VoiceInputButton.tsx`, `DictationStrip.tsx`_
- [x] Mentions
      <br>_apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2006-2011 @-mentions cover skills and projects; FileMentionPicker (packages/ui) has no web caller._
- [x] Commands
      <br>_`SlashCommandMenu.tsx`_
- [x] Context chips
      <br>_apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3213 removable selected-skill chip; cited :3251 is a desktop-only working-folder chip absent on web._
- [x] Remove context
      <br>_"Clear project or folder selection" aria-labels at `ChatComposerNew.tsx:4515,4608`_
- [x] Cancel
      <br>_`onStop`/`handleStopGeneration` wired through composer_
- [x] Send
      <br>_`SendButton.tsx`_
- [x] Stop
      <br>_same `onStop` prop, `SendButton.test.tsx`_
- [x] Keyboard shortcuts
      <br>_`apps/web/features/chat/hooks/use-keyboard-shortcuts.ts` + `KeyboardShortcutsDialog.tsx`_
- [x] IME
      <br>_`e.nativeEvent.isComposing` guards at `ChatComposerNew.tsx:2950-2985`; `dir="auto"` in `ComposerInput.tsx:132`; `env(safe-area-inset-bottom)` in `apps/web/app/globals.css:1579`_
- [x] RTL
      <br>_`e.nativeEvent.isComposing` guards at `ChatComposerNew.tsx:2950-2985`; `dir="auto"` in `ComposerInput.tsx:132`; `env(safe-area-inset-bottom)` in `apps/web/app/globals.css:1579`_
- [x] Mobile keyboard handling
      <br>_`e.nativeEvent.isComposing` guards at `ChatComposerNew.tsx:2950-2985`; `dir="auto"` in `ComposerInput.tsx:132`; `env(safe-area-inset-bottom)` in `apps/web/app/globals.css:1579`_

_§12: 19 of 20 done._

---

# 13. Chat rendering

- [x] User messages
      <br>_`MessageBubble.tsx` isUser branch_
- [x] Assistant messages
      <br>_`MessageBubble.tsx` main render path_
- [x] Tool cards
      <br>_`ToolTimeline.tsx`, `ToolCallCard.tsx` imported at `MessageBubble.tsx:149`_
- [x] Search cards
      <br>_`SearchResponse`/`SearchResult` types, `hasWebSearchSources` at `MessageBubble.tsx:150-151`_
- [x] Source cards
      <br>_`SourcesControl` from `research/ResearchPanel.tsx:161`_
- [x] Images
      <br>_`ImageLightbox.tsx`, `ImageGenerationCard.tsx`_
- [x] Files
      <br>_apps/web/features/chat/components/messages/MessageBubble.tsx:2128-2137 renders DeliverableCard per generated/attached file; cited "equivalent" names were not the renderer._
- [x] Tables
      <br>_`MarkdownContent.tsx:390` table renderer_
- [x] Charts
      <br>_`packages/ui/unified-chat/src/components/artifact-components/ChartArtifact.tsx`, `ChartCanvas.tsx`_
- [x] Maps
      <br>_`PlacesMapCard.tsx`, `lazyMapCards.tsx`, `MapCardFallback.tsx`_
- [x] Code
      <br>_`HighlightedCode.tsx` (shiki), `codeBlock.css`_
- [x] Math
      <br>_`rehypeKatex` in `MarkdownContent.tsx:3`, `preprocessMath.ts`_
- [x] Artifacts
      <br>_`InlineArtifactCards` imported at `MessageBubble.tsx:124`_
- [x] Generated files
      <br>_apps/web/features/chat/components/messages/MessageBubble.tsx:1268,2128 deliverables list renders generated files; GeneratedFileCard is used only inside ArtifactPreview._
- [x] Approval prompts
      <br>_`useToolApprovalResolver`, real approve/reject handlers at `MessageBubble.tsx:808-864`_
- [ ] Browser activity - 🟡 Partial
      <br>_packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:418 mounted in ordinary chat at MessageBubble.tsx:1697; browser steps are generic rows, no dedicated browser card/screenshots._
- [ ] Computer-use activity - 🟡 Partial
      <br>_MessageBubble.tsx:1697 mounts AgentActivityTimeline in ordinary chat; computer-use category maps to generic 'browser' row (AgentActivityTimeline.tsx:418), no screenshot/action card. Not AGI-Work-only as claimed._
- [x] Research activity
      <br>_`ResearchActivity.tsx` imported at `MessageBubble.tsx:163`, phase-driven plan/search/report UI_

_§13: 16 of 18 done._

---

# 14. Markdown

- [x] Headings
      <br>_`MarkdownContent.tsx` remark/rehype pipeline (standard heading components)_
- [x] Lists
      <br>_remark-gfm list rendering, same file_
- [x] Nested lists
      <br>_same remark pipeline, no special-casing needed_
- [x] Blockquotes
      <br>_`MarkdownContent.tsx` component map_
- [x] Tables
      <br>_`MarkdownContent.tsx:390`_
- [x] Links
      <br>_`MarkdownContent.tsx:267` href sanitize comment_
- [x] Images
      <br>_markdown image renderer in component map_
- [x] Code
      <br>_`HighlightedCode.tsx`, shiki highlighter_
- [x] Inline code
      <br>_same component map_
- [x] Math
      <br>_`rehypeKatex`, `preprocessMath.ts`_
- [x] Mermaid
      <br>_`MermaidDiagram.tsx:11,59`_
- [x] Task lists
      <br>_`TASK_LIST_CLASS`/`TASK_LIST_ITEM_CLASS` at `MarkdownContent.tsx:296-297`_
- [x] Escaping
      <br>_react-markdown/remark default text escaping, plus `rehypeSanitize`_
- [x] Unicode
      <br>_`dir="auto"` composer input; markdown text nodes are plain UTF-8, no transform strips non-Latin scripts_
- [x] RTL
      <br>_apps/web/features/chat/components/messages/MessageBubble.tsx:1878 message content wrapper has dir="auto" and text-start; composer dir is not markdown RTL._
- [x] HTML sanitization
      <br>_`rehypeSanitize`, `markdownSanitizeSchema.ts` with its own test file_
- [x] Streaming incomplete markdown
      <br>_`completeInlineTokens.ts`, `splitMarkdownBlocks.ts`, `StreamingMarkdownContent.tsx` - fence/reference-link aware_

_§14: 17 of 17 done._

---

# 15. Streaming

- [ ] Low first-token latency - ⚪ External
      <br>_Cannot verify latency numbers from code; SSE/streaming transport is direct, no obvious added buffering_
- [x] Stable rendering
      <br>_`StreamingMarkdownContent.tsx` settles blocks incrementally rather than re-parsing whole doc_
- [x] No message duplication
      <br>_dedupe via `messageThread.ts`, `replacingSend.ts`_
- [x] No markdown corruption
      <br>_`completeInlineTokens.ts` closes open fences/emphasis before render_
- [x] No scroll jumps _(revised)_
      <br>_apps/web/features/chat/components/messages/ChatMessageList.tsx:1362-1405 scroll anchoring with userScrolledUp suppression and wheel/key intent tracking; auto-follow skipped while reader is scrolled up._
- [x] User scroll override _(revised)_
      <br>_apps/web/features/chat/components/messages/ChatMessageList.tsx:1003,1373,1402,1793 userScrolledUp state stops auto-scroll, shows jump-to-bottom control; fresh user turn resets._
- [x] Stop
      <br>_`handleStopGeneration`, `onStop` throughout composer/message chain_
- [ ] Reconnect - 🟡 Partial
      <br>_apps/web/lib/hooks/inFlightTurnRecovery.ts:16-60 polls durable runs after reload (keeps loading, flags stalls); no live stream reattach to deltas. Durable run continues server-side (completions/route.ts:750)._
- [ ] Continue after transport interruption - 🟡 Partial
      <br>_apps/web/lib/hooks/inFlightTurnRecovery.ts:43-60 only liveness recheck of durable run; no mid-stream resume of token stream on client._
- [x] Tool interleaving
      <br>_`ToolTimeline.tsx` interleaves tool cards with text segments_
- [ ] Usage events _(revised)_ - 🟡 Partial
      <br>_apps/web/shared/stores/web-chat-store.ts:205-212 states no usage stream frame exists (reverted); tokens arrive only with persisted row on reload, absent for temporary chats._
- [x] Final state
      <br>_`persistAssistant` finalization path in `useChatStream.ts:1890`_
- [x] Partial failure state
      <br>_`TranscriptNotice.tsx`, turn-error-notice hook (`use-turn-error-notice.ts`)_

_§15: 9 of 13 done._

---

# 16. Message actions

- [x] Copy
      <br>_`handleCopy` at `MessageBubble.tsx:1479`_
- [x] Edit
      <br>_`handleSaveEdit`, `EditableMessage.tsx`_
- [x] Regenerate
      <br>_`onRegenerate` prop, `handleResendTool` at `MessageBubble.tsx:828`_
- [x] Retry
      <br>_`onRetryResearch`, `onRetryVideo` props_
- [x] Branch
      <br>_`onBranch` at `MessageBubble.tsx:591,2819,2903`_
- [x] Continue
      <br>_`handleContinueMessage` at `WebChatPage.tsx:4422`, wired at `:5336`_
- [x] Read aloud
      <br>_apps/web/features/chat/components/messages/MessageBubble.tsx:2875 Read aloud menu item; handler ChatMessageList.tsx:1480 handleReadAloud using speech hook._
- [x] Share
      <br>_`use-share-conversation.ts` hook, `ConversationTitleMenu.tsx`_
- [x] Save
      <br>_apps/web/features/chat/components/messages/MessageBubble.tsx:2888 Pin message (save) menu item; WebChatPage.tsx:4484 handlePinMessage patches metadata. Move-to-project cite belongs to 349._
- [x] Move to Project
      <br>_`ConversationTitleMenu.tsx` move-to-project menu item, `WebAppShell.tsx`_
- [x] Feedback
      <br>_thumbs up/down + `ComposerFeedbackDialog.tsx` at `MessageBubble.tsx:2696-2741`_
- [x] Report
      <br>_`reportMessage` posts to `/api/content-report` at `MessageBubble.tsx:896-920`_
- [x] Delete
      <br>_`onDelete`/`onDeleteVariant` with confirm dialog at `MessageBubble.tsx:725-758`_
- [x] Archive
      <br>_`onArchiveToggle` in `ConversationTitleMenu.tsx:161`_

_§16: 14 of 14 done._

---

# 17. Conversation history

- [x] Create
      <br>_`apps/web/app/api/chat/conversations/route.ts` POST_
- [x] Rename
      <br>_apps/web/app/api/chat/conversations/[id]/route.ts:145,324 title update handled by PUT (not PATCH); ConversationTitleMenu onRename at WebChatPage.tsx:5079._
- [x] Archive
      <br>_apps/web/app/api/chat/conversations/[id]/route.ts:153-154,220 archived update; ConversationTitleMenu onArchiveToggle wired at WebChatPage.tsx:5084. Cited only a test._
- [x] Delete
      <br>_apps/web/app/api/chat/conversations/[id]/route.ts:25,325 DELETE soft-deletes (deleted_at); WebChatPage.tsx:5085 onDelete. Cited only tests._
- [x] Search
      <br>_web uses packages/ui/ui/src/sidebar/Sidebar.tsx (onOpenSearch) + features/chat/components/dialogs/GlobalSearchDialog.tsx; conversations/route.ts:69 title ilike. Cited unified-chat Sidebar is not web's._
- [x] Pin
      <br>_packages/ui/ui/src/sidebar/Sidebar.tsx:209 pinned sessions; WebAppShell.tsx:254 toggles pinned via updateConversation. Cited unified-chat Sidebar not used by web._
- [x] Date groups
      <br>_packages/ui/ui/src/sidebar/Sidebar.tsx:217-224 temporal grouping via getTemporalGroup. Cited unified-chat Sidebar not used by web._
- [x] Project grouping
      <br>_conversations filtered/grouped by `project_id` in projects UI_
- [x] Pagination
      <br>_`limit`/`offset`/`hasMore`/`nextOffset` in `conversations/route.ts:47-133`_
- [x] Lazy loading
      <br>_same offset-based paging consumed incrementally by sidebar_
- [x] Cross-device sync
      <br>_`apps/web/app/api/chat/sync/route.ts` - server_version cursor sync_
- [x] Deleted-state propagation
      <br>_`route.ts:86-99` selects `deleted_at`, propagated through sync payload_
- [x] Conflict resolution
      <br>_`base_version`/`server_version` compare-and-swap, `'conflict'` kind at `sync/route.ts:151-280`_
- [x] Retention policy
      <br>_`apps/web/lib/services/retention-service.ts:184-251` deletes past org retention window_

_§17: 14 of 14 done._

---

# 18. Temporary Chat

- [x] Clearly indicated
      <br>_"Temporary chat" toggle row in `ComposerPlusMenu.tsx`, header note in `WebChatPage.tsx:3495`_
- [x] Separate retention policy
      <br>_apps/web/app/api/cron/purge-temporary-chats/route.ts:22 RETENTION_DAYS=30, scheduled vercel.json:18; cited client skip is persistence, not retention._
- [x] Memory policy
      <br>_server gates memory write on `isTemporary` at `request-processor.ts:1083,1114`_
- [ ] Connector policy - 🔴 Missing
      <br>_searched `isTemporary` in `apps/web/features/connectors`, `apps/web/app/api/connectors` - no gating found_
- [ ] File-storage policy - 🔴 Missing
      <br>_searched `isTemporary` in `apps/web/app/api/uploads`, `apps/web/app/api/files` - no gating found_
- [ ] Share policy - 🟡 Partial
      <br>_no explicit block found preventing `/api/share` on a temporary conversation; not confirmed either way_
- [x] Save/convert option
      <br>_`updateConversation(id, {isTemporary})` toggle at `WebChatPage.tsx:3503-3534`, and fork-to-temporary at `:3215`_
- [x] No unexpected history persistence
      <br>_`if (isTemporaryConversation) return;` guards message/metadata persistence, `request-processor.ts:1083`_

_§18: 5 of 8 done._

---

# 19. Projects

- [x] Create
      <br>_`ProjectGallery` create flow, `apps/web/app/api/projects/route.ts` POST_
- [x] Rename
      <br>_apps/web/app/api/projects/[id]/route.ts:349 update is PUT (no PATCH export); name handled in handleUpdateProject._
- [ ] Description _(revised)_ - 🟡 Partial
      <br>_apps/web/features/projects/components/ProjectSettingsDialog.tsx:47-97 edits name/instructions only; CreateProjectDialog.tsx:67 sets description only from a template. API accepts it (route.ts:145) but no user input._
- [x] Instructions
      <br>_`page.tsx:272` `instructions: project.instructions`_
- [x] Knowledge files
      <br>_`KnowledgeFilesPanel.tsx`, `apps/web/app/api/projects/[id]/knowledge-files/route.ts`_
- [x] Chats
      <br>_conversations scoped by `project_id`, listed on project page_
- [x] Work sessions ⛔ **not live**
      <br>_`ProjectWorkPanel.tsx` mounted at `page.tsx:1110`_
      <br>⛔ Release check: Production web is the 11 Sep 2026 deployment (about 1,000 commits behind main); every production deploy since errored or awaits approval.
- [ ] Research - 🟡 Partial
      <br>_no project-specific research panel; research runs inside project-scoped chats only (inherited, not dedicated)_
- [x] Artifacts ⛔ **not live**
      <br>_`ProjectArtifactsPanel.tsx` mounted at `page.tsx:1108`_
      <br>⛔ Release check: Production web is the 11 Sep 2026 deployment (about 1,000 commits behind main); every production deploy since errored or awaits approval.
- [ ] Skills - 🔴 Missing
      <br>_no skills panel/wiring found on the project detail page_
- [ ] Connectors - 🔴 Missing
      <br>_no connector panel/wiring found on the project detail page_
- [x] Sharing
      <br>_`organization_shared_projects` table, `org-sharing-service.ts`_
- [x] Permissions
      <br>_`organization_project_access` table (`read`/`write`/`none`), `0086_org_shared_ecosystem.sql:130-147`_
- [x] Search
      <br>_`ProjectGallery.tsx:231` "Search projects"_
- [x] Archive
      <br>_`active`/archived filter at `apps/web/app/chat/projects/page.tsx:37,82`_
- [x] Delete
      <br>_apps/web/app/api/projects/[id]/route.ts:350 DELETE; ProjectSettingsDialog.tsx:129 confirm-delete flow. Cited only a test._
- [x] Project-scoped memory
      <br>_`managed-memory-context-service.ts:190-272` `MemoryScope.projectId`_
      <br>⛔ Deploy risk: apps/web/lib/services/managed-memory-context-service.ts:415 only project-scoped memory writer uses on conflict (user_id,id), needing 0189 (header NOT YET APPLIED); failure swallowed at managed-auto-memory-service.ts:122.
- [x] Project-scoped retrieval
      <br>_`SourcesPanel projectId={project.id}` at `page.tsx:1112`, knowledge extraction scoped per project_
- [x] Cross-device sync
      <br>_`apps/web/app/api/projects/sync/route.ts`_

_§19: 15 of 19 done._

---

# 20. Project collaboration

- [ ] Invite - 🟡 Partial
      <br>_no per-user invite flow; access is org-membership-implicit via `shareProject` to the whole org, not an individual invite_
- [x] Remove
      <br>_"stop sharing" buttons calling `unshareProject`/`useUnshareSharedProject` in `OrganizationSharingSection.tsx:174,225`_
- [x] Viewer
      <br>_`access='read'` option in `OrganizationSharingSection.tsx:274`_
- [ ] Editor - 🟡 Partial
      <br>_DB supports `access='write'` (`0086_org_shared_ecosystem.sql:134`), but the settings UI `<select>` only offers `'read'`/`'none'` (`OrganizationSharingSection.tsx:274`) - not user-reachable_
- [x] Owner
      <br>_project creator is implicit owner (`user_projects.user_id`)_
- [ ] Groups - 🔴 Missing
      <br>_searched for group-based sharing; found only per-org, per-member grants, no group concept_
- [x] Organization sharing
      <br>_`organization_shared_projects` table + UI toggle_
- [ ] Activity - 🟡 Partial
      <br>_`RecentActivityPanel.tsx` exists at org settings level; not project-scoped activity feed_
- [ ] Audit _(revised)_ - 🟡 Partial
      <br>_apps/web/app/api/settings/organization/shared/projects/[projectId]/route.ts:146-148 share/member-access/unshare write no audit event; AuditLogPanel exists but project sharing is not audited._
- [x] Shared files
      <br>_`SourcesPanel projectId readOnly={isSharedProject}`_
- [x] Shared instructions
      <br>_shared project inherits `instructions` field, read-only when `isSharedProject`_
- [ ] Shared artifacts _(revised)_ - 🟡 Partial
      <br>_apps/web/app/api/artifacts/index/route.ts:85 index filters artifacts.user_id=$1, so ProjectArtifactsPanel on a shared project shows only viewer's own; artifacts shared separately via org sharing._
- [x] Access revocation
      <br>_"stop sharing" flow at `OrganizationSharingSection.tsx:225-232`_

_§20: 7 of 13 done._

---

# 21. Library

- [x] All
      <br>_`LibraryTab='all'` default, `LIBRARY_TABS` at `library/LibraryView.tsx:65`_
- [x] Images
      <br>_`LibraryTab='images'` at `LibraryView.tsx:66`_
- [ ] Videos _(revised)_ - 🟡 Partial
      <br>_packages/ui/unified-chat/src/components/library/LibraryView.tsx:72,950 Images tab queries kind image,video and has a video player; no dedicated Videos tab._
- [x] Documents
      <br>_`LibraryTab='documents'` at `LibraryView.tsx:67`_
- [ ] Artifacts - 🟡 Partial
      <br>_covered only via `SurfaceFilter='artifact'` (`LibraryView.tsx:53`), not a visible tab of its own_
- [ ] Generated files - 🟡 Partial
      <br>_folded into `'file'` surface filter, not a distinct category the user picks_
- [x] Upload
      <br>_apps/web/features/library/components/LibraryView.tsx:79 uploadFiles -> uploadChatAttachments; unified LibraryView.tsx:577-592 upload control. AddSourcesModal is the project sources modal._
- [x] Search
      <br>_debounced search input at `LibraryView.tsx:302,335`_
- [x] Filter
      <br>_`surface`/`tab`/`viewDeleted` params at `LibraryView.tsx:343-352`_
- [x] Sort
      <br>_`SortMenu`, `sortFolders` at `LibraryView.tsx:272-279`_
- [x] Grid
      <br>_`LibraryGrid` at `LibraryView.tsx:797`_
- [x] List
      <br>_`LibraryList` at `LibraryView.tsx:798`_
- [x] Preview
      <br>_`viewerItem`, inline image preview at `LibraryView.tsx:572,889`_
- [x] Download
      <br>_`anchor.download = item.file_name` at `LibraryView.tsx:446`_
- [x] Delete
      <br>_soft delete ("Recently deleted", 30-day restore) + permanent delete at `LibraryView.tsx:501-518`_
- [ ] Share - 🟡 Partial
      <br>_no explicit share action found in `LibraryView.tsx`; artifact-level share exists (§23) but not from the Library list itself_
- [ ] Add to Chat _(revised)_ - 🟡 Partial
      <br>_apps/web/features/library/components/LibraryView.tsx:109-116 "Ask about this file" opens /chat with filename in text, explicitly not a real attachment._
- [ ] Add to Project - 🔴 Missing
      <br>_searched repo-wide for "Add to Project"/"Add to Work" - no matches_
- [ ] Add to Work _(revised)_ - 🟡 Partial
      <br>_apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4521 ComposerFilesMenu (AGI Work bar only, :1881) attaches Library items as files; no action from the Library surface itself._

_§21: 12 of 19 done._

---

# 22. File ingestion

Formats:

- [x] PDF
      <br>_`application/pdf` in `CHAT_ATTACHMENT_MIME_TYPES`; `extractPdfAttachmentContent`_
- [x] DOCX
      <br>_`.docx` extension + `application/vnd...wordprocessingml.document`; `extractOfficeDocumentText`_
- [x] XLSX
      <br>_`.xlsx` + spreadsheetml mime, same extractor_
- [x] CSV
      <br>_`text/csv` in mime list_
- [x] PPTX
      <br>_`.pptx` + presentationml mime_
- [x] TXT
      <br>_`text/plain`_
- [x] Markdown
      <br>_`text/markdown`, `.md`_
- [x] JSON
      <br>_`application/json`, `.json`_
- [x] YAML
      <br>_`.yml`/`.yaml` extensions (no dedicated mime, extension-matched)_
- [x] XML
      <br>_`application/xml`, `.xml`_
- [x] Source code
      <br>_`.js/.jsx/.ts/.tsx/.py/.rs/.go/.rb/.sh` in `CHAT_ATTACHMENT_EXTENSIONS` (`chat-attachments.ts:29-49`)_
- [x] Images
      <br>_png/jpeg/gif/webp mimes_
- [ ] Archives where allowed - 🔴 Missing
      <br>_no `.zip`/archive type in `CHAT_ATTACHMENT_MIME_TYPES`/extensions; `upload-scan.ts` explicitly flags ZIP signature as `archive_not_allowed`_
- [ ] Audio - 🔴 Missing
      <br>_no audio mime in chat-attachment allowlist_
- [ ] Video where applicable - 🔴 Missing
      <br>_no video mime in chat-attachment allowlist (video generation output is separate from ingestion)_

Pipeline:

- [x] MIME detection
      <br>_client-declared type checked, then real bytes sniffed server-side via magic-number table in `upload-scan.ts:69-77`_
- [ ] Antivirus - 🟡 Partial
      <br>_signature/structure-based scanner (`upload-scan.ts`) catches active-content SVG/PDF/executables; explicitly documented as not general AV, with an `external_scanner` webhook hook for a real AV product - …_
- [x] Size validation
      <br>_`MAX_CHAT_ATTACHMENT_BYTES`, `byteCount > MAX_CHAT_ATTACHMENT_BYTES` check in `presign/route.ts:109`_
- [x] Parse
      <br>_`extractOfficeDocumentText`, `extractPdfAttachmentContent`, `transcribeScannedPages` (OCR) in `project-knowledge-extraction.ts`_
- [x] Extract
      <br>_`extractOfficeDocumentText`, `extractPdfAttachmentContent`, `transcribeScannedPages` (OCR) in `project-knowledge-extraction.ts`_
- [x] Preview
      <br>_`FilePreviewModal.tsx`, Library preview viewer_
- [ ] Index - 🔴 Missing
      <br>_knowledge files store `extracted_text` as a plain column (`0064_project_knowledge_extraction.sql:4-6`); no search index (no tsvector/pgvector) found_
- [ ] Embed - 🔴 Missing
      <br>_no embedding/vector column found anywhere in `db/neon`; retrieval is raw-text injection, not vector search_
- [x] Metadata
      <br>_`byte_count`, `mime_type`, `checksum`/sha256 tracked through extraction pipeline_
- [ ] Failure/retry - 🟡 Partial
      <br>_failures surface as user-visible errors (`KnowledgeFilesPanel.tsx:111`), but no automatic retry mechanism found - user must re-upload_

_§22: 18 of 25 done._

---

# 23. Artifact system

- [x] Document _(revised)_
      <br>_packages/contracts/types/src/conversation.ts:66 'document' is an ArtifactType; ArtifactPreview.tsx:247-250,909 renders document (pdf/docx) artifacts._
- [x] Code
      <br>_`'code'` in `ArtifactType`_
- [x] HTML
      <br>_`'html'` in `ArtifactType`_
- [x] React
      <br>_`'react'`/`'component'` in `ArtifactType`_
- [x] Diagram
      <br>_`'diagram'`/`'mermaid'` in `ArtifactType`_
- [x] Visualization
      <br>_`'chart'` type, `ChartArtifact.tsx`_
- [ ] Dashboard _(revised)_ - 🟡 Partial
      <br>_no dashboard artifact type in conversation.ts:50-70 or renderer in ArtifactPreview.tsx; "composable primitives" is not a dashboard._
- [x] Report
      <br>_`researchReportToArtifact` at `ResearchReportView.tsx:171`_
- [x] Preview
      <br>_`ArtifactPreview.tsx` main render_
- [x] Full screen
      <br>_`isFullscreen`, `fullscreenchange` handling at `ArtifactPreview.tsx:296-313`_
- [x] Version
      <br>_`versionHistory`, `shownVersionIndex`, `isLatestVersion` at `ArtifactPreview.tsx:164-466`_
- [x] Edit
      <br>_edit-produces-new-version comment at `ArtifactPreview.tsx:460-466`_
- [ ] Fork - 🔴 Missing
      <br>_searched for `forkArtifact`/duplicate-artifact - no matches outside a build cache file_
- [x] Export
      <br>_multiple export formats, `spreadsheetSafeExport`, "Exported to a local file" toast at `ArtifactPreview.tsx:670`_
- [x] Share
      <br>_`ArtifactPublishSelection`, `shareUrl`/`writeToClipboard` at `ArtifactPreview.tsx:657-669`_
- [ ] Project save _(revised)_ - 🟡 Partial
      <br>_apps/web/app/api/artifacts/index/route.ts:29-33 artifact project is derived from its conversation; no artifact-level save-to-project action, only a link (ArtifactPreview.tsx:1516)._
- [x] Library save
      <br>_apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-sources.ts:64 generated outputs tagged surface artifact/file into media_assets, listed by app/api/library/route.ts:56._

_§23: 14 of 17 done._

---

# 24. Research

- [x] Research intent
      <br>_research is a first-class message/tool path (`ResearchActivity.tsx`, `research-plan.ts`)_
- [x] Research plan
      <br>_`ResearchActivity.tsx:30` planning phase, plan step rendering_
- [x] User plan approval where useful
      <br>_`awaiting_approval` phase + Start/Cancel buttons at `ResearchActivity.tsx:172,223-239`_
- [x] Web sources
      <br>_`ResearchSource`/citations, `SourcesControl`_
- [ ] File sources - 🟡 Partial
      <br>_project knowledge files can be referenced in chat generally, but no research-specific "search my files" source toggle found_
- [ ] Connector sources - 🔴 Missing
      <br>_no connector integration found in research plan/panel code_
- [ ] Domain restrictions - 🔴 Missing
      <br>_searched for domain allowlist/denylist on research - none found_
- [x] Source history
      <br>_`ResearchReportsGallery.tsx` lists past reports_
- [x] Progress
      <br>_phase-driven UI (`planning`/`awaiting_approval`/searching/report) in `ResearchActivity.tsx`_
- [ ] Steering - 🔴 Missing
      <br>_no mid-run redirect/refine-plan control found_
- [x] Cancel
      <br>_`onPlanDecision?.('cancel')` at `ResearchActivity.tsx:231`_
- [x] Resume _(revised)_
      <br>_apps/web/app/api/llm/v1/chat/completions/route.ts:540 researchResume passes priorSources/completed steps (research-loop.ts:227-236); Retry button ResearchActivity.tsx:245 resumes interrupted runs._
- [x] Citations
      <br>_`Citation`/`citationAnchorId`/`linkifyCitations` in `ResearchReportView.tsx:38`_
- [x] Report
      <br>_`ResearchReportView.tsx` full render_
- [x] Sources appendix
      <br>_`## Sources` numbered list in `researchReportToMarkdown` at `ResearchReportView.tsx:63-68`_
- [x] Export
      <br>_reuses `documentExportService` (markdown/PDF) at `ResearchReportView.tsx:14-15,269-328`_
- [ ] Project save - 🟡 Partial
      <br>_no report-specific "save to project" action; artifact conversion exists (`researchReportToArtifact`), project save is indirect via "move conversation to Project" (§16)_
- [x] Artifact conversion _(revised)_
      <br>_apps/web/features/chat/components/research/ResearchReportView.tsx:385 "create artifact" button calls researchReportToArtifact; wired via ResearchPanel.tsx:267 onCreateArtifact._

_§24: 13 of 18 done._

---

# 25. AGI Work

- [x] Goal
      <br>_apps/web/app/api/llm/v1/chat/completions/lib/agiwork-plan.ts:14 AgiWorkGoalSchema (goal/constraints/deliverable) entered via ChatComposerNew.tsx:4708 agiWorkFields; WorkSessionPanel:19 is the plan sentence, not the goal_
- [x] Plan
      <br>_`taskDockSummary.ts` + `agiWorkPlanSentence`; plan/steps rendered in dock_
- [x] Long-running execution
      <br>_apps/web/app/api/llm/v1/chat/completions/route.ts:699-800 AGI Work turns start a cloud_agent_runs row and run on the durable Workflow transport; cited enum is only a type_
- [x] Files
      <br>_`WorkSessionPanel.tsx` imports `downloadAllArtifacts`, `downloadGeneratedFile`; TASK_DOCK_FILES_LABEL_
- [x] Projects
      <br>_`WorkSessionPanel.tsx:27` `useProjectStore` wired into panel_
- [ ] Browser _(revised)_ - 🟡 Partial
      <br>_web AGI Work has web_fetch/web search only (request-processor.ts:1370); packages/tools/browser-tool is consumed by apps/extension only; no browser automation in the web Work loop_
- [x] Computer use _(revised)_ ⛔ **not live**
      <br>_apps/web/lib/device-steps/device-tools.ts + request-processor.ts:3735 offer device_screenshot/click/type tools to cloud turns (incl. AGI Work) when the Electron shell declares the grant …_
      <br>⛔ Release check: device-tools.ts absent at prod deploy 107ded474 (2026-09-10); grant comes only from Electron shell, which has no v-cloud-desktop-* tag or release; /api/download?platform=mac returns Installer unavailable
- [x] Research
      <br>_`apps/web/features/chat/components/research/ResearchActivity.tsx` phase incl. planning/executing_
- [x] Connectors
      <br>_apps/web/features/chat/components/Composer/ConnectorToggleRow.tsx (capital C) rendered by ComposerPluginsMenu.tsx:150 and ComposerPlusMenu.tsx:50_
- [x] Skills
      <br>_`Puzzle` icon in panel; skills toggle in composer plugins menu_
- [x] Plugins
      <br>_apps/web/features/chat/components/Composer/ComposerPluginsMenu.tsx (capital C), imported by ChatComposerNew.tsx:67_
- [x] Code execution
      <br>_apps/web/lib/code-execution/required-execution.ts wired at request-processor.ts:41,387 (code_execution flag) running in E2B sandbox (apps/web/lib/e2b)_
- [ ] Subagents _(revised)_ - 🔴 Missing
      <br>_no subagent/child-run concept anywhere in apps/web app/api, lib or features; CLI subagents are not part of the web AGI Work surface_
- [ ] Parallel tasks - 🟡 Partial
      <br>_web loop runs read-only tool calls in parallel (tool-loop.ts:3434 mapWithConcurrency, MAX_PARALLEL_TOOL_CALLS=4) and runs list many concurrent runs; no parallel task fan-out_
- [x] Questions
      <br>_`AskUser`-style interactive card resume flow, `apps/web/features/chat/pages/WebChatPage.tsx:1105` `resumeInteractiveCardTurn`_
- [x] Approvals
      <br>_`apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` paused/approval states consumed_
- [ ] Steering - 🟡 Partial
      <br>_no dedicated "steer mid-run" control found in Work UI; CLI has `turn/steer` (see §29) but web parity unconfirmed_
- [ ] Pause _(revised)_ - 🟡 Partial
      <br>_'paused' only occurs as the approval boundary (cloud-agent-run-service.ts:1208); runs/[runId]/route.ts exposes GET and cancel only, no user-initiated pause control_
- [x] Resume
      <br>_`resumeInteractiveCardTurn`, `WebChatPage.tsx:4095`_
- [x] Cancel
      <br>_apps/web/app/api/llm/v1/chat/completions/runs/[runId]/route.ts:94 POST handleCancel cancels a cloud agent run_
- [x] Background execution _(revised)_
      <br>_route.ts:750-800 durable Workflow transport keeps runs alive after the client closes; lib/hooks/inFlightTurnRecovery.ts reattaches; features/tasks/TasksPage lists runs_
- [x] Deliverables
      <br>_`TASK_DOCK_OUTPUTS_LABEL`, `formatDeliverableTypeLine` in `WorkSessionPanel.tsx`_
- [x] Notifications
      <br>_`apps/web/shared/stores/notification-store.ts`; `WebChatPage.tsx:1532` `sendDesktopNotification`_

_§25: 18 of 23 done._

---

# 26. Work execution states

- [x] Queued
      <br>_`packages/contracts/types/src/generated/protocol/AgentTaskState.ts:12` `'queued'`; also `accepted`/`queued` in cross-device.ts:130_
- [ ] Planning - 🟡 Partial
      <br>_only exists as `BrowserAgentStatus`/'research phase' (`packages/contracts/types/src/runtime.ts:72`), not in the task lifecycle enum itself_
- [x] Running
      <br>_`AgentTaskState.ts:13`_
- [x] Waiting for user
      <br>_`awaiting_input` in both enums, `cross-device.ts:146` label "Waiting for input"_
- [ ] Waiting for approval - 🟡 Partial
      <br>_`awaiting_approval` exists only in the separate `CLOUD_CODE_AGENT_STOP_REASONS` (`packages/contracts/types/src/cloud-code.ts:102`) and `conversation.ts:103`, not in `AgentTaskState`/`DispatchTaskLifecycleStatus` - a …_
- [x] Paused
      <br>_`AgentTaskState.ts:17`; not present in `DispatchTaskLifecycleStatus` (cross-device.ts:130) - enums disagree_
- [ ] Resuming - 🔴 Missing
      <br>_`AgentTaskState.ts:7` comment: "recovery maps back to Running; neither is a durable product state" - explicitly not modeled_
- [x] Completed
      <br>_both enums_
- [ ] Partial - 🔴 Missing
      <br>_no `'partial'` state; `ready_for_review` is the closest ("engine work can finish before a human accepts it", AgentTaskState.ts:6) but is a distinct concept, not "partial completion"_
- [x] Failed
      <br>_both enums_
- [x] Cancelled
      <br>_both enums_
- [ ] Timed out - 🟡 Partial
      <br>_`AgentTaskState.ts:6` explicitly maps timeouts to `Failed`; but `CloudCodeAgentStopReason` (`cloud-code.ts:97` `'timeout'`) keeps it distinct - the two systems disagree on whether timeout is its own state_

_§26: 7 of 12 done._

---

# 27. Subagents

- [x] Parent agent
      <br>_`apps/cli/src/subagent.rs:158` `SubagentManager::new`, owns `allowed_tools`/`disallowed_tools` passed to children_
- [x] Child agent
      <br>_`apps/cli/src/subagent.rs:217` `spawn_inner` spawns dedicated-thread child session_
- [x] Task assignment
      <br>_`spawn(description, prompt)` at `subagent.rs:201`_
- [x] Tool restriction ⛔ **not live**
      <br>_`subagent.rs:138-197` allowed_tools/disallowed_tools propagated via `sync_parent_authority`_
      <br>⛔ Release check: git show b57b308f8:apps/cli/src/subagent.rs:104 SubagentManager::new has no allowed/disallowed tools; v-cli-1.0.0 is the only CLI release users install
- [x] Context restriction
      <br>_`apps/cli/src/subagent.rs:11,131` child gets its own `SystemContext`, not parent's full history_
- [x] Parallelism
      <br>_`subagent.rs:100` `DEFAULT_MAX_CONCURRENT: usize = 7`, enforced at `subagent.rs:247`_
- [x] Result aggregation
      <br>_`SubagentResult` struct (`subagent.rs:64`) + `wait_all`_
- [x] Failure isolation
      <br>_dedicated OS thread per subagent (`subagent.rs:76-78`), status tracked independently_
- [x] Cancellation propagation ⛔ **not live**
      <br>_subagent.rs:506 shutdown_all sets cancel flags, called from developer_host.rs:1836 interrupt; run_subagent select on cancel drops the provider request (:590); line 328 is not an abort_
      <br>⛔ Release check: b57b308f8:apps/cli/src/subagent.rs:290 only per-id cancel(); no shutdown_all or interrupt propagation in released CLI 1.0.0 agent.rs
- [ ] Usage tracking - 🔴 Missing
      <br>_`SubagentResult` (`subagent.rs:64-68`) carries only `output`/`files_modified`, no cost/token field; no subagent references in `apps/cli/src/cost_ledger.rs`_
- [ ] Audit trail _(revised)_ ⛔ **not live** - 🟡 Partial
      <br>_apps/cli/src/agent/chat.rs:1733,1763 fire SubagentStart/SubagentStop hook events (auditable via hooks), but no dedicated subagent audit log_
      <br>⛔ Release check: SubagentStart/SubagentStop hooks absent from v-cli-1.0.0 (git grep b57b308f8 apps/cli/src: no hits); only released CLI
- [x] Max concurrency
      <br>_`subagent.rs:100,247-251` (7, with over-limit error)_

_§27: 10 of 12 done._

---

# 28. AGI Code core

One underlying coding product shared by:

- [x] Desktop _(revised)_ ⛔ **not live**
      <br>_apps/desktop/electron/runtime/developerSessionService.ts:611 spawns `agi app-server`; Tauri shell also runs agent-core run_turn (src-tauri/src/sys/commands/chat/local_turn_host.rs:143)_
      <br>⛔ Release check: Electron shell never released (no v-cloud-desktop-* tag); v-desktop-1.2.0 (4f816a654, Linux-only assets) has no local_turn_host.rs or agent-core
- [x] CLI _(revised)_ ⛔ **not live**
      <br>_CLI is the runtime: apps/cli/src/agent/chat.rs:883 run_turn from crates/agiworkforce-agent-core, served via app_server/developer_host.rs_
      <br>⛔ Release check: released CLI v-cli-1.0.0 (b57b308f8) has no developer_host.rs or agiworkforce-agent-core crate; runs its own agent.rs loop
- [x] VS Code _(revised)_ ⛔ **not live**
      <br>_apps/extension-vscode/src/integrations/localRuntimeClient.ts spawns the CLI app-server; same developer-session protocol_
      <br>⛔ Release check: agiworkforce.agi-workforce not on VS Code Marketplace (0 results) or Open VSX (not found); no v-vscode-* tag, release-vscode-extension.yml never ran
- [ ] Remote - 🔴 Missing
      <br>_apps/cli/src/cli_options.rs:4 remote control intentionally absent; remoteControlSupport.ts:21 only Tauri carries it, not the shared runtime_

Shared runtime:

- [x] Sessions _(revised)_ ⛔ **not live**
      <br>_Electron desktop (developerSessionService.ts:714,836,845 thread/list/resume/start), VS Code and CLI share the CLI ManagedSession store via app-server_
      <br>⛔ Release check: sharing needs Electron desktop and VS Code, neither released; CLI 1.0.0 app_server.rs:88-98 serves only initialize/tools/list/shutdown, no thread/*
- [x] Models _(revised)_ ⛔ **not live**
      <br>_Tauri links agiworkforce-model-registry (src-tauri/Cargo.toml:35, 20 files); Electron uses app-server model/list (dispatcher.ts:710)_
      <br>⛔ Release check: Electron model/list path unreleased; v-desktop-1.2.0 Cargo.toml (4f816a654) has no agiworkforce-model-registry dependency
- [x] Tools _(revised)_ ⛔ **not live**
      <br>_Electron developer sessions execute CLI tools through app-server; Tauri drives agent-core run_turn (local_turn_host.rs:143)_
      <br>⛔ Release check: Electron app-server tools path unreleased; local_turn_host.rs absent in v-desktop-1.2.0; CLI 1.0.0 app_server.rs:93 tools/list is a static name list
- [x] MCP _(revised)_ ⛔ **not live**
      <br>_app-server mcp/list (crates/agiworkforce-protocol/src/developer_session.rs:67) shared by Electron/VS Code; Tauri links agiworkforce-mcp (Cargo.toml:36)_
      <br>⛔ Release check: mcp/list absent from CLI 1.0.0 app_server.rs:88-98; Electron/VS Code unreleased; v-desktop-1.2.0 Cargo.toml lacks agiworkforce-mcp
- [x] Skills _(revised)_ ⛔ **not live**
      <br>_developer_session.rs:62-64 skills/list, setEnabled, consent served by the shared app-server to CLI, VS Code and Electron desktop_
      <br>⛔ Release check: skills/list over app-server absent in CLI 1.0.0 app_server.rs:88-98; VS Code and Electron consumers unpublished
- [x] Plugins _(revised)_ ⛔ **not live**
      <br>_developer_session.rs:65 plugins/list over shared app-server (CLI features/plugins loads plugin skills/agents); Tauri Plugins tab SettingsPanel.tsx:47_
      <br>⛔ Release check: plugins/list absent in CLI 1.0.0 app_server.rs:88-98; shared-runtime consumers (Electron, VS Code) unpublished
- [x] Hooks _(revised)_ ⛔ **not live**
      <br>_developer_session.rs:69 hooks/list; CLI hooks run in the app-server session used by VS Code and Electron desktop_
      <br>⛔ Release check: hooks/list absent in CLI 1.0.0 app_server.rs:88-98; Electron/VS Code app-server sessions never released
- [x] Git
      <br>_both surfaces have git integration (`apps/desktop/src/features/git`, CLI `features/exec/tools/git`) though not literally shared code_
- [x] Terminal
      <br>_both surfaces have a terminal feature (`apps/desktop/src/features/terminal`, CLI TUI)_
- [x] Approvals _(revised)_ ⛔ **not live**
      <br>_developerSessionService.ts:356 handles approval/requested and dispatcher.ts:737 developer_approval_answer relays to CLI approval/respond_
      <br>⛔ Release check: approval/respond absent in CLI 1.0.0 app_server.rs:88-98; developerSessionService.ts is Electron-only, never released
- [x] Sandbox _(revised)_ ⛔ **not live**
      <br>_Electron sessions run CLI sandbox via app-server; Tauri links agiworkforce-sandbox-policy (src-tauri/Cargo.toml:38)_
      <br>⛔ Release check: released CLI 1.0.0 run_command is unsandboxed (b57b308f8 tools.rs:584 sh -c); Electron unreleased
- [x] Files
      <br>_file features present on both surfaces_
- [x] Generated files
      <br>_`apps/desktop/src/features/artifacts`; CLI/web artifacts store_
- [ ] Browser - 🟡 Partial
      <br>_Desktop has its own Playwright bridge (`src-tauri/src/automation/browser/playwright_bridge.rs`); CLI has `browser_bridge.rs` - separate implementations_
- [ ] Computer use - 🟡 Partial
      <br>_Desktop-only (`src-tauri/src/automation/computer_use`); not in the shared CLI/VS Code runtime_
- [ ] Usage ⛔ **not live** - 🟡 Partial
      <br>_CLI has `cost_ledger.rs`; Desktop usage/billing tracked separately under `features/roi-dashboard`/`subscription`_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [ ] Remote Control ⛔ **not live** - 🟡 Partial
      <br>_Remote Control is Desktop+Mobile only (`apps/desktop/src/lib/remoteControlSupport.ts`), not exposed from the CLI_
      <br>⛔ Release check: The only desktop release is Tauri v1.2.0 (4 May 2026), Linux assets only.

_§28: 16 of 21 done._

---

# 29. AGI Code app-server/runtime

- [x] Shared server/runtime ⛔ **not live**
      <br>_`crates/agiworkforce-app-server/src/developer_sessions.rs:304` `DeveloperSessionProcessor`; consumed by `apps/extension-vscode/src/integrations/localRuntimeClient.ts`_
      <br>⛔ Release check: crates/agiworkforce-app-server absent from v-cli-1.0.0; b57b308f8 apps/cli/src/app_server.rs:88-98 handles only initialize, tools/list, shutdown
- [x] Initialize handshake ⛔ **not live**
      <br>_`crates/agiworkforce-protocol/src/developer_session.rs:40` `method::INITIALIZE`; `developer_sessions.rs:350`_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] Client info ⛔ **not live**
      <br>_`developer_session.rs:221` `AppServerClientInfo`, `:236` `client_info` field on the initialize request_
      <br>⛔ Release check: b57b308f8 apps/cli/src/app_server.rs:89-92 initialize ignores params; no client info in released CLI 1.0.0
- [x] Capabilities ⛔ **not live**
      <br>_`developer_session.rs:258` `AppServerCapabilities`_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] Session start ⛔ **not live**
      <br>_`apps/cli/src/app_server/developer_host.rs:1061` `start_thread`_
      <br>⛔ Release check: no thread/start in released CLI 1.0.0 app_server.rs:88-98 (Method not found); developer_host.rs added after v-cli-1.0.0
- [x] Session resume ⛔ **not live**
      <br>_`developer_host.rs:1205` `resume_thread`_
      <br>⛔ Release check: no thread/resume in released CLI 1.0.0 app_server.rs:88-98; only the resume subcommand (main.rs:481) ships
- [x] Session fork ⛔ **not live**
      <br>_`developer_host.rs:1281` `fork_thread`_
      <br>⛔ Release check: no thread/fork in released CLI 1.0.0 app_server.rs:88-98; only the fork subcommand (main.rs:483) ships
- [x] Session list ⛔ **not live**
      <br>_`developer_host.rs:1153` `list_threads`_
      <br>⛔ Release check: no thread/list in released CLI 1.0.0 app_server.rs:88-98
- [x] Session archive ⛔ **not live**
      <br>_`developer_host.rs:1322` `archive_thread`_
      <br>⛔ Release check: no thread/archive in released CLI 1.0.0 app_server.rs:88-98
- [ ] Session delete - 🔴 Missing
      <br>_searched "thread.?delete\|delete_thread" in `developer_session.rs`/`developer_host.rs`, no method exists - archive is the only lifecycle-out state_
- [x] Turn start ⛔ **not live**
      <br>_`developer_host.rs:1373` `start_turn`_
      <br>⛔ Release check: no turn/start in released CLI 1.0.0 app_server.rs:88-98
- [x] Turn cancel ⛔ **not live**
      <br>_`developer_host.rs:1790` `interrupt_turn`_
      <br>⛔ Release check: no turn/interrupt in released CLI 1.0.0 app_server.rs:88-98
- [x] Streaming events ⛔ **not live**
      <br>_`method::TURN_AGENT_EVENT` (`developer_session.rs:52`), `agent_events.rs` envelope_
      <br>⛔ Release check: TURN_AGENT_EVENT and protocol agent_events.rs absent from v-cli-1.0.0; app_server.rs:88-98 streams nothing
- [x] Approvals ⛔ **not live**
      <br>_`developer_host.rs:1877` `respond_to_approval`, `method::APPROVAL_RESPOND`_
      <br>⛔ Release check: approval/respond absent in released CLI 1.0.0 app_server.rs:88-98
- [x] Tool events ⛔ **not live**
      <br>_`AgentEvent::ToolUseStart/ToolUseDelta/ToolUseEnd` (`crates/agiworkforce-protocol/src/agent_events.rs:131` area)_
      <br>⛔ Release check: crates/agiworkforce-protocol/src/agent_events.rs (ToolUseStart) absent at b57b308f8; not served by released app-server
- [ ] Model events - 🟡 Partial
      <br>_no dedicated `Model`-kind `AgentEvent` variant found (searched enum body); model identity travels via `Lifecycle`/`TaskStateChanged` only_
- [x] Usage events ⛔ **not live**
      <br>_`agent_events.rs:164` `AgentEvent::Usage`_
      <br>⛔ Release check: AgentEvent::Usage over app-server absent at b57b308f8; only internal agent_events.rs:50 TurnUsage, not emitted by app_server.rs
- [x] Graceful shutdown ⛔ **not live**
      <br>_`developer_host.rs:2132` `shutdown`, `method::SHUTDOWN`_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [ ] Reconnect - 🔴 Missing
      <br>_searched "reconnect" in `apps/cli/src/app_server/*.rs`, only unrelated browser/MCP/voice reconnect hits; no app-server session-reconnect handshake_

_§29: 16 of 19 done._

---

# 30. Developer-session persistence

- [x] Session ID ⛔ **not live**
      <br>_`apps/cli/src/platform/runtime/session.rs:266` `session_id`_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] Workspace root
      <br>_`session.rs:277` `workspace_root`_
- [ ] Repository - 🟡 Partial
      <br>_no distinct "repository" field beyond `workspace_root`/`worktree_root`; repo identity is implicit in path, not a first-class field_
- [x] Branch
      <br>_`session.rs:287` `git_branch`_
- [x] Worktree ⛔ **not live**
      <br>_`session.rs:289` `worktree_root`_
      <br>⛔ Release check: b57b308f8 apps/cli/src/runtime/session.rs:28-37 ManagedSession has no worktree_root in released CLI 1.0.0
- [x] Trust mode ⛔ **not live**
      <br>_`session.rs:296` `permission_mode: Option<PermissionMode>`_
      <br>⛔ Release check: b57b308f8 apps/cli/src/runtime/session.rs:28-37 no permission_mode on released session record
- [x] Model
      <br>_`session.rs:275` `model`_
- [ ] Provider - 🟡 Partial
      <br>_no explicit `provider` field on `ManagedSession`; provider is inferred from `model` string and `routing_authority` (`session.rs:311`)_
- [x] Transcript
      <br>_`session.rs:269` `messages: Vec<Message>`_
- [x] Tool history
      <br>_tool calls/results embedded in `messages` (Message content blocks)_
- [ ] Approval history ⛔ **not live** - 🟡 Partial
      <br>_`apps/cli/src/approval_audit.rs:19` `ApprovalAuditEntry` exists but is a flat append log, not linked to a specific session_id field in the struct shown_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [ ] File changes - 🟡 Partial
      <br>_tracked implicitly via tool-call transcript entries (patch/write tool calls), no dedicated file-changes ledger found_
- [ ] Generated files _(revised)_ - 🟡 Partial
      <br>_ManagedSession (platform/runtime/session.rs:264) has no generated-files field and CLI never emits ArtifactProduced; cited desktop/web artifact stores are other surfaces_
- [x] Parent/fork
      <br>_`session.rs:271` `fork: Option<ManagedSessionForkMetadata>`_
- [x] Created and updated timestamps
      <br>_`session.rs:267-268` `created_at`/`updated_at`_
- [x] Schema version ⛔ **not live**
      <br>_apps/cli/src/platform/runtime/session.rs:99 MANAGED_SESSION_VERSION=5, version check at :738_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] Atomic persistence ⛔ **not live**
      <br>_`session.rs:17` `atomic_write_session` (tempfile + rename)_
      <br>⛔ Release check: b57b308f8 apps/cli/src/runtime/session.rs:125 save_to_path truncates via File::create in place, no temp+rename in released CLI 1.0.0
- [x] Corruption recovery ⛔ **not live**
      <br>_`session.rs:76` `quarantine_conflicting_session`; test `invalid_neighbors_do_not_hide_valid_session_history` (`session_control.rs:791`)_
      <br>⛔ Release check: quarantine_conflicting_session absent in released CLI (git grep b57b308f8 apps/cli/src quarantine: only a2a.rs prompt text)

_§30: 13 of 18 done._

---

# 31. Developer-session concurrency

- [x] CLI plus VS Code ⛔ **not live**
      <br>_both connect to the same app-server (`developer_sessions.rs`, `localRuntimeClient.ts`)_
      <br>⛔ Release check: VS Code extension never published (Marketplace 0 results, Open VSX not found, no v-vscode-* tag); CLI 1.0.0 app-server has no sessions
- [x] CLI plus Desktop _(revised)_ ⛔ **not live**
      <br>_apps/desktop/electron/runtime/developerSessionService.ts:611 spawns the CLI `agi app-server`; desktop lists/resumes the same CLI sessions (thread/list :714)_
      <br>⛔ Release check: Electron shell has no v-cloud-desktop-* tag or release; /api/download?platform=mac returns Installer unavailable; CLI 1.0.0 lacks thread/*
- [x] Desktop plus VS Code _(revised)_ ⛔ **not live**
      <br>_Electron desktop and VS Code (localRuntimeClient.ts) both attach to CLI app-server sessions stored in the same ManagedSession store_
      <br>⛔ Release check: neither Electron desktop nor VS Code extension is released (no v-cloud-desktop-_/v-vscode-_ tags, marketplace 0 results)
- [ ] Mobile Remote attached ⛔ **not live** - 🟡 Partial
      <br>_Mobile pairs to Desktop via Remote Control (`remoteControlSupport.ts`), not to a CLI/app-server session directly_
      <br>⛔ Release check: The only desktop release is Tauri v1.2.0 (4 May 2026), Linux assets only.
- [ ] Web Remote attached - 🟡 Partial
      <br>_web "Work" sessions (§25) are a separate product surface from developer sessions; no evidence they attach to the same session object_
- [ ] Multiple readers _(revised)_ - 🟡 Partial
      <br>_developer_host.rs:294 admit_request is a shutdown gate, not multi-reader; separate app-server processes can thread/read the same files but live events go only to one client_
- [ ] Writer ownership - 🟡 Partial
      <br>_enforced via fingerprint check on save (`session.rs:45` `fingerprint_of`), not an explicit ownership/lease token_
- [ ] Writer handoff - 🔴 Missing
      <br>_searched "handoff" in session.rs/session_control.rs, no explicit handoff protocol; a second writer is quarantined, not handed ownership_
- [ ] Lock expiration - 🔴 Missing
      <br>_no lease/TTL mechanism found; conflict detection is per-write fingerprint comparison, not time-bounded locks_
- [ ] Stale writer - 🟡 Partial
      <br>_detected implicitly when `fingerprint_of` mismatches (`session.rs:45`, comment at `:37`), but no user-facing "stale writer" warning found_
- [x] Duplicate-turn prevention ⛔ **not live**
      <br>_`apps/cli/src/app_server/developer_host.rs:1389` "A turn is already running for this thread; use turn/steer or turn/interrupt"_
      <br>⛔ Release check: app-server turn guard (developer_host.rs:1389) absent from v-cli-1.0.0; app_server.rs:88-98 has no turns
- [ ] Duplicate-tool prevention ⛔ **not live** - 🟡 Partial
      <br>_closest mechanism is loop-detection tool-call hashing in `crates/agiworkforce-agent-core/src/runaway.rs:27` (`hash_tool_call`), which catches repeats within one turn, not concurrent duplicate dispatch across writers_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] Approval ownership ⛔ **not live**
      <br>_`developer_host.rs:821` `cancel_pending_approvals(turn_id)` scopes/cancels approvals to the turn that owns them_
      <br>⛔ Release check: cancel_pending_approvals lives in developer_host.rs, absent from released CLI 1.0.0 (b57b308f8)
- [x] Conflict detection ⛔ **not live**
      <br>_`session.rs:76` `quarantine_conflicting_session`; test `a_second_writer_never_erases_the_first_writers_turns` (`session.rs:1235`)_
      <br>⛔ Release check: released CLI 1.0.0 runtime/session.rs:118-125 has no fingerprint or quarantine; second writer overwrites

_§31: 6 of 14 done._

---

# 32. AGI Code Desktop

- [ ] Repository picker - 🟡 Partial
      <br>_folder picker exists (`useFolderSelection` hook); no distinct "repository" vs generic folder concept confirmed_
- [x] Folder picker ⛔ **not live**
      <br>_apps/desktop/src/features/v3/DesktopShellV3.tsx:191 useFolderSelection; Electron workspace roots (runtime/workspaceStore.ts)_
      <br>⛔ Release check: The only desktop release is Tauri v1.2.0 (4 May 2026), Linux assets only.
- [x] Session list
      <br>_desktop has session/thread listing in `features/chat`/`features/tasks` (own model, not app-server, per §28)_
- [x] Agent threads
      <br>_features/agent-collaboration is unreferenced; reachable list is features/tasks/DesktopTasks.tsx lazy-loaded in DesktopShellV3.tsx_
- [x] Multiple sessions ⛔ **not live**
      <br>_multi-session support implied by `features/tasks` + `stores/cloudTaskBadgeStore.ts` tracking `AgentTaskState` per task_
      <br>⛔ Release check: The only desktop release is Tauri v1.2.0 (4 May 2026), Linux assets only.
- [x] Files
      <br>_features/file-upload is unreferenced; real path is runtime/TauriRuntime.ts:1100 upload_file and features/artifacts reachable from DesktopShellV3_
- [x] File preview/editor
      <br>_features/editing is unreferenced; reachable editor is features/code/CodeEditor.tsx via CodeWorkspace lazy in DesktopShellV3.tsx:33_
- [x] Terminal
      <br>_`apps/desktop/src/features/terminal`_
- [x] Git
      <br>_features/git UI is unreferenced; git lives in src-tauri/src/core/llm/tool_executor/git_tools.rs and electron/runtime/gitService.ts_
- [x] Diff
      <br>_features/editing is orphaned; diff UI is features/code/DiffViewer.tsx inside CodeWorkspace (DesktopShellV3.tsx:33)_
- [x] Worktrees ⛔ **not live**
      <br>_`apps/desktop/src-tauri/src/core/llm/tool_executor/worktree_tools.rs`_
      <br>⛔ Release check: tool_executor/worktree_tools.rs absent at v-desktop-1.2.0 (4f816a654), the only released desktop; Electron shell unreleased
- [ ] Tests - 🟡 Partial
      <br>_no dedicated "run tests" UI feature directory found; test execution likely goes through the generic exec tool, not a first-class tests panel_
- [x] Browser
      <br>_features/browser is unreferenced; browser tools are src-tauri/src/core/llm/tool_executor/browser_tools.rs over automation/browser/playwright_bridge.rs_
- [x] Computer use
      <br>_`apps/desktop/src-tauri/src/automation/computer_use/action_executor.rs:170`; stop withdraws grants `e2bc17e40`_
- [x] Approvals
      <br>_tool_guard references (`sys/security/tool_guard.rs`) gate tool execution_
- [x] Tools
      <br>_`core/llm/tool_executor`_
- [x] MCP
      <br>_`apps/desktop/src/features/mcp/*` (MCPServerManager, MCPToolBrowser, etc.)_
- [x] Skills
      <br>_`apps/desktop/src/features/skill-marketplace`_
- [x] Plugins _(revised)_ ⛔ **not live**
      <br>_apps/desktop/src/features/settings/SkillsPluginsSettings.tsx installs/updates/removes plugins, mounted as PluginsTab (SettingsPanel.tsx:47)_
      <br>⛔ Release check: The only desktop release is Tauri v1.2.0 (4 May 2026), Linux assets only.
- [x] Generated files
      <br>_`apps/desktop/src-tauri/src/core/artifacts/store.rs`_
- [ ] Open in VS Code _(revised)_ - 🔴 Missing
      <br>_no open-in-VS-Code action in apps/desktop src, electron or src-tauri; only reveal/open-with-default-app (electron/runtime/dispatcher.ts:296,309)_
- [x] Open terminal
      <br>_`features/terminal` integration referenced from shell_

_§32: 19 of 22 done._

---

# 33. CLI

- [x] TUI
      <br>_`apps/cli/src/tui/tui_app.rs` (large interactive TUI)_
- [x] REPL
      <br>_`apps/cli/src/repl/*` (slash_commands, registry, dialogs)_
- [x] One-shot ⛔ **not live**
      <br>_`apps/cli/src/lib.rs:4358` "--print with no prompt is an error" path; one-shot prompt arg_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] Print
      <br>_`--print`/`-p` handling, `lib.rs:4318`_
- [x] Headless exec
      <br>_non-interactive detection, `lib.rs:1542` `io::stdin().is_terminal()` gating_
- [x] JSON
      <br>_`lib.rs:501` `OutputFormat::Json`_
- [x] JSONL
      <br>_`lib.rs:524` `OutputFormat::StreamJson` → `OneShotOutputMode::JsonLine`_
- [x] Stdin
      <br>_`lib.rs:241` `stdin: bool` flag; `lib.rs:4086` piped-stdin auto-detect_
- [x] Stdout
      <br>_structured output writer, `output.rs`_
- [x] Stderr
      <br>_`lib.rs:1542` checks `io::stderr().is_terminal()`_
- [x] Exit codes
      <br>_`lib.rs:3171,3200` `std::process::exit(130)` (SIGINT convention), `:3405` propagates child exit code_
- [x] SIGINT
      <br>_`lib.rs` ctrl_c handling feeding exit(130); `tui_app.rs` signal handling_
- [x] SIGTERM
      <br>_referenced in `apps/cli/src/daemon.rs` (grep hit)_
- [ ] Broken pipe - 🔴 Missing
      <br>_searched "BrokenPipe\|EPIPE\|SIGPIPE" across apps/cli/src, no hits - a downstream pipe close (e.g. `agi ... \|head`) is not explicitly handled_
- [x] Terminal restore
      <br>_`apps/cli/src/tui/tui_app.rs` (raw-mode/alternate-screen restore on exit)_
- [x] Completions
      <br>_`lib.rs:664-675` `clap_complete::generate` for Bash/Zsh/Fish_
- [x] Update ⛔ **not live**
      <br>_`apps/cli/src/update_check.rs`_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] Doctor ⛔ **not live**
      <br>_`lib.rs:873` `Doctor` subcommand; `apps/cli/src/doctor.rs`_
      <br>⛔ Release check: no Doctor subcommand or doctor.rs in released CLI v-cli-1.0.0 (b57b308f8 main.rs Command enum); npm package 404, brew pins 1.0.0
- [x] Login/logout
      <br>_`lib.rs:864,869` `Login`/`Logout` subcommands_
- [x] Resume
      <br>_`lib.rs:801` `Resume` subcommand_
- [x] Fork
      <br>_`lib.rs:808` `Fork { session_id }`_
- [ ] Remote Control - 🔴 Missing
      <br>_Remote Control (phone pairing) is implemented on Desktop only (`apps/desktop/src/lib/remoteControlSupport.ts`); no equivalent CLI-side pairing command found_
- [ ] CI - 🟡 Partial
      <br>_non-interactive/headless mode serves CI use (JSON/JSONL output, exit codes) but no dedicated `--ci` flag or `CI` env detection found (searched `is_ci`, `env::var("CI")`)_

_§33: 20 of 23 done._

---

# 34. VS Code

- [x] Sidebar chat ⛔ **not live**
      <br>_`apps/extension-vscode/src/features/sidebar-webview/*`_
      <br>⛔ Release check: agiworkforce.agi-workforce absent from VS Code Marketplace and Open VSX; no v-vscode-* tag; release-vscode-extension.yml has zero runs
- [x] Chat participant ⛔ **not live**
      <br>_apps/extension-vscode/src/features/chat-participant/chatParticipant.ts:591 createChatParticipant, registered in core/chatSetup.ts:46_
      <br>⛔ Release check: VS Code extension never published (Marketplace query 0 results, Open VSX Extension not found, no v-vscode-* tag)
- [x] Current file ⛔ **not live**
      <br>_apps/extension-vscode/src/data/contextBuilder.ts getActiveFileContext used by data/composerContext.ts:164 for the sidebar composer_
      <br>⛔ Release check: VS Code extension never published (Marketplace query 0 results, Open VSX Extension not found, no v-vscode-* tag)
- [x] Selection ⛔ **not live**
      <br>_apps/extension-vscode/src/data/composerContext.ts:26 activeSelection attaches the editor selection as context_
      <br>⛔ Release check: VS Code extension never published (Marketplace query 0 results, Open VSX Extension not found, no v-vscode-* tag)
- [x] Open tabs _(revised)_ ⛔ **not live**
      <br>_apps/extension-vscode/src/data/contextBuilder.ts:73 enumerates tabGroups; composerContext.ts:38 openFiles offered to ChatStateManager_
      <br>⛔ Release check: VS Code extension never published (Marketplace query 0 results, Open VSX Extension not found, no v-vscode-* tag)
- [x] Problems _(revised)_ ⛔ **not live**
      <br>_apps/extension-vscode/src/data/composerContext.ts:52 problems() from getDiagnostics (contextBuilder.ts:180), consumed by ChatStateManager.ts:90_
      <br>⛔ Release check: VS Code extension never published (Marketplace query 0 results, Open VSX Extension not found, no v-vscode-* tag)
- [x] Diagnostics ⛔ **not live**
      <br>_apps/extension-vscode/src/data/contextBuilder.ts:180 getDiagnosticsContext via vscode.languages.getDiagnostics_
      <br>⛔ Release check: VS Code extension never published (Marketplace query 0 results, Open VSX Extension not found, no v-vscode-* tag)
- [x] CodeLens ⛔ **not live**
      <br>_apps/extension-vscode/src/core/providerSetup.ts:46,102 registerCodeLensProvider (Accept/Reject lenses in providers/diffDecorationProvider.ts:102)_
      <br>⛔ Release check: VS Code extension never published (Marketplace query 0 results, Open VSX Extension not found, no v-vscode-* tag)
- [x] Inline actions ⛔ **not live**
      <br>_apps/extension-vscode/src/core/providerSetup.ts:24 registerCodeActionsProvider AgiCodeActionProvider_
      <br>⛔ Release check: VS Code extension never published (Marketplace query 0 results, Open VSX Extension not found, no v-vscode-* tag)
- [x] Command Palette ⛔ **not live**
      <br>_`apps/extension-vscode/src/core/commandSetup.ts` registers commands_
      <br>⛔ Release check: VS Code extension never published (Marketplace query 0 results, Open VSX Extension not found, no v-vscode-* tag)
- [x] Native diff ⛔ **not live**
      <br>_`apps/extension-vscode/src/integrations/patchEngine.ts`; `diffBatchSafety.test.ts`_
      <br>⛔ Release check: VS Code extension never published (Marketplace query 0 results, Open VSX Extension not found, no v-vscode-* tag)
- [x] Apply ⛔ **not live**
      <br>_apps/extension-vscode/src/providers/diffDecorationProvider.ts:348 workspace.applyEdit on accept; package.json:262 acceptDiff command_
      <br>⛔ Release check: VS Code extension never published (Marketplace query 0 results, Open VSX Extension not found, no v-vscode-* tag)
- [x] Reject ⛔ **not live**
      <br>_apps/extension-vscode/src/providers/diffDecorationProvider.ts:108 Reject lens, package.json:267 agi-workforce.rejectDiff/rejectAllDiffs_
      <br>⛔ Release check: VS Code extension never published (Marketplace query 0 results, Open VSX Extension not found, no v-vscode-* tag)
- [x] Stale-diff detection ⛔ **not live**
      <br>_apps/extension-vscode/src/providers/diffDecorationProvider.ts:3 STALE_DIFF_MESSAGE guards accepting a stale diff_
      <br>⛔ Release check: VS Code extension never published (Marketplace query 0 results, Open VSX Extension not found, no v-vscode-* tag)
- [x] Workspace Trust ⛔ **not live**
      <br>_`apps/extension-vscode/src/extension.ts`, `outboundContentGuard.ts` reference workspace trust_
      <br>⛔ Release check: VS Code extension never published (Marketplace query 0 results, Open VSX Extension not found, no v-vscode-* tag)
- [x] Remote environments ⛔ **not live**
      <br>_apps/extension-vscode/package.json:19 extensionKind workspace; core/outboundContentGuard.ts:13 accepts vscode-remote scheme; no remoteAuthority reference exists_
      <br>⛔ Release check: VS Code extension never published (Marketplace query 0 results, Open VSX Extension not found, no v-vscode-* tag)
- [ ] WSL ⛔ **not live** - 🟡 Partial
      <br>_covered generically by `remoteAuthority` handling; no WSL-specific code path confirmed_
      <br>⛔ Release check: VS Code extension never published (Marketplace query 0 results, Open VSX Extension not found, no v-vscode-* tag)
- [ ] SSH ⛔ **not live** - 🟡 Partial
      <br>_same - generic remote-authority handling, no SSH-specific path confirmed_
      <br>⛔ Release check: VS Code extension never published (Marketplace query 0 results, Open VSX Extension not found, no v-vscode-* tag)
- [ ] Dev Containers _(revised)_ ⛔ **not live** - 🟡 Partial
      <br>_same generic support as WSL/SSH: extensionKind workspace (package.json:19) and vscode-remote scheme (outboundContentGuard.ts:13); no container-specific path_
      <br>⛔ Release check: VS Code extension never published (Marketplace query 0 results, Open VSX Extension not found, no v-vscode-* tag)
- [x] Shared AGI Code runtime ⛔ **not live**
      <br>_`apps/extension-vscode/src/integrations/localRuntimeClient.ts` connects to the CLI's app-server (§29) - VS Code is the one non-CLI surface that actually shares the runtime_
      <br>⛔ Release check: VS Code extension never published; its app-server protocol also absent from released CLI 1.0.0 (app_server.rs:88-98)

_§34: 17 of 20 done._

---

# 35. Chrome Extension

- [x] Manifest V3 ⛔ **not live**
      <br>_`apps/extension/manifest.json:2` `manifest_version: 3`_
      <br>⛔ Release check: .github/workflows/release-chrome-extension.yml:6 fires only on v-ext-* tags; none exist, workflow has zero runs, no Web Store item ID anywhere
- [x] Side panel ⛔ **not live**
      <br>_`apps/extension/manifest.json:66-68` `side_panel.default_path`, `apps/extension/src/features/side-panel/index.ts`_
      <br>⛔ Release check: .github/workflows/release-chrome-extension.yml:6 no v-ext-* tag, zero release runs; extension never packaged for the store
- [x] Toolbar ⛔ **not live**
      <br>_`manifest.json:52-61` `action.default_icon`/`default_title`, `commands._execute_action`_
      <br>⛔ Release check: .github/workflows/release-chrome-extension.yml:6 no v-ext-* tag, zero release runs; extension never packaged for the store
- [x] Authentication ⛔ **not live**
      <br>_`apps/extension/src/features/cloud-bridge/clerkAuth.ts:70-260` Clerk sign-in/out, token refresh_
      <br>⛔ Release check: .github/workflows/release-chrome-extension.yml:6 no v-ext-* tag, zero release runs; extension never packaged for the store
- [x] Current tab ⛔ **not live**
      <br>_`apps/extension/src/features/browser-tools/tabAuthority.ts`_
      <br>⛔ Release check: .github/workflows/release-chrome-extension.yml:6 no v-ext-* tag, zero release runs; extension never packaged for the store
- [x] URL ⛔ **not live**
      <br>_`apps/extension/src/features/computer-use/agentLoop.ts:266-286` navigate + allowlist check on landed URL_
      <br>⛔ Release check: .github/workflows/release-chrome-extension.yml:6 no v-ext-* tag, zero release runs; extension never packaged for the store
- [x] Title ⛔ **not live**
      <br>_apps/extension/src/content.ts:586,999 and page-metadata.ts:191 send document.title; page-capture.ts is only a 51-line delivery/notification helper with no title capture_
      <br>⛔ Release check: .github/workflows/release-chrome-extension.yml:6 no v-ext-* tag, zero release runs; extension never packaged for the store
- [x] Selection ⛔ **not live**
      <br>_apps/extension/src/content.ts:984 window.getSelection() and background.ts:4525-4576 context-menu selectionText; page-capture.ts has no selection path_
      <br>⛔ Release check: .github/workflows/release-chrome-extension.yml:6 no v-ext-* tag, zero release runs; extension never packaged for the store
- [x] DOM ⛔ **not live**
      <br>_apps/extension/src/features/computer-use/cdpDriver.ts:736 readDom, agentLoop.ts:259 read_dom action; side-panel/dom.ts is a UI element-builder helper, not page DOM_
      <br>⛔ Release check: .github/workflows/release-chrome-extension.yml:6 no v-ext-* tag, zero release runs; extension never packaged for the store
- [x] Screenshot ⛔ **not live**
      <br>_`apps/extension/src/features/computer-use/cdpDriver.ts` CDP screenshot capture_
      <br>⛔ Release check: .github/workflows/release-chrome-extension.yml:6 no v-ext-* tag, zero release runs; extension never packaged for the store
- [x] Console ⛔ **not live**
      <br>_`apps/extension/src/features/browser-tools/consoleCapture.ts`_
      <br>⛔ Release check: .github/workflows/release-chrome-extension.yml:6 no v-ext-* tag, zero release runs; extension never packaged for the store
- [x] Network ⛔ **not live**
      <br>_`apps/extension/src/features/browser-tools/networkCapture.ts`_
      <br>⛔ Release check: .github/workflows/release-chrome-extension.yml:6 no v-ext-* tag, zero release runs; extension never packaged for the store
- [x] Click ⛔ **not live**
      <br>_`computer-use/cdpDriver.ts`, `agentLoop.ts` click/clickCoords actions_
      <br>⛔ Release check: .github/workflows/release-chrome-extension.yml:6 no v-ext-* tag, zero release runs; extension never packaged for the store
- [x] Type ⛔ **not live**
      <br>_`computer-use/cdpDriver.ts` type action; password/hidden fields redacted (`REDACTED_FIELD_PLACEHOLDER`)_
      <br>⛔ Release check: .github/workflows/release-chrome-extension.yml:6 no v-ext-* tag, zero release runs; extension never packaged for the store
- [x] Scroll ⛔ **not live**
      <br>_`computer-use/agentLoop.ts` scroll action wired through `cdpDriver.ts`_
      <br>⛔ Release check: .github/workflows/release-chrome-extension.yml:6 no v-ext-* tag, zero release runs; extension never packaged for the store
- [x] Navigate ⛔ **not live**
      <br>_`agentLoop.ts:266-286`_
      <br>⛔ Release check: .github/workflows/release-chrome-extension.yml:6 no v-ext-* tag, zero release runs; extension never packaged for the store
- [x] Downloads _(revised)_ ⛔ **not live**
      <br>_apps/extension/src/features/computer-use/agentLoop.ts:287 download_file via browser-tools/downloads.ts, always-ask at :38; other approval gaps belong to row 718, not Downloads_
      <br>⛔ Release check: .github/workflows/release-chrome-extension.yml:6 no v-ext-* tag, zero release runs; extension never packaged for the store
- [x] Page events ⛔ **not live**
      <br>_`apps/extension/src/features/browser-tools/pageWatch.ts` navigation/suspend tracking per tab_
      <br>⛔ Release check: .github/workflows/release-chrome-extension.yml:6 no v-ext-* tag, zero release runs; extension never packaged for the store
- [x] Permissions ⛔ **not live**
      <br>_optional host permissions (`manifest.json:29`) + `site-allowlist.ts`/`site-permission-policy.ts` runtime grant/revoke_
      <br>⛔ Release check: .github/workflows/release-chrome-extension.yml:6 no v-ext-* tag, zero release runs; extension never packaged for the store
- [x] Pairing ⛔ **not live**
      <br>_`apps/extension/src/features/native-bridge/pairing.ts` code-based pairing, fingerprint, unpair_
      <br>⛔ Release check: .github/workflows/release-chrome-extension.yml:6 no v-ext-* tag, zero release runs; extension never packaged for the store
- [x] Desktop bridge ⛔ **not live**
      <br>_`apps/extension/src/features/native-bridge/{index,desktopCommands,reconnect,sendQueue}.ts`_
      <br>⛔ Release check: .github/workflows/release-chrome-extension.yml:6 no v-ext-* tag, zero release runs; extension never packaged for the store
- [ ] AGI Code bridge - 🔴 Missing
      <br>_searched `apps/extension/src` for "AGI Code"/"cloud-code"/"codeSession"/"code-bridge" - zero hits; extension bridges to Desktop only, not to the separate AGI Code cloud-coding surface_

_§35: 21 of 22 done._

---

# 36. Browser runtime

- [x] Built-in browser
      <br>_packages/tools/browser-tool is imported by no product code; real built-in browser is apps/desktop/src-tauri/src/sys/commands/browser.rs:649 browser_launch over playwright_bridge.rs, registered lib.rs:1574_
- [x] Chrome bridge ⛔ **not live**
      <br>_`apps/desktop/src-tauri/src/automation/browser/extension_bridge.rs`, `mod.rs:21-27` `BrowserState.extension`_
      <br>⛔ Release check: desktop side ships, but the Chrome extension it bridges to is unreleased: release-chrome-extension.yml:6 no v-ext-* tag, zero runs
- [ ] Browser capability abstraction - 🔴 Missing
      <br>_searched for `BrowserProvider`/`BrowserCapability`/`BrowserBackend` - no hits; callers pick `playwright` vs `extension_bridge` explicitly, no unifying trait/enum_
- [ ] Preferred browser - 🔴 Missing
      <br>_searched `preferredBrowser`/`browserPreference` - no hits, no user-facing setting found_
- [x] Tabs
      <br>_`apps/desktop/src-tauri/src/automation/browser/tab_manager.rs`; extension `tabAuthority.ts`_
- [x] Navigation
      <br>_apps/desktop/src-tauri/src/sys/commands/browser.rs:776 browser_navigate (registered lib.rs:1580); browser-tool package is unreferenced by any app_
- [x] Forms
      <br>_`apps/desktop/src-tauri/src/automation/browser/advanced.rs` form fill helpers; extension autofill (`content/autofill/`)_
- [x] Downloads _(revised)_ ⛔ **not live**
      <br>_apps/extension/src/features/browser-tools/downloads.ts ledger + agentLoop.ts:287 download_file with always-ask (:38); same one-surface standard applied to Console/Network rows 704-705_
      <br>⛔ Release check: extension-only path; release-chrome-extension.yml:6 no v-ext-* tag, zero runs, never published
- [x] Uploads
      <br>_`apps/desktop/src-tauri/src/automation/browser/advanced.rs:402-467` `upload_files`/`upload_file`_
- [x] Screenshot
      <br>_apps/desktop/src-tauri/src/sys/commands/browser.rs:1013 browser_screenshot (lib.rs:1594), extension cdpDriver.ts:338; browser-tool types.ts is in an unused package_
- [x] DOM
      <br>_`apps/desktop/src-tauri/src/automation/browser/dom_operations.rs`; `browser-tool/src/snapshot.ts` aria/ai snapshot modes_
- [x] Console ⛔ **not live**
      <br>_extension `consoleCapture.ts` (built-in Playwright browser has no console-capture equivalent found - Partial would apply per-surface, counted once here as the capability exists)_
      <br>⛔ Release check: only extension consoleCapture.ts; release-chrome-extension.yml:6 no v-ext-* tag, zero runs
- [x] Network ⛔ **not live**
      <br>_extension `networkCapture.ts`_
      <br>⛔ Release check: only extension networkCapture.ts; release-chrome-extension.yml:6 no v-ext-* tag, zero runs
- [x] Authenticated websites ⛔ **not live**
      <br>_extension bridge drives the user's real signed-in Chrome session (`browserControlConsent.ts` banner text: "click, type, navigate...inside your signed-in session")_
      <br>⛔ Release check: relies on the extension driving real Chrome; release-chrome-extension.yml:6 no v-ext-* tag, zero runs
- [x] User takeover ⛔ **not live**
      <br>_Chrome's own debugging banner (dismissing it stops the run, `runOwnership.ts` `debugger_detached` reason) + explicit Stop button_
      <br>⛔ Release check: extension runOwnership path; release-chrome-extension.yml:6 no v-ext-* tag, zero runs
- [x] Stop ⛔ **not live**
      <br>_`apps/extension/src/features/side-panel/computerUsePanel.ts:662-775` Stop button, multiple auto-stop reasons_
      <br>⛔ Release check: extension computerUsePanel Stop; release-chrome-extension.yml:6 no v-ext-* tag, zero runs
- [x] Session isolation
      <br>_`playwright_bridge.rs:362-378` dedicated `browser-profiles` dir, never the user's default Chrome profile; `browser-tool` isolates under `~/.agiworkforce/browser/profiles/`_

_§36: 15 of 17 done._

---

# 37. Browser security

- [x] Site allowlist ⛔ **not live**
      <br>_`apps/extension/src/features/options/site-allowlist.ts`; enforced post-click/post-navigate in `agentLoop.ts:208,279`_
      <br>⛔ Release check: extension site-allowlist.ts; release-chrome-extension.yml:6 no v-ext-* tag, zero runs
- [x] Optional permissions ⛔ **not live**
      <br>_`manifest.json:29` `optional_host_permissions`; `site-permission-policy.ts`_
      <br>⛔ Release check: extension manifest optional_host_permissions; release-chrome-extension.yml:6 no v-ext-* tag, zero runs
- [ ] Sensitive sites - 🟡 Partial
      <br>_allowlist model exists but no distinct "sensitive site" classification (banking/healthcare) found beyond the general allowlist_
- [x] Financial actions
      <br>_apps/desktop/src-tauri/src/automation/computer_use/app_permissions.rs:15,42-79,136 hard-blocked bank/broker/wallet apps and hosts; cited :562 is the test, not the implementation_
- [x] Password fields ⛔ **not live**
      <br>_`apps/extension/src/features/computer-use/cdpDriver.ts:15,715` redacts `password`/`hidden` field values before they reach the model_
      <br>⛔ Release check: extension cdpDriver redaction; release-chrome-extension.yml:6 no v-ext-* tag, zero runs
- [x] CAPTCHA handling ⛔ **not live**
      <br>_`apps/extension/src/features/computer-use/escalationEngine.ts:62-101` detects CAPTCHA widgets and escalates to human, does not attempt to solve_
      <br>⛔ Release check: extension escalationEngine; release-chrome-extension.yml:6 no v-ext-* tag, zero runs
- [x] Prompt-injection defense ⛔ **not live**
      <br>_`cdpDriver.ts:563` injected-content warning; `packages/tools/mcp` `connect.ts` fences untrusted MCP output (cross-referenced, same defense family)_
      <br>⛔ Release check: browser half is extension cdpDriver.ts:563 (unreleased, no v-ext-* tag); only web MCP fencing ships
- [x] Malicious DOM content ⛔ **not live**
      <br>_`apps/desktop/src-tauri/src/automation/browser/extension_bridge.rs:219-336` documents and guards the zero-click prompt-injection / config-poisoning chain_
      <br>⛔ Release check: SEV-DESK-02 guard in extension_bridge.rs:219 absent from v-desktop-1.2.0, the only desktop release
- [ ] External side-effect approval ⛔ **not live** - 🟡 Partial
      <br>_commit `cf8426dd7` message names entering sensitive data, granting authorizations, changing permissions as still-open ("closes the first of those"); only `download_file` is in `ALWAYS_ASK_TOOLS` (`agentLoop.ts:38`)_
      <br>⛔ Release check: The Chrome extension has never been published (release workflow never run; no v-ext tag).
- [ ] Upload approval - 🔴 Missing
      <br>_no `ALWAYS_ASK_TOOLS`-style gate for file uploads in `agentLoop.ts`; `escalationEngine.ts` `file_upload` trigger is a technical-limitation escalation (autofill feature) not an approval prompt_
- [x] Download policy ⛔ **not live**
      <br>_`agentLoop.ts:38` `ALWAYS_ASK_TOOLS = {'download_file'}`, fails closed when there's no way to ask (per commit message)_
      <br>⛔ Release check: extension agentLoop ALWAYS_ASK_TOOLS; release-chrome-extension.yml:6 no v-ext-* tag, zero runs
- [x] Navigation policy ⛔ **not live**
      <br>_site-allowlist enforcement, `agentLoop.ts:208,279`_
      <br>⛔ Release check: extension agentLoop allowlist; release-chrome-extension.yml:6 no v-ext-* tag, zero runs
- [x] Emergency stop ⛔ **not live**
      <br>_Stop button (`computerUsePanel.ts`) + auto-cancel reasons in `runOwnership.ts` (`ComputerUseCancellationReason`)_
      <br>⛔ Release check: extension computerUsePanel/runOwnership; release-chrome-extension.yml:6 no v-ext-* tag, zero runs

_§37: 10 of 13 done._

---

# 38. Computer use

- [x] Screenshot
      <br>_`apps/desktop/src-tauri/src/automation/computer_use/action_executor.rs:170` `capture_primary_screen`_
- [ ] Displays - 🟡 Partial
      <br>_`automation::screen::list_displays` exists but `action_executor.rs:296-305` `resolve_primary_display` always targets the primary; no per-display action targeting_
- [x] Windows
      <br>_`apps/desktop/src-tauri/src/automation/computer_use/window_manager.rs:225-496` `WindowEnumerator`/`WindowCoordinator`_
- [x] App switching
      <br>_`window_manager.rs:703-797` `activate_by_title`/`activate_by_process`_
- [x] Mouse
      <br>_`action_executor.rs` click/drag/scroll translated through `translate_capture_point`_
- [x] Click
      <br>_`action_executor.rs:40-69`_
- [x] Drag
      <br>_`action_executor.rs:123-124` `input_from`/`input_to` drag translation_
- [x] Scroll
      <br>_`action_executor.rs` scroll coordinate translation_
- [x] Keyboard
      <br>_`apps/desktop/src-tauri/src/automation/computer_use/anthropic_agent.rs` key/type actions (part of the Anthropic computer-use tool loop)_
- [ ] Dialogs _(revised)_ - 🟡 Partial
      <br>_confirmation.rs:95-231 is the app's own consent dialog; no handling of OS/app dialogs beyond generic screenshot+click in action_executor.rs_
- [ ] File picker - 🔴 Missing
      <br>_searched for native OS file-picker/open-dialog handling in `automation/computer_use` - no hits; no evidence the agent can drive Finder/Explorer's file chooser_
- [ ] Multiple monitors - 🟡 Partial
      <br>_see "displays" - enumerable but actions bound to primary_
- [x] DPI scaling
      <br>_`action_executor.rs:22,282-305` `translate_capture_coordinate` HiDPI scale-factor translation, tested_
- [x] Permission detection ⛔ **not live**
      <br>_apps/desktop/src-tauri/src/lib.rs:63-69 AXIsProcessTrusted TCC check; consent.rs:168 only tracks the app's own consent prompt on screen_
      <br>⛔ Release check: apps/desktop/src-tauri/src/lib.rs:65 cfg(macos) only; v-desktop-1.2.0 assets are deb/rpm/AppImage, macOS deferred in release run
- [x] Approval ⛔ **not live**
      <br>_`computer_use/approval.rs` (400 lines), `confirmation.rs`_
      <br>⛔ Release check: The only desktop release is Tauri v1.2.0 (4 May 2026), Linux assets only.
- [ ] Takeover - 🟡 Partial
      <br>_consent can be revoked (`consent.rs:251` `revoke_consent`) but no explicit mid-run "I'm taking over" affordance found beyond revocation_
- [x] Stop
      <br>_apps/desktop/src/stores/computerUseStore.ts:411 invokes computer_use_stop_session (sys/commands/computer_use.rs:1480); e2bc17e40 made it work on the Electron dispatcher_
- [x] Emergency stop ⛔ **not live**
      <br>_apps/desktop/src/services/coworkDispatch.ts:497-561 cancel-all emergency stop; CloudSafetySection.tsx:110 only mentions "emergency services" in copy_
      <br>⛔ Release check: apps/desktop/src/services/coworkDispatch.ts:497 cancel-all absent from v-desktop-1.2.0; also rides the undeployed signaling relay

_§38: 13 of 18 done._

---

# 39. Remote Control

Controllers:

- [x] Mobile ⛔ **not live**
      <br>_`apps/mobile/src/features/companion/` full component set (dashboard, QR scanner, dispatch composer, execution stream)_
      <br>⛔ Release check: release-mobile.yml:6 v-mobile-* never tagged, zero runs; apps/mobile/lib/constants.ts:15 relay host returns Vercel DEPLOYMENT_NOT_FOUND
      <br>⛔ Relay check: the mobile app pins wss://signaling.agiworkforce.com, which returns Vercel DEPLOYMENT_NOT_FOUND; the healthy Fly app is not the host it uses.
- [ ] Web - ⚪ N/A
      <br>_`apps/web/app/pair/pair-body.tsx:24-27` states pairing "cannot be completed in a browser" - deliberately excluded, not a gap_
      <br>⛔ Relay check: the mobile app pins wss://signaling.agiworkforce.com, which returns Vercel DEPLOYMENT_NOT_FOUND; the healthy Fly app is not the host it uses.
- [ ] Desktop where useful - 🟡 Partial
      <br>_Desktop is the Host in every file found (`mobile-companion/`); no evidence Desktop can act as a controller of another device_
      <br>⛔ Relay check: the mobile app pins wss://signaling.agiworkforce.com, which returns Vercel DEPLOYMENT_NOT_FOUND; the healthy Fly app is not the host it uses.

Host:

- [ ] AGI Code runtime - 🔴 Missing
      <br>_no wiring found from `mobile-companion`/signaling paths into the AGI Code (cloud-code) surface; only chat/agent dispatch found_
- [x] Device runtime ⛔ **not live**
      <br>_`apps/desktop/src/lib/remoteControlSupport.ts:20-23` `remoteControlSupported()` gates on Tauri vs Electron bridge_
      <br>⛔ Release check: remoteControlSupport.ts and dispatch_hmac_verify absent from v-desktop-1.2.0, the only desktop release
      <br>⛔ Relay check: the mobile app pins wss://signaling.agiworkforce.com, which returns Vercel DEPLOYMENT_NOT_FOUND; the healthy Fly app is not the host it uses.

Check:

- [ ] Pair _(revised)_ - 🟡 Partial
      <br>_apps/web/app/api/pair/initiate/route.ts:55 needs SIGNALING_HTTP_URL (empty in .env.example:605); signaling deploy jobs skipped in every CI run - unset in production: SIGNALING_HTTP_URL_
      <br>⛔ Relay check: the mobile app pins wss://signaling.agiworkforce.com, which returns Vercel DEPLOYMENT_NOT_FOUND; the healthy Fly app is not the host it uses.
- [x] QR ⛔ **not live**
      <br>_`QRPairingCard.tsx`; mobile `QRScanner.tsx`_
      <br>⛔ Release check: mobile QRScanner unreleased (no v-mobile-* tag, release-mobile.yml zero runs); relay host signaling.agiworkforce.com 404s
      <br>⛔ Relay check: the mobile app pins wss://signaling.agiworkforce.com, which returns Vercel DEPLOYMENT_NOT_FOUND; the healthy Fly app is not the host it uses.
- [x] Code ⛔ **not live**
      <br>_`apps/extension/src/features/native-bridge/pairing.ts:34-52` (same code-pairing primitive, cross-surface)_
      <br>⛔ Release check: extension pairing.ts; release-chrome-extension.yml:6 no v-ext-* tag, zero runs
      <br>⛔ Relay check: the mobile app pins wss://signaling.agiworkforce.com, which returns Vercel DEPLOYMENT_NOT_FOUND; the healthy Fly app is not the host it uses.
- [x] Expiration _(revised)_ ⛔ **not live**
      <br>_services/signaling-server/src/constants.ts:1 DEFAULT_PAIRING_TTL_SECONDS=300, index.ts:145,546 expiresAt; pair-token.ts note is a deliberate reconnect design, not missing expiry_
      <br>⛔ Release check: deploy-signaling-server.yml:277 railway deploy needs RAILWAY_PUBLIC_URL, skipped every run; fly only manual; pinned host 404s
      <br>⛔ Relay check: the mobile app pins wss://signaling.agiworkforce.com, which returns Vercel DEPLOYMENT_NOT_FOUND; the healthy Fly app is not the host it uses.
- [x] Revoke ⛔ **not live**
      <br>_`apps/desktop/src/features/mobile-companion/` unpair flow; extension `pairing.ts:370` `unpair`_
      <br>⛔ Release check: desktop unpair absent from v-desktop-1.2.0; extension unpair unreleased (no v-ext-* tag)
      <br>⛔ Relay check: the mobile app pins wss://signaling.agiworkforce.com, which returns Vercel DEPLOYMENT_NOT_FOUND; the healthy Fly app is not the host it uses.
- [x] Host presence ⛔ **not live**
      <br>_`apps/desktop/src/features/mobile-companion/MobileCompanionPanel.tsx:69` "Mobile device connected"_
      <br>⛔ Release check: panel exists in v-desktop-1.2.0 but no phone can connect: mobile unreleased, apps/mobile/lib/constants.ts:15 relay host 404s
      <br>⛔ Relay check: the mobile app pins wss://signaling.agiworkforce.com, which returns Vercel DEPLOYMENT_NOT_FOUND; the healthy Fly app is not the host it uses.
- [x] Sessions ⛔ **not live**
      <br>_`apps/mobile/services/companion.ts` (approval/agent-command session plumbing)_
      <br>⛔ Release check: release-mobile.yml:6 no v-mobile-* tag, zero runs; apps/mobile/lib/constants.ts:15 relay returns DEPLOYMENT_NOT_FOUND
      <br>⛔ Relay check: the mobile app pins wss://signaling.agiworkforce.com, which returns Vercel DEPLOYMENT_NOT_FOUND; the healthy Fly app is not the host it uses.
- [x] Transcript ⛔ **not live**
      <br>_`apps/mobile/src/features/companion/components/ExecutionStream.tsx`_
      <br>⛔ Release check: release-mobile.yml:6 no v-mobile-* tag, zero runs; apps/mobile/lib/constants.ts:15 relay returns DEPLOYMENT_NOT_FOUND
      <br>⛔ Relay check: the mobile app pins wss://signaling.agiworkforce.com, which returns Vercel DEPLOYMENT_NOT_FOUND; the healthy Fly app is not the host it uses.
- [x] Prompt ⛔ **not live**
      <br>_`apps/mobile/src/features/companion/components/DispatchTaskComposer.tsx`_
      <br>⛔ Release check: release-mobile.yml:6 no v-mobile-* tag, zero runs; apps/mobile/lib/constants.ts:15 relay returns DEPLOYMENT_NOT_FOUND
      <br>⛔ Relay check: the mobile app pins wss://signaling.agiworkforce.com, which returns Vercel DEPLOYMENT_NOT_FOUND; the healthy Fly app is not the host it uses.
- [ ] Steering - 🟡 Partial
      <br>_dispatch + cancel exist; no evidence of live mid-run prompt injection ("steer this response") from phone to desktop_
      <br>⛔ Relay check: the mobile app pins wss://signaling.agiworkforce.com, which returns Vercel DEPLOYMENT_NOT_FOUND; the healthy Fly app is not the host it uses.
- [x] Approvals ⛔ **not live**
      <br>_`apps/mobile/services/companion.ts:60-63` `approval_response`_
      <br>⛔ Release check: release-mobile.yml:6 no v-mobile-* tag, zero runs; apps/mobile/lib/constants.ts:15 relay returns DEPLOYMENT_NOT_FOUND
      <br>⛔ Relay check: the mobile app pins wss://signaling.agiworkforce.com, which returns Vercel DEPLOYMENT_NOT_FOUND; the healthy Fly app is not the host it uses.
- [x] Pause ⛔ **not live**
      <br>_`apps/mobile/services/companion.ts:79` `sendAgentCommand('pause'\|'resume'\|'cancel')`_
      <br>⛔ Release check: release-mobile.yml:6 no v-mobile-* tag, zero runs; apps/mobile/lib/constants.ts:15 relay returns DEPLOYMENT_NOT_FOUND
      <br>⛔ Relay check: the mobile app pins wss://signaling.agiworkforce.com, which returns Vercel DEPLOYMENT_NOT_FOUND; the healthy Fly app is not the host it uses.
- [x] Resume ⛔ **not live**
      <br>_same as above_
      <br>⛔ Release check: release-mobile.yml:6 no v-mobile-* tag, zero runs; apps/mobile/lib/constants.ts:15 relay returns DEPLOYMENT_NOT_FOUND
      <br>⛔ Relay check: the mobile app pins wss://signaling.agiworkforce.com, which returns Vercel DEPLOYMENT_NOT_FOUND; the healthy Fly app is not the host it uses.
- [x] Cancel ⛔ **not live**
      <br>_same as above; `apps/mobile/src/features/companion/components/DispatchTaskComposer.tsx:143`_
      <br>⛔ Release check: release-mobile.yml:6 no v-mobile-* tag, zero runs; apps/mobile/lib/constants.ts:15 relay returns DEPLOYMENT_NOT_FOUND
      <br>⛔ Relay check: the mobile app pins wss://signaling.agiworkforce.com, which returns Vercel DEPLOYMENT_NOT_FOUND; the healthy Fly app is not the host it uses.
- [x] Emergency stop _(revised)_ ⛔ **not live**
      <br>_apps/mobile/src/features/companion/components/AgentDashboard.tsx:937 Emergency Stop button -> companion.ts:304 sendEmergencyStop, handled cancel-all at desktop coworkDispatch.ts:504_
      <br>⛔ Release check: release-mobile.yml:6 no v-mobile-* tag, zero runs; apps/mobile/lib/constants.ts:15 relay returns DEPLOYMENT_NOT_FOUND
      <br>⛔ Relay check: the mobile app pins wss://signaling.agiworkforce.com, which returns Vercel DEPLOYMENT_NOT_FOUND; the healthy Fly app is not the host it uses.
- [ ] Diff - 🔴 Missing
      <br>_no diff/patch viewer component under `apps/mobile/src/features/companion`_
- [ ] Terminal ⛔ **not live** - 🟡 Partial
      <br>_`ExecutionStream.tsx:95` classifies terminal/command/bash lines as text, no interactive terminal_
      <br>⛔ Release check: The mobile app has never been released (release-mobile.yml never run; no App Store or Google Play listing).
      <br>⛔ Relay check: the mobile app pins wss://signaling.agiworkforce.com, which returns Vercel DEPLOYMENT_NOT_FOUND; the healthy Fly app is not the host it uses.
- [ ] Test results - 🔴 Missing
      <br>_no test-result rendering found in companion components_
- [ ] Generated files - 🔴 Missing
      <br>_AgentDashboard.tsx:608 renders RunArtifactsList (file_created/file_modified), but no desktop snapshot ever populates artifacts; viewer exists, data never arrives_
- [x] Reconnect ⛔ **not live**
      <br>_`apps/extension/src/features/native-bridge/reconnect.ts` (same primitive family); mobile `ConnectionStateViews.tsx`_
      <br>⛔ Release check: extension reconnect unreleased (no v-ext-* tag); mobile unreleased and apps/mobile/lib/constants.ts:15 relay 404s
      <br>⛔ Relay check: the mobile app pins wss://signaling.agiworkforce.com, which returns Vercel DEPLOYMENT_NOT_FOUND; the healthy Fly app is not the host it uses.

_§39: 16 of 25 done._

---

# 40. Device registry

- [x] Device ID
      <br>_`apps/web/app/api/settings/devices/route.ts:12` `device_id`; `apps/web/db/neon/0013_devices.sql`_
- [x] User
      <br>_`0013_devices.sql:26` `desktop_devices.user_id`_
- [ ] Workspace - 🔴 Missing
      <br>_no `workspace_id`/org column on `desktop_devices`/`mobile_devices`; searched `0013_devices.sql` and later ALTERs (`0054_gateway_user_scope_rls.sql`, `0080`, `0133`, `0187`, `0190`)_
- [x] Device name
      <br>_`route.ts:13` `name`; no update/rename path found (see "rename")_
- [x] OS
      <br>_`0013_devices.sql:27` `platform` check (`macos\|windows\|linux`)_
- [ ] Architecture - 🔴 Missing
      <br>_no `architecture`/`arch` column found on either device table_
- [ ] App versions _(revised)_ - 🔴 Missing
      <br>_desktop_devices.version (0013_devices.sql:28) is never written: no insert into desktop_devices anywhere; devices/route.ts:29 returns null version for mobile rows_
- [ ] Capabilities - 🔴 Missing
      <br>_no `capabilities` field/table found in device schema or signaling payloads_
- [ ] Last seen _(revised)_ - 🔴 Missing
      <br>_desktop_devices.last_seen_at never written (no insert/update anywhere in repo); mobile rows return null last_seen_at at devices/route.ts:30_
- [ ] Online - 🟡 Partial
      <br>_implicit via an active WebSocket in `services/signaling-server/src/connection-manager.ts`, not exposed as a device-registry field/status_
- [ ] Sleeping - 🔴 Missing
      <br>_searched signaling-server and device routes for "sleeping"/"idle" presence state - no hits_
- [ ] Remote enabled - 🔴 Missing
      <br>_no per-device "remote control enabled" flag found; gating is build-type (`remoteControlSupported()`), not a stored device attribute_
- [ ] Browser available - 🔴 Missing
      <br>_no such field on device rows_
- [ ] Computer-use available - 🔴 Missing
      <br>_no such field on device rows_
- [ ] Local models - 🔴 Missing
      <br>_no such field on device rows_
- [ ] Local MCP - 🔴 Missing
      <br>_no such field on device rows_
- [x] Revoke
      <br>_`apps/web/app/api/settings/devices/[deviceId]/route.ts:109` `DELETE` unlinks device + revokes live refresh-token credentials_
- [ ] Rename - 🔴 Missing
      <br>_no `PATCH`/update-name route found; only `DELETE` exists on `[deviceId]/route.ts`; only push-token updates found elsewhere (`push-notification-service.ts`)_

_§40: 5 of 18 done._

---

# 41. Connectors

- [x] Directory
      <br>_`apps/web/app/api/connectors/directory/route.ts:39-152` search/filter/sort/pagination_
- [x] Search
      <br>_same route, zod query schema_
- [x] Connect
      <br>_`apps/web/app/api/connectors/oauth/start/route.ts`_
- [x] OAuth
      <br>_`oauth/start/route.ts:249-283`, `oauth/callback/route.ts:64-96,135` state + PKCE + replay check_
- [x] Disconnect
      <br>_`apps/web/app/api/connectors/route.ts:614-657` `disconnectDirectoryTarget`_
- [x] Reconnect
      <br>_`resolveConnectorHealth` → `needs-reauthorization` path, `route.ts:266-285`_
- [ ] Multiple accounts - 🔴 Missing
      <br>_one grant per `(user, connectorId)`; no second-account-of-same-provider model found in `route.ts`_
- [x] Status
      <br>_`apps/web/lib/connectors/catalog.ts:271-286` `ConnectorHealth` enum (`connected\|connectable\|needs-reauthorization\|not-configured\|unsupported-here`)_
- [x] Read capability
      <br>_apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:63 actionClass (ToolActionClass from packages/contracts/types generated protocol)_
- [x] Write capability
      <br>_apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:56-63 ToolActionClass read/write/delete/execute/external_send_
- [x] Approval
      <br>_`apps/web/app/api/connectors/[connectorId]/mcp/route.ts:72-76` denial on `level==='deny'`_
- [x] Scope
      <br>_apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts:160 loadConnectorToolPermissions per connector+tool level, used by connectors/[connectorId]/mcp/route.ts:67_
- [ ] Logs - 🟡 Partial
      <br>_`recordAuditEvent` on connect/disconnect only; no per-tool-call log viewer found_
- [x] Workspace policy
      <br>_`apps/web/lib/services/connector-policy-gate.ts:51-100`, invoked before OAuth token exchange_
- [x] Admin allowlist
      <br>_`apps/web/features/workspace-console/components/WorkspaceConnectorPolicy.tsx:67-68` `allowedConnectors`/`blockedConnectors`_
- [ ] Provider outage - 🔴 Missing
      <br>_`resolveConnectorHealth` (`catalog.ts:278-286`) has no "provider down"/upstream-outage state, only auth/config-derived states_
- [x] Token expiration
      <br>_`needsReauthorization` tracked in connector/OAuth grant state (`oauth-store.ts`)_

_§41: 14 of 17 done._

---

# 42. MCP

- [x] Stdio ⛔ **not live**
      <br>_`crates/agiworkforce-mcp/src/config.rs:34-42` `TransportConfig::Stdio` (CLI/Desktop, unrestricted); web path gated near-unreachable by design (`packages/tools/mcp/src/transport.ts:181-206`, signed-manifest or …_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] Streamable HTTP
      <br>_`config.rs:48-58` `TransportConfig::Http`; web `packages/tools/mcp/src/transport.ts:208-231`_
- [x] OAuth
      <br>_`config.rs:11-17` `OAuthConfig`; web `onInsufficientScope:'reauthorize'`_
- [x] Bearer
      <br>_header-based auth in `Http`/`Sse` transport headers_
- [x] Environment variables
      <br>_`config.rs:39` `Stdio.env`; web `transport.ts:17-64` `BLOCKED_ENV_KEYS` denylist_
- [x] Custom headers
      <br>_`config.rs:44,50,61` `headers: HashMap<String,String>` on every remote transport_
- [x] Server discovery
      <br>_`packages/tools/mcp` `connect.ts` `buildMcpToolCatalog`_
- [x] Tool discovery
      <br>_same_
- [x] Resources
      <br>_`app/api/connectors/[connectorId]/mcp/route.ts` `readResource`_
- [x] Elicitation/forms ⛔ **not live**
      <br>_`crates/agiworkforce-mcp/src/elicitation.rs`; web `connect.ts:819-839` `isInputRequiredResult`_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] Health _(revised)_
      <br>_apps/desktop/src-tauri/src/core/mcp/health.rs McpHealthMonitor started every 30s by sys/commands/mcp.rs:161,657 on mcp_initialize; crate client.rs:911 is_alive probe_
- [x] Restart _(revised)_ ⛔ **not live**
      <br>_crates/agiworkforce-mcp/src/client.rs:410-423 reconnect-and-retry on connection loss; desktop core/mcp/manager.rs:160 restart_server, :203 auto_restart_failed_servers_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] Timeout ⛔ **not live**
      <br>_`crates/agiworkforce-mcp/src/config.rs:98` `McpTimeouts`; web `connect.ts:45,533-545` 30s default_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] Failure
      <br>_per-server catch in `buildMcpToolCatalog`, marks `discoveryErrors`, other servers still load_
- [x] Approval
      <br>_apps/web/app/api/connectors/[connectorId]/mcp/route.ts:67-76 loads tool permissions, denies level=deny, returns approvalRequired unless allowed_
- [x] Local vs remote
      <br>_CLI/Desktop reach local `stdio`; web is remote-only by design (`transport.ts`, no reachable `command` path)_
- [x] Admin policy
      <br>_custom MCP connectors route through `evaluateConnectorPolicyForUser` (`apps/web/app/api/connectors/custom/route.ts:9,85`) before creation_

_§42: 17 of 17 done._

---

# 43. Skills

- [x] Built-in
      <br>_`packages/tools/skills/src/types.ts:1-7` `SkillSource` incl. `'bundled'`; web `getManagedSkillLayers`_
- [x] Personal
      <br>_web `user-skill-service.ts`; CLI personal skills dir in `apps/cli/src/skills.rs` discovery_
- [ ] Workspace - 🟡 Partial
      <br>_`SkillSource` type includes `'workspace'` but web only wires an ops-controlled env var (`SKILLS_LAYERS`), no per-org runtime store (`apps/web/lib/services/skill-catalog-service.ts:123-146`)_
- [x] Project
      <br>_CLI: `apps/cli/src/skills.rs:191-255` `project_skills_consent_recorded`/`grant_project_skills_consent` - real per-repo consent gate_
- [ ] Repository - ⚪ N/A
      <br>_dev-session concept, subsumed by "project" above on CLI; out of web's product model_
- [x] Plugin-provided
      <br>_web `installed-skills.ts` `isPluginOwnedSkill`; CLI `apps/cli/src/skills.rs` plugin-dir loading (`load_skills_from_plugin_dir`)_
- [x] Discover
      <br>_`apps/cli/src/skills.rs:125-142` `discover_skills`/`discover_skills_all`_
- [ ] Install - 🟡 Partial
      <br>_plugin-carried skills install with the plugin; no standalone skill-only install flow found (skills are filesystem-discovered or plugin-bundled)_
- [ ] Update - 🟡 Partial
      <br>_apps/web/app/api/skills/[name]/route.ts:107 PUT updates a personal skill, so "no update flow" is false; still no versioned update/rollback for catalog skills_
- [x] Enable
      <br>_`apps/cli/src/skills.rs:354-362` `set_skill_enabled`; web `installs/route.ts:35-84`_
- [x] Disable
      <br>_same_
- [x] Version
      <br>_`types.ts:27` `version?: string`_
- [x] Dependencies
      <br>_`SkillMetadata.requires` (`types.ts:15-21`, `bins`/`anyBins`/`tools`/`env`/`config`)_
- [x] Required tools
      <br>_`types.ts:18` `tools?: string[]`_
- [ ] Required MCP - 🔴 Missing
      <br>_`types.ts:15-21` `requires` has no `mcp` field; no MCP-as-skill-dependency modeled anywhere_
- [x] Invocation
      <br>_`packages/tools/skills/src/relevance.ts` directional keyword-coverage scoring_
- [x] Capability validation ⛔ **not live**
      <br>_CLI `apps/cli/src/skills.rs:874-956` `missing_tool_dependencies`/`check_env_deps` block activation and report reasons; web `describeSkillUnavailability`_
      <br>⛔ Release check: missing_tool_dependencies absent from v-cli-1.0.0 (only CLI release, 2026-05-03); release checks env vars only

_§43: 12 of 17 done._

---

# 44. Plugins

- [x] Registry
      <br>_web `plugin_registry_entries` (curated) + `plugin_marketplace_sources/entries/installations` (self-serve, migration 0159)_
- [x] Install
      <br>_web `app/api/plugins/installations/route.ts`; CLI `apps/cli/src/features/plugins/plugins.rs:705-745` (local/git source, integrity check, manifest validation)_
- [ ] Update - 🟡 Partial
      <br>_web has update routes; no version-diff/changelog surfaced; CLI has no explicit `plugin update` re-fetch-and-diff path found_
- [x] Enable
      <br>_web `installations/route.ts`_
- [x] Disable
      <br>_same_
- [x] Uninstall ⛔ **not live**
      <br>_web `uninstallDirectoryInstallation`; CLI removes install dir on failed integrity check (`plugins.rs:726-728`), full uninstall command not directly located but rollback path confirms the mechanism_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] Version ⛔ **not live**
      <br>_`plugins.rs:176` `dependencies`/version fields on manifest; web schema carries version_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] Publisher
      <br>_web `publisher_id/name/kind/url`, `first-party\|third-party\|partner`_
- [ ] Signature - 🔴 Missing
      <br>_CLI `plugins.rs:748-770` `verify_plugin_integrity` is SHA-256 content-hash only, not a cryptographic publisher signature, and `PluginIntegrity::UnsafeSkip` (`--unsafe-no-integrity`) bypasses even that with just a …_
- [x] Permissions
      <br>_web self-serve path binds `plugin.permissions` (`plugin-marketplace-service.ts:336-361`); directory-browse path fixed today (`e210bbb41`, `features/plugins/server/directory/install.ts`) to also bind real values instead …_
- [x] Skills
      <br>_see §43 plugin-provided skills_
- [x] MCP ⛔ **not live**
      <br>_web `plugins.ts:129,289` `mcpServers`; CLI plugin manifests can declare MCP servers loaded alongside hooks (`plugins.rs`)_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] Hooks ⛔ **not live**
      <br>_CLI `apps/cli/src/features/hooks/hooks.rs:638-828` `merge_plugin_hooks`, real, with a trust boundary (project-local plugin hooks blocked, global allowed); web `PluginManifest` has no `hooks` field - Missing on web …_
      <br>⛔ Release check: merge_plugin_hooks absent from v-cli-1.0.0, the only CLI release (npm @agiworkforce/cli 404, unpublished)
- [x] Commands _(revised)_ ⛔ **not live**
      <br>_apps/cli/src/features/plugins/plugins.rs:153 PluginManifest.commands, :542 command_path_entries registered by apps/cli/src/command_registry.rs:101_
      <br>⛔ Release check: PluginManifest.commands/command_path_entries absent from v-cli-1.0.0 plugins.rs; no later CLI release
- [x] Dependencies ⛔ **not live**
      <br>_CLI `plugins.rs:111-113,173-176` `manifest_dependencies`/`dependencies` (cross-plugin, real); web only has `required_connectors` as a dependency-like field_
      <br>⛔ Release check: manifest_dependencies absent from v-cli-1.0.0 plugins.rs; no later CLI release; web has none
- [ ] Compatibility - 🟡 Partial
      <br>_CLI plugin manifest carries dependency names but no version-range/compat check found; web has none_
- [ ] Organization allowlist - 🔴 Missing
      <br>_no `evaluateConnectorPolicyForUser`-equivalent gate anywhere in the plugin install path (web or CLI); confirmed absent on web by contrast with `WorkspaceConnectorPolicy.tsx` having no plugin equivalent_

_§44: 13 of 17 done._

---

# 45. Hooks

- [x] Session start
      <br>_dispatched at `apps/cli/src/tui/tui_app.rs:4373-4375`, `apps/cli/src/repl/mod.rs:181-183` `HookEvent::SessionStart`_
- [x] Session end
      <br>_`tui_app.rs:4437-4439`, `repl/mod.rs:629-631` `HookEvent::SessionEnd`_
- [x] Turn start _(revised)_ ⛔ **not live**
      <br>_HookEvent::UserPromptSubmit dispatched at apps/cli/src/tui/tui_app.rs:4955 and repl/mod.rs:559 at the start of every turn_
      <br>⛔ Release check: v-cli-1.0.0 hooks.rs:61 has no UserPromptSubmit; BeforeMessage never dispatched in agent/repl/tui at that tag
- [x] Turn end ⛔ **not live**
      <br>_turn end is HookEvent::AfterMessage at apps/cli/src/agent/chat.rs:1009; Stop fires on Ctrl-C/quit (repl/mod.rs:589, tui_app.rs:4541), not turn completion_
      <br>⛔ Release check: v-cli-1.0.0 defines AfterMessage (hooks.rs:67) but agent.rs/repl.rs/tui_app.rs never dispatch it
- [x] Pre-tool ⛔ **not live**
      <br>_`apps/cli/src/agent/chat.rs:260-262` `HookEvent::PreToolUse`_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] Post-tool
      <br>_`chat.rs:1853-1855,1942-1944` `HookEvent::PostToolUse`_
- [x] Pre-command ⛔ **not live**
      <br>_aliased to `PreToolUse` (`hooks.rs:255-259` `"PreCommand" => (HookEvent::PreToolUse, ...)`)_
      <br>⛔ Release check: v-cli-1.0.0 hooks.rs:73 PreCommand is its own event, never dispatched; alias to PreToolUse is unreleased
- [x] Post-command ⛔ **not live**
      <br>_aliased to `PostToolUse` (`hooks.rs:259-263`)_
      <br>⛔ Release check: v-cli-1.0.0 hooks.rs:75 PostCommand is its own event, never dispatched; alias is unreleased
- [ ] Approval requested _(revised)_ ⛔ **not live** - 🟡 Partial
      <br>_HookEvent::PermissionRequest only dispatched at apps/cli/src/agent/chat.rs:2240 for loop-detection confirmation; ordinary tool approval prompts fire no hook_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [ ] Error - 🟡 Partial
      <br>_`StopFailure` covers a Stop-hook command failing, not a generic model/tool run error; no generic `Error` event found_
- [ ] Cancellation _(revised)_ - 🟡 Partial
      <br>_HookEvent::Stop fires on ReadlineError::Interrupted (repl/mod.rs:589-593) and TUI quit (tui_app.rs:4541); no hook for cancelling an in-flight turn_

Check:

- [x] Timeout
      <br>_`hooks.rs:34-36,1163-1204` per-hook `timeout` (default 10s), "Hook timed out after {}s"_
- [x] Failure behavior
      <br>_`hooks.rs:597-627` `HookAggregateOutcome` priority `Blocked > Stop > Continue`_
- [ ] Workspace policy - 🔴 Missing
      <br>_no org/workspace-level hook policy found (nothing gates which hooks a workspace permits)_
- [x] Plugin hooks ⛔ **not live**
      <br>_`hooks.rs:638-828` `merge_plugin_hooks`; project-local plugin hooks blocked by default, global plugin hooks allowed (`plugins.rs:320,638`)_
      <br>⛔ Release check: merge_plugin_hooks absent from v-cli-1.0.0, the only CLI release
- [ ] Managed hooks - 🔴 Missing
      <br>_searched "managed hook"/"enterprise hook"/"admin hook"/"org hook" across `apps/cli/src` - no hits; no IT-admin-enforced hook layer exists_

_§45: 11 of 16 done._

---

# 46. Model registry (one canonical source of truth)

- [x] ID
      <br>_`registry.schema.json` `modelIdentity.key`, required_
- [x] Provider
      <br>_`modelIdentity.provider`, required_
- [x] Name
      <br>_`modelIdentity.displayName`, required_
- [x] Family
      <br>_`modelIdentity.family`, resolved from `model-families.json`_
- [ ] Version - 🟡 Partial
      <br>_no dedicated version field; encoded only inside the `key`/`providerModelId` string (e.g. `gpt-5.1`)_
- [x] Context
      <br>_`definitions.limits.contextTokens/maxInputTokens/maxOutputTokens`_
- [x] Input modalities
      <br>_`capabilities.{textInput,imageInput,audioInput,videoInput}`_
- [x] Output modalities
      <br>_`capabilities.{textOutput,imageOutput,audioOutput,videoOutput}`_
- [x] Tool support
      <br>_`capabilities.functionCalling`, `toolSchemaSupport`_
- [x] Reasoning
      <br>_`capabilities.reasoning`_
- [x] Structured output
      <br>_`capabilities.structuredOutput`_
- [x] Image
      <br>_`capabilities.imageInput/imageOutput/imageEditing`_
- [x] Audio
      <br>_`capabilities.audioInput/audioOutput`_
- [x] Video
      <br>_`capabilities.videoInput/videoOutput`, `pricing.videoPerSecondByResolution`_
- [x] Cost
      <br>_`definitions.pricing` (input/output/cache per-million, schedule, tiers)_
- [x] Latency profile _(revised)_
      <br>_packages/contracts/types/src/model-catalog.ts:453 required speed: ModelSpeed ('very-fast'..'slow') compiled per model (model-registry/scripts/compile.mjs:408), served by apps/web/app/api/models/route.ts:160_
- [x] Plan _(revised)_
      <br>_packages/ai/model-registry/catalog/routing-policies.json:22 tierAllowedSlots maps each plan to slots inside the registry; enforced at packages/ai/routing/src/auto.ts:583_
- [x] Trust-mode availability
      <br>_`runtimeProfile.trustMode`, `allowedHarnessIds`, `registry.schema.json`_
- [ ] Region - 🟡 Partial
      <br>_no per-model region; only per-provider `providerGovernance.residencyRegions` (`registry.schema.json`), and per-endpoint `endpointHosts`_
- [x] Deprecation
      <br>_`lifecycle.deprecated/deprecatedOn/status`; `catalog/retired-models.json` `retiredModelIds`_
- [ ] Replacement _(revised)_ - 🟡 Partial
      <br>_packages/ai/model-registry/catalog/model-families.json:1338 family slots carry activeModelKey/previousModelKey/fallbackChain and history from->to; per-model replacedBy field still absent_

_§46: 18 of 21 done._

---

# 47. Model gateway

- [x] Provider-neutral request
      <br>_`packages/ai/providers/factory/src` builds one adapter interface over openai/anthropic/google/xai/groq/etc._
- [x] Translation
      <br>_`packages/ai/provider-protocol/src/openai-wire-compat.ts`, `anthropic-payload-policy.ts`_
- [x] Authentication
      <br>_per-provider adapters under `packages/ai/providers/*/src` take API key/OAuth session_
- [x] Streaming
      <br>_provider adapters implement SSE stream parsing (e.g. `packages/ai/providers/anthropic/src/stream.ts`)_
- [x] Tool translation
      <br>_`packages/ai/provider-protocol/src/openai-tool-schema.ts`, `anthropic-tool-payload-compat.ts`_
- [x] Structured-output translation
      <br>_`packages/ai/provider-protocol/src/openai-responses-payload-policy.ts`_
- [x] Multimodal translation
      <br>_per-adapter image/audio payload mapping in `packages/ai/providers/*`_
- [x] Error normalization
      <br>_`packages/ai/provider-runtime/src/errors.ts`_
- [x] Usage normalization
      <br>_apps/web/lib/cost-tracker.ts:24 NormalizedUsage is the provider-neutral usage shape priced by calculateCostUsd; governance billing classes only parameterize it_
- [x] Cancellation _(revised)_
      <br>_packages/ai/provider-runtime/src/client/streamFromProvider.ts:13-42 merges caller and internal AbortSignals; adapters accept signal (providers/anthropic/src/index.ts:104), retry.ts:32 honours it_
- [x] Timeout
      <br>_`packages/ai/provider-runtime/src/watchdog.ts`_
- [x] Retry
      <br>_`packages/ai/provider-runtime/src/retry.ts`, `retry-after-internal.ts`_
- [x] Provider fallback
      <br>_`packages/ai/provider-runtime/src/failover.ts`_
- [x] Observability _(revised)_
      <br>_apps/web/app/api/llm/v1/chat/completions/lib/adapter-factory.ts:82 wraps every provider stream in withSpan gen_ai.stream.start with gen_ai.request.model and error_code attributes_

_§47: 14 of 14 done._

---

# 48. Router

Inputs:

- [x] Intent
      <br>_`AutoRoutingRequest.taskType` (`auto.ts:153`)_
- [x] Coding _(revised)_
      <br>_packages/contracts/types/src/runtime.ts:52 RoutingTaskType includes 'coding' as a discrete taskType input to resolveAutoRoute (auto.ts:153)_
- [x] Research _(revised)_
      <br>_packages/contracts/types/src/runtime.ts:57 RoutingTaskType includes 'research'; TaskFamily adds deep_research (task-family.ts:69)_
- [x] Tool need
      <br>_`capabilitiesInUse`, `requiredCapabilities` (`auto.ts:250,158`)_
- [x] Multimodal
      <br>_`requiredCapabilities` intrinsic capability list includes image/audio/video (`auto.ts:158`)_
- [x] Context size
      <br>_`estimatedInputTokens`/`estimatedOutputTokens` (`auto.ts:207-208`)_
- [ ] Latency _(revised)_ - 🟡 Partial
      <br>_packages/ai/routing/src/auto.ts:672 latencyP50Ms ranking only runs when AGI_ROUTING_OBSERVED_HEALTH=1; default off (apps/web/.env.example:709 commented)_
- [x] Cost
      <br>_`budgetRemainingCents`, `expectedMicroUsdFromCents` (`auto.ts:206`, `task-family-routing.ts`)_
- [x] Quality _(revised)_
      <br>_packages/ai/routing/src/task-family-routing.ts:96 per-family qualityFloor (slot band, benchmark minimums) filters routes; stage enabled by default (task-family-routing.ts:81)_
- [x] Provider health
      <br>_`observedRouteHealth`, `runtimeState` (`auto.ts:243,252`)_
- [x] User preference
      <br>_`preferSlots`, `preferredRouteId`, `currentModelKey` (`auto.ts:216,233,156`)_
- [x] Workspace policy
      <br>_`organizationPolicy: ModelAccessPolicy` (`auto.ts:279`)_
- [ ] Region - 🟡 Partial
      <br>_only `usOnly` boolean and `excludedRouteHosts`; no general region parameter_
- [x] Plan
      <br>_`subscriptionTier` (`auto.ts:154`)_

Outputs:

- [x] Selected model
      <br>_`SelectedAutoRoute.modelKey/provider/providerModelId` (`auto.ts:339-349`)_
- [x] Selected provider
      <br>_`SelectedAutoRoute.provider`_
- [x] Reason
      <br>_`SelectedAutoRoute.reason` enum (`auto.ts:351-359`)_
- [x] Fallback
      <br>_`SelectedAutoRoute.fallbacks: AutoFallbackRoute[]`_
- [ ] Routing trace - 🟡 Partial
      <br>_reason + fallbacks + `UnavailableAutoRoute.reasons[]` exist, but no persisted structured decision trace/log was found (searched "routingTrace", "logRoutingDecision")_

_§48: 16 of 19 done._

---

# 49. Provider health

- [x] Availability
      <br>_`RouteHealthSnapshot`/`RouteOutcomeClass` (`runtime-state.ts`), consumed in `effectiveRouteHealth`_
- [ ] Latency _(revised)_ - 🟡 Partial
      <br>_packages/ai/routing/src/auto.ts:672-674,1148 latency band only ranks when AGI_ROUTING_OBSERVED_HEALTH=1; unset by default (.env.example:709 commented) - unset in production: AGI_ROUTING_OBSERVED_HEALTH_
- [x] Rate limits
      <br>_packages/ai/routing/src/route-health-store.ts:152 counts rate_limit outcome class into rateLimitRate (:615); breaker-profiles.ts has no production consumer_
- [x] Error rates
      <br>_`route-health-store.ts` `routeBreakerStateWithDegradeBand` counts failures in a window_
- [ ] Tool reliability _(revised)_ - 🟡 Partial
      <br>_request-processor.ts:1654-1675 serving route never passes capabilitiesInUse or unhonouredCapabilities; only app/api/llm/v1/route/preview/route.ts:115 applies the penalty_
- [ ] Region availability - 🟡 Partial
      <br>_health tracked per route/provider, not per region explicitly_
- [ ] Context capacity - 🟡 Partial
      <br>_capacity gating is via registry `limits.contextTokens` admission, not a *health* signal (no runtime "capacity exceeded" health state found)_
- [x] Model deprecation
      <br>_admission check `lifecycle.deprecated` rejects before health is even consulted (`auto.ts:1198`)_
- [x] Circuit breaker
      <br>_packages/ai/routing/src/route-health-store.ts:50-54,312 route breaker (consecutive failures, failure rate, cooldown) fed by recordRouteOutcome in completions route.ts:335; breaker-profiles.ts is unused_
- [x] Recovery
      <br>_packages/ai/routing/src/route-health-store.ts:53-54 AGI_ROUTE_BREAKER_COOLDOWN_MS / MAX_COOLDOWN govern re-admission; breaker-profiles.ts resetMs is never consumed_
- [ ] Health scoring _(revised)_ - 🟡 Partial
      <br>_auto.ts:835-851 failure-rate and latency score bands skipped unless AGI_ROUTING_OBSERVED_HEALTH=1 (auto.ts:672); capability penalty never fed on serving path_

_§49: 6 of 11 done._

---

# 50. Prompt system

- [ ] Versioned system prompts - 🔴 Missing
      <br>_searched "promptVersion", "PROMPT_REGISTRY" - no hits; `apps/web/lib/support/agent/prompt/system-prompt.ts:16` is an unversioned plain `const`_
- [ ] Product prompts - 🟡 Partial
      <br>_exist as scattered consts (`apps/web/lib/voice/live-voice-prompts.ts`, `packages/ai/agent-core/src/memory.ts` `MEMORY_FACT_EXTRACTION_SYSTEM_PROMPT`) but not under one registry_
- [ ] Agent prompts - 🟡 Partial
      <br>_apps/web/lib/services/cloud-code-agent-loop.ts:169 buildSystemPrompt is an inline agent prompt; scheduled-agent-executor.ts only length-checks the user's prompt_
- [ ] Router prompts - 🔴 Missing
      <br>_the router (`packages/ai/routing`) is pure code/heuristics, not an LLM-prompted classifier - no router prompt found_
- [ ] Tool prompts _(revised)_ - 🟡 Partial
      <br>_apps/web/lib/url-fetch/url-fetch-tool.ts:73 tool descriptions are model-facing tool prompts, inline per tool, uncatalogued and unversioned_
- [ ] Research prompts _(revised)_ - 🟡 Partial
      <br>_apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1190 RESEARCH_SYSTEM_PROMPT exists as an inline const, not a managed asset_
- [ ] Safety prompts _(revised)_ - 🟡 Partial
      <br>_apps/web/lib/connectors/mcp-context-service.ts:115 injects "untrusted reference data, do not obey instructions" safety text; scattered, not a safety prompt set_
- [ ] Prompt registry - 🔴 Missing
      <br>_none found_
- [ ] Release version - 🔴 Missing
      <br>_none found_
- [ ] A/B testing - 🔴 Missing
      <br>_searched "promptVariant", "prompt.\*experiment" - no hits_
- [ ] Rollback - 🔴 Missing
      <br>_no versioning means no rollback mechanism_
- [ ] Eval linkage - 🔴 Missing
      <br>_searched "promptEval", "golden.\*prompt" - no hits_

_§50: 0 of 12 done._

---

# 51. Agent loop

- [x] Context assembly
      <br>_host-side message/context building feeds `TurnParams` into `run_turn` (`engine.rs:35`)_
- [x] Model call
      <br>_`engine.rs:44` `complete_and_emit(host, TurnPhase::First)`_
- [x] Tool detection
      <br>_`engine.rs:52` `current_tool_calls = first.outcome.tool_calls.clone()`_
- [x] Tool execution
      <br>_`engine.rs:110` partitions into `ToolClass::Task`/parallel/sequential then dispatches_
- [x] Approval ⛔ **not live**
      <br>_`crate::Prepared` enum + host `prepare_tool` (`crates/agiworkforce-agent-core/src/lib.rs:302`) gates dispatch_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] Tool result
      <br>_`ResultBlock` commit step (imported at `engine.rs:14`)_
- [x] Continue reasoning
      <br>_continuation loop structure in `run_turn` (loops back to `complete_and_emit`)_
- [x] Loop limit ⛔ **not live**
      <br>_`crates/agiworkforce-agent-core/src/runaway.rs:12` `MAX_AGENTIC_ITERATIONS: usize = 25`_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] Token limit
      <br>_max_budget_usd is a cost cap; token limit is crates/agiworkforce-agent-core/src/context.rs:151 context_budget used by apps/cli/src/compaction.rs:54_
- [x] Compaction ⛔ **not live**
      <br>_`apps/cli/src/agent/chat.rs:560,593` `compact_history`/`compact_now`, `PreCompact` hook (`chat.rs:661`)_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] Failure
      <br>_`run_turn` returns `anyhow::Result<TurnOutcome>`; error propagation through host_
- [x] Cancellation ⛔ **not live**
      <br>_`engine.rs:75,206` `host.is_cancelled()` checked loop-top and post-dispatch_
      <br>⛔ Release check: released CLI 1.0.0 agent.rs has no is_cancelled/interrupt check (git grep b57b308f8 agent.rs cancel: only a comment at :461)
- [x] Subagents
      <br>_`engine.rs:110,118` `ToolClass::Task` batch spawned/awaited host-side_
- [x] Final response _(revised)_ ⛔ **not live**
      <br>_crates/agiworkforce-protocol/src/developer_session.rs:792 TurnEndedNotification carries the final response on turn/completed, distinct from TextDelta stream_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.

_§51: 14 of 14 done._

---

# 52. Tool registry

Each tool:

- [ ] ID ⛔ **not live** - 🟡 Partial
      <br>_tools are keyed by `name` only (`crates/agiworkforce-llm/src/wire.rs:50`); no separate stable ID field_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] Name ⛔ **not live**
      <br>_`wire.rs:50` `pub name: String`_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] Description ⛔ **not live**
      <br>_`wire.rs:51` `pub description: String`_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] Schema ⛔ **not live**
      <br>_`wire.rs:52` `pub input_schema: serde_json::Value`_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [ ] Version - 🔴 Missing
      <br>_searched `ToolDefinition` in `wire.rs` and `crates/agiworkforce-protocol/src/tool_primitive.rs:75`, no version field on either_
- [ ] Capability ⛔ **not live** - 🟡 Partial
      <br>_`tool_primitive.rs:78` has `category: AgentEventToolCategory`/`action_class`; the live `wire.rs` struct only has `owner`/`permission_class` strings (`wire.rs:87,90`)_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] Risk _(revised)_
      <br>_apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:197 per-tool actionClass/reversible/egress risk model, consumed by tool-loop.ts:233 gating_
- [x] Approval requirement
      <br>_handled out-of-struct via `ApprovalRequestKind` (§53) keyed by tool call site, not a declared field_
- [x] Trust-mode availability ⛔ **not live**
      <br>_`apps/cli/src/agent/mod.rs:701-736` `apply_tool_filters`/`effective_tool_definitions` gates tool list on plan-mode/allowed/disallowed lists_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [ ] Timeout - 🟡 Partial
      <br>_bash tool has a per-call `timeout_sec` arg (`apps/cli/src/platform/runtime/tool_catalog.rs:373`) and sandbox exec timeout (`apps/cli/src/sandbox.rs:437`), but it's execution-level, not a declared registry field_
- [ ] Cancellation - 🟡 Partial
      <br>_only turn-level cancellation confirmed (`engine.rs:75`); no per-tool-call cancellation token found_
- [ ] Result schema - 🔴 Missing
      <br>_live `wire.rs` `ToolDefinition` has no `output_schema`; only the unwired `tool_primitive.rs:82` has one_
- [ ] Error schema - 🔴 Missing
      <br>_searched both `ToolDefinition` structs, no error-schema field or type found_

_§52: 6 of 13 done._

---

# 53. Approval system

Canonical decisions:

- [x] Pending ⛔ **not live**
      <br>_`apps/cli/src/tui/approval_broker.rs:96` request enqueued, awaits response via oneshot channel_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] Allow once ⛔ **not live**
      <br>_`approval_broker.rs:82` `ApprovalDecision::AllowOnce`_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] Allow session ⛔ **not live**
      <br>_`approval_broker.rs:83` `AllowSession`_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] Always allow workspace ⛔ **not live**
      <br>_`approval_broker.rs:84` `AlwaysAllow`; persisted via `apps/cli/src/permissions.rs:369` `allow_workspace`_
      <br>⛔ Release check: b57b308f8 permissions.rs:78 allow_always is never called outside permissions.rs; released CLI offers only y/n Confirm (tools.rs:560)
- [x] Deny ⛔ **not live**
      <br>_`approval_broker.rs:85` `Deny`_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.

Approval for:

- [x] File writes ⛔ **not live**
      <br>_`ApprovalRequestKind::FileWrite/FileEdit/Patch` (`approval_broker.rs:23-31`)_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] Commands ⛔ **not live**
      <br>_`ApprovalRequestKind::Exec` (`approval_broker.rs:20`)_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] Git ⛔ **not live**
      <br>_git tool routes through `Exec` kind, `apps/cli/src/features/exec/tools/git/mod.rs:36`_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] MCP ⛔ **not live**
      <br>_`ApprovalRequestKind::McpTool/McpElicitation` (`approval_broker.rs:35-41`)_
      <br>⛔ Release check: b57b308f8 apps/cli/src/mcp.rs:313 call_tool has no approval prompt; McpTool approval kind absent from released CLI 1.0.0
- [x] Connector write _(revised)_
      <br>_apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-permissions.ts allow/ask/deny per connector tool, enforced in tool-loop.ts:2528; destructive connector tools via tool-metadata.ts:221_
- [x] Browser _(revised)_ ⛔ **not live**
      <br>_CLI browser tools always prompt through the generic approval engine (pinned by 4926761ed); a dedicated enum variant is not required for approval to exist_
      <br>⛔ Release check: released CLI 1.0.0 has no browser tools (app_server.rs:95 tool list); pinning commit 4926761ed is 2026-09-16
- [ ] Computer use - 🟡 Partial
      <br>_Desktop computer use is consent-gated (`apps/desktop/src-tauri/src/automation/computer_use`); no approval kind in the shared CLI/app-server runtime_
- [ ] Network _(revised)_ - 🟡 Partial
      <br>_web tool-loop.ts:2541-2553 escalates egress-path tools (lethal trifecta) to ask; CLI network is a sandbox allow/deny, not a per-call approval_
- [x] Destructive actions _(revised)_ ⛔ **not live**
      <br>_apps/cli/src/features/exec/exec_policy.rs:257 classify_command (safety/approval.rs:39 classify_rm) forces approval for destructive commands; web tool-metadata.ts:217 destructive metadata_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.

_§53: 12 of 14 done._

---

# 54. Sandbox

- [x] Filesystem ⛔ **not live**
      <br>_`apps/cli/src/sandbox.rs` Seatbelt profile allows workspace read/write, denies elsewhere (`sandbox.rs:300`+ area)_
      <br>⛔ Release check: released CLI 1.0.0 agent run_command is unsandboxed (b57b308f8 tools.rs:584 sh -c); Seatbelt only via explicit agi sandbox subcommand (main.rs:1094)
- [x] Network ⛔ **not live**
      <br>_`sandbox.rs:94` `NetworkPolicy` enum (Allow/Deny), wired through `bwrap --unshare-net` (test `bwrap_deny_args_include_unshare_net`, `sandbox.rs:958`)_
      <br>⛔ Release check: released CLI 1.0.0 sandbox profile allows network-outbound unconditionally (b57b308f8 sandbox.rs profile); no NetworkPolicy; agent commands unsandboxed tools.rs:584
- [x] Processes ⛔ **not live**
      <br>_`sandbox.rs:451-497` wraps child process via `sandbox-exec`/`bwrap`_
      <br>⛔ Release check: b57b308f8 tools.rs:584 agent commands spawn sh -c directly; sandbox wrapper only on agi sandbox subcommand (main.rs:1094)
- [x] Writable roots ⛔ **not live**
      <br>_live profile apps/cli/src/sandbox.rs:326-331 allows writes to /tmp and writable_roots; macos_sandbox.rs is only used by doctor_
      <br>⛔ Release check: released CLI writable_roots not applied to agent commands (tools.rs:584 unsandboxed); profile only in agi sandbox subcommand
- [x] Readable roots ⛔ **not live**
      <br>_apps/cli/src/sandbox.rs:344-353 file-read\* allowlist (/usr,/bin,/Library,/System,/etc,/opt, workspace)_
      <br>⛔ Release check: released CLI read allowlist only in agi sandbox subcommand (b57b308f8 sandbox.rs, main.rs:1094); agent run_command unsandboxed tools.rs:584
- [ ] Environment ⛔ **not live** - 🟡 Partial
      <br>_bash sandbox passes inherited env (sandbox.rs:479 only sets TMPDIR); only MCP children get env_clear plus allowlist (crates/agiworkforce-mcp/src/client.rs:217)_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] Child processes ⛔ **not live**
      <br>_`sandbox.rs:451` `(allow process-fork)`/`(allow process-exec)` in profile_
      <br>⛔ Release check: released CLI agent child processes unsandboxed (b57b308f8 tools.rs:584); process-fork profile only in agi sandbox subcommand
- [ ] MCP ⛔ **not live** - 🟡 Partial
      <br>_MCP servers run as separate child processes (`apps/cli/src/mcp/mod.rs`) but no evidence they're routed through the same sandbox wrapper as the bash tool_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [ ] Hooks - 🔴 Missing
      <br>_searched for sandbox-wrapping of hook execution, no hits - hooks appear to run unsandboxed_
- [ ] Browser where applicable - 🔴 Missing
      <br>_`browser_bridge.rs` has no sandbox wrapping; browser automation runs outside this sandbox model entirely_
- [x] Sandbox-unavailable behavior ⛔ **not live**
      <br>_`apps/cli/src/features/exec/tools/bash/mod.rs:202-217` "Sandbox unavailable (...). Re-run with --no-sandbox only if you accept unrestricted command execution."_
      <br>⛔ Release check: "Sandbox unavailable" message and features/exec/tools/bash absent at b57b308f8; released run_command silently runs unsandboxed (tools.rs:584)
- [x] Explicit unsafe override ⛔ **not live**
      <br>_`--no-sandbox` flag referenced above; `sandbox.rs:164` `set_sandbox_disabled`_
      <br>⛔ Release check: no --no-sandbox or set_sandbox_disabled in released CLI 1.0.0 (git grep b57b308f8 no hits); sandbox is opt-in subcommand
- [ ] Enterprise forced sandbox - 🔴 Missing
      <br>_searched "forced.?sandbox\|enterprise.\*sandbox\|mandatory.?sandbox", only a docstring hit unrelated to enforcement; no admin-mandated always-on sandbox policy found_

_§54: 8 of 13 done._

---

# 55. Authentication

- [x] Email
      <br>_`apps/web/features/auth/identityAuthAdapter.tsx:120-188` email code sign-in via Clerk `useSignIn`_
- [x] Google
      <br>_`apps/web/features/auth/identityAuthAdapter.tsx:22` `oauth_google` strategy wired_
- [ ] Apple _(revised)_ - 🟡 Partial
      <br>_apps/web/features/auth/authProviderConfig.ts:3 reads AGI_AUTH_PROVIDERS (absent from .env.example); packages/client/client-runtime/src/authProviders.ts:17 default is google,github only, no Apple button - unset in …_
- [ ] Microsoft _(revised)_ - 🟡 Partial
      <br>_apps/web/features/auth/authProviderConfig.ts:3 reads AGI_AUTH_PROVIDERS (absent from .env.example); packages/client/client-runtime/src/authProviders.ts:17 default google,github, no Microsoft button - unset in …_
- [x] SAML
      <br>_`apps/web/lib/server/sso/clerk-enterprise-connections.ts:26,56` SAML connection type, ACS/entity ID metadata_
- [x] Device-code flow
      <br>_`apps/web/app/device-auth`, `apps/web/app/api/auth/device`, `apps/web/lib/server/device-signin-policy.ts`_
      <br>⛔ Deploy risk: apps/web/app/api/auth/device/token/route.ts:143-145 inserts device_refresh_tokens.organization_id from 0187 (header line 3: NOT YET APPLIED); token redemption fails if unapplied
- [x] Desktop callbacks
      <br>_`apps/web/app/api/auth/desktop-token/route.ts`_
      <br>⛔ Deploy risk: apps/desktop/src/services/desktopNativeSignIn.ts:95 desktop sign-in redeems via /api/auth/device/token, whose insert needs 0187 organization_id column (NOT YET APPLIED)
- [x] Mobile callbacks _(revised)_ ⛔ **not live**
      <br>_apps/mobile/app/(auth)/login.tsx:6-7 uses Clerk native AuthView (@clerk/expo/native), which completes OAuth/SSO callbacks in-app; apps/mobile/app/_layout.tsx:640-654 routes auth deep links (reset-password)._
      <br>⛔ Release check: The mobile app has never been released (release-mobile.yml never run; no App Store or Google Play listing).
- [x] Extension authentication ⛔ **not live**
      <br>_`apps/extension/src/features/cloud-bridge/clerkAuth.ts`, tested in `apps/extension/__tests__/clerk-auth.test.ts`_
      <br>⛔ Release check: The Chrome extension has never been published (release workflow never run; no v-ext tag).
- [x] CLI authentication
      <br>_`apps/cli/src/auth.rs:15-24` OAuth refresh/access token store, `apps/cli/src/oauth.rs`_
      <br>⛔ Deploy risk: apps/cli/src/auth.rs:477-479 CLI login uses /api/auth/device/token; route.ts:143-145 writes 0187 organization_id column, header says NOT YET APPLIED
- [x] MFA where relevant
      <br>_`apps/web/app/api/settings/2fa/route.ts`, TOTP + backup codes, envelope-encrypted secret at `apps/web/lib/crypto/totp-envelope.ts`_
- [ ] Passkey readiness - 🔴 Missing
      <br>_searched `passkey`, `webauthn`, `WebAuthn` across `apps/web` - no hits_
- [x] Refresh
      <br>_Clerk SDK session refresh (client-managed); CLI has explicit `refresh`/`access`/`expires` fields, `apps/cli/src/auth.rs:19-21`_
      <br>⛔ Deploy risk: apps/web/app/api/auth/device/refresh/route.ts:135 rotation insert writes organization_id added by 0187 (NOT YET APPLIED); device refresh breaks if unapplied
- [x] Logout
      <br>_`apps/web/app/api/auth/logout/route.ts`, `apps/web/shared/stores/authentication-store.logout-cleanup.test.ts`_
- [x] Global revoke
      <br>_`apps/web/app/api/settings/sessions/route.ts` batch-revokes all active sessions with backoff/retry (`REVOKE_BATCH_SIZE`, `MAX_REVOKE_PASSES`)_

_§55: 12 of 15 done._

---

# 56. Enterprise identity

- [x] Domain verification
      <br>_`apps/web/lib/server/sso/domain-verification.ts`, `apps/web/app/api/admin/sso/verify-domain/route.ts`_
- [x] SSO
      <br>_`apps/web/app/api/admin/sso/route.ts`, `apps/web/features/settings/sections/team/SSOPanel.tsx`, SAML+OIDC in `clerk-enterprise-connections.ts`_
- [x] SCIM
      <br>_`apps/web/app/api/scim/v2/Groups/route.ts`, `apps/web/app/api/scim/v2/ServiceProviderConfig/route.ts`, `apps/web/lib/server/scim/scim-provisioning-service.ts`_
- [ ] JIT provisioning - 🟡 Partial
      <br>_SCIM upserts on IdP push (`scim-provisioning-service.ts:512-523`); no true JIT-on-first-SSO-login path found - searched `justInTime`, `JIT`_
- [x] Group sync
      <br>_`apps/web/lib/services/directory-sync-revocation.ts`, SCIM group provision/deprovision events in `security-audit.ts:263-267`_
- [x] Deprovisioning
      <br>_`apps/web/lib/services/deprovision-service.ts:1-40` revokes org-scoped credentials on membership removal_
      <br>⛔ Deploy risk: apps/web/lib/services/deprovision-service.ts:162-164 filters device_refresh_tokens.organization_id (0187, NOT YET APPLIED); error swallowed, device tokens stay live
- [ ] Account-takeover prevention _(revised)_ - 🟡 Partial
      <br>_apps/web/lib/rate-limit.ts:191-196 throttles 2fa-verify/setup; lib/server/two-factor-replay.ts claimTotpStep blocks TOTP replay; cron/page-security-anomalies pages on auth spikes. No login-anomaly or new-device …_
- [x] Workspace assignment
      <br>_`organization_members` primary key `(organization_id, user_id)`, `apps/web/db/neon/0015_organizations.sql:10-19`_
- [ ] Product assignment - 🔴 Missing
      <br>_no per-seat Work/Code/Research product entitlement table found; workspace policy is org-wide only (see §60)_
- [x] Session invalidation _(revised)_
      <br>_apps/web/lib/services/deprovision-service.ts:91,146-180 revokes identity sessions, device_refresh_tokens and api_keys; called from scim-provisioning-service.ts:921 and team/[memberId] route. …_
      <br>⛔ Deploy risk: apps/web/lib/services/deprovision-service.ts:162-173 device-token revocation needs 0187 column (NOT YET APPLIED); failure only pushed to errors, sessions/API keys still revoked

_§56: 7 of 10 done._

---

# 57. Multi-tenancy

- [x] Tenant ID everywhere
      <br>_`organization_id` columns with RLS across `apps/web/db/neon/*.sql`; `check:rls-boundary` CI guard, `scripts/check-rls-boundary.mjs`_
- [x] Workspace ID everywhere
      <br>_same as above; `getUserScopedDb` resolves `organizationId` per request, `apps/web/app/api/search/route.ts:108`_
- [x] Row isolation
      <br>_`CREATE POLICY` count 56 across migrations, e.g. `apps/web/db/neon/0037_rls_user_isolation.sql:100-157`_
- [x] Storage isolation _(revised)_
      <br>_apps/web/app/api/uploads/presign/route.ts:134,155 keys prefixed by userId; chat-attachment/put/route.ts:38 and complete/route.ts:72-80 reject keys outside chat-attachments/{userId}/; reads go through DB-scoped media …_
- [x] Search isolation
      <br>_apps/web/app/api/search/**tests**/message-search-scoping.test.ts is the real test path; route scoping via getUserScopedDb at apps/web/app/api/search/route.ts:108._
- [ ] Vector isolation - ⚪ N/A
      <br>_no vector/embedding store exists in the product (no pgvector table, no embedding service found)_
- [x] Cache isolation
      <br>_`apps/web/lib/rate-limit.ts:1086-1087` keys namespaced `agi-turns:${userId}`_
- [x] Queue isolation
      <br>_`apps/web/lib/server/video-generation-jobs.ts` and workflow steps scope by user/org (durable workflow inputs carry ids)_
- [x] Usage isolation
      <br>_`apps/web/features/workspace-console/components/WorkspaceUsageAnalytics.tsx` "By member/model/provider" breakdown is org-scoped_
- [x] Billing isolation
      <br>_`apps/web/db/neon/0163_enterprise_billing_contracts.sql:19,68,104` org-scoped tables + RLS `app_has_org_role`_
- [x] Logs isolation
      <br>_`apps/web/db/neon/0091_audit_insert_policy_scoping.sql:48-51`_
- [x] Connector isolation
      <br>_`apps/web/db/neon/0141_organization_connector_policy.sql:34,76-77` org-scoped policy table with RLS_

_§57: 11 of 12 done._

---

# 58. Roles

Built-in:

- [x] Member
      <br>_`apps/web/db/neon/0015_organizations.sql:14` role check includes `'member'`_
- [x] Admin
      <br>_same check includes `'admin'`_
- [x] Owner
      <br>_same check includes `'owner'`; `apps/web/features/workspace-console/components/WorkspaceIdentityPanels.tsx:69` `isOwner` gate_
- [ ] Primary Owner - 🟡 Partial
      <br>_no distinct "Primary Owner" tier above Owner; `apps/web/app/api/settings/organization/transfer-ownership/route.ts` implies single-owner semantics but role enum has no separate value_

Support:

- [ ] Custom roles - 🔴 Missing
      <br>_searched `custom.*role`, `customRole` - role is a fixed `check` constraint, 4 values only_
- [x] Group-based roles _(revised)_
      <br>_scim groups carry a standing mapped_role (scim-provisioning-service.ts:332-341,1428); admin route apps/web/app/api/admin/directory-sync/groups/route.ts:170-203 changes it and reconciles members; UI …_
- [ ] Multiple roles - 🔴 Missing
      <br>_`organization_members` primary key `(organization_id, user_id)` with a single `role text` column - one role per user per org_
- [ ] Feature permissions - 🔴 Missing
      <br>_searched for a permissions/capability grid keyed by role beyond the 4-value check constraint - none found_
- [x] Admin permissions
      <br>_`app_has_org_role(organization_id, array['owner','admin'])` gates admin-only RLS writes, e.g. `0163_enterprise_billing_contracts.sql:104,112`_
- [ ] Delegated group manager - 🔴 Missing
      <br>_searched `group.*manager`, `groupManager` - no hits_

_§58: 5 of 10 done._

---

# 59. Admin control plane

- [x] Users
      <br>_`apps/web/features/workspace-console/components/WorkspaceIdentityPanels.tsx` + `apps/web/app/workspace/people/page.tsx`_
- [x] Groups
      <br>_`apps/web/app/admin/directory-sync/page.tsx`, `DirectorySyncAdminPage` in `WorkspaceIdentityPanels.tsx:5,74`_
- [ ] Roles - 🟡 Partial
      <br>_role is visible/settable per member (§58) but no role-management UI beyond invite/assign; no custom-role builder_
- [x] Seats
      <br>_`apps/web/db/neon/0085_organization_seats_lifecycle.sql`_
- [x] Models
      <br>_`apps/web/features/workspace-console/components/WorkspaceModelPolicy.tsx:177-278` providers + models allow-list_
- [ ] Default model - 🔴 Missing
      <br>_searched `defaultModel`, `default_model` under an org-policy context - only user-level default found in `apps/web/lib/projects.ts`_
- [ ] Reasoning levels - 🔴 Missing
      <br>_searched `org.*reasoning`, `reasoning_level.*organization` - no org-wide reasoning-effort policy found_
- [x] Managed Cloud
      <br>_`apps/web/features/settings/sections/WorkspacePolicySection.tsx:296-300` "Allow AGI-managed cloud compute" toggle_
- [x] BYOK
      <br>_`WorkspacePolicySection.tsx:63` `byok` compute mode option_
- [x] Local
      <br>_`WorkspacePolicySection.tsx:61` `local` compute mode option_
- [ ] Work - 🔴 Missing
      <br>_no admin toggle scoping the Work product surface; searched `'work'` mode in workspace policy/console - not present_
- [ ] Code - 🔴 Missing
      <br>_same search, no Code-surface admin toggle_
- [ ] Research - 🔴 Missing
      <br>_same search, no Research-surface admin toggle_
- [ ] Projects - 🟡 Partial
      <br>_Projects exist as a product surface (`apps/web/lib/projects.ts`) but no dedicated admin policy panel governs them_
- [x] Memory
      <br>_`WorkspacePolicySection.tsx:425-436` "Allow memory" workspace toggle_
- [x] Connectors
      <br>_`apps/web/features/workspace-console/components/WorkspaceConnectorPolicy.tsx:136-169`_
- [ ] MCP - 🟡 Partial
      <br>_custom-connector = "arbitrary MCP endpoint" governed by the same connector toggle (`WorkspaceConnectorPolicy.tsx:148`), no MCP-specific admin surface_
- [ ] Skills - 🔴 Missing
      <br>_searched `allowSkills`, `skills.*policy` under admin/workspace-console - no hits_
- [ ] Plugins - 🔴 Missing
      <br>_searched `allowPlugins`, `plugin.*policy` - no hits_
- [ ] Hooks - 🔴 Missing
      <br>_searched `allowHooks` - no hits (product concept, not the Claude Code CLI hooks)_
- [ ] Browser - 🔴 Missing
      <br>_searched `allowBrowser`, `browserTool` under workspace-console/settings - no hits_
- [ ] Computer use - 🔴 Missing
      <br>_searched `computerUse`, `computer_use` under workspace-console/settings - no hits_
- [ ] Remote Control - 🔴 Missing
      <br>_searched `remoteControl`, `remote_control` under workspace-console/settings - no hits_
- [x] Sharing
      <br>_`WorkspacePolicySection.tsx:408-419` "Allow public sharing" toggle; `apps/web/app/workspace/sharing/page.tsx`_
- [x] Data retention
      <br>_`apps/web/features/workspace-console/components/WorkspaceDataControls.tsx:215-343` legal holds + sweeps_
- [x] IP allowlists
      <br>_`apps/web/lib/services/ip-allow-list.ts`, `apps/web/lib/ip-allow-list-gate.ts`, `apps/web/app/api/settings/organization/policy/route.ts`_
- [ ] Device access _(revised)_ - 🟡 Partial
      <br>_apps/web/lib/services/organization-policy-evaluator.ts:59-72 gates cloud access per client class (web/desktop/mobile/cli/vscode/chrome) from admin policy; no per-device allow/deny or managed-device policy._
- [ ] Schedules - 🔴 Missing
      <br>_searched `schedule.*polic`, `org.*schedule` under admin/workspace - no hits_
- [ ] Event triggers - 🔴 Missing
      <br>_searched `event.*trigger` under admin/workspace - no hits_
- [x] Cost visibility
      <br>_`apps/web/features/workspace-console/components/WorkspaceUsageAnalytics.tsx:74,281-291` by-member/model/provider cost_
- [x] Usage limits
      <br>_`apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx:65-135`_

_§59: 14 of 31 done._

---

# 60. Policy engine

- [x] Workspace defaults
      <br>_`apps/web/lib/services/organization-policy-evaluator.ts:9-40` `PolicyAsk`/`PolicyDecision` types, evaluated per org_
- [ ] Group overrides - 🔴 Missing
      <br>_searched for group-scoped policy override table/logic - none; `WorkspaceIdentityPanels.tsx:93-97` self-documents "Group-scoped entitlements... do not yet carry sharing grants, policy scope, or budgets"_
- [ ] Role overrides - 🔴 Missing
      <br>_no role-conditioned policy evaluation found beyond the fixed admin/owner RLS gate_
- [ ] User exceptions - 🔴 Missing
      <br>_searched for a per-user policy exception table - none found_
- [ ] Device restrictions - 🔴 Missing
      <br>_`apps/web/lib/server/device-signin-policy.ts` is a per-user on/off toggle for device-code sign-in, not a device-attribute restriction (managed-device, OS, posture)_
- [ ] Region restrictions - 🔴 Missing
      <br>_no region-based access policy found (matches §65 residency gap)_
- [ ] Policy revision - 🟡 Partial
      <br>_policy rows are updatable (`organization-policy-service.ts`) but no explicit versioning/revision history found_
- [ ] Client refresh - 🟡 Partial
      <br>_`apps/web/lib/services/organization-ip-allow-list-cache.ts` implies TTL-based cache refresh, not verified for the full policy object_
- [ ] Push updates - 🔴 Missing
      <br>_no websocket/SSE push of policy changes found; clients presumably poll_
- [ ] Offline cached policy - 🔴 Missing
      <br>_no offline-cache-then-reconcile behavior found for policy on any client surface_
- [x] Immediate revoke
      <br>_IP-allowlist and MFA policy are enforced synchronously per-request in `organization-policy-gate.ts`, not cached indefinitely_
- [x] Audit
      <br>_`admin_policy_changed` event type, `apps/web/lib/security-audit.ts:244`_
- [ ] Fail closed for security controls _(revised)_ - 🟡 Partial
      <br>_apps/web/lib/services/organization-policy-gate.ts:327-330 and :249-252 policy read failure logs and treats org as ungoverned: IP allowlist and MFA fail OPEN_

_§60: 3 of 13 done._

---

# 61. Data retention (controlled separately per domain)

- [x] Chats
      <br>_`apps/web/lib/services/retention-service.ts:202-357` sweeps `web_conversations` on org retention window_
- [ ] Projects - 🔴 Missing
      <br>_no dedicated retention sweep for Projects as a standalone entity; searched `retention` scoped to projects tables - none_
- [ ] Work - 🔴 Missing
      <br>_no Work-surface-specific retention job found_
- [ ] Research _(revised)_ - 🟡 Partial
      <br>_apps/web/db/neon/0094_research_reports.sql:32 research_reports cascade-delete with web_conversations, so the workspace retention sweep removes conversation-linked reports; no standalone research retention._
- [ ] Code - 🔴 Missing
      <br>_no Code-surface-specific retention job found_
- [ ] Files - 🟡 Partial
      <br>_Files do not cascade: 0081_media_assets_conversation_provenance.sql:36-43 uses on delete set null. cron/purge-deleted-media purges only user soft-deleted media after recovery window; no retention-period sweep._
- [ ] Artifacts - 🟡 Partial
      <br>_`apps/web/db/neon/0095_published_artifacts.sql`, `0184_organization_shared_artifacts.sql` are FK'd to conversations/orgs but no dedicated retention job runs against them_
- [ ] Generated files _(revised)_ - 🟡 Partial
      <br>_apps/web/app/api/cron/purge-deleted-media/route.ts deletes soft-deleted media rows and objects (deleteStoredMediaObjects) after the recovery window; generated files survive chat retention (0081 set null), no …_
- [x] Audit logs
      <br>_`apps/web/app/api/cron/purge-security-audit-logs/route.ts`, `apps/web/lib/server/security-log-retention.ts`_
- [ ] Connector data - 🔴 Missing
      <br>_no connector-token/connector-history retention sweep found separate from deprovisioning revocation_
- [ ] Remote sessions - 🔴 Missing
      <br>_no remote-session (paired device/browser) retention sweep found; only revoke-on-demand exists (§56)_
- [ ] Notifications - 🔴 Missing
      <br>_no notification-record retention job found_

Check:

- [x] Configurable periods
      <br>_`apps/web/features/settings/sections/WorkspacePolicySection.tsx` retention-days draft field feeding `organization_policy`_
- [ ] Legal minimums - 🟡 Partial
      <br>_`apps/web/lib/billing/financial-record-retention.ts` exists for billing records; no evidence of jurisdiction-specific legal-minimum enforcement beyond that domain_
- [x] Deletion job
      <br>_`apps/web/app/api/cron/enforce-workspace-retention/route.ts`, `enforce-billing-retention/route.ts`, `purge-temporary-chats/route.ts`_
- [x] Deletion audit
      <br>_`retention_sweep_completed` event, `enforce-workspace-retention/route.ts:70-83`_
- [ ] Backup behavior - ⚪ External
      <br>_Neon-managed backups; repo has no code control over backup retention/purge - cite `docs/security/security.md` for whatever is documented there_
- [x] Search removal _(revised)_
      <br>_apps/web/app/api/search/route.ts:162-211 searches live tables with ilike; a retention-deleted row cannot be returned, so removal is immediate and complete with no separate index to lag._
- [ ] Index removal _(revised)_ - ⚪ N/A
      <br>_No separate search index or search service exists; only Postgres indexes (apps/web/db/neon/0101_sync_and_search_indexes.sql), which drop entries transactionally on delete._
- [ ] Object deletion - 🟡 Partial
      <br>_Objects are deleted on account erasure `apps/web/lib/server/account-erasure.ts:425` and knowledge removal `project-knowledge-object-storage.ts:418`; retention crons not confirmed to delete objects_

_§61: 6 of 20 done._

---

# 62. Compliance platform

- [x] Audit API
      <br>_`apps/web/app/api/settings/audit-logs/route.ts:1-40`_
- [x] Authentication logs
      <br>_`login`/`logout`/`session_revoked` event types, `apps/web/lib/security-audit.ts:216-218`_
- [x] Admin logs
      <br>_`admin_policy_changed`, `member_role_changed` events, same file_
- [ ] Data-access logs - 🟡 Partial
      <br>_`data_exported` event exists (`security-audit.ts:236`); general read-access logging (not just export) not found_
- [ ] Tool logs _(revised)_ - 🟡 Partial
      <br>_tool-loop.ts:2370-2385 writes only secret_detected for tool results; agent_tool_executions table has no writer (only export/erasure read it). No general tool-call audit record._
- [x] Connector logs
      <br>_`connector_added`/`connector_removed`/`connector_setting_changed`, `security-audit.ts:224-228`_
- [ ] Remote logs - 🔴 Missing
      <br>_no audit event for remote-pairing/remote-control sessions found (consistent with §63 "remote pairing" gap)_
- [ ] Browser and computer-use logs - 🔴 Missing
      <br>_no audit event type for browser or computer-use tool actions found_
- [x] Compliance export
      <br>_apps/web/app/api/settings/organization/audit/export/route.ts streams filtered org audit export (iterateAuditEventsForExport), called from WorkspaceAuditSection.tsx:81; audit-logs/actions only lists action types._
- [ ] SIEM integration _(revised)_ - 🟡 Partial
      <br>_audit-streaming-service.ts drain plus cron exist, but upsertAuditDestination (line 155) is called only from tests; no route or UI lets a workspace configure a SIEM destination._
- [ ] DLP integration - 🔴 Missing
      <br>_searched `dlp`, `DLP` across `apps/web` - no hits_
- [ ] EDiscovery integration - 🟡 Partial
      <br>_legal hold exists (`apps/web/app/api/settings/organization/legal-holds/route.ts`) but no search/export tooling built specifically for eDiscovery requests_
- [ ] Admin API keys - 🔴 Missing
      <br>_searched `admin.*api.key`, `scoped.*admin.*key` - only personal developer tokens/API keys found, no org-admin-scoped key type_
- [ ] Scoped permissions - 🟡 Partial
      <br>_connector OAuth scopes are enforced (`apps/web/lib/connectors/oauth-scope-allowlist.ts`) but there is no scoped-permission model for the audit/compliance API itself_

_§62: 5 of 14 done._

---

# 63. Audit logging

- [x] Login/logout
      <br>_`eventType: 'login'`/`'logout'`, `security-audit.ts:216-217`_
- [ ] Failed authentication _(revised)_ - 🟡 Partial
      <br>_logAuthFailure (security-audit.ts:116) has no callers and invalid TOTP only logger.warn (2fa/verify/route.ts:55); only authorization_failed is written (sso-route-guard.ts:41,88)._
- [x] Role changes
      <br>_`'member_role_changed'`, `'scim_group_role_mapping_changed'`, `security-audit.ts:233,267`_
- [x] User changes
      <br>_`'member_invited'`/`'member_removed'`/`'scim_user_updated'`, `security-audit.ts:232-234,262`_
- [x] Group changes
      <br>_`'scim_group_provisioned'`/`'scim_group_updated'`/`'scim_group_deprovisioned'`, `security-audit.ts:264-266`_
- [x] Device registration
      <br>_`'device_authorization_approved'`, `security-audit.ts:219`_
- [x] Device revoke
      <br>_`'session_revoked'` written from `apps/web/app/api/settings/devices/[deviceId]/route.ts:91-93`_
- [ ] Project sharing _(revised)_ - 🔴 Missing
      <br>_apps/web/app/api/share/route.ts:201-204 writes only secret_detected; organization/shared/projects routes and org-sharing-service write no audit event for sharing._
- [x] Connector change
      <br>_`'connector_added'`/`'connector_removed'`/`'connector_setting_changed'`, `security-audit.ts:224-228`_
- [x] MCP change _(revised)_
      <br>_apps/web/app/api/connectors/custom/route.ts:145-156,201 writes connector_added/connector_removed for custom MCP connectors, detail includes transport._
- [ ] Plugin install - 🔴 Missing
      <br>_no `plugin_install`/`plugin_removed` event type exists in `AuditEventType`_
- [ ] Skill install - 🔴 Missing
      <br>_no `skill_install` event type exists_
- [ ] Remote pairing - 🔴 Missing
      <br>_no `remote_pairing`/`remote_session_*` event type exists_
- [ ] Computer use - 🔴 Missing
      <br>_no `computer_use` event type exists_
- [ ] Browser actions - 🔴 Missing
      <br>_no `browser_action` event type exists_
- [x] Policy changes
      <br>_`'admin_policy_changed'`, `security-audit.ts:244`_
- [x] Retention changes _(revised)_
      <br>_apps/web/app/api/settings/organization/policy/route.ts:220-235 writes admin_policy_changed with changedKeys; diffAdminPolicy (organization-policy-service.ts:223-234) includes retentionDays and retentionEnforced._
- [ ] Encryption-key changes - 🔴 Missing
      <br>_no audit event for key rotation/creation; `apps/web/__tests__/security/key-rotation-runbook.test.ts` enforces a documented runbook, not a logged event_
- [x] Admin-key changes _(revised)_
      <br>_Admin credentials audited: scim_token_created at apps/web/app/api/admin/directory-sync/tokens/route.ts:135, scim_token_revoked at tokens/[tokenId]/route.ts:63._

_§63: 11 of 19 done._

---

# 64. Encryption

- [ ] TLS - ⚪ External
      <br>_platform-terminated (Vercel/Neon); no in-repo control, nothing to disprove it_
- [ ] Database encryption - ⚪ External
      <br>_Neon-managed at-rest encryption; not controllable from this repo_
- [ ] Object encryption - ⚪ External
      <br>_Object storage is Cloudflare R2 via S3 adapter (apps/web/lib/server/object-storage.ts:17-19, packages/platform/object-storage/src/adapters/s3.ts), not Vercel Blob; at-rest encryption is provider-managed._
- [ ] Backup encryption - ⚪ External
      <br>_Neon-managed; not controllable from this repo_
- [x] Secret encryption
      <br>_`apps/web/lib/crypto/totp-envelope.ts:1-30` AES-256 envelope for TOTP secrets; same pattern for connector/GitHub/device tokens per `apps/web/__tests__/security/key-rotation-runbook.test.ts:13-17`_
- [x] Envelope encryption
      <br>_`apps/web/lib/crypto/envelope.ts:1-40,309-339` `sealEnvelope`/`openEnvelope`, versioned format_
- [x] Key rotation _(revised)_
      <br>_scripts/reencrypt.mjs:7-40 re-encrypts connector, GitHub and 2FA secrets to the current key version; scripts/key-rotation-drill.mjs exercises it. Rotation is operator-run, which meets the plain item._
- [x] Key versioning
      <br>_`apps/web/lib/crypto/envelope.ts:205-215` `envelopeKeyId`, retired-key lookup in `resolveKey`_
- [ ] Customer-managed encryption keys - 🔴 Missing
      <br>_`key-rotation-runbook.test.ts` heading is literally `'### Accepted risk: no KMS, no escrow'` - CMEK explicitly not offered_
- [ ] Workspace key association - 🟡 Partial
      <br>_`apps/web/lib/crypto/envelope.ts:161-172` `resolveTenantKeyRing` derives a per-organization key via HKDF, but only `key-provider.test.ts` calls it - not wired into any production call site_
- [x] Key failure behavior
      <br>_`apps/web/lib/crypto/totp-envelope.ts:13-27` throws a clear configuration error rather than silently disabling encryption_

_§64: 5 of 11 done._

---

# 65. Data residency

- [ ] Storage region - 🔴 Missing
      <br>_searched `region` across `apps/web/lib/server/neon*.ts` and top-level lib - no region-selection code_
- [ ] Database region - 🔴 Missing
      <br>_single Neon project/connection string, no per-org region routing found_
- [ ] Object storage region - 🔴 Missing
      <br>_Storage is R2/S3 with one global OBJECT_STORAGE_REGION env (packages/platform/object-storage/src/config.ts:91), not Vercel Blob; no per-workspace region selection._
- [ ] Search region - 🔴 Missing
      <br>_N/A-adjacent: search is same-DB `LIKE` query (§57), no separate regional search service_
- [ ] Vector region _(revised)_ - ⚪ N/A
      <br>_No vector store exists anywhere (no pgvector/embedding tables in apps/web/db/neon), matching row 1029 N/A._
- [ ] Log region - 🔴 Missing
      <br>_no region-scoped logging destination found_
- [ ] Inference region _(revised)_ - 🟡 Partial
      <br>_request-processor.ts:1560-1579 EXCLUDED_ROUTE_HOSTS keeps managed routing off non-US vendor transports; global only, no per-workspace inference region choice._
- [ ] Backup region - ⚪ External
      <br>_Neon-managed, not controllable from this repo_
- [ ] Encryption-key region - 🔴 Missing
      <br>_envelope keys are process-env values, no region binding_
- [ ] Connector-data region - 🔴 Missing
      <br>_no region parameter on connector token storage found_

_§65: 0 of 10 done._

---

# 66. Network security

- [ ] WAF - ⚪ External
      <br>_no `vercel.json` firewall rules found in repo; would be a Vercel Firewall dashboard setting_
- [ ] DDoS protection - ⚪ External
      <br>_inherent to Vercel platform, not repo-controlled_
- [x] IP allowlists
      <br>_`apps/web/lib/services/ip-allow-list.ts`, `apps/web/lib/ip-allow-list-gate.ts`_
- [x] Rate limits
      <br>_`apps/web/lib/rate-limit.ts` (1207 lines), applied per-route via `withRateLimit`_
- [ ] Private networking where offered - 🔴 Missing
      <br>_searched for VPC/private-link connector config - none found; all egress goes through public internet with DNS pinning_
- [x] Egress restrictions
      <br>_`apps/web/lib/egress-policy.ts:80-138` `isInternalHostname`, `pinnedAddressesFor` block internal targets_
- [ ] Internal service authentication - 🟡 Partial
      <br>_`apps/web/lib/server/cron-auth.ts` authenticates cron-triggered internal routes; no broader service-to-service mTLS/token mesh found_
- [ ] MTLS where appropriate - 🔴 Missing
      <br>_searched `mTLS`, `mutual.tls` - no hits_
- [ ] TLS everywhere - ⚪ External
      <br>_platform-terminated; nothing in-repo to verify or disprove_
- [ ] DNS security - 🟡 Partial
      <br>_`apps/web/lib/egress-policy.ts:150-169` pins resolved addresses to prevent DNS-rebinding, but this is SSRF-defense, not DNSSEC/domain-level security_
- [x] SSRF protection
      <br>_`apps/web/lib/egress-policy.ts:106-269` `assertNonInternalHostname`, `pinnedPublicFetch`, `validateEgressUrl`; tested per `apps/web/__tests__/security` (2 SSRF-named tests)_

_§66: 4 of 11 done._

---

# 67. Security baseline

- [x] XSS
      <br>_`apps/web/shared/utils/html-sanitizer.test.ts`; sanitizer used ahead of any user-controlled HTML render_
- [x] CSRF
      <br>_`apps/web/lib/csrf.ts` (`requireCsrfToken`), 38 test files reference CSRF, e.g. `apps/web/__tests__/security/csrf-coverage.test.ts`_
- [x] SSRF
      <br>_see §66 - `egress-policy.ts` + dedicated SSRF tests_
- [x] SQL injection _(revised)_
      <br>_Queries are parameterized throughout; only interpolations are constant identifiers (account-erasure.ts:604,628; organization/route.ts:431 builds set clauses with $n params). Structural defence meets the item._
- [ ] NoSQL injection - ⚪ N/A
      <br>_no NoSQL datastore in the product (Postgres only)_
- [ ] Command injection - 🟡 Partial
      <br>_`apps/web/lib/services/cloud-code-agent-tools.ts` `classifyCommandRisk` gates shell commands and is tested (`apps/web/__tests__/security/agent-privilege-gates.test.ts:11-24`), but this governs the agent sandbox, not a …_
- [x] Path traversal _(revised)_ ⛔ **not live**
      <br>_apps/cli/src/path_security.rs:237-302 validate_workspace_path canonicalizes and confines to workspace roots (19 call sites); web object keys reject '..' segments (object-storage.ts:90-93)._
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] Symlink escape _(revised)_ ⛔ **not live**
      <br>_apps/cli/src/path_security.rs:162-210 resolves symlinks incl. dangling links via symlink_metadata; test at :360 rejects files under symlinked parent outside workspace._
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] IDOR
      <br>_RLS-enforced org/user scoping is the structural defence (§57); `apps/web/__tests__/security/user-settings-isolation.test.ts`_
- [x] Privilege escalation
      <br>_`apps/web/__tests__/security/agent-privilege-gates.test.ts`, `apps/web/__tests__/security/platform-admin-routes.test.ts`_
- [x] Token leakage
      <br>_`apps/web/__tests__/security/secret-redaction-fails-closed.test.ts`_
- [x] OAuth attacks
      <br>_PKCE fields (`code_challenge`/`codeVerifier`) in `apps/web/lib/connectors/oauth-registry.ts`, `oauth-client.ts`; state param + tests under `apps/web/__tests__/contracts/connector-oauth-paths.test.ts`_
- [x] Replay attacks
      <br>_`apps/web/lib/server/two-factor-replay.ts` (`claimTotpStep`); Stripe webhook signature verification, `apps/web/app/api/stripe-webhook/route.ts:50`_
- [x] Supply chain
      <br>_`pnpm audit --audit-level=critical/high` blocking in CI, `.github/workflows/ci.yml:435-474`; frozen lockfile discipline_
- [x] Secret leakage
      <br>_`scripts/check-secrets.mjs` (11 detector patterns) run in CI `check:secrets`; `apps/web/lib/security-audit.ts` `secret_detected` event_
- [x] Dependency vulnerabilities
      <br>_same `pnpm audit` blocking gates, `.github/workflows/ci.yml:435-474`_

_§67: 14 of 16 done._

---

# 68. Agent-specific security

- [ ] Direct prompt injection - 🟡 Partial
      <br>_system-prompt hardening exists (`apps/web/lib/support/agent/prompt/system-prompt.ts`) but no dedicated direct-injection test found (only indirect, below)_
- [x] Indirect prompt injection
      <br>_`fenceUntrustedContent` escapes closing tags in fetched pages/search/connector output; `apps/web/__tests__/security/untrusted-content-fence.test.ts:13-30`_
- [x] Malicious webpages
      <br>_`apps/web/lib/url-fetch/url-fetch-tool.ts` fences page content; egress SSRF protection blocks internal targets (§66)_
- [x] Malicious files _(revised)_
      <br>_apps/web/lib/security/upload-scan.ts scans real bytes (type confusion, SVG, PDF, optional external AV hook), wired in apps/web/app/api/uploads/chat-attachment/complete/route.ts._
- [ ] Malicious MCP tools _(revised)_ - 🟡 Partial
      <br>_apps/web/lib/user-connector-tools.ts:212-240 seals MCP tool results/errors in untrusted envelopes; admin connector policy can block servers. No validation of MCP tool definitions._
- [x] Malicious connector output
      <br>_apps/web/lib/user-connector-tools.ts:186-240 fences connector/MCP output and errors with fenceUntrustedContent; the cited test only references the pattern in a comment._
- [ ] Tool poisoning - 🔴 Missing
      <br>_searched `tool.poisoning`, `toolPoisoning` - no hits_
- [x] Data exfiltration
      <br>_`apps/web/lib/egress-policy.ts` blocks internal/private targets for any tool-initiated fetch; `secret-handling-gate.ts` blocks secrets in tool output_
- [ ] Cross-tool escalation - 🔴 Missing
      <br>_searched `cross.tool`, `crossTool` - no hits_
- [x] Approval bypass
      <br>_`apps/web/lib/services/cloud-code-agent-tools.ts` `classifyCommandRisk`, tested against approval-bypass patterns in `agent-privilege-gates.test.ts:11-24`_
- [x] Hidden instructions
      <br>_covered by the same untrusted-content fencing (§ indirect prompt injection)_
- [x] Sandbox escape
      <br>_apps/cli/src/sandbox.rs:15-25 OS sandbox (macOS Seatbelt, Linux bubblewrap/Landlock); execpolicy crate is a command approval policy, not escape containment._
- [x] Credential theft
      <br>_`apps/extension-vscode/src/core/outboundContentGuard.ts` uses `isSensitiveFile` to block outbound sensitive-file content; `secret-handling-gate.ts` for chat tool loop_

_§68: 9 of 13 done._

---

# 69. Secret scanning

Detect:

- [x] API keys
      <br>_`scripts/check-secrets.mjs:38` AWS pattern, plus generic high-entropy detectors_
- [x] .env
      <br>_`packages/platform/utils/src/sensitiveFiles.ts:3-4` `.env` patterns_
- [x] SSH keys
      <br>_`sensitiveFiles.ts:15-19` `id_rsa`, `.ssh/`, `authorized_keys`_
- [x] Certificates
      <br>_`sensitiveFiles.ts:16` `.pem|.p12|.pfx|.crt|.cer`_
- [x] Cloud credentials
      <br>_`sensitiveFiles.ts:22-24` `.aws/`, `.gcloud/`, `.azure/`_
- [x] OAuth tokens
      <br>_apps/web/lib/security/secret-patterns.ts:45,59,95 JWT, Bearer Token and GitHub OAuth detectors used by scanForSecrets; oauth-scope-allowlist is not detection._
- [x] Database strings _(revised)_
      <br>_scripts/check-secrets.mjs:54 'Postgres/Redis URL with password'; apps/web/lib/security/secret-patterns.ts:52,102,109 Neon, database URL and MongoDB credential detectors at runtime._
- [x] .npmrc
      <br>_`sensitiveFiles.ts:8`_
- [x] Kubeconfig
      <br>_`sensitiveFiles.ts:23` `.kube/config`_
- [ ] Terraform secrets - 🔴 Missing
      <br>_searched `terraform` in `sensitiveFiles.ts`/`check-secrets.mjs` - no `.tfstate`/terraform-specific pattern found_
- [ ] High-entropy secrets _(revised)_ - 🟡 Partial
      <br>_No entropy calculation anywhere; check-secrets.mjs:142 is filler-masking length logic. Only keyword-anchored generic patterns (secret-patterns.ts:122-135, low confidence)._

Apply to:

- [ ] Uploads - 🔴 Missing
      <br>_searched `isSensitiveFile`/secret-scan calls in `apps/web/app/api/uploads` - none found_
- [x] Code tools
      <br>_`apps/web/app/api/llm/v1/chat/completions/lib/secret-handling-gate.ts`, `tool-loop.ts:2374-2375`_
- [x] Logs
      <br>_apps/web/lib/logger.ts:3,11 applies redactLogRecord to every log record; cited test covers the chat secret-handling gate, not logs._
- [ ] Remote projection ⛔ **not live** - 🟡 Partial
      <br>_VS Code extension outbound guard applies (`outboundContentGuard.ts`), but no equivalent found for other remote-projection surfaces (Desktop/Mobile screen share)_
      <br>⛔ Release check: The VS Code extension has never been published (Marketplace and Open VSX return nothing; release workflow never run).
- [x] Cloud handoff
      <br>_`secret-handling-gate.ts` sits in the same chat-completions path used for cloud/managed execution_
- [ ] Generated files - 🟡 Partial
      <br>_artifact publish route exists (`apps/web/app/api/artifacts/publish/route.ts`) referencing secret-detection utilities per grep, but not confirmed to run the full detector set on every generated file type_

_§69: 12 of 17 done._

---

# 70. Billing

- [x] Free
      <br>_`MANAGED_USAGE_LIMITS.free` (`apps/web/lib/billing/managed-usage-caps.ts:19`)_
- [x] Individual paid
      <br>_`basic`/`pro` tiers, same file lines 21-33_
- [x] Higher usage tiers
      <br>_`max`, `max_15x` tiers, same file lines 34-46_
- [x] Team
      <br>_`team` tier entry, `managed-usage-caps.ts`_
- [x] Enterprise
      <br>_`getEnterpriseProductId`/`isEnterpriseProductId` (`apps/web/lib/price-tier-mapping.ts`), `enterprise-billing-service.ts`_
- [x] Monthly
      <br>_apps/web/app/api/checkout/route.ts:119 getCheckoutPriceSelection(plan, billingInterval, country) sells monthly and annual intervals for self-serve plans_
- [x] Annual
      <br>_`DEFAULT_BILLING_CADENCE: BillingCadence = 'annual'` (`enterprise-billing-service.ts:18`)_
- [ ] Trial _(revised)_ - 🟡 Partial
      <br>_app/api/checkout/route.ts:303-305 subscription_data sets no trial_period_days; no code starts a trial, 'trialing' only handled if Stripe sends it_
- [x] Seat quantity
      <br>_`resolveCommittedSeats` (`enterprise-billing-service.ts:57`), `MAX_PURCHASABLE_SEATS`_
- [x] Credits
      <br>_`apps/web/lib/billing/plan-credits.ts`, `apps/web/lib/services/credit-service.ts`_
- [x] Usage
      <br>_`apps/web/lib/server/managed-usage-policy.ts`, `managed-usage-accounting-service.ts`_
- [x] Add-ons _(revised)_
      <br>_apps/web/app/api/stripe-webhook/lib/handlers.ts:43 credit_topup checkout sessions fulfilled via handleCreditTopUp; purchasable credit add-on beyond plan and seats_
- [x] Proration
      <br>_`apps/web/lib/server/stripe-plan-change.ts:27` prorates mid-cycle upgrades explicitly_
- [x] Upgrade
      <br>_`PlanChangeKind = 'tier_upgrade' \|'seat_increase'` (`stripe-plan-change.ts:46`)_
- [ ] Downgrade - 🟡 Partial
      <br>_upgrade path is code-driven; downgrade is explicitly deferred to "the billing portal" (`stripe-plan-change.ts:64`), i.e. Stripe-hosted, not first-party_
- [x] Cancellation
      <br>_`cancel_at_period_end` handling throughout `apps/web/app/api/stripe-webhook/lib/db.ts`_
- [x] Failed payment
      <br>_`invoice.payment_failed`, `payment_intent.payment_failed` handlers set `past_due` (`apps/web/app/api/stripe-webhook/lib/handlers.ts:183,227`)_

_§70: 15 of 17 done._

---

# 71. Enterprise billing

- [x] Contract pricing
      <br>_`OrganizationBillingContractRow` (`apps/web/lib/server/neon-types.ts:516`) carries `stripe_price_id`, `minimum_annual_spend_cents`_
- [x] Custom per-seat price
      <br>_`committed_seats` + contract-specific `stripe_price_id`, same row_
- [x] Invoice billing
      <br>_`OrganizationBillingInvoiceRow` (`neon-types.ts:545`), `collection_method` from Stripe_
- [ ] NET terms - 🟡 Partial
      <br>_`collection_method`/`due_at` are read from Stripe's invoice object, not authored/enforced by app code; actual NET-30/60 term is set in Stripe, not this repo_
- [x] PO number
      <br>_`procurement_reference`, `PROCUREMENT_METADATA_KEY = 'po_number'` (`enterprise-billing-service.ts:22-23`)_
- [ ] ACH - ⚪ External
      <br>_Stripe payment-method configuration, no app-side ACH-specific code found; would be proven by Stripe dashboard payment method settings_
- [ ] Wire - ⚪ External
      <br>_same as ACH - Stripe/bank-side, not represented in repo_
- [ ] Billing contacts _(revised)_ - 🔴 Missing
      <br>_apps/web/lib/server/neon-types.ts:516 contract row has customer_legal_entity (an entity name) but no billing contact; repo-wide search for billing_contact/billing_email found none_
- [ ] Procurement contacts - 🔴 Missing
      <br>_searched neon-types/enterprise-billing-service for a procurement-contact field - none, only `procurement_reference` (a PO string, not a contact)_
- [ ] Tax exemption _(revised)_ - 🟡 Partial
      <br>_apps/web/lib/billing/tax-policy.ts:29 checkout enables tax_id_collection so Stripe Tax applies reverse charge/zero rate; no tax_exempt customer status handled_
- [x] Renewal
      <br>_`contract_term_start`/`contract_term_end` (`neon-types.ts:524-525`)_
- [ ] Seat true-up - 🟡 Partial
      <br>_`committed_seats` syncs from Stripe subscription quantity on webhook (true-up by side effect); no explicit co-term (aligning renewal dates across contracts) logic found_
- [ ] Co-term _(revised)_ - 🔴 Missing
      <br>_apps/web/app/api/upgrade/route.ts:280 seat changes reset billing_cycle_anchor to now; no co-term alignment of renewal dates anywhere_

_§71: 5 of 13 done._

---

# 72. Usage metering

Track:

- [x] Tokens
      <br>_`organization_usage_ledger.input_tokens/output_tokens` (`apps/web/db/neon/0076_enterprise_control_plane_tables.sql:156-157`)_
- [x] Cached tokens _(revised)_
      <br>_apps/web/db/neon/0130_cogs_token_classes.sql cache_read_units/cache_write_units and 0180_provider_cost_events_customer_and_cogs_split.sql cached_tokens columns on provider_cost_events_
- [x] Model
      <br>_`organization_usage_ledger.model`, `provider_cost_events.model`_
- [x] Provider
      <br>_`organization_usage_ledger.provider`, `provider_cost_events.provider`_
- [x] Chat
      <br>_`provider_cost_events.capability = 'chat'` (`0127_cogs_ledger.sql:28`)_
- [ ] Work - 🟡 Partial
      <br>_not a capability value; Work-surface spend is not distinguished from Chat in the capability enum, only inferable via `metadata`/`source_ref`_
- [ ] Code - 🟡 Partial
      <br>_same - no distinct 'code' capability; `sandbox`/`tool` are the nearest proxies_
- [ ] Research - 🟡 Partial
      <br>_same - folded into `chat`/`tool`, not its own tracked capability_
- [x] Search _(revised)_
      <br>_apps/web/lib/web-search/perplexity-search-cost.ts:67 and grounding-cost.ts:78 record search cost rows with feature web_search_*; search-budget.ts:287 quotaFeature 'search'_
- [x] Tools
      <br>_`'tool'` capability, `resolveCogsUnits` case `'tool'` (`cogs-ledger-service.ts:175`)_
- [ ] Browser - 🟡 Partial
      <br>_no distinct browser capability; nearest is `'computer_use'`_
- [x] Computer use
      <br>_`provider_cost_events.capability = 'computer_use'`_
- [x] Voice _(revised)_
      <br>_apps/web/app/api/voice/live/sessions/[sessionId]/close/route.ts:105,127 live voice sessions metered (quotaFeature, operation voice_live_session) plus backend cost live-voice-backend-cost.ts:94_
- [x] Images
      <br>_`'image'` capability, unit `outputCount` (`cogs-ledger-service.ts:166`)_
- [ ] Generated files - 🔴 Missing
      <br>_searched capability enum and ledger schema - no "generated file" or artifact-storage capability_
- [ ] Storage - 🔴 Missing
      <br>_no storage-cost capability/column found in usage ledger or COGS enum_
- [ ] Connector calls - 🔴 Missing
      <br>_no distinct connector-call capability; would fall under generic `'tool'` if metered at all - no evidence it is_

Dimensions:

- [x] User
      <br>_`organization_usage_ledger.user_id`, `managed_usage_requests.user_id`_
- [x] Workspace
      <br>_`organization_usage_ledger.organization_id`_
- [ ] Project - 🔴 Missing
      <br>_no `project_id` column on `organization_usage_ledger` or `provider_cost_events`; conversations have `project_id` but usage/cost rows do not join it structurally_
- [ ] Session - 🔴 Missing
      <br>_no `session_id`/`conversation_id` column on the cost/usage ledger tables (0076, 0127)_
- [x] Feature _(revised)_ ⛔ **not live**
      <br>_apps/web/db/neon/0180_provider_cost_events_customer_and_cogs_split.sql adds queryable feature and surface columns with a user/feature index_
      <br>⛔ Release check: Production web is the 11 Sep 2026 deployment (about 1,000 commits behind main); every production deploy since errored or awaits approval.

_§72: 13 of 22 done._

---

# 73. Usage controls

- [x] User limits
      <br>_`MANAGED_USAGE_LIMITS` per-tier monthly/weekly/5h/daily units (`managed-usage-caps.ts:10-46`)_
- [x] Workspace limits _(revised)_
      <br>_apps/web/lib/services/spend-limit-service.ts:152 evaluateSpendLimit blocks managed turns at workspace monthly cap (0142_organization_spend_limits.sql), called from lib/managed-compute-gate.ts:245_
- [x] Budget
      <br>_`budgetRemainingCents` consumed by the router (`auto.ts:206`); `minimum_annual_spend_cents` at contract level_
- [x] Hard limit
      <br>_`MANAGED_USAGE_LIMITS` fields are hard ceilings (`unlimited: false` per tier)_
- [x] Soft warning _(revised)_
      <br>_apps/web/features/chat/pages/WebChatPage.tsx:25 UsageWarningBanner via selectUsageWarning; workspace alert_threshold_pct overThreshold shown in WorkspaceSpendLimit.tsx:163_
- [x] Model restriction
      <br>_`packages/ai/routing/src/model-policy.ts`, `apps/web/lib/services/model-policy-service.ts`, `ModelAccessPolicy`_
- [x] Feature restriction
      <br>_`apps/web/lib/services/model-policy-gate.ts`, `managed-compute-gate.ts`_
- [x] Usage reset _(revised)_
      <br>_apps/web/features/settings/sections/UsageSection.tsx:116-125 shows resetAt for rolling windows computed in lib/server/managed-usage-period.ts; reset-credits cron in vercel.json_
- [x] Overage
      <br>_`EnterpriseOverageReportResult`, `getOrganizationMonthToDateSpendCents` (`enterprise-usage-metering.ts:20-38`)_
- [ ] Admin alerts _(revised)_ - 🟡 Partial
      <br>_apps/web/features/workspace-console/components/WorkspaceSpendLimit.tsx:163 shows threshold crossing in console; notify mode sends nothing and records no audit (spend-limit-service.ts:141)_
- [x] Member cost visibility _(revised)_
      <br>_apps/web/lib/services/organization-usage-service.ts:158 aggregates cost_cents by user_id, served by app/api/settings/organization/usage-analytics and use-workspace-usage.ts_

_§73: 10 of 11 done._

---

# 74. Backend API gateway

- [x] Authentication
      <br>_Clerk middleware in `apps/web/proxy.ts:25` (`identityMiddleware`)_
- [x] Authorization
      <br>_RLS + `ModelAccessPolicy`/workspace role checks throughout `apps/web/lib/services`_
- [ ] Schema validation - 🟡 Partial
      <br>_per-route manual validation observed (e.g. conversation route param parsing); no single shared schema-validation middleware found across `apps/web/app/api`_
- [x] Rate limits
      <br>_`apps/web/lib/rate-limit.ts` (Redis-backed, fail-closed in prod)_
- [x] Request IDs
      <br>_trace context in `apps/web/lib/error-handler.ts` (`formatTraceparent`/`parseTraceparent`)_
- [ ] Idempotency - 🟡 Partial
      <br>_idempotency exists per-feature (`managed_usage_requests.idempotency_key`, `apps/web/app/api/llm/v1/chat/completions/lib/tool-idempotency.ts`) but not as a uniform gateway-level `Idempotency-Key` contract across all …_
- [ ] Versioning - 🟡 Partial
      <br>_only the LLM-compat surface is versioned (`apps/web/app/api/llm/v1/...`); the rest of `apps/web/app/api` is unversioned_
- [ ] Timeouts - 🟡 Partial
      <br>_provider calls have timeouts (`provider-runtime/src/watchdog.ts`); no evidence of a uniform request-timeout policy across all API routes_
- [ ] Retry limits - 🟡 Partial
      <br>_present at the provider-gateway layer (`provider-runtime/src/retry.ts`); not confirmed as a general inbound-request retry policy_
- [ ] Circuit breaking - 🔴 Missing
      <br>_circuit breakers exist for outbound provider calls (`breaker-profiles.ts`); no inbound API-gateway-level circuit breaker found_
- [x] Payload limits
      <br>_`apps/web/lib/payload-ceiling.ts` (`DEFAULT_API_PAYLOAD_CEILING_BYTES`, `PayloadCeilingExceededError`)_
- [x] CORS
      <br>_`apps/web/lib/cors.ts` `withCorsAndSecurityHeaders`, `withCorsRoute`_
- [x] Audit context
      <br>_`apps/web/lib/security-audit.ts` (`recordAuditEvent`, used by billing/rate-limit)_
- [x] Tracing
      <br>_`apps/web/lib/observability/otel-span-bridge.ts`, `trace-context.ts`, OTel semantic attrs in `error-handler.ts`_

_§74: 8 of 14 done._

---

# 75. Conversation backend

- [x] Create
      <br>_`POST` handler `apps/web/app/api/chat/conversations/route.ts:230`_
- [x] Read
      <br>_`GET` handler, same file line 229, with filters (`q`, `projectId`, `archived`, `deleted`)_
- [x] Update
      <br>_`PATCH`-style update in `apps/web/app/api/chat/conversations/[id]/route.ts:153` (title, archived, pinned, starred)_
- [x] Delete
      <br>_`DELETE` handler, `[id]/route.ts:325`_
- [x] Rename
      <br>_title update, same PATCH path (`[id]/route.ts:153`)_
- [x] Archive
      <br>_`archived` field toggle, `[id]/route.ts:154,220`_
- [x] Fork _(revised)_
      <br>_apps/web/lib/services/conversation-branch-service.ts:185 forkConversation creates a new conversation from a message, POST app/api/chat/conversations/[id]/branches/route.ts:52_
- [x] Branch
      <br>_`apps/web/app/api/chat/conversations/[id]/branches/route.ts`_
- [x] Project association
      <br>_`project_id` filter/column, `route.ts:33`, `[id]/route.ts` select list_
- [x] Sharing
      <br>_`apps/web/app/api/share`, `apps/web/db/neon/0021_shared_conversations.sql`, `0068_shared_conversations_owner.sql`_
- [x] Search
      <br>_`q` search param, `route.ts:31`_
- [x] Pagination
      <br>_`limit`/`offset`, `route.ts:47-53`_
- [ ] Optimistic concurrency _(revised)_ - 🟡 Partial
      <br>_apps/web/app/api/chat/sync/route.ts:170,464 sync push compares baseVersion and returns conflicts; REST PUT on [id]/route.ts still updates unconditionally_
- [x] Sync _(revised)_
      <br>_apps/web/app/api/chat/sync/route.ts:88 server_version pull/push delta sync consumed by apps/mobile/services/cloudSyncEngine.ts and desktop_

_§75: 13 of 14 done._

---

# 76. Event model (canonical events)

- [x] Session created
      <br>_apps/web/lib/e2b/harnesses/message-stream-parser.ts:205 emits lifecycle started on session init; EventMsg SessionConfiguredEvent is a generated type nothing emits_
- [x] Turn started ⛔ **not live**
      <br>_apps/desktop/electron/runtime/developerSessionService.ts:346 emits turn-started; EventMsg TurnStartedEvent is never constructed outside the protocol crate_
      <br>⛔ Release check: The Electron desktop has never been released (release-desktop-cloud.yml never run).
- [x] Text delta
      <br>_`AgentEvent` `'text-delta'` (`AgentEvent.ts:31`)_
- [x] Reasoning/status
      <br>_`'reasoning-delta'`, `'progress-update'` (`AgentEvent.ts:32,42`)_
- [ ] Tool queued - 🟡 Partial
      <br>_no distinct "queued" variant; closest is `'tool-use-start'`/`McpToolCallBeginEvent`, which already implies dispatch, not a separate queued state_
- [x] Approval requested
      <br>_`'approval-requested'` (`AgentEvent.ts:47`), `ExecApprovalRequestEvent` in `EventMsg.ts:28`_
- [x] Tool running
      <br>_`'tool-execution-start'` (`AgentEvent.ts:41`)_
- [x] Tool result
      <br>_`'tool-use-end'`, `'server-tool-result'` (`AgentEvent.ts:34,37`)_
- [x] Tool failed _(revised)_
      <br>_AgentEventToolExecutionEnd isError (emitted in tool-loop.ts, 6 sites) and developer-sessions.ts tool-finished isError carry tool failure to clients_
- [ ] File changed _(revised)_ - 🟡 Partial
      <br>_crates/agiworkforce-protocol/src/protocol.rs:2988 PatchApply events never emitted; packages/contracts/local-runtime/src/protocol.ts:79 file-changed declared with no emitter found_
- [ ] Command started _(revised)_ - 🟡 Partial
      <br>_ExecCommandBeginEvent is never emitted by any crate or app; commands only surface as generic tool-execution-start events_
- [x] Command output ⛔ **not live**
      <br>_apps/desktop/electron/runtime/dispatcher.ts:627 emits shell-output stdout/stderr chunks; EventMsg ExecCommandOutputDeltaEvent is unemitted_
      <br>⛔ Release check: The Electron desktop has never been released (release-desktop-cloud.yml never run).
- [ ] Diff generated _(revised)_ - 🟡 Partial
      <br>_TurnDiffEvent never emitted; diffs only available by pull from app/api/code/sessions/[sessionId]/changes/route.ts_
- [x] Generated file created
      <br>_`AgentEventArtifactProduced` (`AgentEventArtifactProduced.ts`)_
- [x] Usage updated
      <br>_`'usage'` (`AgentEvent.ts:38`), `TokenCountEvent` (`EventMsg.ts:64`)_
- [x] Turn completed
      <br>_`TurnCompleteEvent` (`EventMsg.ts:66`), `AgentEventStopReason` `'end-turn'`_
- [x] Failed
      <br>_`AgentEventStopReason` `'error'`/`'refusal'` (`AgentEventStopReason.ts`)_
- [x] Cancelled
      <br>_`TurnAbortedEvent` (`EventMsg.ts:65`), `AgentEventStopReason` `'cancelled'`_

_§76: 14 of 18 done._

---

# 77. Queue system

Use durable queues for:

- [ ] Research - 🔴 Missing
      <br>_research runs via `apps/web/lib/services/research-report-service.ts`, no dedicated queue table found_
- [x] Work _(revised)_
      <br>_apps/web/app/api/llm/v1/chat/completions/route.ts:787-805 paid and AgiWork turns start durable Workflow runs (start-cloud-agent-workflow.ts:69), steps retry via RetryableError_
- [ ] File processing - 🔴 Missing
      <br>_not located as a queued job type_
- [ ] Indexing - 🔴 Missing
      <br>_not located_
- [ ] Notifications - 🟡 Partial
      <br>_`apps/web/lib/services/schedule-notification-service.ts` exists but no queue/retry semantics confirmed_
- [ ] Email - 🔴 Missing
      <br>_no email queue table/module found in this pass_
- [x] Schedules
      <br>_`scheduled_tasks`/`scheduled_task_runs` (`apps/web/db/neon/0009_scheduling.sql:1,34`) is a real durable dispatch table with run history_
- [ ] Webhooks - 🟡 Partial
      <br>_`apps/web/app/api/github/webhook/delivery-dedup.ts` dedups inbound deliveries; no outbound webhook-delivery queue found_
- [x] Billing
      <br>_`managed_usage_requests` lease/settlement state machine (`apps/web/db/neon/0056_managed_usage_request_lifecycle.sql:13-52`) is a durable, retryable job record_
- [ ] Exports - 🔴 Missing
      <br>_no export-job queue located_
- [ ] Data deletion _(revised)_ - 🟡 Partial
      <br>_apps/web/app/api/cron/purge-deleted-accounts/route.ts:67 cron retries erasure least-recently-attempted first with tombstones; no DLQ or queue semantics_

Check:

- [ ] Retry - 🟡 Partial
      <br>_retry exists at the workflow/provider level (`provider-runtime/src/retry.ts`), not a generic queue-retry policy_
- [ ] DLQ - 🔴 Missing
      <br>_searched "DLQ"/"dead_letter"/"dead-letter" - no hits anywhere in `apps/web`_
- [x] Idempotency
      <br>_`managed_usage_requests.idempotency_key` unique per user (`0056...sql:16,50`)_
- [ ] Priority - 🔴 Missing
      <br>_no priority column/field found on any job table_
- [ ] Concurrency - 🟡 Partial
      <br>_`for update skip locked` in `schedule-service.ts:799,817` bounds concurrent dispatch, but no general per-queue concurrency limit config found_
- [ ] Tenant fairness _(revised)_ - 🟡 Partial
      <br>_apps/web/lib/rate-limit.ts:707-714 per-plan maxConcurrentTurns caps each user's concurrent turns; no cross-tenant weighting_

_§77: 4 of 17 done._

---

# 78. Scheduler

- [x] One-time
      <br>_`schedule_type = 'once'` (`apps/web/db/neon/0009_scheduling.sql:6`)_
- [x] Recurring
      <br>_`schedule_type = 'interval'`/`'cron'`, same line_
- [ ] Cron/RRULE - 🟡 Partial
      <br>_`cron_expression` column and `apps/web/lib/schedules/schedule-time.ts` parse cron; no RRULE (iCal recurrence) support found_
- [x] Time zones
      <br>_`timezone text not null default 'UTC'` (`0009_scheduling.sql:10`), `schedule-time.ts` wall-clock math_
- [ ] Dayparts - 🔴 Missing
      <br>_searched "daypart" - no hits; only clock-time cron fields_
- [ ] Event trigger - 🟡 Partial
      <br>_`action_type = 'workflow'`/GitHub webhook-triggered runs exist, but scheduler table itself only fires on time, not on an arbitrary event condition_
- [ ] Condition watch - 🔴 Missing
      <br>_no "watch a condition, then fire" logic found distinct from time-based `next_execution_at`_
- [ ] Missed execution - 🟡 Partial
      <br>_`next_execution_at <= now()` catch-up query (`schedule-service.ts:813`) will run overdue tasks, but no explicit missed-execution audit/backoff policy confirmed_
- [ ] Retry - 🟡 Partial
      <br>_`scheduled_task_runs.status = 'failed'/'timeout'` records the outcome (`0009_scheduling.sql:38`), but automatic re-run-on-failure was not confirmed_
- [x] Duplicate prevention
      <br>_`for update skip locked` row locking in dispatch query (`schedule-service.ts:799,817`)_
- [x] Run history
      <br>_`scheduled_task_runs` table (`0009_scheduling.sql:34-45`)_
- [x] Pause
      <br>_`status = 'paused'` (`0009_scheduling.sql:19-20`)_
- [x] Resume
      <br>_same enum, transition back to `'active'`_

_§78: 7 of 13 done._

---

# 79. Event triggers

- [ ] Gmail - 🔴 Missing
      <br>_searched "gmail.\*push"/"gmail.\*watch" - no hits; no Gmail webhook/Pub-Sub receiver found_
- [ ] Slack - 🔴 Missing
      <br>_searched "slack.\*event" - no hits; no Slack Events API receiver found_
- [x] GitHub
      <br>_`apps/web/app/api/github/webhook/route.ts` with signature verification, PR-comment triggers_
- [ ] Calendar - 🔴 Missing
      <br>_no calendar webhook receiver found_
- [x] Webhook
      <br>_generic inbound webhook handling exists for GitHub and Stripe (`apps/web/app/api/stripe-webhook`)_
- [ ] Connector events - 🔴 Missing
      <br>_no generic "connector fired an event, run an agent" trigger path found outside GitHub_
- [ ] CI - 🔴 Missing
      <br>_no CI-status-triggered agent run found (GitHub webhook triggers are PR-comment/mention driven, not CI-result driven)_
- [ ] Repository events _(revised)_ - 🟡 Partial
      <br>_apps/web/app/api/github/webhook/webhook-router.ts:58 only issue_comment, installation and ping are routed; push and pull_request events are ignored_

Check:

- [x] Filters
      <br>_`REVIEW_TRIGGER_ASSOCIATIONS` restricts to OWNER/MEMBER/COLLABORATOR (`route.ts:28-30`)_
- [x] Debounce _(revised)_
      <br>_apps/web/app/api/github/webhook/route.ts:35,214 DEBOUNCE_WINDOW_MS five-minute window checks github_pr_review_attempts before starting another review_
- [ ] Conditions - 🟡 Partial
      <br>_mention-based (`@agi-workforce`) and association-based gating exist for GitHub only, not a general condition engine_
- [ ] Retry - 🔴 Missing
      <br>_not confirmed for inbound webhook processing_
- [ ] DLQ - 🔴 Missing
      <br>_none found (consistent with §77)_
- [x] Audit
      <br>_apps/web/app/api/github/webhook/route.ts:220 github_pr_review_attempts rows record each triggered review with status; delivery-dedup.ts:21 records deliveries_

_§79: 5 of 14 done._

---

# 80. Storage

- [x] Database
      <br>_`packages/platform/data-layer/src/factory.ts` neon/postgres adapters, RLS via `withUser()` `packages/platform/data-layer/src/adapters/neon.ts:544`_
- [x] Object storage
      <br>_`packages/platform/object-storage/src/{factory,config}.ts` S3/R2 adapters, per-user key prefix `apps/web/lib/server/media-storage.ts:108` Third pass: production sets CLOUDFLARE_R2_* (names verified), so storage is …_
- [x] Cache
      <br>_`packages/platform/key-value/src/factory.ts` upstash/redis/memory adapters_
- [ ] Search - 🟡 Partial
      <br>_live SQL search only, no dedicated search store, see §81_
- [ ] Vector index _(revised)_ - 🟡 Partial
      <br>_apps/desktop/src-tauri/src/core/embeddings/mod.rs:1 local embedding+similarity index (Ollama); apps/mobile/src/features/memory/services/ragIndex.ts:71 sqlite-vec table; neither reached from UI; no cloud vector store_
- [ ] Session storage - 🟡 Partial
      <br>_Clerk-hosted session/JWT; no first-party session store in `data-layer`_
- [x] Local secure storage
      <br>_mobile `ExpoSecureStore` pod; desktop `keyring` crate `apps/desktop/src-tauri/src/sys/security/machine_key.rs:161`_
- [ ] Backup _(revised)_ - 🟡 Partial
      <br>_docs/runbooks/database-backup-restore.md:243 Neon drill never run, retention never read; backup is Neon provider default only, no app-run backup schedule_

For each:

- [ ] Encryption - 🟡 Partial
      <br>_apps/web/lib/crypto/envelope.ts:1 app AES-256-GCM keyring for connector/GitHub secrets in DB; object storage and KV still rely on provider encryption_
- [x] Access controls
      <br>_RLS `withUser()`, per-user object key hashing `media-storage.ts:108-122`_
- [ ] Tenant isolation - 🟡 Partial
      <br>_DB/object storage isolate by org/user id; KV/cache has no namespace-per-tenant convention, only rate-limit `namespace` param `key-value/src/types.ts:80`_
- [x] Retention _(revised)_
      <br>_apps/web/app/api/cron/purge-deleted-media/route.ts:29 deletes stored objects after 30d, enforce-workspace-retention cron, both scheduled in vercel.json:46,78; KV keys use expire TTLs_
- [ ] Backup _(revised)_ - 🟡 Partial
      <br>_docs/runbooks/database-backup-restore.md:243 Neon PITR restore drill never run; only provider-default backup, unverified retention_
- [ ] Restore - 🟡 Partial
      <br>_DB restore proven (§92); object storage and KV have no restore runbook or drill found_

_§80: 6 of 14 done._

---

# 81. Search backend

Index:

- [x] Chats
      <br>_`apps/web/app/api/search/route.ts:255-270` messages + sessions ILIKE search_
- [x] Projects
      <br>_`apps/web/app/api/search/route.ts:239-246`_
- [x] Library _(revised)_
      <br>_apps/web/app/api/library/route.ts:96 search:q over library assets, called with q from apps/web/features/chat/components/Composer/ComposerFilesMenu.tsx:83_
- [x] Files
      <br>_`apps/web/app/api/search/route.ts:247-254` media_assets filename/prompt ILIKE_
- [ ] Artifacts - 🔴 Missing
      <br>_no artifact table search clause in `search/route.ts`_
- [ ] Reports - 🔴 Missing
      <br>_no report search clause; `research-report-service.ts` has no search API_
- [ ] Developer sessions - 🔴 Missing
      <br>_no cloud-code/developer-session search clause found_

Support:

- [x] Exact
      <br>_ILIKE literal match is exact-substring capable_
- [ ] Full text - 🟡 Partial
      <br>_ILIKE substring, not Postgres `tsvector`/`to_tsvector` (none found in migrations)_
- [ ] Semantic - 🔴 Missing
      <br>_no embeddings/vector query in search route_
- [ ] Hybrid - 🔴 Missing
      <br>_no BM25+vector fusion in search route (BM25 exists only in support/RAG, §82)_
- [x] Filters
      <br>_role/date/archived filters `search/route.ts:154-227`_
- [x] ACL-aware results
      <br>_scoped by `userId`+`organizationId` via `getUserScopedDb` `search/route.ts:108`_
- [x] Freshness
      <br>_live query against current tables, no stale index_
- [x] Delete propagation
      <br>_`deleted_at is null` clauses mean deletes vanish immediately, no separate index to desync_

_§81: 9 of 15 done._

---

# 82. RAG

- [x] Chunking
      <br>_windowed passages with overlap `apps/web/lib/services/project-knowledge-passages.ts:26-40`_
- [ ] Embeddings _(revised)_ - 🟡 Partial
      <br>_web has none, but apps/desktop/src-tauri/src/features/projects/rag.rs:193 generates embeddings via local model; mobile ragIndex.ts:83 hash vectors; not reached from UI_
- [ ] Metadata - 🟡 Partial
      <br>_chunk carries `headingPath`/`tags`/`category` for support corpus `apps/web/lib/support/agent/retrieval/retrieve.ts:27-29`; project-file passages carry only offsets_
- [ ] ACL - 🟡 Partial
      <br>_project-knowledge passages inherit the file's own per-user scope; support corpus has none (public docs only)_
- [x] Keyword retrieval
      <br>_BM25 `apps/web/lib/support/agent/retrieval/bm25.ts` reused by both retrievers_
- [ ] Vector retrieval _(revised)_ - 🟡 Partial
      <br>_apps/desktop/src-tauri/src/features/projects/rag.rs:248 cosine find_similar_chunks, command project_search_knowledge registered lib.rs:1383 but no renderer caller_
- [ ] Hybrid _(revised)_ - 🟡 Partial
      <br>_apps/desktop/src-tauri/src/features/projects/rag.rs:292 hybrid_search (keyword+vector) exists in desktop; no reachable caller; web keyword-only_
- [ ] Reranking - 🟡 Partial
      <br>_BM25 score is the only ranking signal; no second-stage reranker_
- [x] Context packing
      <br>_`PASSAGE_WINDOW_CHARS`/`PASSAGE_OVERLAP_CHARS` selection `project-knowledge-passages.ts:31-40`_
- [ ] Deduplication - 🟡 Partial
      <br>_`MAX_PER_DOCUMENT` caps hits per doc in support retrieval `retrieve.ts:16`; no cross-document dedup_
- [ ] Citations _(revised)_ - 🟡 Partial
      <br>_apps/web/features/support/components/SupportWidgetMount.tsx:12 only UI for support retrieval renders when NEXT_PUBLIC_SUPPORT_WIDGET_ENABLED==='1'; .env.example leaves it commented off - unset in production: …_
- [ ] Freshness _(revised)_ - 🟡 Partial
      <br>_apps/web/features/support/components/SupportWidgetMount.tsx:12 getSupportCorpus only reached via support widget, off unless NEXT_PUBLIC_SUPPORT_WIDGET_ENABLED=1 - unset in production: NEXT_PUBLIC_SUPPORT_WIDGET_ENABLED_
- [ ] Versioning - 🔴 Missing
      <br>_no chunk/document version field found_

_§82: 3 of 13 done._

---

# 83. Memory backend

- [x] Extraction ⛔ **not live**
      <br>_pattern extractor + model-backed extractor behind flag `apps/web/lib/services/model-memory-extraction.ts:1-16`, `packages/ai/agent-core/src/memory.ts:78`_
      <br>⛔ Release check: Production web is the 11 Sep 2026 deployment (about 1,000 commits behind main); every production deploy since errored or awaits approval.
- [x] Candidate memory ⛔ **not live**
      <br>_`extractCandidateMemoryFacts` + `MAX_AUTO_MEMORY_FACTS` cap `model-memory-extraction.ts:46`_
      <br>⛔ Release check: Production web is the 11 Sep 2026 deployment (about 1,000 commits behind main); every production deploy since errored or awaits approval.
- [ ] Consolidation - 🟡 Partial
      <br>_`normalizeMemoryKey`/`classifyMemoryCategory` dedup by key `packages/ai/agent-core/src/memory.ts:346-350`, no merge-on-conflict logic found_
- [ ] Conflict - 🔴 Missing
      <br>_no conflicting-fact resolution found beyond key overwrite_
- [ ] Scope - 🟡 Partial
      <br>_apps/web/db/neon/0073_tenancy_foundation.sql:142 user_memories.organization_id exists and auto-memory writes it (managed-auto-memory-service.ts:112); list route scopes by user/project only_
- [x] Account
      <br>_`user_memories` keyed by `user_id`, `apps/web/db/neon/0010_memory.sql:1`_
- [x] Project
      <br>_project filter in list route `apps/web/app/api/memory/route.ts:16,36-39`_
- [ ] Workspace _(revised)_ - 🟡 Partial
      <br>_apps/web/db/neon/0073_tenancy_foundation.sql:142 organization_id column exists, written by auto-memory, org policy gate managed-memory-context-service.ts:48; reads not workspace-scoped_
- [x] Developer _(revised)_
      <br>_apps/cli/src/memory.rs:25 Global/Project/Local developer memory tiers; consolidation pipeline apps/cli/src/agent/chat.rs:976 via memory_pipeline.rs_
- [ ] Expiration - 🔴 Missing
      <br>_no TTL/`expires_at` column on `user_memories`; importance decay (`decayMemoryImportance`, `memory.ts:385`) is a ranking signal, not deletion_
- [x] Privacy
      <br>_exclusion-term enforcement tested `apps/web/app/api/memory/__tests__/exclusion-enforcement.test.ts`_
- [x] Correction
      <br>_`PUT /api/memory/[id]` content edit `apps/web/app/api/memory/[id]/route.ts:50`_
- [x] Deletion
      <br>_soft-delete `is_deleted` flag, `apps/web/app/api/memory/[id]/route.ts:37`_

_§83: 8 of 13 done._

---

# 84. Notification system

Channels:

- [x] In-app
      <br>_`notificationStore.ts` apps/desktop, mobile prefs store `apps/mobile/stores/notificationPrefsStore.ts`_
- [x] Push
      <br>_`apps/web/lib/services/push-notification-service.ts:167` `sendPushToUser`_
- [x] Desktop
      <br>_`apps/desktop/src/lib/tauri-electron/notification.ts`, `tauri-web/notification.ts`_
- [ ] Web push _(revised)_ - 🟡 Partial
      <br>_apps/web/lib/services/web-push-service.ts:100-106 no VAPID keys means web delivery off; WEB_PUSH_VAPID_* empty in .env.example:614, not production-required - unset in production: WEB_PUSH_VAPID__
- [ ] Email _(revised)_ - 🟡 Partial
      <br>_apps/web/lib/services/notification-email-service.ts:11 needs RESEND_API_KEY and AGI_NOTIFICATIONS_FROM_EMAIL; both empty in .env.example:369-372, not production-required - unset in production: RESEND_API_KEY, …_

Events:

- [x] Work completed
      <br>_`AgentRunNotificationEvent = 'completed'` `apps/web/lib/services/agent-notification-service.ts:20-34`_
- [ ] Research completed - 🔴 Missing
      <br>_searched `notifyResearch`, `research.*complet.*notif`, none found_
- [x] Approval
      <br>_`approval_required` event `agent-notification-service.ts:20`_
- [x] Code completed
      <br>_same agent-run event set covers cloud-code turns (`completed`/`failed`)_
- [x] Schedule
      <br>_`notifyScheduleCompleted` `apps/web/lib/services/schedule-notification-service.ts:54`_
- [ ] Connector expired - 🔴 Missing
      <br>_`connect-required.ts:13` only returns a tool-facing string to the model, no user push/email dispatch found_
- [ ] Device disconnected - 🔴 Missing
      <br>_searched `device.*disconnect`, `deviceDisconnected`, none found_
- [ ] Billing _(revised)_ - 🟡 Partial
      <br>_apps/web/app/api/cron/enforce-billing-collection/route.ts:209 emails enterprise org owner on collection stage change; no consumer billing notifications_
- [ ] Security - 🔴 Missing
      <br>_`security-monitoring-service.ts` has no notify/push/email export, monitoring only_

_§84: 7 of 14 done._

---

# 85. Deep links

Support links to:

- [x] Chat ⛔ **not live**
      <br>_desktop `agiworkforce-cloud://chat/<id>` routed via `desktopDeepLinkRouter.ts`; web `/chat/[sessionId]`_
      <br>⛔ Release check: The only desktop release is Tauri v1.2.0 (4 May 2026), Linux assets only.
- [x] Project
      <br>_desktop `project` target validated against `useProjectStore`; web `/chat/projects`_
- [ ] File - 🔴 Missing
      <br>_no `file` deep-link target in `DESKTOP_DEEP_LINK_TARGETS` (chat/project/settings only) or web route_
- [ ] Artifact - 🟡 Partial
      <br>_web has `/shared-artifact/[token]` for sharing, no direct-open-by-id deep link on desktop/mobile_
- [ ] Work - 🔴 Missing
      <br>_no distinct Work deep-link target; would fall through to `chat`_
- [ ] Research - 🔴 Missing
      <br>_no distinct Research deep-link target_
- [ ] Schedule - 🔴 Missing
      <br>_`/chat/schedules` is a list page, no `/schedules/[id]` deep link_
- [x] Connector _(revised)_ ⛔ **not live**
      <br>_apps/mobile/app/(app)/connectors/[id].tsx expo-router route reachable via agiworkforce://connectors/<id> (scheme app.config.ts:62)_
      <br>⛔ Release check: The mobile app has never been released (release-mobile.yml never run; no App Store or Google Play listing).
- [x] Developer session _(revised)_
      <br>_apps/web/app/code/[sessionId]/page.tsx opens a developer session by id on web_
- [ ] Remote session _(revised)_ ⛔ **not live** - 🟡 Partial
      <br>_apps/mobile/app/(app)/companion/agent/[id].tsx opens a remote agent by id via expo-router scheme; no desktop/web target_
      <br>⛔ Release check: The mobile app has never been released (release-mobile.yml never run; no App Store or Google Play listing).
- [ ] Approval _(revised)_ ⛔ **not live** - 🟡 Partial
      <br>_apps/mobile/services/notifications.ts:297 approval notifications route to /(app)/companion list, not the specific approval_
      <br>⛔ Release check: The mobile app has never been released (release-mobile.yml never run; no App Store or Google Play listing).
- [ ] Browser task - 🔴 Missing
      <br>_no target found_

Check:

- [x] Native routing ⛔ **not live**
      <br>_`apps/desktop/src/lib/desktopDeepLinkRouter.ts` for its 3 targets_
      <br>⛔ Release check: The only desktop release is Tauri v1.2.0 (4 May 2026), Linux assets only.
- [ ] Web fallback - 🟡 Partial
      <br>_web has real routes per surface but nothing generates a universal link that falls back from native to web for unsupported targets_
- [ ] Unauthorized state - 🟡 Partial
      <br>_`/403` page exists app-wide, not verified per deep-link target_
- [ ] Deleted state - 🟡 Partial
      <br>_`routeDesktopDeepLink` returns `false` (no-op) for an id that names nothing that exists; no explicit "this was deleted" UI distinct from "not found"_
- [ ] Expired state - 🟡 Partial
      <br>_`/session-expired` page exists for auth; not verified for e.g. an expired schedule/connector link_

_§85: 5 of 17 done._

---

# 86. Observability

- [x] Logs
      <br>_logger is apps/web/lib/logger.ts:9 (pino with trace mixin); span emit at apps/web/lib/observability/span.ts:76,80_
- [ ] Metrics - 🟡 Partial
      <br>_span duration/status recorded per-call `span.ts:60-64`; no separate metrics/counter pipeline found_
- [ ] Traces _(revised)_ - 🟡 Partial
      <br>_apps/web/lib/observability/otel-config.ts:51 no AGI_OTEL_EXPORTER_ENDPOINT means no exporter; commented out .env.example:496, only documentedKeys in env-doctor.mjs - unset in production: AGI_OTEL_EXPORTER_ENDPOINT_
- [x] Request ID _(revised)_
      <br>_apps/web/lib/error-handler.ts:207 reads inbound x-request-id, :279 sets x-request-id and traceparent on every withErrorHandler response_
- [x] User ID _(revised)_
      <br>_apps/web/lib/logger.ts:9 mixin traceLogFields adds user_id to every log line; set by setTenantScope in apps/web/lib/api-auth.ts:226 and rls-db.ts:88_
- [x] Workspace ID _(revised)_
      <br>_apps/web/lib/observability/trace-context.ts:76 organization_id injected into all logs via logger mixin; set in apps/web/lib/server/rls-db.ts:88_
- [ ] Session ID _(revised)_ - 🟡 Partial
      <br>_route.ts:1227 turn span attributes are timer.attributes() phase durations (phase-timer.ts:22), not a conversation/session id_
- [x] Turn ID
      <br>_`CHAT_TURN_SPAN` root span per turn `route.ts:1226`_
- [ ] Tool ID - 🟡 Partial
      <br>_tool spans exist (`domain: 'tool'` in `SpanDomain` `span.ts:14`) but tool-id attribute not directly verified_
- [ ] Provider request ID - 🔴 Missing
      <br>_searched `providerRequestId`, `provider_request_id` in observability, no consistent field found_
- [ ] Queue job ID - 🟡 Partial
      <br>_durable workflow run has its own id (`CloudAgentTransportKind`, `start-cloud-agent-workflow.ts:93`), not confirmed wired into span attributes_
- [ ] Browser task ID - 🔴 Missing
      <br>_not found in observability code_
- [ ] Remote session ID - 🔴 Missing
      <br>_not found in observability code_

_§86: 5 of 13 done._

---

# 87. Service dashboards

- [x] Availability
      <br>_`/api/health` + `/status/page.tsx:58,107` self-fetches health_
- [ ] Request rate _(revised)_ - 🟡 Partial
      <br>_apps/web/lib/services/route-cache-observability-service.ts:145 request counts per route/model/user/tenant per window in /operator; model requests only, no HTTP request rate_
- [ ] Error rate _(revised)_ - 🟡 Partial
      <br>_apps/web/features/admin/services/routing-health-metrics.ts:39 serverErrorRate/timeoutRate per provider in operator RoutingHealthPanel; no overall HTTP error rate_
- [x] Latency _(revised)_
      <br>_apps/web/lib/services/route-cache-observability-service.ts:156 latency p50/p95 per route/model/user/tenant shown in OperatorCostsPanel on /operator_
- [x] First-token latency _(revised)_
      <br>_apps/web/features/admin/services/routing-health-metrics.ts:42 ttftP50Ms per provider/route in RoutingHealthPanel on /operator_
- [ ] Tool latency - 🟡 Partial
      <br>_tool spans carry duration (§86); no dashboard_
- [ ] File processing - 🔴 Missing
      <br>_no dashboard found_
- [ ] Queue depth - 🔴 Missing
      <br>_no queue-depth metric found_
- [x] Provider health _(revised)_
      <br>_apps/web/app/api/admin/routing-health/route.ts:23 breaker state, success/error rates per provider rendered by RoutingHealthPanel in OperatorDashboardPage (/operator)_
- [x] DB health
      <br>_apps/web/lib/server/health-check.ts:61 runHealthChecks database check feeds /api/health, status page and health-probe cron_
- [ ] Remote connection health - 🔴 Missing
      <br>_not found_
- [ ] Browser health - 🔴 Missing
      <br>_not found_
- [ ] Notification delivery - 🔴 Missing
      <br>_no delivery-rate tracking for push/email found_

_§87: 5 of 13 done._

---

# 88. Error monitoring

- [ ] Web exceptions _(revised)_ - 🟡 Partial
      <br>_apps/web/lib/sentry-shared.ts:16 Sentry only when a DSN is set; NEXT_PUBLIC_SENTRY_DSN empty .env.example:469 and absent from env-doctor production required - unset in production: NEXT_PUBLIC_SENTRY_DSN_
- [ ] Mobile crashes - 🔴 Missing
      <br>_no Sentry/Bugsnag/Crashlytics dependency in `apps/mobile/package.json`_
- [ ] Desktop crashes _(revised)_ - 🟡 Partial
      <br>_apps/desktop/src/services/errorTracking.ts:31 enabled:false and :44 needs VITE_SENTRY_DSN; no release-desktop\*.yml injects a Sentry DSN_
- [ ] CLI panics - 🟡 Partial
      <br>_`apps/cli/src/tui/tui_app.rs` has a panic hook that restores the terminal; no crash-reporting dispatch confirmed_
- [x] VS Code exceptions _(revised)_ ⛔ **not live**
      <br>_apps/extension-vscode/src/core/errorReporting.ts:29 uncaught/unhandled handlers installed in extension.ts:17, sent via telemetry.logError to configured endpoint_
      <br>⛔ Release check: The VS Code extension has never been published (Marketplace and Open VSX return nothing; release workflow never run).
- [ ] Chrome errors _(revised)_ - 🟡 Partial
      <br>_packages/platform/observability/src/client.ts:27 no DSN no reporting; VITE_SENTRY_DSN not in release-chrome-extension.yml env nor extension production required keys_
- [ ] API errors _(revised)_ - 🟡 Partial
      <br>_apps/web/lib/error-handler.ts:138 caught errors only logger.error; no captureException, Sentry sees only uncaught via instrumentation.ts:87 onRequestError_
- [ ] Worker failures - 🟡 Partial
      <br>_workflow steps have structured error paths (§89); not confirmed as a Sentry-tagged event class_
- [ ] Tool failures - 🔴 Missing
      <br>_no dedicated tool-failure monitoring surface found beyond spans (§86)_
- [ ] Model failures _(revised)_ - 🟡 Partial
      <br>_apps/web/features/admin/services/routing-health-metrics.ts:34 per-route failure/timeout rates on /operator; no alerting or Sentry event class_
- [ ] MCP failures - 🔴 Missing
      <br>_not found_
- [ ] Connector failures - 🔴 Missing
      <br>_not found_
- [ ] Remote failures - 🔴 Missing
      <br>_not found_

_§88: 1 of 13 done._

---

# 89. Reliability

- [x] Multi-provider fallback
      <br>_`packages/ai/routing/src/auto.ts`, `free-auto.ts` route around a failed provider_
- [x] Provider circuit breakers
      <br>_`packages/ai/routing/src/breaker-profiles.ts:11-32` degrade/open/reset thresholds per credential class_
- [x] Queue durability
      <br>_Vercel Workflow durable transport `apps/web/lib/workflows/start-cloud-agent-workflow.ts:53-93`_
- [ ] DB failover - ⚪ External
      <br>_delegated to Neon's managed failover; nothing in `data-layer` implements app-level failover_
- [ ] Storage resilience - 🟡 Partial
      <br>_S3/R2 retries are SDK defaults; no app-level retry/backoff policy found in `object-storage` src_
- [ ] Cache failure - 🟡 Partial
      <br>_`memory` adapter exists as a fallback (`key-value/src/adapters/memory.ts`) but no confirmed automatic failover from Redis/Upstash to it_
- [x] Retry limits
      <br>_`apps/web/lib/retry.ts`_
- [x] Idempotency
      <br>_idempotency handling in workflow steps `apps/web/lib/workflows/steps/execute-cloud-agent-invocation.ts`_
- [ ] Backpressure _(revised)_ - 🟡 Partial
      <br>_apps/web/app/api/llm/v1/chat/completions/lib/conversation-turn-admission.ts:10 one active turn per conversation; video admission slot video/generate/route.ts:1011; no global queue backpressure_
- [x] Graceful degradation
      <br>_durable-to-inline transport fallback `start-cloud-agent-workflow.ts:93-98`_
- [ ] Regional failover - ⚪ External
      <br>_not implemented in-repo; would be a Vercel/Neon platform capability_
- [ ] Dependency isolation - 🟡 Partial
      <br>_inline vs durable transport is isolated (`CloudAgentTransportKind`), broader service-to-service isolation not verified_

_§89: 6 of 12 done._

---

# 90. SLOs

- [ ] Authentication _(revised)_ - 🟡 Partial
      <br>_apps/web/app/sla/page.tsx:35 publishes 99.9% monthly Authentication target, explicitly non-contractual and unmeasured_
- [ ] Chat _(revised)_ - 🟡 Partial
      <br>_apps/web/app/sla/page.tsx:33-34 99.9% target for web and API gateway, non-contractual, no measurement_
- [ ] First token - 🔴 Missing
      <br>_no SLO target found_
- [ ] Completion - 🔴 Missing
      <br>_no SLO target found_
- [ ] Tool execution - 🔴 Missing
      <br>_no SLO target found_
- [ ] Work - 🔴 Missing
      <br>_no SLO target found_
- [ ] Research - 🔴 Missing
      <br>_no SLO target found_
- [ ] File upload - 🔴 Missing
      <br>_no SLO target found_
- [ ] File parsing - 🔴 Missing
      <br>_no SLO target found_
- [ ] Search - 🔴 Missing
      <br>_no SLO target found_
- [ ] Remote Control - 🔴 Missing
      <br>_no SLO target found_
- [ ] Browser - 🔴 Missing
      <br>_no SLO target found_
- [ ] Notifications - 🔴 Missing
      <br>_no SLO target found_
- [ ] Billing events - 🔴 Missing
      <br>_no SLO target found_

_§90: 0 of 14 done._

---

# 91. Incident management

- [x] Severity levels
      <br>_`docs/runbooks/incident-response.md:47` `## Severity` section_
- [ ] On-call - 🔴 Missing
      <br>_"No on-call rotation. One mailbox, one person, no handoff." `incident-response.md:180`_
- [ ] Pager _(revised)_ - 🟡 Partial
      <br>_apps/web/app/api/cron/health-probe/route.ts:120 pageOnCall posts to PAGER_WEBHOOK_URL, also used by page-security-anomalies; no pager vendor configured_
- [ ] Escalation - 🔴 Missing
      <br>_same citation, "nothing escalates if the first recipient does not acknowledge"_
- [ ] Incident channel - 🔴 Missing
      <br>_not found; alert is email only_
- [x] Status page
      <br>_`apps/web/app/status/page.tsx:58,107` live self-fetching status page_
- [ ] Customer notice - 🔴 Missing
      <br>_no customer-notice mechanism found beyond the status page itself_
- [x] Mitigation
      <br>_triage steps per detector `incident-response.md:58-99`_
- [x] Recovery
      <br>_recovery procedure tied to `docs/runbooks/database-backup-restore.md`_
- [ ] Postmortem _(revised)_ - 🟡 Partial
      <br>_docs/runbooks/personal-data-breach.md:281 requires written blameless post-incident review for breaches; no general incident postmortem template_
- [ ] Follow-up owners - 🟡 Partial
      <br>_gaps are "tracked as founder actions in `docs/work/release-readiness-2026-08-25.md`" `incident-response.md:165`, but that is ad hoc, not a per-incident owner process_

_§91: 4 of 11 done._

---

# 92. Backups / disaster recovery

- [ ] Database backup _(revised)_ - 🟡 Partial
      <br>_docs/runbooks/database-backup-restore.md:253 retention never read, Neon drill never run; provider default only, no app-verified backup_
- [ ] PITR _(revised)_ - 🟡 Partial
      <br>_scripts/db-restore-drill.mjs PITR branch drill exists but database-backup-restore.md:243 says never run; history_retention_seconds unrecorded_
- [ ] Object backups - 🔴 Missing
      <br>_no object-storage backup/versioning mechanism found in `object-storage` src or runbooks_
- [ ] Cross-region backup - 🔴 Missing
      <br>_not found; Neon PITR is same-region_
- [ ] Encryption - 🟡 Partial
      <br>_provider-side (Neon/S3) encryption assumed, not app-verified; see §80_
- [ ] Restore test _(revised)_ - 🟡 Partial
      <br>_.github/workflows/db-restore-drill.yml:48 runs only logical dump/restore of a CI container DB; Neon backup restore drill never run (runbook:243)_
- [ ] RPO - 🔴 Missing
      <br>_"No RPO/RTO has been published to customers" `database-backup-restore.md:256`_
- [ ] RTO - 🔴 Missing
      <br>_same citation_
- [x] Disaster runbook
      <br>_`docs/runbooks/database-backup-restore.md` full recovery procedure_
- [ ] Quarterly recovery drill _(revised)_ - 🟡 Partial
      <br>_.github/workflows/db-restore-drill.yml:5 weekly logical drill on disposable postgres, not a production recovery drill; Neon drill BLOCKED_BY_HUMAN_

_§92: 1 of 10 done._

---

# 93. Web quality

- [x] SSR where useful
      <br>_`apps/web/next.config.ts` default App Router SSR; 128 pages export `metadata`/`generateMetadata` server-side_
- [x] Streaming
      <br>_`apps/web/features/chat` streams model output; React Suspense used across `app/**` (19 files)_
- [x] Route-level splitting
      <br>_Next.js App Router per-segment code splitting is default; `next.config.ts` `optimizePackageImports` list_
- [x] Error boundaries
      <br>_Root `app/error.tsx` + 23 nested `error.tsx` overrides (contact, chat, billing, auth, etc.)_
- [ ] Loading boundaries - 🟡 Partial
      <br>_Only 7 `loading.tsx` files (`chat`, `settings`, `share`, `verify`, `welcome`, `device-auth`) across ~90 route segments_
- [x] Optimistic UI
      <br>_`shared/stores/web-chat-store.ts:727` paints optimistic turn under local id before create resolves_
- [x] Query caching
      <br>_`shared/stores/query-client.ts` TanStack Query with `QueryCache`/`MutationCache` error policy_
- [x] Virtualization
      <br>_`features/chat/components/messages/ChatMessageList.tsx:15-19,1768` uses `react-window` v2 `List`_
- [x] CSP
      <br>_`apps/web/proxy.ts:27-95` nonce-based CSP built per-request, applied to all responses_
- [x] Trusted input handling
      <br>_`shared/utils/html-sanitizer.ts`, `shared/lib/security.ts`; 104/296 API routes use zod schemas_
- [ ] Performance budget - 🔴 Missing
      <br>_Searched `package.json`, `.github/workflows/*.yml` for size-limit/bundlesize/lighthouse-ci; none found_
- [x] SEO only for public surfaces
      <br>_`app/robots.ts`, `app/sitemap.ts`; metadata scoped to marketing/public routes, not `/chat` or `/settings`_

_§93: 10 of 12 done._

---

# 94. Mobile quality

- [x] iOS ⛔ **not live**
      <br>_.github/workflows/release-mobile.yml:199-295 builds and submits iOS to TestFlight; apps/mobile/ios is gitignored prebuild output (0 tracked files), not evidence_
      <br>⛔ Release check: release-mobile.yml:4-10 needs a v-mobile-* tag; git ls-remote origin has none, so no store/TestFlight build ever produced
- [x] Android ⛔ **not live**
      <br>_.github/workflows/release-mobile.yml:300 builds and submits Android to Play internal track; apps/mobile/android is untracked prebuild output_
      <br>⛔ Release check: release-mobile.yml:4-10 needs a v-mobile-* tag; git ls-remote origin has none, so no store/TestFlight build ever produced
- [x] Phones ⛔ **not live**
      <br>_Default RN layout targets phone; no phone-exclusive gating found_
      <br>⛔ Release check: release-mobile.yml:4-10 needs a v-mobile-* tag; git ls-remote origin has none, so no store/TestFlight build ever produced
- [x] Tablets ⛔ **not live**
      <br>_`app.config.js:65` `supportsTablet: true`_
      <br>⛔ Release check: release-mobile.yml:4-10 needs a v-mobile-* tag; git ls-remote origin has none, so no store/TestFlight build ever produced
- [x] Safe areas ⛔ **not live**
      <br>_87 files use `SafeAreaProvider`/`useSafeAreaInsets`/`SafeAreaView`_
      <br>⛔ Release check: release-mobile.yml:4-10 needs a v-mobile-* tag; git ls-remote origin has none, so no store/TestFlight build ever produced
- [x] Keyboard ⛔ **not live**
      <br>_20 files use `KeyboardAvoidingView`/keyboard hooks_
      <br>⛔ Release check: release-mobile.yml:4-10 needs a v-mobile-* tag; git ls-remote origin has none, so no store/TestFlight build ever produced
- [x] Camera ⛔ **not live**
      <br>_`app/(app)/camera.tsx`, `app/(app)/scan.tsx`, `src/features/media/photo-picker.ts`_
      <br>⛔ Release check: release-mobile.yml:4-10 needs a v-mobile-* tag; git ls-remote origin has none, so no store/TestFlight build ever produced
- [x] Files ⛔ **not live**
      <br>_`src/features/projects/components/ProjectSourcesTab.tsx`, file-based project sources and image references_
      <br>⛔ Release check: release-mobile.yml:4-10 needs a v-mobile-* tag; git ls-remote origin has none, so no store/TestFlight build ever produced
- [x] Photos ⛔ **not live**
      <br>_`src/features/settings/permissions/registry.ts` declares photo-library permission handling_
      <br>⛔ Release check: release-mobile.yml:4-10 needs a v-mobile-* tag; git ls-remote origin has none, so no store/TestFlight build ever produced
- [x] Microphone ⛔ **not live**
      <br>_`src/features/voice/services/voiceInput.ts`_
      <br>⛔ Release check: release-mobile.yml:4-10 needs a v-mobile-* tag; git ls-remote origin has none, so no store/TestFlight build ever produced
- [x] Share sheet ⛔ **not live**
      <br>_`src/features/chat/components/FileExportButton.tsx`, `src/features/artifacts/index.tsx`_
      <br>⛔ Release check: release-mobile.yml:4-10 needs a v-mobile-* tag; git ls-remote origin has none, so no store/TestFlight build ever produced
- [x] Push ⛔ **not live**
      <br>_`expo-notifications` wired via `src/features/integrations/components/DeviceIntegrationStatus.tsx`_
      <br>⛔ Release check: release-mobile.yml:4-10 needs a v-mobile-* tag; git ls-remote origin has none, so no store/TestFlight build ever produced
- [x] Deep links ⛔ **not live**
      <br>_`app.config.js:37,62,166-194` scheme `agiworkforce`, `applinks:agiworkforce.com`, intent filters_
      <br>⛔ Release check: release-mobile.yml:4-10 needs a v-mobile-* tag; git ls-remote origin has none, so no store/TestFlight build ever produced
- [x] Backgrounding _(revised)_ ⛔ **not live**
      <br>_apps/mobile/app/_layout.tsx:306-318 foreground refresh on AppState; services/backgroundFetch.ts:56,135 TaskManager background task registered from _layout.tsx:78; useBiometricGate.ts:113 re-locks on resume_
      <br>⛔ Release check: release-mobile.yml:4-10 needs a v-mobile-* tag; git ls-remote origin has none, so no store/TestFlight build ever produced
- [x] Offline ⛔ **not live**
      <br>_apps/mobile/hooks/useNetworkStatus.ts:21 (a file, not a dir); services/offlineQueue.ts enqueued from app/(app)/chat/[id].tsx:473; OfflineBanner mounted in app/_layout.tsx_
      <br>⛔ Release check: release-mobile.yml:4-10 needs a v-mobile-* tag; git ls-remote origin has none, so no store/TestFlight build ever produced
- [x] Network transitions ⛔ **not live**
      <br>_`OfflineBanner.tsx:13-40` reacts live to `useNetworkStatus().isOnline`_
      <br>⛔ Release check: release-mobile.yml:4-10 needs a v-mobile-* tag; git ls-remote origin has none, so no store/TestFlight build ever produced
- [x] Crash recovery ⛔ **not live**
      <br>_`app/error.tsx`, `app/(app)/error.tsx`, `app/(auth)/error.tsx`, `app/(public)/error.tsx` per-segment boundaries_
      <br>⛔ Release check: release-mobile.yml:4-10 needs a v-mobile-* tag; git ls-remote origin has none, so no store/TestFlight build ever produced

_§94: 17 of 17 done._

---

# 95. Desktop quality

- [x] MacOS ⛔ **not live**
      <br>_`apps/desktop/electron-builder.yml:29-63` dmg arm64/x64; `src-tauri/tauri.conf.json` macOS signing block_
      <br>⛔ Release check: release-desktop.yml@82463ae48:257-259 build-macos if:false (APPLE secrets missing); v-desktop-1.2.0 built Linux x86_64 AppImage only; Electron untagged
- [x] Windows ⛔ **not live**
      <br>_`src-tauri/tauri.conf.json:64-77` Windows digest/timestamp config; `.github/workflows/build-windows-release.yml`_
      <br>⛔ Release check: release-desktop.yml@82463ae48:403-409 build-windows if:false, deferred to v1.3+; no later v-desktop tag; Electron shell untagged
- [x] ARM64 ⛔ **not live**
      <br>_`electron-builder.yml:44` `target: [arm64, x64]` for dmg_
      <br>⛔ Release check: release-desktop.yml@82463ae48:503-508 Linux build is x86_64 AppImage only; macOS arm64 jobs if:false; Electron dmg untagged
- [x] X64
      <br>_same as above; `release-cli.yml` matrix also builds x64_
- [x] Native titlebar ⛔ **not live**
      <br>_`apps/desktop/electron/windowChrome.ts`_
      <br>⛔ Release check: The Electron desktop has never been released (release-desktop-cloud.yml never run).
- [x] Menu ⛔ **not live**
      <br>_`apps/desktop/electron/appMenu.ts`_
      <br>⛔ Release check: electron/appMenu.ts unreleased (no v-cloud-desktop tag); Tauri at v-desktop-1.2.0 (82463ae48) has no Submenu/app menu
- [x] Tray ⛔ **not live**
      <br>_`apps/desktop/electron/tray.ts` (150 lines)_
      <br>⛔ Release check: The Electron desktop has never been released (release-desktop-cloud.yml never run).
- [x] Global shortcuts ⛔ **not live**
      <br>_`apps/desktop/electron/shortcuts.ts:1,59,112` uses `globalShortcut`_
      <br>⛔ Release check: The Electron desktop has never been released (release-desktop-cloud.yml never run).
- [x] Multi-monitor ⛔ **not live**
      <br>_`electron/main.ts:587,613` `screen.getAllDisplays()`/`getDisplayMatching`; `screenshot.ts:65`, `quickAsk.ts:72`_
      <br>⛔ Release check: The Electron desktop has never been released (release-desktop-cloud.yml never run).
- [x] Fullscreen _(revised)_ ⛔ **not live**
      <br>_apps/desktop/electron/appMenu.ts:174 role togglefullscreen in installed menu; main.ts:611 window-frame persistence skips isFullScreen state_
      <br>⛔ Release check: The Electron desktop has never been released (release-desktop-cloud.yml never run).
- [x] Restore window ⛔ **not live**
      <br>_`electron/main.ts:613` `win.isMaximized()`/work-area fill check on relaunch_
      <br>⛔ Release check: The Electron desktop has never been released (release-desktop-cloud.yml never run).
- [x] Launch at login ⛔ **not live**
      <br>_`apps/desktop/electron/launchAtLogin.ts` (29 lines)_
      <br>⛔ Release check: The Electron desktop has never been released (release-desktop-cloud.yml never run).
- [x] Quick Ask ⛔ **not live**
      <br>_`apps/desktop/electron/quickAsk.ts` (132 lines)_
      <br>⛔ Release check: electron/quickAsk.ts unreleased (no v-cloud-desktop tag); no quick_ask in Tauri src at v-desktop-1.2.0 (82463ae48)
- [x] Screenshot ⛔ **not live**
      <br>_`apps/desktop/electron/screenshot.ts` (127 lines)_
      <br>⛔ Release check: The Electron desktop has never been released (release-desktop-cloud.yml never run).
- [x] Dictation ⛔ **not live**
      <br>_`apps/desktop/electron/voiceDictation.ts` (64 lines)_
      <br>⛔ Release check: The Electron desktop has never been released (release-desktop-cloud.yml never run).
- [x] Deep links ⛔ **not live**
      <br>_`electron-builder.yml:31-38` registers `agiworkforce-cloud` protocol; `main.ts` deep-link IPC channel_
      <br>⛔ Release check: The only desktop release is Tauri v1.2.0 (4 May 2026), Linux assets only. The Electron desktop has never been released (release-desktop-cloud.yml never run).
- [x] Auto update
      <br>_`apps/desktop/electron/desktopCloudUpdate.ts` (159 lines); Tauri `updater.endpoints`/`pubkey` in `tauri.conf.json:99-104`_

_§95: 17 of 17 done._

---

# 96. Electron hardening

- [x] Context isolation ⛔ **not live**
      <br>_`apps/desktop/electron/main.ts:659` `contextIsolation: true`_
      <br>⛔ Release check: The Electron desktop has never been released (release-desktop-cloud.yml never run).
- [x] Sandboxed renderer ⛔ **not live**
      <br>_`main.ts:660` `sandbox: true`_
      <br>⛔ Release check: The Electron desktop has never been released (release-desktop-cloud.yml never run).
- [x] No Node in renderer ⛔ **not live**
      <br>_`main.ts:661` `nodeIntegration: false`_
      <br>⛔ Release check: The Electron desktop has never been released (release-desktop-cloud.yml never run).
- [x] Strict preload bridge ⛔ **not live**
      <br>_`electron/preload.ts:6-137` only exposes typed `ipcRenderer.invoke` wrappers via `contextBridge`_
      <br>⛔ Release check: The Electron desktop has never been released (release-desktop-cloud.yml never run).
- [x] IPC validation _(revised)_ ⛔ **not live**
      <br>_apps/desktop/electron/main.ts:193-201 isTrustedSender checks main frame origin; :267-300 command allowlist and object-shape checks; runtime/dispatcher.ts:116-240 typed requireString/number/object validators throw …_
      <br>⛔ Release check: The Electron desktop has never been released (release-desktop-cloud.yml never run).
- [x] Origin validation ⛔ **not live**
      <br>_`electron/windowPolicy.ts:46-49,53-69` `isAppOrigin`/`decideRemoteNavigation` host allowlist_
      <br>⛔ Release check: windowPolicy.ts is Electron-only; release-desktop-cloud.yml:26-28 needs v-cloud-desktop-* tag; none on origin; Electron shell never released
- [x] CSP ⛔ **not live**
      <br>_`electron/main.ts:173` sets `Content-Security-Policy` header via `RENDERER_CSP`_
      <br>⛔ Release check: The Electron desktop has never been released (release-desktop-cloud.yml never run).
- [x] Navigation restrictions ⛔ **not live**
      <br>_`windowPolicy.ts:89-96` `will-navigate` handler blocks non-allowed origins_
      <br>⛔ Release check: will-navigate guard Electron-only; no on_navigation handler in Tauri src at v-desktop-1.2.0 (82463ae48); Electron untagged
- [x] External link handling ⛔ **not live**
      <br>_`windowPolicy.ts:82-86` `setWindowOpenHandler` denies in-app open, routes to `shell.openExternal`_
      <br>⛔ Release check: The Electron desktop has never been released (release-desktop-cloud.yml never run).
- [x] No arbitrary shell exposure ⛔ **not live**
      <br>_`electron/runtime/shellService.ts:157` + `shellPolicyStore.ts` gate every shell command through `evaluateShellPolicy` with approval_
      <br>⛔ Release check: shellService evaluateShellPolicy is Electron-only; release-desktop-cloud.yml:26-28 needs v-cloud-desktop-* tag; none on origin; Electron shell never released
- [x] Signed builds ⛔ **not live**
      <br>_`electron-builder.yml:49` `hardenedRuntime: true`; signing via `CSC_LINK`/`CSC_KEY_PASSWORD`; Tauri `signingIdentity` in `tauri.conf.json:83`_
      <br>⛔ Release check: 82463ae48 commit: APPLE_* signing secrets not configured, macOS signing deferred; electron-builder CSC_LINK path untagged
- [x] Notarization ⛔ **not live**
      <br>_`electron-builder.yml:60` `notarize: true`, comment cites `APPLE_API_KEY`/`APPLE_API_KEY_ID`/`APPLE_API_ISSUER`_
      <br>⛔ Release check: notarize:true only in Electron config (untagged); Tauri macOS build if:false at release-desktop.yml@82463ae48:259

_§96: 12 of 12 done._

---

# 97. CLI quality

- [x] MacOS
      <br>_`.github/workflows/release-cli.yml:110-116` `aarch64/x86_64-apple-darwin` matrix_
- [x] Linux
      <br>_`release-cli.yml:120-127` `x86_64/aarch64-unknown-linux-gnu`, cross for arm64_
- [x] Windows
      <br>_`release-cli.yml:131-137` `aarch64/x86_64-pc-windows-msvc`_
- [x] X64
      <br>_matrix targets above include x64 for all three OSes_
- [x] ARM64 ⛔ **not live**
      <br>_matrix targets above include aarch64 for all three OSes_
      <br>⛔ Release check: release-cli.yml@a8650d61c:33-56 matrix dropped aarch64-unknown-linux-gnu; only v-cli-1.0.0 ever tagged
- [x] Terminal compatibility
      <br>_`apps/cli/src/tui/icons.rs` NO_COLOR-aware icon fallback; `output.rs` dumb-terminal detection_
- [x] NO_COLOR
      <br>_`apps/cli/src/output.rs:19,32,38` implements the no-color.org spec_
- [x] Pipes ⛔ **not live**
      <br>_`apps/cli/src/lib.rs`, `config.rs`, `mcp/mod.rs` use `is_terminal`/isatty checks to branch on piped stdio_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [x] Redirection
      <br>_same isatty/pipe-detection call sites govern redirected stdout behavior_
- [x] Signals
      <br>_`apps/cli/src/process_tree.rs`, `daemon.rs`, `agent/chat.rs` handle `SIGINT`/`SIGTERM`_
- [x] Process cleanup ⛔ **not live**
      <br>_`apps/cli/src/process_tree.rs:147,369,481,656,673,746,758` platform-specific (`cfg(windows)`/`cfg(unix)`) process-tree teardown_
      <br>⛔ Release check: apps/cli/src/process_tree.rs absent at v-cli-1.0.0 (a8650d61c); cleanup fixes deb53833b/6f54c4b31 dated 2026-09-16
- [x] Machine output
      <br>_`apps/cli/src/agent_events.rs`, `sdk_io/mod.rs` structured JSON event stream_
- [ ] Accessibility/plain mode - 🟡 Partial
      <br>_NO_COLOR covers color; no distinct "plain" screen-reader mode found beyond that (searched `plain`, `accessible` in `src/`)_

_§97: 12 of 13 done._

---

# 98. Accessibility

- [ ] WCAG AA - 🟡 Partial
      <br>_`apps/web/shared/components/__tests__/theme-contrast.test.ts` computes AA ratios per `.claude/rules/ui-colour-and-interaction.md`; no whole-app AA certification_
- [x] Keyboard
      <br>_`useMenuKeyboard` primitive (per `.claude/rules/ui-colour-and-interaction.md`); `features/chat/components/dialogs/__tests__/GlobalSearchDialog.a11y.test.tsx`_
- [x] Focus
      <br>_menu-keyboard contract requires focus return to trigger; tested in dialog a11y test_
- [x] Screen readers
      <br>_.github/workflows/ci.yml:1018-1137 web-a11y job runs blocking axe WCAG 2.1 A/AA audit (apps/web/scripts/a11y-audit.mjs:12,76) on PRs touching web; ci.yml:304 is js-verify Chromium install_
- [x] ARIA
      <br>_80 `.tsx` files in `shared`/`app` use `aria-*` attributes; `role="status"` streaming indicators_
- [x] Contrast
      <br>_`theme-contrast.test.ts` enforces per-token contrast ratios (fill/text/on-fill roles)_
- [x] Reduced motion ⛔ **not live**
      <br>_14 files use `prefers-reduced-motion`/`useReducedMotion` (web) and `useReduceMotion` (mobile, `OfflineBanner.tsx:19`)_
      <br>⛔ Release check: The mobile app has never been released (release-mobile.yml never run; no App Store or Google Play listing).
- [x] Zoom _(revised)_
      <br>_apps/web/app/layout.tsx:68-73 viewport sets no maximum-scale/user-scalable; axe wcag2aa tags in a11y-audit.mjs:12 include the meta-viewport rule, blocking in CI web-a11y job_
- [x] Dynamic type _(revised)_ ⛔ **not live**
      <br>_RN Text scales with Dynamic Type by default; apps/mobile/src/shared/components/TextScaleBoundary.tsx remounts on fontScale change, mounted app-wide at app/_layout.tsx:716_
      <br>⛔ Release check: mobile only; release-mobile.yml:4-10 needs a v-mobile-* tag; git ls-remote origin has none, so no store/TestFlight build ever produced
- [ ] VoiceOver - 🟡 Partial
      <br>_144 files use `accessibilityLabel`/`AccessibilityInfo` in mobile; no dedicated VoiceOver-specific test found_
- [ ] TalkBack - 🟡 Partial
      <br>_Same `accessibilityLabel` API covers Android via RN, no Android-specific TalkBack test found_
- [ ] Narrator - 🔴 Missing
      <br>_Searched desktop/Windows code for Narrator-specific ARIA/automation-peer handling; none found_
- [ ] Accessible diffs ⛔ **not live** - 🟡 Partial
      <br>_`apps/desktop/src/features/git/GitDiffViewer.tsx:153-154` has `role="region" aria-label`, but no evidence line-level add/remove is announced_
      <br>⛔ Release check: The only desktop release is Tauri v1.2.0 (4 May 2026), Linux assets only.
- [x] Accessible streaming status
      <br>_`apps/web/features/chat/components/ThinkingBlock.tsx:135`, `research/ResearchActivity.tsx:275-276` use `aria-live="polite"`_

_§98: 9 of 14 done._

---

# 99. Internationalization

- [x] Translation framework
      <br>_`apps/web/package.json:105-127` i18next/react-i18next; `packages/ui/i18n/src`_
- [x] Plurals
      <br>_packages/ui/i18n/locales/en/pricing.json and v3.json carry _one/_other plural keys; en/common.json has none_
- [x] Dates
      <br>_apps/web/features/schedules/types/index.ts:92-101 formatDateTime uses Intl.DateTimeFormat with timeZone; user-profile-store.ts:19 is only a type field_
- [x] Time
      <br>_apps/web/shared/components/OfflineIndicator.tsx:199 and features/settings/components/AuditLogPanel.tsx:24 locale-aware Intl.DateTimeFormat time formatting_
- [x] Timezones
      <br>_apps/web/features/schedules/types/index.ts:101 applies stored timezone; features/settings/sections/TimeFocusSection.tsx:36 resolves browser timeZone; store-types is only a type_
- [x] Numbers
      <br>_`apps/web/shared/utils/format.ts` `Intl.NumberFormat` usage_
- [x] Currency
      <br>_`apps/web/shared/utils/format.ts` currency formatting_
- [ ] RTL - 🟡 Partial
      <br>_apps/web/app/i18n/index.ts:78 does switch document dir for RTL, but packages/ui/i18n/src/languages.ts:28 makes only en/es selectable on web, so Arabic is unreachable; mobile full RTL_
- [ ] CJK - 🟡 Partial
      <br>_`ja`, `ko`, `zh` locale folders exist under `packages/ui/i18n/locales`; no CJK-specific line-break/IME-width test found_
- [x] IME
      <br>_`apps/web/features/chat/components/Composer/ChatComposerNew.tsx` handles composition events (tested in `.test.tsx`)_
- [ ] Long translations - 🔴 Missing
      <br>_Searched for text-overflow/truncation-safety tests tied to locale string length; none found_
- [ ] Notifications ⛔ **not live** - 🟡 Partial
      <br>_Push/notify code paths exist (`electron/main.ts` `notify` IPC, mobile `expo-notifications`) but no locale-aware copy resolution found at those call sites_
      <br>⛔ Release check: The Electron desktop has never been released (release-desktop-cloud.yml never run).
- [ ] Emails - 🔴 Missing
      <br>_`apps/web/lib/support/handoff/escalation-email.ts` sends support-handoff email; no localized template system found (searched for react-email/i18n email dirs)_
- [ ] Search locale - 🔴 Missing
      <br>_apps/web/app/api/search/route.ts:162-211 plain ILIKE matching with no locale/collation or language-aware ranking; apps/web/lib/search does not exist_

_§99: 8 of 14 done._

---

# 100. Analytics

- [ ] Signup - 🔴 Missing
      <br>_desktop has telemetry (apps/desktop/src/services/analytics.ts:146, analytics_track_event) but no signup event on any surface; web has none_
- [ ] Activation - 🔴 Missing
      <br>_no activation-event tracking found_
- [ ] First Chat - 🔴 Missing
      <br>_not found_
- [ ] First useful response - 🔴 Missing
      <br>_not found_
- [ ] Upload - 🔴 Missing
      <br>_not found_
- [ ] Project - 🔴 Missing
      <br>_not found_
- [ ] Library - 🔴 Missing
      <br>_not found_
- [ ] Research - 🔴 Missing
      <br>_not found_
- [ ] Work - 🔴 Missing
      <br>_not found_
- [ ] Code - 🔴 Missing
      <br>_not found_
- [ ] Connector - 🔴 Missing
      <br>_not found_
- [ ] Skill - 🔴 Missing
      <br>_not found_
- [ ] Plugin - 🔴 Missing
      <br>_not found_
- [ ] Remote - 🔴 Missing
      <br>_not found_
- [ ] Browser - 🔴 Missing
      <br>_not found_
- [ ] Voice - 🔴 Missing
      <br>_not found_
- [ ] Upgrade - 🟡 Partial
      <br>_Stripe webhook updates subscription state (`apps/web/app/api/stripe-webhook`), which is a fact record, not an analytics event_

_§100: 0 of 17 done._

---

# 101. Business metrics

- [ ] DAU - 🔴 Missing
      <br>_searched `\bDAU\b`, none_
- [ ] WAU - 🔴 Missing
      <br>_searched `\bWAU\b`, none_
- [ ] MAU - 🔴 Missing
      <br>_searched `\bMAU\b`, none_
- [ ] D1 - 🔴 Missing
      <br>_not found_
- [ ] D7 - 🔴 Missing
      <br>_not found_
- [ ] D30 - 🔴 Missing
      <br>_not found_
- [ ] Retention - 🔴 Missing
      <br>_no cohort/retention computation found_
- [ ] Paid conversion - 🔴 Missing
      <br>_not found_
- [ ] Churn - 🔴 Missing
      <br>_not found_
- [ ] Expansion - 🔴 Missing
      <br>_not found_
- [ ] ARR - 🔴 Missing
      <br>_not found_
- [ ] ARPU - 🔴 Missing
      <br>_not found_
- [x] Gross margin _(revised)_
      <br>_apps/web/features/admin/services/economics-summary.ts:429 contribution margin = revenue - COGS - fees - store commission, grouped by plan/model/etc, EconomicsSummaryPanel on /operator_
- [x] Cost per user _(revised)_
      <br>_apps/web/lib/services/route-cache-observability-service.ts:13 actualCostCents by 'user' dimension, OperatorCostsPanel.tsx:21 renders user breakdown_
- [ ] Support cost - 🔴 Missing
      <br>_not found_

_§101: 2 of 15 done._

---

# 102. AI quality metrics

- [ ] Regenerate rate - 🔴 Missing
      <br>_regenerate action exists in chat UI; no rate aggregation found_
- [ ] Stop rate - 🔴 Missing
      <br>_stop/cancel exists (`useChatStream.ts`); no rate aggregation found_
- [x] Thumbs down
      <br>_`reaction: 'thumbsDown'` captured and stored `apps/web/app/api/chat/conversations/[id]/messages/[messageId]/route.ts:23`_
- [ ] Tool failure - 🟡 Partial
      <br>_tool spans record error status (§86); no aggregated failure-rate metric_
- [ ] Tool retry - 🟡 Partial
      <br>_`apps/web/lib/retry.ts` exists; no retry-rate metric surfaced_
- [ ] Citation failure - 🟡 Partial
      <br>_citation invariant is unit-tested (`support/agent/__tests__/citation-invariant.test.ts`) but that's correctness testing, not a production metric_
- [ ] File failure - 🔴 Missing
      <br>_not found as a metric_
- [x] Model fallback
      <br>_fallback_count per route/model in route-cache-observability-service.ts:155, displayed by OperatorCostsPanel on /operator_
- [ ] Code acceptance - 🔴 Missing
      <br>_not found_
- [ ] Work completion - 🟡 Partial
      <br>_`notifyAgentRunEvent('completed'|'failed')` fires per-run (§84) but no aggregated completion-rate metric_
- [ ] Research completion - 🔴 Missing
      <br>_no Research-specific completion event found (§84)_
- [ ] Browser success - 🔴 Missing
      <br>_not found_
- [ ] Remote success - 🔴 Missing
      <br>_not found_

_§102: 2 of 13 done._

---

# 103. Evaluation framework

Maintain eval suites for:

- [ ] Chat - 🟡 Partial
      <br>_golden corpus, 12 rows, `tools/evals/datasets/golden.json`, gate 0.9, `tools/evals/README.md:19`_
- [ ] Coding - 🔴 Missing
      <br>_no coding eval suite found under `tools/evals`_
- [ ] Reasoning - 🔴 Missing
      <br>_not found_
- [ ] Research - 🔴 Missing
      <br>_not found_
- [ ] Search - 🔴 Missing
      <br>_not found_
- [ ] Tools - 🔴 Missing
      <br>_not found (tool-use eval)_
- [ ] Structured output - 🔴 Missing
      <br>_not found_
- [ ] Long context - 🔴 Missing
      <br>_not found_
- [ ] Files - 🔴 Missing
      <br>_not found_
- [ ] Browser - 🔴 Missing
      <br>_not found_
- [ ] Computer use - 🔴 Missing
      <br>_not found_
- [ ] Multilingual - 🔴 Missing
      <br>_not found_
- [x] Safety
      <br>_refusal + jailbreak corpora, gate 1.0, `tools/evals/README.md:20-21`, weekly live run `.github/workflows/evals.yml`_
- [ ] Cost - 🔴 Missing
      <br>_not found as an eval axis_
- [ ] Latency - 🔴 Missing
      <br>_not found as an eval axis_

_§103: 1 of 15 done._

---

# 104. Model rollout

- [ ] Benchmark _(revised)_ - 🟡 Partial
      <br>_packages/ai/model-registry/scripts/lifecycle-stages.mjs:16 'benchmarked' is a stage label only; no benchmark runner found in scripts or workflows_
- [ ] Shadow _(revised)_ - 🟡 Partial
      <br>_packages/ai/routing/src/auto.ts:724 shadowMirror decision computed, but no apps/web caller dispatches the shadow request_
- [x] Internal testing
      <br>_scripts/probe-models.mjs probes models, run by .github/workflows/model-probe.yml_
- [ ] Limited cohort _(revised)_ - 🟡 Partial
      <br>_packages/ai/routing/src/auto.ts:682 canary only when AGI_ROUTING_CANARY==='1'; commented off .env.example:720 - unset in production: AGI_ROUTING_CANARY_
- [ ] Feature flag - 🟡 Partial
      <br>_stage system gates a model's route, not a generic per-user flag on rollout; see §105 for the actual flag primitive_
- [ ] A/B _(revised)_ - 🟡 Partial
      <br>_packages/ai/routing/src/auto.ts:721 canaryBucket(requestId) < trafficFraction splits traffic between canary and promoted model; no experiment analysis_
- [ ] Gradual rollout - 🟡 Partial
      <br>_compile.mjs:1914 canary trafficFraction strictly between 0 and 1 is a percentage ramp; stepping is manual catalog edits, no automated ramp_
- [x] Default
      <br>_`promoted` stage, line 19_
- [x] Rollback
      <br>_`deprecated`/`removed` stages with shortcut reasons, lines 20-21, 44-58_
- [ ] Quality alerts - 🔴 Missing
      <br>_not found tied to lifecycle stage transitions_
- [ ] Cost alerts - 🟡 Partial
      <br>_cost tracking exists (COGS ledger, §101) but not confirmed wired to a model-rollout alert_
- [ ] Latency alerts - 🔴 Missing
      <br>_not found_

_§104: 3 of 12 done._

---

# 105. Feature flags

- [ ] User _(revised)_ - 🟡 Partial
      <br>_apps/web/db/neon/0016_misc.sql:25 feature_flags table read only by GDPR export (user/export/route.ts:1182); /api/me feature_flags are computed, not from table_
- [ ] Workspace - 🔴 Missing
      <br>_no org/workspace column on `feature_flags`_
- [ ] Role - 🔴 Missing
      <br>_not found_
- [ ] Plan _(revised)_ - 🟡 Partial
      <br>_apps/web/app/api/me/route.ts:100 feature_flags.advanced_model_access derived from plan tier; no generic plan-targeted flag system_
- [ ] Region - 🔴 Missing
      <br>_not found_
- [ ] Client version - 🔴 Missing
      <br>_not found_
- [ ] Percentage - 🔴 Missing
      <br>_not found_
- [ ] Kill switch - 🟡 Partial
      <br>_`managed-compute-gate.ts` is a purpose-built kill switch for managed compute, not a generic flag-driven kill switch_
- [ ] Experiment - 🔴 Missing
      <br>_not found_
- [ ] Expiration - 🔴 Missing
      <br>_no `expires_at` on `feature_flags`_
- [ ] Audit - 🔴 Missing
      <br>_no audit trail beyond `created_at`/`updated_at` on the row itself_

_§105: 0 of 11 done._

---

# 106. CI

- [ ] Formatting _(revised)_ - 🟡 Partial
      <br>_No prettier/format:check step in any workflow (eslint-config-prettier only disables rules, eslint.config.mjs:778); cargo fmt at ci.yml:593 is in rust-desktop-cli, gated to refs/heads/main (ci.yml:550)_
      <br>⛔ CI check: runs in CI and gates production deploys, but main has no branch protection or ruleset, so it does not block merges.
- [x] Lint
      <br>_`ci.yml:309` `pnpm exec turbo run lint --affected`, `--max-warnings=0`_
      <br>⛔ CI check: runs in CI and gates production deploys, but main has no branch protection or ruleset, so it does not block merges.
- [x] Typecheck
      <br>_`ci.yml:316` "Type check" step (js-verify job)_
      <br>⛔ CI check: runs in CI and gates production deploys, but main has no branch protection or ruleset, so it does not block merges.
- [x] Rust checks
      <br>_`ci.yml:540-745` `rust-desktop-cli` job: fmt gate, clippy, trust-boundary tests_
      <br>⛔ CI check: runs in CI and gates production deploys, but main has no branch protection or ruleset, so it does not block merges.
- [x] Unit tests
      <br>_`ci.yml:342` "Test" step; `ci.yml:651` Rust "Test" step_
      <br>⛔ CI check: runs in CI and gates production deploys, but main has no branch protection or ruleset, so it does not block merges.
- [x] Contract tests
      <br>_`ci.yml:698` "Cross-language sync parity (TEST-05)"; `ci.yml:537` auto-route TS/Rust conformance_
      <br>⛔ CI check: runs in CI and gates production deploys, but main has no branch protection or ruleset, so it does not block merges.
- [x] Integration tests
      <br>_`ci.yml:203-254` "Postgres migrations and RLS" job applies + verifies migrations against a real DB_
      <br>⛔ CI check: runs in CI and gates production deploys, but main has no branch protection or ruleset, so it does not block merges.
- [ ] E2E - 🟡 Partial
      <br>_`web-e2e-ci-coverage.test.ts` shows only signed-out Playwright specs run in `ci.yml`; authenticated specs (majority) skipped for lack of `CLERK_SECRET_KEY`_
      <br>⛔ CI check: runs in CI and gates production deploys, but main has no branch protection or ruleset, so it does not block merges.
- [x] Security scanning
      <br>_`ci.yml:477` Semgrep (blocking on findings), `codeql.yml` (titled "Rust Security": cargo-audit + clippy)_
      <br>⛔ CI check: runs in CI and gates production deploys, but main has no branch protection or ruleset, so it does not block merges.
- [x] Dependency scanning
      <br>_`ci.yml:435-474` `pnpm audit` critical+high blocking; `ci.yml:625-642` Rust `cargo-deny` bans/advisories_
      <br>⛔ CI check: runs in CI and gates production deploys, but main has no branch protection or ruleset, so it does not block merges.
- [x] Secret scanning
      <br>_`ci.yml:184` `pnpm check:secrets` (CRIT-017), blocking, with reviewed-fixture allowlist_
      <br>⛔ CI check: runs in CI and gates production deploys, but main has no branch protection or ruleset, so it does not block merges.
- [x] Build
      <br>_`ci.yml:390` "Build affected deployable JavaScript surfaces"_
      <br>⛔ CI check: runs in CI and gates production deploys, but main has no branch protection or ruleset, so it does not block merges.
- [x] Packaging
      <br>_`ci.yml:398` "Package browser and VS Code release artifacts"; separate `release-*.yml` workflows package CLI/desktop/mobile_
      <br>⛔ CI check: runs in CI and gates production deploys, but main has no branch protection or ruleset, so it does not block merges.

_§106: 11 of 13 done._

---

# 107. Deployment

- [x] Development
      <br>_local dev via `pnpm dev`/turbo; not a separate deploy target, N/A-adjacent but present as a mode_
- [ ] Preview _(revised)_ - 🔴 Missing
      <br>_vercel.json:9-11 git.deploymentEnabled false disables Vercel git preview deployments; no workflow runs a non-prod vercel deploy (only --prod in deploy-production.yml:286,512)_
- [ ] Staging - 🔴 Missing
      <br>_No dedicated staging environment/workflow found; only production + preview + the sandbox origin (`deploy-production.yml:402-576`, a separate isolated surface, not a staging gate)_
- [ ] Production _(revised)_ - 🟡 Partial
      <br>_`deploy-production.yml` exists, but the last successful production deploy was 11 Sep 2026; every production-web deployment since errored or awaits approval (GitHub deployment statuses; `vercel inspect`)._
- [ ] Canary - 🔴 Missing
      <br>_No canary/percentage-based traffic shift found in `deploy-production.yml` or `vercel.json`_
- [ ] Rolling deployment - 🟡 Partial
      <br>_Vercel promote-then-verify (`deploy-production.yml:296-338`) is atomic cutover, not a rolling multi-instance rollout_
- [x] Health check
      <br>_`deploy-production.yml:34-73` alarm job + `:329` "Verify the production serving path"_
- [x] DB migration
      <br>_`deploy-production.yml:211-217` `pnpm db:migrate -- verify` before deploy_
- [ ] Worker migration - 🔴 Missing
      <br>_No separate worker/queue-consumer version-compat step found distinct from the web deploy job_
- [ ] Version compatibility - 🟡 Partial
      <br>_`deploy-production.yml:338` "Record the migration state this deployment serves" implies compat tracking, but no explicit N/N-1 client check_
- [x] Rollback
      <br>_`deploy-production.yml:346` "Roll back to the last verified production deployment"_
- [ ] Feature flag fallback _(revised)_ - 🟡 Partial
      <br>_Env kill-switches with fallback paths exist: apps/web/lib/workflows/durable-initial-turns.ts:5-19 (AGI_DURABLE_INITIAL_TURNS falls back to request-scoped turns), lib/managed-compute-gate.ts:49; no runtime flag service_

_§107: 4 of 12 done._

---

# 108. Zero-downtime migrations

- [x] Expand
      <br>_`apps/web/db/neon/*.sql` - 192 forward migrations, additive-first naming pattern_
- [x] Dual read/write where needed _(revised)_ ⛔ **not live**
      <br>_apps/web/db/neon/0182_managed_usage_microusd_ledger.sql:186-200 mirror triggers keep cents and microUSD columns consistent for writers that never moved (dual write)_
      <br>⛔ Release check: Production web is the 11 Sep 2026 deployment (about 1,000 commits behind main); every production deploy since errored or awaits approval.
- [x] Backfill _(revised)_ ⛔ **not live**
      <br>_apps/web/db/neon/0182_managed_usage_microusd_ledger.sql:73 bounded-batch idempotent backfill; 28 migrations contain backfills (e.g. 0038, 0041, 0042)_
      <br>⛔ Release check: Production web is the 11 Sep 2026 deployment (about 1,000 commits behind main); every production deploy since errored or awaits approval.
- [x] Verify
      <br>_`.github/workflows/deploy-production.yml:214` `pnpm db:migrate -- verify`; `ci.yml:245` "Apply and verify canonical Postgres migrations"_
- [ ] Switch - 🟡 Partial
      <br>_Deploy promotes the built artifact after migration verify (`deploy-production.yml:296`), but no explicit code path documents a "switch" step separate from migration apply_
- [ ] Contract - 🟡 Partial
      <br>_down/\*.down.sql are reversals, not contract steps; real contract steps exist ad hoc (0193_user_memories_drop_transition_index.sql, 0026 drops email after hashing) with no systematic contract phase_
- [x] Rollback plan
      <br>_`apps/web/db/neon/down/` directory (98 files) + `deploy-production.yml:346` deployment-level rollback_

_§108: 5 of 7 done._

---

# 109. Cross-version testing

- [ ] New web plus old backend - 🔴 Missing
      <br>_Searched `apps/web/e2e`, `apps/web/__tests__` for version-pinned backend compat specs; none found_
- [ ] Old mobile plus new backend - 🔴 Missing
      <br>_Searched `apps/mobile/__tests__`, detox config for backend-version pinning; none found_
- [ ] Old desktop plus new backend - 🔴 Missing
      <br>_Searched `apps/desktop/e2e`, `wdio` for backend-version pinning; none found_
- [ ] New CLI plus old VS Code _(revised)_ ⛔ **not live** - 🟡 Partial
      <br>_crates/agiworkforce-protocol/src/developer_session.rs:34 CLI answers protocol versions [8,7] (N-1) with test at :1311; no actual old-extension skew suite_
      <br>⛔ Release check: Users can install only CLI v1.0.0 (3 May 2026); source is 1.7.1; not on npm.
- [ ] Old CLI plus new VS Code _(revised)_ ⛔ **not live** - 🟡 Partial
      <br>_apps/extension-vscode/src/integrations/localRuntimeClient.ts:52-70 enforces MINIMUM_SUPPORTED_CLI_VERSION 1.7.1 with update guidance; no old-CLI runtime skew test_
      <br>⛔ Release check: The VS Code extension has never been published (Marketplace and Open VSX return nothing; release workflow never run).
- [ ] New Mobile Remote plus old host _(revised)_ ⛔ **not live** - 🟡 Partial
      <br>_apps/mobile/services/manualPairing.ts:22 detects legacy Desktop QR scheme and asks user to update Desktop (connectionStore.ts:579,889; tested in **tests**/connection-watchdog.test.ts); no broader skew suite_
      <br>⛔ Release check: The mobile app has never been released (release-mobile.yml never run; no App Store or Google Play listing).
- [ ] Old Remote plus new host - 🔴 Missing
      <br>_Same, no reverse case found_
- [ ] New Chrome plus old bridge - 🔴 Missing
      <br>_`apps/extension/native-host` has no version-skew test against older bridge builds_
- [ ] Old Chrome plus new bridge - 🔴 Missing
      <br>_Same; only `crates/agiworkforce-protocol` carries a `protocol.rs` version concept, not an old/new client test matrix_

_§109: 0 of 9 done._

---

# 110. Cross-surface E2E (automated)

- [ ] Start Chat on Web - 🔴 Missing
      <br>_`apps/web/__tests__/web-e2e-ci-coverage.test.ts` shows only signed-out specs run in CI; a chat-start-then-continue chain needs auth, which is excluded_
- [ ] Continue Mobile - 🔴 Missing
      <br>_No test found chaining a web-created session into a mobile Detox run_
- [ ] Continue Desktop - 🔴 Missing
      <br>_`e2e-tests.yml` (Desktop E2E) is a standalone weekly/manual desktop smoke, not chained from web/mobile_
- [ ] Project sync - 🔴 Missing
      <br>_No cross-surface project-sync E2E spec found_
- [ ] File upload - 🔴 Missing
      <br>_Same - no cross-surface chain_
- [ ] Library - 🔴 Missing
      <br>_Same_
- [ ] Research - 🔴 Missing
      <br>_Same_
- [ ] Work - 🔴 Missing
      <br>_Same_
- [ ] Schedule - 🔴 Missing
      <br>_Same_
- [ ] Connector - 🔴 Missing
      <br>_Same_
- [ ] Start AGI Code Desktop - 🔴 Missing
      <br>_Same_
- [ ] Continue CLI - 🔴 Missing
      <br>_Same_
- [ ] Continue VS Code - 🔴 Missing
      <br>_Same_
- [ ] Attach Mobile Remote - 🔴 Missing
      <br>_Same_
- [ ] Approve remotely - 🔴 Missing
      <br>_Same_
- [ ] Browser verification - 🔴 Missing
      <br>_Same_
- [ ] Generated file - 🔴 Missing
      <br>_Same_
- [ ] Save to Library - 🔴 Missing
      <br>_Same_

_§110: 0 of 18 done._

---

# 111. Security testing

- [x] SAST
      <br>_`ci.yml:477` Semgrep, blocking on unaccepted findings_
- [ ] DAST - 🔴 Missing
      <br>_Searched `.github/workflows` for zap-baseline/DAST scanners; none found_
- [x] Dependency scan
      <br>_`ci.yml:435-474` `pnpm audit`; `ci.yml:625-642` `cargo-deny`_
- [ ] Container scan - 🔴 Missing
      <br>_Repo ships real images apps/web/Dockerfile and services/signaling-server/Dockerfile (web-container-drill.yml builds one) yet no trivy/grype/scout scan in any workflow_
- [ ] IaC scan - 🔴 Missing
      <br>_Searched for checkov/tfsec; no IaC directory or scanner found_
- [x] Secret scan
      <br>_`ci.yml:184` `pnpm check:secrets`, blocking_
- [ ] Pen test - ⚪ External
      <br>_`SECURITY.md` names a security contact/disclosure path; no repo artifact proves a completed third-party pen test_
- [ ] Red-team agent tools - 🟡 Partial
      <br>_.agents/skills/claude-security does not exist; red-team regression tests apps/web/**tests**/security/rt-01..rt-05 and agent-privilege-gates.test.ts exist, no standing adversarial harness_
- [x] Prompt-injection tests
      <br>_`apps/web/__tests__/security/rt-03-prompt-injection.test.ts`, `lib/support/agent/__tests__/injection.test.ts`_
- [x] Tenant-escape tests
      <br>_`ci.yml:251` `pnpm db:rls-probe -- --target ci`; `__tests__/security/platform-admin-routes.test.ts`_
- [x] Remote-Control tests _(revised)_ ⛔ **not live**
      <br>_services/signaling-server/**tests**/websocket/origin-policy.test.ts:124-183 (origin, secret, rate-limit) and pair-token.test.ts cover the Remote relay; apps/mobile/**tests**/manual-pairing.test.ts_
      <br>⛔ Release check: The mobile app has never been released (release-mobile.yml never run; no App Store or Google Play listing).
- [x] Browser tests
      <br>_`apps/desktop/src-tauri/tests/browser_automation_test.rs`, `electron/__tests__/browserBridge.test.ts`_
- [x] Computer-use tests ⛔ **not live**
      <br>_browserAutomation.test.ts is browser automation; computer-use coverage is apps/desktop/electron/**tests**/computerUseProtocol.test.ts and apps/extension/**tests**/computer-use-agent-loop.test.ts_
      <br>⛔ Release check: The Electron desktop has never been released (release-desktop-cloud.yml never run). The Chrome extension has never been published (release workflow never run; no v-ext tag).

_§111: 8 of 13 done._

---

# 112. Compliance readiness

- [ ] SOC 2 Type I - 🔴 Missing
      <br>_`apps/web/app/security/page.tsx:345-347` "No SOC 2 Type I or Type II report exists. No audit is underway."_
- [ ] SOC 2 Type II - 🔴 Missing
      <br>_same citation_
- [ ] ISO 27001 - 🔴 Missing
      <br>_`apps/web/app/security/page.tsx:349` "Not certified. No certification body engaged."_
- [x] GDPR
      <br>_`apps/web/app/trust/page.tsx:59-64` data-subject-rights and Article 27 rows rated against actual erasure-scoped table count (per changelog note, corrected from 34 to 66 tables)_
- [x] CCPA/CPRA
      <br>_`apps/web/app/trust/page.tsx:69` access-and-deletion row_
- [x] DPA
      <br>_`apps/web/app/dpa` page exists_
- [x] SCC _(revised)_
      <br>_apps/web/app/dpa/page.tsx:411-429 incorporates EU SCCs (Decision 2021/914) with UK Addendum and Swiss adaptations._
- [ ] HIPAA/BAA if offered _(revised)_ - ⚪ N/A
      <br>_apps/web/app/security/page.tsx:351-353 states AGI is not offered for PHI and signs no BAAs; item applies only if offered._
- [ ] Data residency - 🔴 Missing
      <br>_see §65 - no residency controls exist_
- [x] Legal hold
      <br>_`apps/web/app/api/settings/organization/legal-holds/route.ts`, `apps/web/lib/services/retention-service.ts` legal-hold gating_
- [ ] EDiscovery - 🟡 Partial
      <br>_legal hold exists but no eDiscovery search/export tooling (§62)_
- [ ] DLP - 🔴 Missing
      <br>_see §62 - no DLP integration found_
- [ ] SIEM _(revised)_ - 🟡 Partial
      <br>_audit-streaming-service.ts drain exists but upsertAuditDestination has no route or UI caller (tests only), so no workspace can enable SIEM streaming._
- [ ] CMEK - 🔴 Missing
      <br>_`key-rotation-runbook.test.ts` heading "Accepted risk: no KMS, no escrow" (§64)_
- [x] IP allowlists
      <br>_`apps/web/lib/services/ip-allow-list.ts` (§59, §66)_

_§112: 6 of 15 done._

---

# 113. Trust center

- [x] Security overview
      <br>_`apps/web/app/security/page.tsx` full page with per-mode (Local/Managed/BYOK) boundary descriptions_
- [x] Privacy
      <br>_`apps/web/app/privacy` page_
- [x] Encryption
      <br>_apps/web/app/security/page.tsx:36-37 'Encryption in transit' and 'Encryption at rest' sections; line 53 is Local-mode runtime copy._
- [x] Data use
      <br>_`apps/web/app/trust/page.tsx` subprocessor/data-flow descriptions_
- [x] Retention
      <br>_`apps/web/app/trust/page.tsx:397` "Retention consolidated to a single enforced answer"_
- [x] Subprocessors
      <br>_`apps/web/app/subprocessors` page, cross-linked from both trust and security pages_
- [x] Certifications
      <br>_`apps/web/app/security/page.tsx:345-349` explicitly states none held_
- [x] Residency _(revised)_
      <br>_Residency documented: apps/web/app/trust/page.tsx:114-116 'All hosting is in the United States'; security/page.tsx:71,95 Neon and Clerk US; /subprocessors lists regions._
- [x] Vulnerability reporting _(revised)_
      <br>_apps/web/app/security/page.tsx:593-605 monitored security mailbox; apps/web/app/.well-known/security.txt; SECURITY.md:7-18 private advisory flow, 3-business-day acknowledgement._
- [x] Status
      <br>_`apps/web/app/status` page exists_
- [x] Compliance docs
      <br>_`docs/compliance/README.md`, `enterprise-order-form-template.md`, `dpa`, `directory-sync.md`, `enterprise-msa-draft.md`_

_§113: 11 of 11 done._

---

# 114. Support

- [x] Help Center
      <br>_`apps/web/app/help/page.tsx`_
- [ ] Search - 🟡 Partial
      <br>_No search input/query wiring found directly in `app/help/page.tsx`; support search may live only in the agent retrieval layer (`lib/support/agent/retrieval`)_
- [ ] In-product support _(revised)_ - 🟡 Partial
      <br>_SupportWidgetMount.tsx:12 renders only if NEXT_PUBLIC_SUPPORT_WIDGET_ENABLED==='1'; .env.example:395-397 says defaults off, endpoints not all built - unset in production: NEXT_PUBLIC_SUPPORT_WIDGET_ENABLED_
- [ ] Ticketing - 🟡 Partial
      <br>_No dedicated ticket-object store found; `lib/support/handoff/store.ts` tracks handoff records, not a full ticket lifecycle_
- [ ] Diagnostic attachment _(revised)_ - 🔴 Missing
      <br>_No diagnostic collection or attachment in app/support, features/support or lib/support; mobile feedback route stores text only (app/api/mobile/feedback/route.ts)_
- [ ] Billing support _(revised)_ - 🟡 Partial
      <br>_support handoff reached only via SupportPanel under widget gated by NEXT_PUBLIC_SUPPORT_WIDGET_ENABLED (SupportWidgetMount.tsx:12), default off .env.example:397 - unset in production: NEXT_PUBLIC_SUPPORT_WIDGET_ENABLED_
- [ ] Technical support _(revised)_ - 🟡 Partial
      <br>_lib/support/agent only reached via support-client from widget; SupportWidgetMount.tsx:12 env gate default off (.env.example:395-397)_
- [ ] Enterprise priority _(revised)_ - 🟡 Partial
      <br>_lib/support/handoff/config.ts has no priority/tier routing; supportTier is only recorded in enterprise contract metadata (lib/services/enterprise-billing-service.ts:197,222) and never read by support_
- [x] Status integration
      <br>_`apps/web/app/status/page.tsx:16-40` live, self-hosted health-check status page (`lib/server/health-check.ts`)_
- [x] Abuse reporting
      <br>_apps/web/app/api/content-report/route.ts called from features/chat/components/messages/MessageBubble.tsx; mobile via services/contentReport.ts_
- [x] Security contact
      <br>_`/Users/siddhartha/Desktop/agiworkforce/SECURITY.md`_

_§114: 4 of 11 done._

---

# 115. Documentation

- [x] Product
      <br>_`docs/product/` directory_
- [ ] Admin - 🔴 Missing
      <br>_Searched `docs/` for an admin-surface guide; none found (only `apps/web/app/admin` code, no doc)_
- [x] Security
      <br>_`docs/security/security.md`, `SECURITY.md`_
- [x] Architecture
      <br>_`/Users/siddhartha/Desktop/agiworkforce/ARCHITECTURE.md`, `docs/architecture/`_
- [x] Web
      <br>_`apps/web/AGENTS.md`, `apps/web/CLAUDE.md`_
- [ ] Mobile - 🟡 Partial
      <br>_Only `store-listing/REVIEWER-NOTES-*.md`; no dev-facing apps/mobile AGENTS.md/README_
- [ ] Desktop - 🟡 Partial
      <br>_`apps/desktop/docs/macos-release-runbook.md` + docs qa folder; no top-level `AGENTS.md`/README for the app_
- [x] CLI
      <br>_`apps/cli/README.md`_
- [x] VS Code
      <br>_`apps/extension-vscode/README.md`, `docs/CONTRIBUTING-NOTES.md`_
- [x] Chrome
      <br>_`apps/extension/README.md`, `apps/extension/docs/` (audit, listing, publish runbook, threat model)_
- [ ] Remote - 🟡 Partial
      <br>_No dedicated Remote-Control doc found distinct from mobile companion feature code_
- [x] MCP
      <br>_`docs/development/connectors-setup.md` covers MCP/connector setup_
- [x] Plugin
      <br>_`docs/development/plugins-directory.md`_
- [x] Skill
      <br>_.agents/skills are internal contributor skills; product skill authoring is documented at apps/cli/README.md:216-221 (SKILL.md layout, progressive disclosure, consent gating)_
- [x] Connector
      <br>_`docs/development/connectors-setup.md`_
- [ ] API - 🟡 Partial
      <br>_`apps/web/app/api-docs/` page exists; no standalone docs api folder reference found_
- [ ] Troubleshooting - 🔴 Missing
      <br>_Searched repo (excluding vendored VS Code test fixtures) for a troubleshooting doc; none found_
- [x] Release notes
      <br>_`/Users/siddhartha/Desktop/agiworkforce/CHANGELOG.md`_

_§115: 12 of 18 done._

---

# 116. Release management

- [x] Semantic/version policy
      <br>_Policy is enforced, not just stated: release-desktop.yml:139 requires stable SemVer for stable channel; release-mobile.yml:46 and release-vscode-extension.yml:46 require exact semver tags_
- [x] Changelog
      <br>_`CHANGELOG.md`, actively maintained (last updated 2026-09-14)_
- [x] Release notes
      <br>_CHANGELOG.md entries are all Unreleased; per-release notes are generated into the GitHub release body at release-desktop.yml:242-261 and published by release-cli.yml:373_
- [x] Known issues
      <br>_`/Users/siddhartha/Desktop/agiworkforce/ACTIVE_ISSUES.md`_
- [ ] Migration notes - 🟡 Partial
      <br>_DB migration files exist (`apps/web/db/neon/*.sql`) but no separate human migration-notes doc found_
- [ ] Beta _(revised)_ - 🟡 Partial
      <br>_Workflows handle prereleases, but no beta release of any surface has ever been cut (git tags, `gh release list`)._
- [ ] Stable _(revised)_ - 🟡 Partial
      <br>_Only two stable releases exist, CLI v1.0.0 and Tauri desktop v1.2.0 (May 2026); `release-cli.yml` and `release-desktop.yml` last runs failed._
- [ ] Deprecation - 🟡 Partial
      <br>_`docs/development/execution-state.md`, `docs/compliance/dpdp-audit-log.md` mention deprecation ad hoc; no formal deprecation policy doc_
- [ ] Minimum client version _(revised)_ ⛔ **not live** - 🟡 Partial
      <br>_apps/extension-vscode/src/integrations/localRuntimeClient.ts:52 MINIMUM_SUPPORTED_CLI_VERSION enforced at runtime; no minimum client version for web/mobile/desktop against the backend_
      <br>⛔ Release check: The VS Code extension has never been published (Marketplace and Open VSX return nothing; release workflow never run).
- [ ] Rollout percentage - 🔴 Missing
      <br>_Searched for phased/percentage rollout mechanism in web deploy or mobile `eas.json`; only `releaseStatus: draft` (manual gate, not %)_
- [x] Rollback
      <br>_`deploy-production.yml:346`; Tauri/electron auto-updaters support previous-version reinstall_

_§116: 5 of 11 done._

---

# 117. Desktop distribution

- [ ] MacOS arm64 _(revised)_ - 🟡 Partial
      <br>_Configured in `electron-builder.yml:44`, but no macOS build has been released: Tauri v1.2.0 is Linux-only (macOS deferred for missing Apple signing secrets) and Electron was never released._
- [ ] MacOS x64 _(revised)_ - 🟡 Partial
      <br>_Configured in `electron-builder.yml:44`, but no macOS x64 build has been released._
- [ ] Windows x64 _(revised)_ - 🟡 Partial
      <br>_Configured (`tauri.conf.json`, `build-windows-release.yml`), but no Windows build has been released; that workflow last ran 6 Mar 2026 and failed._
- [ ] Windows ARM64 when supported _(revised)_ - 🔴 Missing
      <br>_Desktop Windows build is x64 nsis only (build-windows-release.yml:284 on windows-latest); release-desktop.yml:3-4 ships only Linux x86_64 and macOS; aarch64-pc-windows exists only for the CLI_
- [ ] Code signing _(revised)_ - 🟡 Partial
      <br>_Signing configured (`electron-builder.yml:49`, `tauri.conf.json:83`), but no signed macOS or Windows build has been produced._
- [ ] Notarization _(revised)_ - 🟡 Partial
      <br>_`notarize: true` in `electron-builder.yml:60`, but no notarized build exists; the only desktop release is Linux._
- [ ] Installer _(revised)_ - 🟡 Partial
      <br>_dmg and nsis installers are configured, but the only released installers are Linux AppImage, deb and rpm (v-desktop-1.2.0)._
- [x] Auto updater
      <br>_`electron/desktopCloudUpdate.ts`; Tauri `updater.endpoints`/`pubkey` (`tauri.conf.json:99-104`)_
- [x] Update signing
      <br>_`tauri.conf.json:103` minisign pubkey embedded for updater verification_
- [ ] Rollback _(revised)_ - 🟡 Partial
      <br>_apps/web/app/api/releases/[target]/[version]/route.ts:51-52 serves only a strictly newer latest release; updater cannot downgrade, rollback means shipping a higher version or manual reinstall_
- [ ] Enterprise deployment - 🔴 Missing
      <br>_Searched for MDM/Intune/pkg-deployment config for the desktop shells; none found_

_§117: 2 of 11 done._

---

# 118. Mobile distribution

- [ ] App Store _(revised)_ - 🟡 Partial
      <br>_Submission config in `apps/mobile/eas.json:117-132`, but no App Store listing exists: production /mobile says "No listing on the App Store or Google Play"; `release-mobile.yml` never run._
- [ ] Play Store _(revised)_ - 🟡 Partial
      <br>_Android submit config in `eas.json`, but no Google Play listing exists; `release-mobile.yml` never run._
- [ ] Signing _(revised)_ - 🟡 Partial
      <br>_EAS-managed credentials configured, but no signed store build has been produced._
- [x] Privacy manifest ⛔ **not live**
      <br>_apps/mobile/app.config.js:90-94 privacyManifests declares NSPrivacyAccessedAPITypes; ios/AGIWorkforce/PrivacyInfo.xcprivacy is untracked prebuild output_
      <br>⛔ Release check: release-mobile.yml:4-10 needs a v-mobile-* tag; git ls-remote origin has none, so no store/TestFlight build ever produced
- [x] Data safety ⛔ **not live**
      <br>_`store-listing/android/data-safety.json`_
      <br>⛔ Release check: release-mobile.yml:4-10 needs a v-mobile-* tag; git ls-remote origin has none, so no store/TestFlight build ever produced
- [x] Store privacy ⛔ **not live**
      <br>_Same data-safety + xcprivacy artifacts_
      <br>⛔ Release check: release-mobile.yml:4-10 needs a v-mobile-* tag; git ls-remote origin has none, so no store/TestFlight build ever produced
- [ ] Push credentials ⛔ **not live** - 🟡 Partial
      <br>_`expo-notifications` integrated in-app; no explicit APNs/FCM credential config found in `eas.json`/`app.config.js` beyond default EAS handling_
      <br>⛔ Release check: The mobile app has never been released (release-mobile.yml never run; no App Store or Google Play listing).
- [x] Universal links ⛔ **not live**
      <br>_`app.config.js:37,69` `associatedDomains: ['applinks:agiworkforce.com']`_
      <br>⛔ Release check: release-mobile.yml:4-10 needs a v-mobile-* tag; git ls-remote origin has none, so no store/TestFlight build ever produced
- [x] App links ⛔ **not live**
      <br>_`app.config.js:166,189` Android `intentFilters` with `autoVerify: true`_
      <br>⛔ Release check: release-mobile.yml:4-10 needs a v-mobile-* tag; git ls-remote origin has none, so no store/TestFlight build ever produced
- [x] Screenshots ⛔ **not live**
      <br>_store-listing/screenshots/captures is gitignored (apps/mobile/.gitignore:18); capability is the Detox capture pipeline apps/mobile/package.json:42-47 scripts/screenshots/pipeline.ts_
      <br>⛔ Release check: release-mobile.yml:4-10 needs a v-mobile-* tag; git ls-remote origin has none, so no store/TestFlight build ever produced
- [ ] Review compliance _(revised)_ - 🟡 Partial
      <br>_Reviewer notes exist (`store-listing/REVIEWER-NOTES-IOS.md`), but the app has never been submitted for review._
- [ ] Phased rollout - 🟡 Partial
      <br>_`releaseStatus: "draft"` only in `eas.json:130,139`; no staged rollout, and no release has been made._

_§118: 6 of 12 done._

---

# 119. Extension distribution

- [ ] VS Code Marketplace _(revised)_ - 🟡 Partial
      <br>_`release-vscode-extension.yml:127-193` can publish, but it has never run; the Marketplace returns 0 results for agiworkforce.agi-workforce._
- [ ] VSIX _(revised)_ - 🟡 Partial
      <br>_CI packages a VSIX (`ci.yml:398`), but none has been published or attached to a release._
- [ ] Chrome Web Store _(revised)_ - 🟡 Partial
      <br>_`release-chrome-extension.yml:145-207` can submit, but it has never run and no v-ext tag exists; no store listing._
- [ ] Publisher identity _(revised)_ - 🟡 Partial
      <br>_`"publisher": "agiworkforce"` in `apps/extension-vscode/package.json:6`; no published item proves the Marketplace or Chrome Web Store publisher accounts._
- [x] Permissions disclosure ⛔ **not live**
      <br>_`apps/extension/manifest.json:10-31` explicit `permissions`/`host_permissions`/`optional_host_permissions`; `apps/extension/docs/chrome-web-store-listing.md`_
      <br>⛔ Release check: release-chrome-extension.yml:4-10 needs v-ext-* tag; none on origin; never submitted to Chrome Web Store
- [x] Privacy disclosure ⛔ **not live**
      <br>_apps/extension/docs/chrome-web-store-listing.md:94-118 data-use disclosures and privacy policy URL; the audit and threat-model docs are not the store disclosure_
      <br>⛔ Release check: release-chrome-extension.yml:4-10 needs v-ext-* tag; none on origin; never submitted to Chrome Web Store
- [ ] Changelog _(revised)_ - 🟡 Partial
      <br>_No apps/extension-vscode/CHANGELOG.md (and .vscodeignore:54 excludes one), so Marketplace changelog is empty; root CHANGELOG.md covers extensions only in Unreleased entries_
- [ ] Auto update _(revised)_ - 🟡 Partial
      <br>_Store auto-update would apply, but neither extension is in a store._
- [ ] Enterprise installation - 🔴 Missing
      <br>_Searched for Chrome `ExtensionSettings`/force-install policy or VS Code Marketplace enterprise-gallery config; none found_

_§119: 2 of 9 done._

---

# 120. Cost architecture (per feature)

- [x] Inference
      <br>_`capability = 'chat'` (`0127_cogs_ledger.sql:28`)_
- [x] Search _(revised)_
      <br>_apps/web/lib/web-search/perplexity-search-cost.ts:67 writes provider_cost_events rows with feature web_search_perplexity (grounding-cost.ts:78 likewise), a distinct line item_
- [ ] Storage - 🔴 Missing
      <br>_no storage-cost capability in the enum_
- [ ] Database - 🔴 Missing
      <br>_no DB-compute cost tracked_
- [ ] Vector DB - 🔴 Missing
      <br>_no vector-DB cost tracked_
- [x] Voice _(revised)_ ⛔ **not live**
      <br>_apps/web/lib/voice/live-voice-backend-cost.ts:94 records live voice backend cost; voice sessions settle via finalizeManagedUsageRequest (voice/live/sessions/route.ts:241)_
      <br>⛔ Release check: Production web is the 11 Sep 2026 deployment (about 1,000 commits behind main); every production deploy since errored or awaits approval.
- [x] Images
      <br>_`capability = 'image'`, unit `image`_
- [ ] Browser - 🟡 Partial
      <br>_nearest proxy is `'computer_use'`; no distinct "browser" cost line_
- [ ] Work compute - 🔴 Missing
      <br>_no distinct Work-surface compute cost capability_
- [x] Code compute _(revised)_
      <br>_apps/web/lib/e2b/compute-metering.ts:186 meters E2B sandbox compute (sandbox capability) priced from model-registry/catalog/provider-compute-pricing.json e2b vCPU/GiB rates_
- [ ] Notifications - 🔴 Missing
      <br>_not tracked_
- [ ] Email - 🔴 Missing
      <br>_not tracked_
- [ ] Egress - 🔴 Missing
      <br>_no egress-cost tracking found_

_§120: 5 of 13 done._

---

# 121. Cost optimization

- [x] Prompt caching
      <br>_`packages/ai/provider-protocol/src/system-prompt-cache-boundary.ts`, `apps/web/lib/prompt-cache-helper.ts`, registry `cacheReadPerMillion`/`cacheWritePerMillion` pricing_
- [ ] Semantic caching where safe - 🔴 Missing
      <br>_searched "semanticCache" - no hits_
- [x] Router
      <br>_`packages/ai/routing/src/auto.ts` selects cheapest eligible route by policy_
- [x] Cheap-model classification
      <br>_`packages/ai/routing/src/classify.ts`, `free-auto.ts`_
- [x] Context trimming
      <br>_`apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.ts`_
- [x] Context compaction
      <br>_same file; also `'context-compacted'` protocol event (`AgentEvent.ts:50`)_
- [ ] Batch processing - 🔴 Missing
      <br>_searched "batchProcess"/"BatchRequest" - no provider batch-API usage found_
- [ ] File deduplication - 🔴 Missing
      <br>_searched "fileDedup"/"dedupe.\*upload" - no hits_
- [x] Storage lifecycle _(revised)_
      <br>_vercel.json crons purge-deleted-media, purge-temporary-chats, enforce-workspace-retention and enforce-billing-retention implement storage lifecycle sweeps_
- [x] Provider arbitrage _(revised)_
      <br>_packages/ai/routing/src/auto.ts:1015-1041 ranks equivalent routes for one model across providers and picks the cheapest; 24 registry models have multiple routes_
- [x] Timeouts
      <br>_`provider-runtime/src/watchdog.ts`_
- [x] Loop limits
      <br>_`apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts`, `tool-loop.ts` bound iteration counts_
- [x] Per-plan budgets
      <br>_`MANAGED_USAGE_LIMITS` (`managed-usage-caps.ts:10-46`), `budgetRemainingCents` router input_

_§121: 10 of 13 done._

---

# 122. Scalability

- [ ] Millions of users - 🔴 Missing
      <br>_no load-test scripts found; searched `load-test`, `k6`, none in repo (target/build artifacts excluded)_
- [ ] Millions of conversations - 🔴 Missing
      <br>_no partitioning/sharding strategy found for `web_conversations` beyond normal Postgres indexing_
- [ ] Billions of messages - 🔴 Missing
      <br>_same, no sharding/partitioning found for `web_messages`_
- [ ] Large files - 🟡 Partial
      <br>_streaming upload/presigned PUT exists (`object-storage/src/presign.ts`), not load-tested_
- [ ] High concurrent streaming - 🟡 Partial
      <br>_SSE/streaming chat path exists (`route.ts`), no concurrency ceiling test found_
- [ ] High queue volume - 🔴 Missing
      <br>_no queue-volume test found_
- [ ] Long-running agents - 🟡 Partial
      <br>_durable workflow transport (§89) is designed for this; no long-duration load test found_
- [ ] Large enterprise tenants - 🔴 Missing
      <br>_no tenant-scale test found_
- [ ] Thousands of connectors - 🔴 Missing
      <br>_connector directory is data-driven (`apps/web/lib/connectors/directory`), no scale test_
- [ ] Large Remote fleet - 🔴 Missing
      <br>_not found_
- [ ] Provider rate limits - 🔴 Missing
      <br>_breaker profiles (§89) react to rate limits per-credential, not tested at fleet scale_

_§122: 0 of 11 done._

---

# 123. Capacity planning

- [ ] DB connections - 🟡 Partial
      <br>_pool size configurable (`DatabaseConnectionConfig.poolSize` `packages/platform/data-layer/src/types.ts:47`), no documented capacity target_
- [ ] Queue workers - 🔴 Missing
      <br>_no worker-count/concurrency config found for durable workflows_
- [ ] CPU - 🔴 Missing
      <br>_not tracked in-repo (Vercel Functions config, not verified)_
- [ ] Memory - 🔴 Missing
      <br>_not tracked in-repo_
- [ ] Storage - 🔴 Missing
      <br>_no storage-capacity monitoring found_
- [ ] CDN - 🔴 Missing
      <br>_not tracked in-repo (Vercel-managed)_
- [ ] WebSockets/SSE - 🟡 Partial
      <br>_SSE chat streaming exists; no connection-capacity limit found_
- [ ] Remote relays - 🔴 Missing
      <br>_not found_
- [ ] Browser workers - 🔴 Missing
      <br>_not found_
- [ ] Provider quotas - 🟡 Partial
      <br>_per-provider spend/usage tracking exists (`spend-limit-service.ts`), which is adjacent to quota management_
- [ ] Notification limits - 🟡 Partial
      <br>_rate limiting exists generically (`withRateLimit`), not confirmed applied to notification dispatch specifically_

_§123: 0 of 11 done._

---

# 124. Vendor neutrality (abstract)

- [x] Models
      <br>_`packages/ai/model-registry` + `routing` abstract every model behind a registry entry_
- [x] Model providers
      <br>_`packages/ai/routing/src/auto.ts` routes across providers with fallback_
- [x] Auth
      <br>_packages/platform/identity IdentityProvider used by apps/web/proxy.ts:25 and lib/auth-guards.ts:11; data-layer AuthAdapter has no production caller_
- [x] Database
      <br>_`DatabaseAdapter` neon/postgres `data-layer/src/factory.ts`_
- [x] Object storage
      <br>_`s3`/`memory`/`none` providers, R2-compatible endpoint `object-storage/src/config.ts:20-22`_
- [ ] Queue - 🟡 Partial
      <br>_durable transport is Vercel Workflow-specific; no alternate queue adapter found_
- [ ] Search - 🔴 Missing
      <br>_search is direct SQL, not behind a provider-swappable interface (§81)_
- [ ] Vector store - 🔴 Missing
      <br>_no vector store exists to abstract (§80/§82)_
- [ ] Email - 🟡 Partial
      <br>_`notification-email-service.ts` - provider not confirmed abstracted behind an interface, likely a single SMTP/API vendor_
- [x] Push
      <br>_`web-push-service.ts` uses the W3C Web Push standard, not a single vendor SDK_
- [ ] Billing - 🟡 Partial
      <br>_Stripe-specific webhook/service (`apps/web/app/api/stripe-webhook`), no billing-provider abstraction layer found_
- [ ] Analytics - 🔴 Missing
      <br>_desktop (apps/desktop/src-tauri/src/sys/telemetry/collector.rs:165) and VS Code telemetry post to configurable endpoints, but no analytics abstraction or web pipeline_
- [x] Observability
      <br>_OTel-based bridge (`otel-span-bridge.ts`) is vendor-neutral; Sentry is one exporter among possible others_
- [ ] Sandboxes _(revised)_ - 🟡 Partial
      <br>_apps/web/lib/e2b/types.ts:65 E2BExecutor interface, vendor-named; @e2b imported directly in e2b/runtime.ts:151; cited provider-proxy.ts is the model-key proxy_
- [ ] Browser execution _(revised)_ - 🟡 Partial
      <br>_packages/tools/browser-tool/src/types.ts:4 shared BrowserAction vocabulary has no app consumer; each surface implements its own browser driver_

_§124: 7 of 15 done._

---

# 125. Migration readiness

Be able to migrate:

- [x] Database
      <br>_logical drill proves Postgres-host portability, `scripts/db-restore-drill-logical.mjs`, `docs/runbooks/database-backup-restore.md:9-16`_
- [ ] Auth - 🟡 Partial
      <br>_`AuthAdapter` interface exists (§124) but no documented Clerk-export migration path_
- [ ] Storage - 🟡 Partial
      <br>_provider abstraction exists (§124); no bucket-to-bucket migration script found_
- [ ] Search - 🔴 Missing
      <br>_nothing to migrate away from since search is inline SQL, but that also means no abstraction to swap (see §124)_
- [ ] Vector store - 🔴 Missing
      <br>_N/A target, none exists to migrate_
- [x] Model provider
      <br>_routing/model-registry is explicitly designed for provider swap (§104, §124)_
- [ ] Billing - 🔴 Missing
      <br>_Stripe-specific, no abstraction or export path found_
- [ ] Queue - 🔴 Missing
      <br>_Vercel Workflow-specific, no alternate-queue migration path found_
- [ ] Analytics - 🔴 Missing
      <br>_N/A, no analytics pipeline exists to migrate_
- [ ] Observability - 🟡 Partial
      <br>_OTel export is swappable (`otel-config.ts`), Sentry itself is not behind the same abstraction_
- [ ] CDN - 🔴 Missing
      <br>_not addressed in-repo (Vercel-managed)_
- [ ] Hosting - 🟡 Partial
      <br>_.github/workflows/web-container-drill.yml weekly boot of apps/web/Dockerfile with no platform services; Workflow/cron portability unproven_
- [ ] Maintain canonical export/import formats - 🟡 Partial
      <br>_GDPR export (`apps/web/app/api/user/export/route.ts`) proves a per-user canonical export exists; no equivalent import or org-level format found_

_§125: 2 of 13 done._

---

# 126. No-duplication architecture gate (reject implementations where)

- [x] Web owns its own model catalog
      <br>_Single catalog `packages/contracts/types/src/models.json` / `packages/ai/model-registry`; `check-model-catalog-integrity.mjs`, `check-availability-invariant.mjs` gate it; web imports the shared catalog, not a local one_
- [x] Mobile owns separate routing logic ⛔ **not live**
      <br>_`check-plan-tier-predicates.mjs` names `billing-catalog.ts`/`model-catalog.ts` as sole owners; mobile (`apps/mobile/app/(app)/settings/workspace.tsx:22`) imports `getBillingPlanPricing` from `@agiworkforce/types`, not a …_
      <br>⛔ Release check: The mobile app has never been released (release-mobile.yml never run; no App Store or Google Play listing).
- [x] VS Code owns separate tools ⛔ **not live**
      <br>_`apps/extension-vscode/src/integrations/localRuntimeClient.ts` and `runtimeProcessRegistry.ts` talk to the shared runtime/app-server process rather than reimplementing tool execution_
      <br>⛔ Release check: The VS Code extension has never been published (Marketplace and Open VSX return nothing; release workflow never run).
- [x] Desktop owns separate MCP
      <br>_Both `apps/desktop/src-tauri/Cargo.toml` and `apps/cli/Cargo.toml` depend on the same `crates/agiworkforce-mcp` crate_
- [ ] CLI owns incompatible permissions _(revised)_ - 🟡 Partial
      <br>_desktop Cargo.toml has execpolicy/sandbox-policy (used in exec_gate.rs) but not command-registry; desktop keeps its own 7.9k-line sys/security/tool_guard.rs approval tiers_
- [x] Chrome owns developer-session history ⛔ **not live**
      <br>_`apps/extension/src/surface.ts` only labels itself as a `SourceSurface` value; no separate history store found; canonical `DeveloperSession` type is shared (`suite-contracts.ts:431`)_
      <br>⛔ Release check: The Chrome extension has never been published (release workflow never run; no v-ext tag).
- [x] Multiple surfaces independently interpret billing tiers
      <br>_`check-plan-tier-predicates.mjs` is a dedicated repo-wide guard for exactly this, naming `billing-catalog.ts` as the one legal owner of `BillingPlanTier`_
- [ ] Different apps invent separate error enums - 🔴 Missing
      <br>_`packages/contracts/types/src/errors.ts` defines canonical `ErrorCode` (`RATE_LIMIT_EXCEEDED`, no `UNKNOWN`/`NETWORK_ERROR`/`TIMEOUT` overlap-safe naming), but `apps/web/shared/lib/error-utils.ts:8` independently …_
- [ ] Different apps duplicate sync logic _(revised)_ ⛔ **not live** - 🟡 Partial
      <br>_packages/client/sync used by web, desktop, mobile, but apps/extension/src/features/cloud-bridge/conversationSync.ts (571 lines) reimplements sync; cited lane/service guards do not cover sync_
      <br>⛔ Release check: The Chrome extension has never been published (release workflow never run; no v-ext tag).
- [ ] Different apps use contradictory vocabulary - 🔴 Missing
      <br>_§3 spot-checks found no violation for Connector/Skill/Team-vs-Workspace, but §5/§126's error-enum finding is itself a vocabulary contradiction (`RATE_LIMIT` vs `RATE_LIMIT_EXCEEDED` for the same concept) that a …_

_§126: 6 of 10 done._

---

# 127. Public launch blocker criteria (do not launch with any P0 involving)

Do not launch if any P0 exists involving:

- [x] Authentication bypass
      <br>_suspend/ban fail closed, RLS bound per transaction; `check:rls-boundary`, `check:org-role-checks` in `check:llm-operability`_
- [x] Tenant leak
      <br>_FORCE RLS plus app filter, `check:db-isolation` + `check:rls-boundary` (§57 10/12 Done)_
- [x] Billing corruption ⛔ **not live**
      <br>_single `CREDITS_PER_USD`, idempotent Stripe webhooks, reconciliation (§70); `c679e9633` stopped reading an unfunded account as a spent quota_
      <br>⛔ Release check: c679e9633 (packages/ai) commit dated 2026-09-16; production web deploys of recent main cancelled/in progress, not confirmed serving
- [ ] Permission bypass - 🟡 Partial
      <br>_plugin install records declared permissions (`e210bbb41`); CLI browser tools always ask (`4926761ed`); Electron `shell_run` still unsandboxed (open, founder call)_
- [x] Trust-mode leak ⛔ **not live**
      <br>_Electron Cloud-only gate `afce2dc68`; VS Code outbound trust + credential guard `5cc13bda9`_
      <br>⛔ Release check: afce2dc68 Electron (no v-cloud-desktop tag) and 5cc13bda9 VS Code (no v-vscode tag), both 2026-09-16
- [x] Secret leak ⛔ **not live**
      <br>_credential-file policy in shared Rust read tool and mention expansion `4ec5c87a6`; `check:secrets` in CI_
      <br>⛔ Release check: 4ec5c87a6 dated 2026-09-16; released CLI is v-cli-1.0.0 (a8650d61c, 2026-05-03); source is 1.7.1 (apps/cli/Cargo.toml:4), never tagged
- [ ] Data loss - 🟡 Partial
      <br>_session writer race fixed `1ec082f9d`, unreadable JSONL line no longer loses a session `608201f6d`; `rqa-07` half not re-verified_
- [x] Stale AI edit overwriting human work ⛔ **not live**
      <br>_VS Code inline diff refuses a file that moved since proposal `760044a35`_
      <br>⛔ Release check: 760044a35 dated 2026-09-16; release-vscode-extension.yml:4-10 needs v-vscode-* tag; none on origin; extension never published to Marketplace
- [x] Orphaned processes ⛔ **not live**
      <br>_signal cleanup on Unix and Windows `deb53833b`, `6f54c4b31`_
      <br>⛔ Release check: deb53833b/6f54c4b31 dated 2026-09-16; process_tree.rs absent at v-cli-1.0.0 (a8650d61c)
- [x] Invalid machine output ⛔ **not live**
      <br>_NDJSON U+2028/29 escaping and terminal event before denial exit `5abeb9f7b`, `agi exec` obeys permission flags `d6ad07ab5`_
      <br>⛔ Release check: 5abeb9f7b/d6ad07ab5 dated 2026-09-16; released CLI is v-cli-1.0.0 (a8650d61c, 2026-05-03); source is 1.7.1 (apps/cli/Cargo.toml:4), never tagged
- [ ] Broken updates - 🟡 Partial
      <br>_desktop updaters signed (§117); Homebrew tap installs v-cli-1.0.0 while source is 1.7.1, a release nobody has cut_
- [x] Dead primary navigation ⛔ **not live**
      <br>_desktop dead nav entries removed `c4ee12064`, `aba1e05ee`; web `/tasks` rail omission is a documented founder decision `app-nav-items.test.ts:93`_
      <br>⛔ Release check: c4ee12064/aba1e05ee dated 2026-09-16; newest desktop release v-desktop-1.2.0 (82463ae48, 2026-05-04), Electron untagged
- [x] File upload failure
      <br>_server-side magic-byte sniffing and scan `upload-scan.ts:69-77` (§22); public-bucket-before-scan window noted in §22_
- [ ] Tool failures displayed as success - 🟡 Partial
      <br>_Remote Control no longer claims Connected on builds that drop messages `d2cca3bc3`; `NEW-dqa-02` and `rqa-53` not re-verified this pass_
- [x] Missing cancellation ⛔ **not live**
      <br>_screen control stop really stops and withdraws grants `e2bc17e40`; Escape stops a streaming reply `c30812e7d`_
      <br>⛔ Release check: e2bc17e40 desktop not in v-desktop-1.2.0; c30812e7d web commit dated 2026-09-16; production web deploys of recent main cancelled/in progress, not confirmed serving
- [ ] Broken mobile/desktop sync - 🟡 Partial
      <br>_false pairing removed `d2cca3bc3`; no automated cross-device continuation test exists (§110 0/18)_

_§127: 11 of 16 done._

---

# 128. Enterprise launch blocker criteria (do not claim Enterprise-ready without)

Do not claim Enterprise-ready without:

- [x] SSO
      <br>_SAML + OIDC via `apps/web/lib/.../clerk-enterprise-connections.ts`, `app/api/admin/sso/route.ts` (§56)_
- [x] SCIM
      <br>_`app/api/scim/v2/*`, `lib/server/scim/scim-provisioning-service.ts` (§56)_
- [ ] RBAC - 🟡 Partial
      <br>_owner/admin vs everyone enforced by RLS `app_has_org_role`; `viewer` assignable but enforced nowhere (`ebef4eb4b`); no custom roles or feature permissions (§58 3/10)_
- [ ] Groups _(revised)_ - 🟡 Partial
      <br>_SCIM groups carry a standing mapped_role editable at `apps/web/app/api/admin/directory-sync/groups/route.ts:170-203`; groups carry no sharing, policy or budget entitlements_
- [x] Audit
      <br>_canonical `AuditEventType` `lib/security-audit.ts:216-267`, audit API `app/api/settings/audit-logs/route.ts` (§63 13/19)_
- [ ] Retention - 🟡 Partial
      <br>_chat retention + legal hold + deletion crons real; most other domains ride cascade deletes, not independent periods (§61 9/20)_
- [ ] Device/session controls _(revised)_ - 🟡 Partial
      <br>_IdP deprovision revokes workspace-bound device tokens and API keys `apps/web/lib/services/deprovision-service.ts:146-180`; personal-scope tokens untouched; devices not listed individually; admin UI copy …_
- [ ] Admin feature controls - 🟡 Partial
      <br>_models, connectors, sharing, data, IP policy governable; Work, Code, Research, Browser, Computer use, Remote, Skills, Plugins, Hooks are not (§59 17/31)_
- [x] Model controls
      <br>_`WorkspaceModelPolicy.tsx:177-278`, server-enforced allow-list_
- [x] Connector controls
      <br>_`WorkspaceConnectorPolicy.tsx:136-169`; no equivalent for plugins or MCP (§41, §44)_
- [x] IP allowlists where promised
      <br>_`lib/services/ip-allow-list.ts`, `lib/ip-allow-list-gate.ts`, enforced per request_
- [ ] Compliance exports/API - 🟡 Partial
      <br>_audit export route real; no admin-scoped API key type, no DLP or eDiscovery integration (§62 8/14)_
- [x] Security documentation
      <br>_`/security` and `/trust` dated, candid ledgers; `SECURITY.md`, `docs/security/security.md` (§113 9/11)_
- [ ] Pen test - ⚪ External
      <br>_no repo artifact proves a completed third-party test; `/security` does not claim one_
- [ ] SOC 2 program - 🔴 Missing
      <br>_`apps/web/app/security/page.tsx:345-347`: no SOC 2 report exists and no audit is underway_
- [ ] Encryption - 🟡 Partial
      <br>_per-tenant envelope encryption with key versioning; no KMS/CMEK, no escrow, rotation manual (`key-rotation-runbook.test.ts`, §64 6/11)_
- [x] DPA
      <br>_`apps/web/app/dpa` page_
- [ ] Incident response - 🟡 Partial
      <br>_runbook + detection exist; "No pager", "No on-call rotation. One mailbox, one person" `docs/runbooks/incident-response.md:167-180`_
- [ ] Backups/recovery - 🟡 Partial
      <br>_restore drill in CI `.github/workflows/db-restore-drill.yml`; no cross-region backup, no stated RPO/RTO (§92 7/10)_
- [ ] Enterprise billing - 🟡 Partial
      <br>_contract + invoice rows and collection cron exist; no in-product surface reads them (only `app/api/cron/enforce-billing-collection`), no tax exemption or procurement contacts (§71)_

_§128: 8 of 20 done._

---

# 129. UX quality gate (every screen)

Every screen must have:

- [ ] Clear hierarchy - 🟡 Partial
      <br>_design-review rule for UI changes; no automated check; open hierarchy gaps in `audit/ui-gaps.csv`_
- [ ] Correct spacing - 🟡 Partial
      <br>_spacing tokens `packages/ui/design-tokens`; enforcement is review only_
- [x] Consistent typography
      <br>_type scale tokens (§7) + `check:css-tokens`, `check:no-hex-web`, `check:no-hex-mobile`_
- [ ] Clear primary action - 🟡 Partial
      <br>_review only; tracked in ui-gaps ledger_
- [ ] Back/close - 🟡 Partial
      <br>_dialogs close on Escape (`766e0be54`, `d38bc7271` floor test); no screen-wide check_
- [ ] Loading - 🟡 Partial
      <br>_`Spinner` primitive and route `loading.tsx` boundaries (§93); no guard requires a loading state per screen_
- [ ] Empty - 🟡 Partial
      <br>_component-level empty-state tests exist per feature; no gate; `.claude/rules` notes live sweeps cannot see empty states_
- [ ] Error - 🟡 Partial
      <br>_route `error.tsx` boundaries (§93); no per-screen requirement_
- [ ] Disabled _(revised)_ - 🟡 Partial
      <br>_--text-disabled token exists (packages/ui/design-tokens/src/foundation.css:133) but theme-contrast.test.ts has no disabled case; no gate_
- [ ] Keyboard - 🟡 Partial
      <br>_desktop menus keyboard reachable `8b0d2995c`; `useMenuKeyboard`; no surface-wide keyboard test outside web/desktop_
- [ ] Responsive - 🟡 Partial
      <br>_`apps/web/e2e/qa-05-responsive.spec.ts`, `responsive-interaction-regressions.spec.ts`; authenticated specs do not run in CI_
- [ ] Accessibility - 🟡 Partial
      <br>_axe + Playwright gate for web and desktop only (§98); none for mobile, VS Code, Chrome_
- [ ] No horizontal clipping - 🟡 Partial
      <br>_qa-11-long-content.spec.ts and qa-05-responsive.spec.ts both use qa-capability-harness and are absent from the signed-out list at .github/workflows/ci.yml:1153-1159, so neither runs in CI_
- [ ] No overlapping controls ⛔ **not live** - 🟡 Partial
      <br>_`responsive-interaction-regressions.spec.ts`; not CI-run for authenticated screens_
      <br>⛔ Release check: Production web is the 11 Sep 2026 deployment (about 1,000 commits behind main); every production deploy since errored or awaits approval.
- [ ] No placeholder text in production _(revised)_ - 🟡 Partial
      <br>_no guard checks placeholder copy: check-web-ui-invariants.mjs:67 rules are colour/type/hover, check-mock-exports.mjs checks vi.mock factories, check-vacuous-e2e checks specs_
- [ ] No fake data _(revised)_ - 🟡 Partial
      <br>_desktop fixtures refused outside test/dev (apps/desktop/src/lib/tauri-mock.ts:351 shouldServeFixtures); check:mock-exports only validates test vi.mock factories; no production fake-data guard_
- [ ] No raw IDs unless useful - 🔴 Missing
      <br>_no guard or test found; searched `raw id`, `uuid` render checks_
- [x] No raw backend errors
      <br>_`check:raw-error-to-user` with baseline `audit/raw-error-to-user.json`_

_§129: 2 of 18 done._

---

# 130. Final enterprise smoke test

A test account should be able to:

- [ ] Authenticate through SSO - 🟡 Partial
      <br>_capability exists (§56); never run as a scripted enterprise smoke_
- [ ] Be provisioned through SCIM - 🟡 Partial
      <br>_`app/api/scim/v2/*`; no test tenant run recorded_
- [ ] Receive a group-based role _(revised)_ - 🟡 Partial
      <br>_scim_groups.mapped_role resolved per user at apps/web/lib/server/scim/scim-provisioning-service.ts:327-341,501,1300; a standing group-to-role mapping exists, never smoke-run_
- [ ] Sign into Web - 🟡 Partial
      <br>_Clerk sign-in real; 46 of 53 authenticated web specs cannot run in CI (no sign-in secret)_
- [ ] Sign into Mobile - 🟡 Partial
      <br>_Clerk mobile auth real (§55); no automated run_
- [ ] Sign into Desktop - 🟡 Partial
      <br>_desktop callback auth real (§55); no automated run_
- [ ] Sign into CLI - 🟡 Partial
      <br>_device-code flow real (§55, `agi login`); no automated run_
- [ ] Sign into VS Code - 🟡 Partial
      <br>_auth via CLI runtime (§34); no automated run_
- [ ] Sign into Chrome - 🟡 Partial
      <br>_extension auth real (§35); no automated run_
- [ ] Create Chat - 🟡 Partial
      <br>_real (§11); authenticated spec not CI-run_
- [ ] Continue on another device - 🟡 Partial
      <br>_conversation sync with server_version (§17); no cross-device test_
- [ ] Create Project - 🟡 Partial
      <br>_real (§19); not CI-run_
- [ ] Upload files - 🟡 Partial
      <br>_real with server scan (§22)_
- [ ] Run Research - 🟡 Partial
      <br>_real (§24 10/17)_
- [ ] Run AGI Work - 🟡 Partial
      <br>_real cloud agent (§25 15/23)_
- [ ] Use approved Connector - 🟡 Partial
      <br>_workspace connector allow-list real (§41)_
- [ ] Use approved Skill - 🟡 Partial
      <br>_skills real; no workspace skill approval (§43, §59)_
- [ ] Use approved Plugin - 🔴 Missing
      <br>_no org allowlist for plugins (§44)_
- [ ] Start AGI Code Desktop _(revised)_ ⛔ **not live** - 🟡 Partial
      <br>_Electron desktop spawns the CLI `agi app-server` `apps/desktop/electron/runtime/developerSessionService.ts:611`; Tauri shell keeps its own agent stack; never smoke-run_
      <br>⛔ Release check: The Electron desktop has never been released (release-desktop-cloud.yml never run).
- [ ] Continue same developer session from CLI _(revised)_ ⛔ **not live** - 🟡 Partial
      <br>_Electron desktop lists and resumes CLI app-server sessions (`developerSessionService.ts:714,836`); Tauri-origin sessions cannot continue in CLI; never smoke-run_
      <br>⛔ Release check: The Electron desktop has never been released (release-desktop-cloud.yml never run).
- [ ] Continue same developer session from VS Code - 🟡 Partial
      <br>_CLI to VS Code shares the app-server session (§29); Desktop origin cannot_
- [ ] Attach Mobile Remote - 🟡 Partial
      <br>_mobile pairing to desktop real (§39); not to CLI developer sessions_
- [ ] Approve from phone - 🟡 Partial
      <br>_remote approvals real for desktop host (§39)_
- [ ] Use browser integration - 🟡 Partial
      <br>_Chrome bridge + isolated Playwright (§36)_
- [ ] Run tests - 🟡 Partial
      <br>_terminal/test execution in CLI and desktop (§32, §33); no test-results surface on Remote (§39)_
- [ ] Generate file - 🟡 Partial
      <br>_generated files real (§23)_
- [ ] Save generated output to Library - 🟡 Partial
      <br>_Library exists; no Add to Library/Project/Work actions (§21)_
- [ ] Run scheduled task - 🟡 Partial
      <br>_scheduler real (§78 8/12)_
- [ ] Receive notification - 🟡 Partial
      <br>_channels wired; several events never fire (§84)_
- [ ] Observe usage - 🟡 Partial
      <br>_usage ledger + workspace usage view (§72, §59)_
- [ ] Admin changes policy - 🟡 Partial
      <br>_workspace policy editor real (§60)_
- [ ] Client receives new policy - 🟡 Partial
      <br>_per-request enforcement on web; no push to clients, TTL caches (§60)_
- [ ] Admin revokes device - 🟡 Partial
      <br>_only personal device revoke; no admin device access control (§59)_
- [ ] Device loses access _(revised)_ - 🟡 Partial
      <br>_Deprovision revokes workspace-bound device refresh tokens `deprovision-service.ts:159-168`; never run as a scripted smoke_
- [ ] Compliance event appears in audit - 🟡 Partial
      <br>_audit events real (§63); browser/computer-use/remote pairing logging partial_
- [ ] Retention job handles expired content correctly - 🟡 Partial
      <br>_retention crons real for chats/temporary chats/billing (§61)_
- [ ] Account logs out cleanly - 🟡 Partial
      <br>_logout + global sign-out revoke (§55)_

_§130: 0 of 37 done._

---

# 131. Definition of enterprise-grade, highly polished

It is complete when:

- [ ] All major surfaces are production-stable - 🟡 Partial
      <br>_CI green on main; no crash reporting on mobile, VS Code, Chrome or CLI (§88)_
- [ ] Shared domains actually share implementations _(revised)_ - 🟡 Partial
      <br>_Shared: `crates/agiworkforce-mcp`, execpolicy, `packages/client/sync`, app-server for CLI/VS Code/Electron. Diverge: Tauri agent stack, Chrome sync reimplementation, two error-code enums_
- [ ] Cross-device behavior is predictable - 🟡 Partial
      <br>_server_version optimistic sync (§17); no cross-device test (§110)_
- [ ] Data ownership is unambiguous - 🟡 Partial
      <br>_canonical contracts package (§5); three Work-state vocabularies (§26)_
- [x] Local/Cloud/BYOK boundaries cannot be accidentally crossed ⛔ **not live**
      <br>_generated trust-mode enum, per-surface `trust-boundary.test.ts`, `check:trust-boundaries` (§4); Electron Cloud-only gate `afce2dc68`_
      <br>⛔ Release check: Electron Cloud-only gate afce2dc68 (2026-09-16) in a shell with no v-cloud-desktop tag; release-desktop-cloud.yml:26-28
- [ ] Errors are recoverable - 🟡 Partial
      <br>_retry before first token `c41878026`; no mid-stream resume (§15)_
- [ ] Offline/reconnect behavior works - 🟡 Partial
      <br>_mobile offline handling (§94); web has retry only, no stream reattach (§15)_
- [ ] Old clients do not corrupt new servers _(revised)_ - 🟡 Partial
      <br>_protocol-version gates refuse legacy writers: apps/web/app/api/chat/sync/route.ts:735-764 SYNC_PROTOCOL_UPGRADE_REQUIRED, also memory/sync and uploads/presign; no cross-version tests_
- [ ] Security controls are enforceable centrally - 🟡 Partial
      <br>_workspace policy engine with audit; no group/role/user override layers, no push (§60 6/13)_
- [ ] Enterprise administrators can govern the system - 🟡 Partial
      <br>_§59 17/31 Done_
- [ ] Every consequential action is auditable - 🟡 Partial
      <br>_§63 13/19; subagent actions unaudited (§27)_
- [x] Billing is accurate
      <br>_single credit rate, idempotent webhooks, reconciliation (§70)_
- [ ] Usage is observable - 🟡 Partial
      <br>_usage ledger lacks project and session dimensions (§72 9/22); no product analytics (§100)_
- [ ] Production incidents can be diagnosed quickly - 🟡 Partial
      <br>_Sentry with release tags on web + desktop `6c196958e`; no dashboards or pager (§87, §91)_
- [ ] Backups can actually be restored - 🟡 Partial
      <br>_restore drill workflow in CI; no cross-region copy (§92)_
- [ ] App updates are safe - 🟡 Partial
      <br>_signed desktop updaters (§117); no staging or canary stage (§107)_
- [x] Models/providers can be swapped
      <br>_generated catalog + family slots with promote/rollback (§46, §104)_
- [ ] No single provider is structurally required - 🟡 Partial
      <br>_models abstracted (§124); auth, email, analytics not abstracted (§124 9/15)_
- [x] No critical production feature relies on mock behavior
      <br>_apps/desktop/src/lib/tauri-mock.ts:351 refuses fixtures outside test/desktop-ui-dev; check:mock-exports is test-mock hygiene, not a production mock guard_
- [ ] QA runs continuously _(revised)_ - 🟡 Partial
      <br>_ci.yml:1153 runs signed-out Playwright on every push, e2e-tests.yml:20 weekly desktop E2E; 46 of 53 authenticated web specs never run_
- [ ] Architecture documentation matches reality _(revised)_ - 🟡 Partial
      <br>_`ARCHITECTURE.md:37` describes desktop as Tauri only, omitting the shipped Electron shell `apps/desktop/electron`; `check-doc-freshness.mjs` reports stale doc headers_
- [ ] Product terminology is consistent across every surface - 🟡 Partial
      <br>_see §3_
- [ ] User experience feels like one ecosystem rather than unrelated applications _(revised)_ - 🔴 Missing
      <br>_216 open gaps in `audit/ui-gaps.csv` (53 P1); Tauri and Electron desktops diverge; no cross-surface E2E_

_§131: 4 of 23 done._

---
