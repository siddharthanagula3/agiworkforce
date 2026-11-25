---
id: "META-outdated-documents"
type: "meta"
title: "Project documents found out of date"
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Project documents found out of date

115 places in 104 project documents (and code comments) that no longer match the code, found while writing the system, app and engineering pages. Each names what is outdated, what the code says, and where. On the branch `claude/agent-contract` (not merged) 26 of these, in 23 documents, are corrected; each was confirmed against the code by a second reader. Sixteen other corrections were made and then taken back because they were not plain facts or did not hold. Findings about decision records, generated documents, the known-flaws register, the pinned design skill and `AGENTS.md` itself were not applied. The project's own register for such findings is `audit/doc-corrections/contradictions-register.md`.

## `.agents/skills/agiworkforce-design/SKILL.md step 3 (logo motion: no shine overlay)`

- **Outdated:** Possible mismatch: states no shine overlay on the landing logo. **The code says:** foundation.css still defines .agi-mark-shine with an offset-path animation. Whether the landing uses it was not checked. (packages/ui/design-tokens/src/foundation.css (agi-mark-shine rules near the end of file); found by SYS-shared-ui-and-design)

## `143 migration headers, for example 0203_user_memories_lifecycle.sql, 0239_resource_deletion_semantics.sql, 0425_adult_eligibility.sql`

- **Outdated:** Header text 'NOT YET APPLIED : draft only, pending explicit approval'. **The code says:** The recorded production watermark is 425, so these files are applied. Applied files cannot be edited. (scripts/config/production-migrations-applied.json; scripts/check-migration-dependencies.mjs (comment above loadAppliedThrough); found by SYS-data-model-and-migrations)

## `AGENTS.md section 12 (Vitest bullet)`

- **Outdated:** Describes the separate Vitest major as specific to apps/web. **The code says:** apps/desktop also declares vitest ^5.1.0, while the root, apps/extension and apps/extension-vscode use ^4.1.12. (apps/web/package.json:207; apps/desktop/package.json:182; package.json:469; apps/extension/package.json:72; found by ENG-build-and-test)

## `AGENTS.md section 4`

- **Outdated:** Says the Rust model-literal check is scripts/check-no-hardcoded-models.sh **The code says:** That file only forwards to the Node guard scripts/check-no-hardcoded-model-ids.mjs, which scans Rust and TypeScript (scripts/check-no-hardcoded-models.sh; found by SYS-repository-and-guards)

## `AGENTS.md section 4 (promotion keeps gate evidence)`

- **Outdated:** States that promotion keeps the prior model, a bounded fallback chain and gate evidence. **The code says:** Eight active family records say the eval gate was not run, 13 slots are seeded without a gate, and 27 of 28 fallback chains are empty. (packages/ai/model-registry/catalog/model-families.json (script count 2026-11-24); found by SYS-model-catalog-and-routing)

## `AGENTS.md section 5`

- **Outdated:** Cargo workspace listed as apps/desktop/src-tauri, apps/cli, crates/* **The code says:** Cargo.toml also has apps/desktop/gpui as a member (Cargo.toml:2-7 versus AGENTS.md:88; found by SYS-repository-and-guards)

## `AGENTS.md section 5 and packages/ui/unified-chat/package.json description`

- **Outdated:** Say unified-chat is shared by desktop, web, Chrome and VS Code. This is incomplete: it omits mobile, and Chrome and VS Code use only helper modules, not the chat UI. **The code says:** Full chat UI mount found only in desktop. Web uses selected pieces, mobile uses about 60 helper subpaths, Chrome and VS Code use a few. (apps/desktop/src/features/v3/DesktopShellV3.tsx:710; apps/mobile/package.json:73; apps/extension/src and apps/extension-vscode/src/webview/render.ts imports; found by SYS-shared-ui-and-design)

## `CONTRIBUTING.md`

- **Outdated:** Setup section says Rust 1.94.0. **The code says:** rust-toolchain.toml pins channel 1.99.1, and apps/desktop/README.md also says 1.99.1. (CONTRIBUTING.md:12 versus rust-toolchain.toml; found by ENG-development-setup)

## `README.md (environment table, lines 246-250)`

- **Outdated:** The table of tracked example files lists Desktop, Web, Mobile, Chrome extension and Signaling only. **The code says:** apps/cli/.env.example and services/upload-scanner/.env.example are also tracked, and scripts/env-doctor.mjs defines cli and scanner scopes. (scripts/env-doctor.mjs contracts keys: desktop, web, mobile, extension, cli, signaling, scanner; found by ENG-configuration)

## `apps/cli/Cargo.toml description`

- **Outdated:** Says '10+ providers' and lists a fixed set, which differs from the lists in README and the auth error text (mistral, openrouter, nvidia, minimax are also named elsewhere). **The code says:** Login accepts anthropic, openai, google, xai, deepseek, minimax, perplexity, qwen, moonshot, zhipu, ollama-cloud, openrouter, nvidia; README lists pre-registered providers including mistral and lmstudio. (apps/cli/Cargo.toml:4; apps/cli/src/auth.rs:1281; found by SURF-cli)

## `apps/cli/README.md (Purpose banner example)`

- **Outdated:** Not wrong, but states 'Last updated: 2026-11-11' while the file was modified 2026-11-24, so dated claims such as the release state may lag. **The code says:** File mtime is Nov 24; the surface status and install.sh still say no release. (apps/cli/README.md:5; directory listing; found by SURF-cli)

## `apps/cli/src/sessions.rs (module comment, Sync-rule isolation)`

- **Outdated:** Says the CLI must not sync consumer chat history and that no CLI code touches the synced chat tables. **The code says:** In managed (cloud) privacy mode the CLI pushes sessions to /api/chat/sync, which writes web_conversations and web_messages. Local and BYOK sessions are refused. (apps/cli/src/cloud/chat.rs:1-13; apps/cli/src/cloud/mod.rs:326-335; apps/cli/src/cloud/client.rs:361-373; found by SYS-data-model-and-migrations)

## `apps/cli/src/tier_cache.rs (module header comment)`

- **Outdated:** Lists canonical tiers without team_premium and says the CLI no longer reads credits because there are no per-use credits. **The code says:** The UserTier enum includes TeamPremium, and usage_summary.rs reads /api/usage credit windows (monthly, weekly, five_hour). (apps/cli/src/tier_cache.rs:6-9 versus 184-200; apps/cli/src/usage_summary.rs:1-8, 40-62; found by SYS-subscriptions-entitlements-and-usage)

## `apps/desktop/electron/config.ts header comment and electron-builder.yml comments`

- **Outdated:** They cite apps/desktop/AGENTS.md as the source for 'one Desktop surface, two shells'. **The code says:** apps/desktop/AGENTS.md does not exist; the owning documents are apps/desktop/README.md and ARCHITECTURE.md. (ls apps/desktop/AGENTS.md returned no such file; found by SURF-desktop)

## `apps/extension-vscode/README.md`

- **Outdated:** Not clearly outdated, but says extension files lack a CLI path for provider-free use without stating that the CLI is unpublished; also says Marketplace Q&A and docs links as if live. **The code says:** The web status map shows VS Code as Coming soon, and the CLI has no signed release. (apps/web/lib/surface-status.ts:11; audit/blockers/14-desktop-and-vscode-need-unpublished-cli.md; found by SURF-vscode)

## `apps/extension/README.md`

- **Outdated:** Title is the bare string 'agiworkforce' and does not use the product name. **The code says:** Manifest name is 'AGI Extension'; product names are owned by the registry. (apps/extension/README.md:1; apps/extension/manifest.json:3; found by SURF-chrome)

## `apps/extension/docs/threat-model.md (capability table)`

- **Outdated:** Links `src/features/cloud-bridge/clerkAuth.ts` relative to docs/, which resolves to a wrong path (docs/src/...), a broken link rather than a wrong claim. **The code says:** The file is at apps/extension/src/features/cloud-bridge/clerkAuth.ts. (apps/extension/docs/threat-model.md cookies row; apps/extension/src/features/cloud-bridge/clerkAuth.ts; found by SURF-chrome)

## `apps/mobile/README.md`

- **Outdated:** Header says Last updated 2026-10-18 and describes only the base folders; it omits the many features added since (accounts, companion, voice, siri, release-state, rollout) and does not mention the feature flags or purchase switch **The code says:** src/features holds about 50 folders; lib/v1FeatureFlags.ts and storePurchases.json control what ships (apps/mobile/README.md vs apps/mobile/src/features listing; found by SURF-mobile)

## `apps/mobile/lib/egressGuard.ts (comment at line 326 and error message at line 31)`

- **Outdated:** Calls the pass-through of provider or other hosts 'BYOK direct-to-provider' and says Local Mode is 'on-device + BYOK only'. **The code says:** Mobile has no own-key mode, and the guard passes any non-AGI host to secureFetch, so the BYOK wording is a stale comment and message and the pass-through is a boundary gap. (apps/mobile/lib/egressGuard.ts:31 and :326; found by SYS-local-inference)

## `apps/mobile/lib/egressGuard.ts comment (and docs repeating it)`

- **Outdated:** States Local Mode is on-device plus BYOK only and describes BYOK direct-to-provider as allowed **The code says:** No mobile code path stores or uses a provider key; byokKeys is never consulted and suite.md forbids BYOK in v1 (apps/mobile/lib/egressGuard.ts:31,326; apps/mobile/services/remoteChatGate.ts:8-11; found by SURF-mobile)

## `apps/mobile/services/notificationEventTypes.ts (code comment, read as a source note)`

- **Outdated:** Comment says the only server-side push producer is schedule-notification-service. **The code says:** Agent run, research, cloud code, local code, chat-reply and product-update producers also send push. (apps/mobile/services/notificationEventTypes.ts:8-14; apps/web/lib/services/agent-notification-service.ts:140-416; apps/web/lib/services/chat-reply-notification-service.ts:30-50; found by SYS-sync-and-continuity)

## `apps/web/.env.example (comment near NEXT_PUBLIC_FREE_LANE_UI, line 889)`

- **Outdated:** It refers to the server's AGI_FREE_LANE_MODE but never lists that name as an entry, although its header says every name the source reads appears there. **The code says:** AGI_FREE_LANE_MODE is read through FREE_LANE_MODE_ENV in apps/web/lib/services/free-lane/mode.ts and is not in documentedKeys in scripts/env-doctor.mjs. (apps/web/lib/services/free-lane/mode.ts:3,32; apps/web/.env.example:889; scripts/env-doctor.mjs web documentedKeys; found by ENG-configuration)

## `apps/web/app/api/llm/v1/chat/completions/lib/managed-failover.ts (header comment)`

- **Outdated:** Says it mirrors the gateway's failover in services/api-gateway/src/routes/llm.ts. **The code says:** The services directory contains only signaling-server and upload-scanner; no api-gateway exists, so the referenced file is gone. (ls services shows signaling-server and upload-scanner; managed-failover.ts:4-5; found by SYS-inference-providers)

## `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts (file header comment)`

- **Outdated:** Says the safety model is default fail-closed with every tool call queued awaiting approval and manual as the default approval mode. **The code says:** The approval mode follows the account policy: auto when every offered tool is auto-approved by the policy, manual otherwise. A signed-in cloud account with no stored setting gets autonomous. Only MCP, connector and irreversible tools force manual. (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop-routing.ts:56-65,144-151; packages/contracts/types/src/tool-approval-policy.ts:11-13; apps/web/shared/types/toolApprovalPolicy.ts:40-48; found by SYS-agents-tools-and-automation)

## `apps/web/app/api/llm/v1/chat/completions/route.ts (header comment, lines 162-196; a code comment, not a doc)`

- **Outdated:** States that a turn holding a free-tier or managed reservation starts on the Workflow transport so it outlives the request, and 'Routes to 10+ LLM providers'. **The code says:** The durable attempt is made only in the tool-loop branch (and in the approved-research branch). The plain adapter stream and the non-streaming branch run request-scoped. Providers are whatever ADAPTER_PROVIDERS lists. (route.ts:898-1024 and 1239-1345 versus the comment at route.ts:162-196; found by SYS-chat-turn-pipeline)

## `apps/web/config/free-model-promotion.json`

- **Outdated:** It describes a promotion window ending 2026-10-24, now past. **The code says:** The file is still the config the example points at (ANTHROPIC_PROMO_API_KEY comment). Whether code still loads an expired window is not established. (apps/web/config/free-model-promotion.json endsAt; apps/web/.env.example:313-315; found by ENG-configuration)

## `apps/web/db/neon/0036_media_assets.sql (header)`

- **Outdated:** Not outdated on storage (it already says R2), but it names lib/server/object-storage.ts; the owner of bytes is now the shared platform object-storage package plus app helpers. **The code says:** Object storage is configured through AGI_STORAGE_* settings in packages/platform/object-storage. (packages/platform/object-storage/src/config.ts:7-17; found by SYS-data-model-and-migrations)

## `apps/web/db/neon/0037_rls_user_isolation.sql (header)`

- **Outdated:** Says the live web query path uses getNeonDb() without withUser(), so RLS is correct but dormant and the app-layer user_id filter is the only active control. **The code says:** Request handlers obtain a scoped handle from getUserScopedDb, which binds the verified user and workspace and runs under app_rls. About 810 files import rls-db; getNeonDb() remains for crons, webhooks and erasure. (apps/web/lib/server/rls-db.ts:116-182; apps/web/lib/server/neon-db.ts:20-31; scripts/check-rls-boundary.mjs:11-20; found by SYS-data-model-and-migrations)

## `apps/web/db/neon/0037_rls_user_isolation.sql (header, PRODUCTION ENFORCEMENT CAVEAT)`

- **Outdated:** Says the live web query path uses getNeonDb() without withUser(), so RLS is correct-but-dormant for the live path. **The code says:** getUserScopedDb binds withUser(token).withOrg(organizationId), or a claimed scope for API keys, and the data layer sets SET LOCAL ROLE app_rls per transaction. (apps/web/lib/server/rls-db.ts:81-105,116-165; apps/web/lib/server/claimed-user-scope-db.ts:20-28; found by SYS-authorization-and-workspaces)

## `apps/web/db/neon/0050_temporary_chat_retention.sql header comment`

- **Outdated:** Points to docs/products/agi-mobile/volume-23-settings.md, a path that is not in the current docs tree (docs/product has no such file) **The code says:** The current documentation homes are docs/product/ and docs/compliance/; I did not find the cited file (apps/web/db/neon/0050_temporary_chat_retention.sql:1-5; ls docs/product; found by SYS-memory-projects-and-context)

## `apps/web/db/neon/0073_tenancy_foundation.sql (header and app_row_is_visible body)`

- **Outdated:** The owner sees all their rows regardless of workspace, and org owner/admin see the active org's rows. **The code says:** Superseded twice: 0110 makes Personal and each organization mutually exclusive; 0272 makes visibility depend on active membership and the content.govern permission rather than the owner/admin role pair. (apps/web/db/neon/0110_active_workspace_content_scope.sql:18-32; apps/web/db/neon/0272_active_membership_authorization.sql:76-90; found by SYS-authorization-and-workspaces)

## `apps/web/db/neon/0100_admin_role_helper.sql (rewired app_row_is_visible)`

- **Outdated:** Its app_row_is_visible body (owner/admin role helper) is no longer the live definition. **The code says:** The latest definition found is in 0272 and uses app_has_org_permission(..., 'content.govern'). (apps/web/db/neon/0272_active_membership_authorization.sql:76-90; found by SYS-authorization-and-workspaces)

## `apps/web/db/neon/0182_managed_usage_microusd_ledger.sql (header)`

- **Outdated:** Says one credit is 20,000 microUSD and one cent is 10,000. **The code says:** One credit is 5,000 microUSD, and docs/architecture/credits.md agrees. (packages/contracts/types/src/credits.ts:3; docs/architecture/credits.md:14; found by SYS-data-model-and-migrations)

## `apps/web/db/neon/0200, 0217, 0234, 0236, 0248 headers ('NOT YET APPLIED : draft only')`

- **Outdated:** The label says the migration is a draft not yet applied. **The code says:** Applied-state is not recorded in these files. Later migrations (0272 depends on 0234 and 0248; 0315 depends on 0200 and 0217; 0358 restates 0217) and live code that reads organization_members.status and calls app_has_org_permission rely on them, so the label is stale. Whether each is applied to a given database is not established here. (apps/web/db/neon/0272_active_membership_authorization.sql:1-3; apps/web/db/neon/0315_private_shared_projects.sql:17-18; apps/web/lib/services/active-workspace-service.ts:95-105; found by SYS-authorization-and-workspaces)

## `apps/web/lib/support/doc-metadata.ts (help topic 'memory' availability)`

- **Outdated:** Lists the memory help topic for surfaces web and desktop only **The code says:** Memory clients exist and are wired on mobile, CLI, VS Code and Chrome, and docs/product/surface-feature-matrix.md lists memory present on all six apps (apps/web/lib/support/doc-metadata.ts:219; docs/product/surface-feature-matrix.md:202-210; apps/mobile/app/(app)/settings/memory.tsx; apps/cli/src/cloud/memory.rs; apps/extension-vscode/src/memory/accountMemoryStore.ts; apps/extension/src/background/memory-bridge.ts; found by SYS-memory-projects-and-context)

## `apps/web/lib/temporary-chat-policy.ts (TEMPORARY_CHAT_RETENTION_NOTE and the comment above it)`

- **Outdated:** Says memory is skipped by 'resolveInteractiveTurnContext leaving it out of a temporary turn' and that history is refused by `persistConversationMessage`; the user text says messages are never saved **The code says:** Memory is withheld by resolveInteractiveTurnContext (matches), but a web_conversations row with is_temporary=true is created and purged by a 30-day cron, so the row exists until purge; the end-chat copy says 'never written to your history'. Whether message rows are written at all was not confirmed in this pass (apps/web/app/api/chat/conversations/route.ts:273; apps/web/app/api/cron/purge-temporary-chats/route.ts:20-45; apps/web/lib/temporary-chat-policy.ts:20-45; found by SYS-memory-projects-and-context)

## `audit/decisions/open-questions.md (matrix paragraph)`

- **Outdated:** Reports matrix totals of 184 present, 95 absent, 63 unverified, 1 partial as of 2026-09-20. **The code says:** The JSON now computes to 190 present, 106 absent, 60 unverified, 1 partial. (computed from docs/product/surface-feature-matrix.json; found by REF-product-requirements-sources)

## `audit/overview.md`

- **Outdated:** Dated 2026-09-27; lists VS Code defects and says its sessions are shared with the CLI; later code has added many features and the doc is a point-in-time audit. **The code says:** The extension has 149 commands and 193 test files; the defect list was not re-verified here. (audit/overview.md:398-403; apps/extension-vscode/package.json; found by SURF-vscode)

## `audit/registers/known-flaws.md (Ask from Siri row, line 342)`

- **Outdated:** Says the Ask from Siri deviation is recorded in docs/architecture/trust-boundaries.md. **The code says:** That file has no such section (found in the earlier pass; not re-checked here). (audit/registers/known-flaws.md:342; found by SYS-execution-boundaries)

## `audit/registers/known-flaws.md WEB-DESKTOP-DEVICES-NEVER-WRITTEN-01`

- **Outdated:** Says the Electron Desktop sends no device heartbeat. **The code says:** dispatcher.ts defines describeDeviceForRegistry with capabilities; whether it is sent was not traced, so the row may be stale. (apps/desktop/electron/runtime/dispatcher.ts ~2290; audit/registers/known-flaws.md:50; found by SURF-desktop)

## `docs/agent-context/README.md`

- **Outdated:** Says to run check:llm-operability after editing agent-context rules without noting that some enforced guards run only in CI **The code says:** check:trust-boundaries, check:rust-egress-boundary, check:hardcoded-arrays and the skills-lock check are outside the chain (package.json:397; ci.yml:130,149,932; repo-operability.yml:163; found by SYS-repository-and-guards)

## `docs/agent-context/commands.json`

- **Outdated:** Inventory (lastUpdated 2026-11-09) omits scripts that exist, such as check:script-tests, check:readme-facts, mobile test:local and test:handles, desktop test:smoke and test:gpui:search, and VS Code test:integration:vsix. **The code says:** These scripts are defined in package.json and the app manifests. (package.json:363, 436; apps/mobile/package.json:46-47; apps/desktop/package.json:37, 57; apps/extension-vscode/package.json:1577; found by ENG-build-and-test)

## `docs/agent-context/llm-failure-taxonomy.json`

- **Outdated:** Not outdated, but easy to misread: the brief for this subject names it as an error-category source. **The code says:** It is a development guardrail vocabulary (purpose field). Runtime error categories are in packages/contracts/types/src/error-taxonomy.json. (docs/agent-context/llm-failure-taxonomy.json (purpose); packages/contracts/types/src/error-taxonomy.ts:17-41; found by SYS-observability-and-operations)
- **Outdated:** Header says lastUpdated 2026-06-02, earlier than the guard and register work recorded in later documents. **The code says:** The bug-finding guide (updated 2026-11-11) names the staged and strict guards, so the taxonomy has probably not changed with them. I did not diff them. (docs/agent-context/llm-failure-taxonomy.json:3-4; docs/agent-context/bug-finding-guide.md:20-22; found by ENG-troubleshooting)

## `docs/agent-context/repo-map.json (packages/ui/unified-chat entry, line 1138-1150)`

- **Outdated:** Lists consumers of packages/ui/unified-chat as apps/desktop and apps/web only, with trust boundary 'cloud consumer chat presentation and state'. **The code says:** Chrome, VS Code and mobile also declare and import it (headless subpaths). The tierStore and BYOK or local handoff pieces show it also carries non-cloud modes. (apps/extension/package.json:54; apps/extension-vscode/package.json:1599; apps/mobile/package.json:73; found by SYS-shared-ui-and-design)

## `docs/agent-context/risk-map.json`

- **Outdated:** lastUpdated 2026-08-13, older than lanes.json (2026-11-08) and commands.json (2026-11-09); may not reflect later changes **The code says:** Not re-verified path by path (docs/agent-context/risk-map.json lastUpdated; found by SYS-repository-and-guards)

## `docs/architecture/byok-provider-strategy.md`

- **Outdated:** Says the released CLI and VS Code (when published) must support BYOK and open-model providers including Mistral, Hugging Face, Replicate and Bedrock, and lists them as P0 or P1 work. **The code says:** There is no TS provider package for Mistral, Hugging Face, Replicate or Bedrock. The CLI pre-registers OpenAI-compatible endpoints for OpenAI, xAI, DeepSeek, Perplexity, Qwen, Moonshot, Zhipu, LM Studio, MiniMax, OpenRouter and NVIDIA. The vscode BYOK profile is marked unwired. (apps/cli/src/models/mod.rs:102-192; harnesses.json runtimeProfiles vscode/byok-chat; packages/ai/providers listing; found by SYS-inference-providers)

## `docs/architecture/byok-provider-strategy.md ('Core Decision') versus harnesses.json`

- **Outdated:** States public Electron Desktop chat is managed-cloud-only and must not expose BYOK routes. **The code says:** harnesses.json defines desktop/byok-chat (implemented) and desktop/local-chat (partial) runtime profiles. Whether the Electron window uses them is not established. (packages/ai/model-registry/catalog/harnesses.json runtimeProfiles; found by SYS-inference-providers)

## `docs/architecture/credits.md`

- **Outdated:** Calls the windows a '5-hour' and 'weekly' allowance without saying they are rolling sums rather than fixed periods; and says top-ups are 'sold on the web only' while the top-up route also serves Apple- and Google-billed accounts (the purchase is still made through Stripe). **The code says:** 5-hour and weekly windows are rolling sums over trailing hours; the top-up route accepts billing sources stripe, apple and google. (apps/web/lib/server/rolling-usage.ts; apps/web/app/api/billing/top-up/route.ts:157-162; found by SYS-subscriptions-entitlements-and-usage)

## `docs/architecture/overview.md`

- **Outdated:** Line 158 says migration 0422 is unapplied (appliedThrough 421) as of 2026-11-15. **The code says:** The recorded production watermark is 425, recorded 2026-11-21. (scripts/config/production-migrations-applied.json:3-4; found by ENG-migrations)

## `docs/architecture/overview.md (Chat File Uploads)`

- **Outdated:** States that on 2026-11-15 migration 0422 is unapplied (appliedThrough 421). **The code says:** The committed ledger records appliedThrough 425 recorded 2026-11-21. (scripts/config/production-migrations-applied.json:3-5; found by SURF-web)

## `docs/architecture/overview.md (large chat files paragraph, line 158)`

- **Outdated:** Says that on 2026-11-15 migration 0422 is unapplied (appliedThrough 421). **The code says:** The recorded watermark is 425 as of 2026-11-21, so 0422 is applied. Whether large files are offered is a separate flag question. (scripts/config/production-migrations-applied.json; docs/architecture/overview.md:158; found by SYS-data-model-and-migrations)

## `docs/architecture/provider-routing.md`

- **Outdated:** Says the chat picker shows the model, its developer and the routes that can serve it now. **The code says:** The shared picker short list carries guidance, capability icons, price band, plan lock and family slot; no route list per model appears in its row model. (packages/ai/routing/src/model-picker.ts:82-90 (ModelPickerRowModel); the web picker UI itself was not fully read, so treat this as a partial mismatch; found by SYS-model-catalog-and-routing)
- **Outdated:** Its capability matrix (Responses, Chat Completions, native tools and so on) is described as the product contract, while the generated docs/generated/provider-capability-matrix.md now owns harness wiring. **The code says:** Harness features come from packages/ai/model-registry/catalog/harnesses.json; the prose table is not derived from it and was not cross-checked. (docs/architecture/provider-routing.md:21-24; packages/ai/model-registry/catalog/harnesses.json; found by SYS-model-catalog-and-routing)

## `docs/architecture/release-architecture.md`

- **Outdated:** Section 1 lists the signaling server artifact as 'A Fly.io deployment' triggered by its own workflow. **The code says:** The automatic path after green CI deploys to Railway; Fly deploys only on manual workflow_dispatch with deploy_target fly or both. (.github/workflows/deploy-signaling-server.yml:14-17,224-243,292-309; found by ENG-deployment)

## `docs/architecture/release-architecture.md (section 2 and 3 wording on staging and approvals)`

- **Outdated:** Describes staging and the staging-web status as live ordering without the caveat in its own Current state that the workflows are disabled; also says 'the identical artifact served staging' while ci-and-deploys says staging and production build separately from the same commit. **The code says:** deploy-staging builds with the Vercel preview environment and production builds its own artifact; they share a commit, not an artifact. (docs/development/ci-and-deploys.md staging tier section; .github/workflows/deploy-production.yml:391-401; found by ENG-deployment)

## `docs/architecture/remote-control.md`

- **Outdated:** Lists only the Electron desktop and VS Code extension as hosts, and says the pairing route applies an MFA policy gate and an IP allow-list gate. It also lists the relay allow-list without the dispatch-task verbs. **The code says:** The CLI is a third host (agi remote-control). The pairing route calls remoteControlStandingRefusal, which checks the workspace remote_control policy, the plan capability and the screen_share kill switch. The relay also allows dispatch.task.create, cancel, reply and status. (apps/cli/src/lib.rs:6659-6678; apps/web/app/api/pair/initiate/route.ts:66; apps/web/lib/feature-flags/remote-control-gate.ts:97-130; services/signaling-server/src/control-payload.ts:46-51; found by SYS-sync-and-continuity)

## `docs/architecture/render-layer.md`

- **Outdated:** A Draft spec (2026-08-26) for typed response parts. It lists response-parts.ts files as new and does not describe the artifact sandbox origin, publishing or the Library. It cites artifact-store.ts line numbers that were not re-checked. **The code says:** packages/contracts/types/src/response-parts.ts and packages/contracts/cloud-contracts/src/response-parts.ts do not exist, so the described contract is not implemented. Artifact versioning is documented in the artifact store header (a different id with different content appends a version). (ls of both response-parts.ts paths returned no file; packages/platform/artifacts/src/artifact-store.ts:15-17; found by SYS-files-artifacts-and-storage)

## `docs/architecture/trust-boundaries.md`

- **Outdated:** The policy table (lines 36-45) presents Local, own key and Cloud as uniform capabilities per app. **The code says:** Mobile and desktop Local and CLI Local are partial. The Electron shell refuses local inference outright, and CLI and VS Code Cloud chat need PRO_TIERS while other apps need only managed_chat. The policy's VS Code Local and own-key entries match the code. (apps/desktop/electron/runtime/dispatcher.ts:3235-3244; apps/web/lib/free-chat-surface-policy.ts:96-113; apps/extension-vscode/README.md:~35-38; found by SYS-execution-boundaries)

## `docs/decisions/2026-09-15-founder-decisions.md D-2026-09-15-04 (Tauri not a public product, Electron sole public Desktop)`

- **Outdated:** The same entry says it was superseded on 2026-10-24 to ship Tauri as a second public app loading the hosted web app, while README, ARCHITECTURE.md and AGENTS.md section 5 still say Tauri is internal only. **The code says:** The Tauri window shows the Vite renderer in src, not the hosted web app (apps/desktop/README.md; hostHasLocalMode is true only for the tauri shell). Release workflows and download routes cover only the Electron 'cloud' channel in the Desktop path read; Tauri public status is unproven and is an owner question. (docs/decisions/2026-09-15-founder-decisions.md:78-99 versus apps/desktop/README.md:1-12; found by SURF-desktop)

## `docs/decisions/2026-09-27-founder-decisions.md D-2026-09-27-01 and docs/product/commercial.md`

- **Outdated:** Name plans Pro, Max 5x, Max 20x and max_15x. **The code says:** Public labels are Premium (`pro`), Max (`max`) and Ultra (`max_15x`). (packages/contracts/types/src/billing-catalog.ts:192-207; found by REF-product-requirements-sources)

## `docs/decisions/README.md`

- **Outdated:** Dated record list omits 2026-11-12 and 2026-11-13 founder decisions; last updated 2026-11-11. **The code says:** Both files exist in docs/decisions. (ls docs/decisions; README Decision Sources list; found by REF-product-requirements-sources)

## `docs/development/README.md`

- **Outdated:** Index and how-to list omit the heavy-job rule and the scripts/dev wrappers, and give no setup steps. **The code says:** CLAUDE.md and .claude/hooks/heavy-job-gate.py make the wrappers mandatory on machines of 24 GB or less; the root dev:desktop script runs tauri dev while the public Desktop is Electron. (docs/development/README.md (no mention); .claude/hooks/heavy-job-gate.py:9; found by ENG-development-setup)

## `docs/development/agent-operability.md (Hook Rules)`

- **Outdated:** Says pre-push runs check:llm-operability and whitespace checks **The code says:** pre-push runs the chain inside a clean detached worktree, then turbo lint and typecheck for affected packages, then git diff --check; it has an on-tree mode (.husky/pre-push; scripts/prepush-clean-worktree.sh; found by SYS-repository-and-guards)

## `docs/development/agent-workflow.md`

- **Outdated:** Last updated 2026-09-19; the verification ladder does not mention the clean-worktree pre-push, the heavy-job wrappers or the guard chain's run-alone and re-run rules. **The code says:** Pre-push uses scripts/prepush-clean-worktree.sh, and the guard chain re-runs failed guards alone. (.husky/pre-push; scripts/run-guard-chain.mjs:150-190; found by ENG-build-and-test)

## `docs/development/ci-and-deploys.md`

- **Outdated:** Lines 61-62 present migration 0394 as pending work for the release operator. **The code says:** 0394 is below the recorded applied watermark of 425, so it is historical. (scripts/config/production-migrations-applied.json:3; found by ENG-migrations)

## `docs/development/troubleshooting.md`

- **Outdated:** Not found stale in most entries. Two claims are not backed by code I could open: the Clerk development key handshake redirect, and 'every completion fails' when the key-value provider is down. The file also lacks any section on sign-in, plan limits, provider errors, uploads, sync or local models. **The code says:** The key-value provider list (upstash, redis, memory, none) matches the factory. CLERK_AUTHORIZED_PARTIES is in validate-env.ts as an 'important' variable, but whether it is required is a warning level in that list, not a hard error. (packages/platform/key-value/src/factory.ts:22; apps/web/lib/validate-env.ts:68. The doc says 'is required', while the code lists it under importantVars [inferred: the severity is not shown in the lines I read]; found by ENG-troubleshooting)

## `docs/generated/trust-mode-surface-matrix.md and the trust-mode matrix policy table (Web: Local no)`

- **Outdated:** Policy says Web has no Local; the web chat hook still contains a full Local turn path (runLocalTurn, local: model ids, desktop-host bridge). **The code says:** The Local branch exists in useChatStream and runs only where a host bridge answers local_chat_start; the Electron shell refuses it. This is a policy-versus-code tension, not proof the doc is wrong, because the doc says 'allowed, not shipped'. (apps/web/lib/hooks/useChatStream.ts:4155-4170, 4259-4290; apps/web/features/desktop-host/lib/runtime-client.ts:621; apps/desktop/electron/runtime/dispatcher.ts:3235-3244; found by SYS-chat-turn-pipeline)

## `docs/product/competitive-guidance.md (surface inventory)`

- **Outdated:** States Tauri is not a second public Desktop 'under the current founder decision'. **The code says:** D-2026-09-15-04 records a 2026-10-24 owner choice to ship Tauri as a second public app, yet AGENTS.md and README.md still treat Tauri as internal; the public status is unresolved. (docs/product/competitive-guidance.md inventory table row Retained Tauri Desktop versus docs/decisions/2026-09-15-founder-decisions.md lines 78-99; found by REF-product-requirements-sources)

## `docs/product/requirements.md section 11 (Website Requirements)`

- **Outdated:** Describes Website v1 as a pricing placeholder that must not launch a full Cloud chat product. **The code says:** definition.md and commercial.md say Managed Free chat is open to signed-in users since 2026-06-27 and Web chat is subscription-backed. (docs/product/requirements.md lines 1080-1107 versus docs/product/definition.md Launch Lock; found by REF-product-requirements-sources)

## `docs/product/requirements.md section 12 (Desktop Requirements)`

- **Outdated:** Says Desktop exposes Local, BYOK and Cloud modes and is the local-private compute host with BYOK setup. **The code says:** definition.md, experience-contract.md 12.2 and D-2026-09-15-04 say the public Electron Desktop shows hosted Cloud chat with inference in Managed Cloud; Local and BYOK live in the retained Tauri host. (docs/product/requirements.md lines 1108-1147 versus docs/product/definition.md Surface Roles and docs/decisions/2026-09-15-founder-decisions.md D-2026-09-15-04; found by REF-product-requirements-sources)

## `docs/product/suite.md`

- **Outdated:** Describes Mobile as 'Unpublished client' and the Web role without the guest chat route. **The code says:** Code includes a guest chat route behind a flag and the website labels all non-web surfaces 'Coming soon' consistently with unpublished state; guest chat is not mentioned in suite.md. (apps/web/app/api/llm/v1/chat/completions/guest/route.ts; apps/web/lib/surface-status.ts:6-13; docs/product/suite.md:33; found by SURF-web)
- **Outdated:** The Trust Modes table (lines 53-57) names the third mode Managed. **The code says:** Managed is the internal id; the label shown to users is Cloud. The doc also says surface UI must source labels from the types package, which defines Local, BYOK and Cloud. (docs/product/suite.md:55-57; packages/contracts/types/src/suite-contracts.ts:67-83; found by REF-glossary)

## `docs/product/suite.md (Mobile row, line 33)`

- **Outdated:** Describes Mobile as an 'Unpublished client with small on-device Local LLM work in the codebase' and Cloud as 'public-alpha'. **The code says:** The code has a full Local chat path with four runtimes, a downloader and a model picker. I cannot confirm release status from the code. The document's tone understates the implementation. (apps/mobile/stores/chat/chatExecutionStore.ts:3036-3232; packages/platform/local-llm/src/selector.ts:105-146; found by SYS-local-inference)

## `docs/product/surface-feature-matrix.md`

- **Outdated:** Lists Connectors as general_availability. **The code says:** Connector release is coming_soon, with 13 ids selectively released. (packages/contracts/types/src/connector-release.ts:14-30; found by SYS-connectors-plugins-and-skills)
- **Outdated:** Marks Image generation on mobile as Unverified ('Nothing under apps/mobile was found naming the image work mode') and Video generation on Chrome as Absent ('Nothing under apps/extension/src requests a video'). Last updated 2026-09-20. **The code says:** Mobile has image generation (async job with polling) and the imageGen flag is true. The Chrome side panel imports and calls startChromeVideo against /api/media/video/generate and polls /api/media/video/status. (apps/mobile/src/features/image/services/imagegen.ts:70-100; apps/mobile/lib/v1FeatureFlags.ts:27; apps/extension/src/side_panel.ts:395-401 and :6253; apps/extension/src/features/cloud-bridge/videoGenerationClient.ts:9-12; found by SYS-voice-and-media)
- **Outdated:** States that Remote control is absent on the CLI (nothing under apps/cli/src is a host) and present on mobile. **The code says:** apps/cli/src/remote_control holds a full host. Mobile has the files, but they are switched off in v1 by FEATURES.companion and FEATURES.dispatch being false. (docs/product/surface-feature-matrix.md:562-569; apps/cli/src/remote_control/mod.rs:759; apps/mobile/lib/v1FeatureFlags.ts:1-43; found by SYS-sync-and-continuity)
- **Outdated:** Marks web Chat as Unverified because no import of WebChatPage was found. **The code says:** The chat route imports WebChatRoot, which mounts WebChatPage (generated file dated 2026-09-20). (apps/web/app/chat/[sessionId]/page.tsx:2; apps/web/features/chat/components/WebChatRoot.tsx; docs/product/surface-feature-matrix.md:154; found by SURF-web)
- **Outdated:** Last updated 2026-09-20; marks mobile companion/agent routes as present although the dispatch and companion flags are false in v1 builds, and several cells are 'unverified' **The code says:** FEATURES.dispatch and FEATURES.companion are false, so pairing links and background tasks are compiled out (apps/mobile/lib/v1FeatureFlags.ts:12,16; apps/mobile/app.config.js; found by SURF-mobile)
- **Outdated:** Several vscode cells are marked unverified because features/settings, onboarding, context-handoff, editor-utilities, account-auth and config are 'directories, not entry points'. **The code says:** Those folders hold files that are imported and wired: features/account-auth/deviceAuth.ts is used by commandSetup.ts, features/context-handoff/index.ts is imported by extension.ts, features/editor-utilities is imported by extension.ts, features/settings/SettingsPanel.ts exists. (apps/extension-vscode/src/extension.ts:2-14,50-54; apps/extension-vscode/src/core/commandSetup.ts:1221; docs/product/surface-feature-matrix.md:238,258,428,528,588; found by SURF-vscode)

## `docs/product/surface-feature-matrix.md (chrome, plan or quota row, line 249)`

- **Outdated:** Says nothing renders the plan. **The code says:** features/side-panel/freePlanNotices.ts branches on the free billing tier and freeTrialClient.ts handles plan tier and quota recovery; a plan label itself was not found, so the row is only partly stale. (apps/extension/src/features/side-panel/freePlanNotices.ts:193; freeTrialClient.ts:122-160; found by SURF-chrome)

## `docs/product/surface-feature-matrix.md (chrome, settings row, line 239)`

- **Outdated:** Says nothing under apps/extension/src imports or declares options.ts, so the settings page is unverified. **The code says:** options.ts is a Vite build entry and manifest options_page points to src/options.html. (apps/extension/vite.config.ts:75; apps/extension/manifest.json options_page; found by SURF-chrome)

## `docs/product/surface-feature-matrix.md (cli MCP, approval, cloud tasks, repo cells)`

- **Outdated:** Marks mcp/mod.rs, safety/approval.rs, cloud and repo as 'unverified' because no import was found. **The code says:** lib.rs declares `pub mod cloud`, `pub mod mcp`, `pub mod repo` and `pub mod safety`, so they are mounted. (apps/cli/src/lib.rs:22,44,62,63; found by SURF-cli)

## `docs/product/surface-feature-matrix.md (cli remote-control cell, line ~567)`

- **Outdated:** Says 'Nothing under apps/cli/src is a remote-control host or client.' **The code says:** apps/cli declares `pub mod remote_control`, has a `Command::RemoteControl` that calls `remote_control::run`, and a src/remote_control folder with host.rs and envelope.rs. (apps/cli/src/lib.rs:60,894,6659-6678; found by SURF-cli)

## `docs/product/surface-feature-matrix.md (last updated 2026-09-20)`

- **Outdated:** Lists CLI image generation as Present and Chrome event triggers as Absent without the later Chrome run journal; its dated cells predate recent commits such as unattended browser tasks. **The code says:** The chat image tool is offered only on web, desktop, mobile and chrome; the Chrome extension keeps a scheduled-task run journal (scheduled-task-runs.ts). (apps/web/app/api/media/image/lib/image-chat-tools.ts:50-55; apps/extension/src/features/background/scheduled-task-runs.ts:1-30; found by SYS-agents-tools-and-automation)
- **Outdated:** Says plugins are absent on mobile ('canUsePlugins false for mobile'). Says MCP is absent on desktop. **The code says:** canUsePlugins is true in the mobile capability row. Mobile has plugin screens and installs through the marketplace-installations route. Desktop has a Tauri MCP module with its own OAuth store, and an MCP config editor. (packages/contracts/types/src/capabilities.ts:54,87,120; apps/mobile/src/features/plugins/sourcesService.ts:80-91; apps/mobile/app/(app)/plugins/index.tsx; apps/desktop/src-tauri/src/core/mcp/oauth.rs; apps/desktop/src/features/mcp/MCPConfigEditor.tsx; found by SYS-connectors-plugins-and-skills)

## `docs/runbooks/capacity-and-load-testing.md`

- **Outdated:** Says admission is per conversation (plus video) with nothing else, and lists streaming admission only as conversation-turn-admission.ts. **The code says:** There is also a per-user managed concurrent turn ceiling by plan (acquireManagedTurnSlot, with denials plan-excluded, ceiling-reached, limiter-unavailable) and tier-scaled rate limits. Still no process-wide backpressure, so the main conclusion holds. (apps/web/lib/rate-limit.ts:925-960,1330-1440; found by SYS-observability-and-operations)

## `docs/runbooks/free-quota-models.md`

- **Outdated:** The sentence 'Mobile restores the eligible no-attachment image fallback; its video UI remains paid-only despite media-capable transport' implies a paid-only video UI exists on mobile. **The code says:** Mobile video is switched off by the v1 flag videoGen: false, and video messages are hidden from the message list when the flag is off, so there is no paid-only video UI. Also the runbook says 'Plans with the capability are not counted or capped per day', while video seconds are capped monthly by tier policy on the Max product tier. (apps/mobile/lib/v1FeatureFlags.ts:28; apps/mobile/src/features/chat/components/MessageList.tsx:113-114; apps/web/lib/services/tier-unit-quota-service.ts:57-58; found by SYS-voice-and-media)

## `docs/runbooks/incident-response.md`

- **Outdated:** The 'Where the alert lands' section lists three channels (email, pager, incident channel) and says an undeliverable alert is when none reached anyone. It does not mention the fourth, out-of-band webhook and status mirror fallback, and the detector table does not say evaluate-slo-burn also evaluates cost and latency anomalies. **The code says:** dispatch.ts tries the out-of-band webhook and writes a status mirror when no channel delivered, and counts a paged out-of-band alert as delivered; evaluate-slo-burn also runs evaluateAnomalies. (apps/web/lib/server/incident/dispatch.ts:140-175; apps/web/app/api/cron/evaluate-slo-burn/route.ts:16-21,116; found by SYS-observability-and-operations)

## `docs/runbooks/personal-data-breach.md`

- **Outdated:** Last updated 2026-10-03; its claims that no admin route or script calls sendBulkTransactionalEmail and that no in-product or public notice route exists were not re-verified against current code. **The code says:** Not re-checked in code in this pass; treat as unverified rather than wrong. (docs/runbooks/personal-data-breach.md section 5 (header date 2026-10-03); found by ENG-recovery)

## `docs/runbooks/release-rollback.md`

- **Outdated:** Nothing found contradicting code; however the statement that the rollback workflow is disabled cannot be confirmed, and the intro says the only rollback was an in-job step until 2026-09-18, while that in-job step still exists. **The code says:** deploy-production.yml still contains a failure() rollback step using vercel rollback, alongside the dispatch inputs and a rollback-web job. (.github/workflows/deploy-production.yml:515-525,15-25,819; found by ENG-recovery)

## `docs/security/security.md section 1.1 first sentence and 'Website account default'`

- **Outdated:** Describes the Free-plan and website default in terms of 'Skip approvals' wording; the code constant is the policy value 'autonomous'. Wording in the doc is a product label, not the code name. **The code says:** CLOUD_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY = 'autonomous' and WEB_ACCOUNT_DEFAULT_TOOL_APPROVAL_POLICY aliases it. The document matches in behaviour; only the label differs. (packages/contracts/types/src/tool-approval-policy.ts:13; apps/web/shared/types/toolApprovalPolicy.ts:29; found by SYS-security-and-privacy)

## `docs/security/security.md section 3 (Accepted risk paragraph)`

- **Outdated:** Says 'All four keys live only as deployment environment variables', but the rotation cadence table and the first paragraph name three keys on the cadence (CUSTOM_CONNECTOR_TOKEN_ENCRYPTION_KEY, GITHUB_TOKEN_ENCRYPTION_KEY, TOTP_ENCRYPTION_KEY) and DEVICE_TOKEN_ENCRYPTION_KEY is stated to seal nothing. **The code says:** The same document states DEVICE_TOKEN_ENCRYPTION_KEY is read by no module, so only three live keys remain; the count of four is inconsistent within the file. (docs/security/security.md:689-691,750-754,767; found by SYS-security-and-privacy)

## `docs/security/upload-scanning.md`

- **Outdated:** Says no web code calls the scanner's POST /v2/scans yet, and that the two paths storing files are chat-attachment complete and project knowledge extraction. **The code says:** The web has a protocol 2 client and the large-file intake step runner submits source scans; the coverage guard lists a third finishing path, chat-file-intake/steps.ts, which must call inspectUploadHead and submitSourceScan. (apps/web/lib/security/source-scan-client.ts:196-295; apps/web/lib/server/chat-file-intake/steps.ts:181,689; scripts/check-upload-inspection-coverage.mjs (DEFERRED list); found by SYS-files-artifacts-and-storage)
- **Outdated:** States the external scanner call timeout implicitly via the service's 14-second deadline; the web caller uses a 15-second abort, so the two numbers differ slightly. No functional contradiction found. **The code says:** runExternalScanner uses AbortSignal.timeout(15_000). (apps/web/lib/security/upload-scan.ts:452; docs/security/upload-scanning.md:73-77; found by SYS-security-and-privacy)

## `docs/standards/api-rate-limits.md`

- **Outdated:** No contradiction found in the limits table; the table matches rateLimitConfigs and is pinned by a test. Its Last updated date (2026-09-27) predates later rate-limit changes I could not date, so freshness is unverified. **The code says:** Limits and fail modes match rate-limit.ts at the cited lines. (apps/web/lib/rate-limit.ts:282-286, :354-363, :399-403, :836-840; developer-api-contract.test.ts:233-262; found by SYS-api-and-contracts)
- **Outdated:** Shows POST /chat/completions as a flat 30 requests per minute per user and /embeddings as 60. **The code says:** llm-completion and chat-conversation (used by embeddings) are in TIER_SCALED_KEYS, so the effective limit is the base multiplied by the plan's concurrent turns when a plan tier is passed. The base values (30, 60, 1500, default 100) match. (apps/web/lib/rate-limit.ts:354-362,925-960; apps/web/app/api/llm/v1/embeddings/route.ts:126; found by SYS-observability-and-operations)

## `docs/standards/http-api-surface.md`

- **Outdated:** Describes run control as `runs/{runId}` carrying pause, resume, steer and archive, and does not name the extra `chat/completions/guest` route or the `resume/stream` and `steer/{steerId}` routes in the tree. The OpenAPI file lists only runs/{runId}/resume for run control. **The code says:** Route files exist for runs/[runId]/{pause,archive,resume,resume/stream,steer,steer/[steerId]} and chat/completions/guest. (find apps/web/app/api/llm; apps/web/public/openapi.json paths; docs/standards/http-api-surface.md:76-79; found by SYS-api-and-contracts)

## `docs/standards/naming-conventions.md`

- **Outdated:** Lines 22 and 34-35 say the public brand is AGI, that surfaces are AGI Desktop, AGI Web, AGI Mobile, AGI CLI, AGI in Chrome and AGI for VS Code, and that managed cloud is AGI Cloud. **The code says:** The brand string is AGIWORKFORCE, the product names are plain (Chat, Mobile, Desktop, CLI, Extension, Code, Work), and the managed mode label is Cloud. The apps themselves disagree: Mobile shows AGI Mobile, the VS Code manifest says AGI Code and the Chrome manifest says AGI Extension. (packages/contracts/types/src/product-names.ts:1-15; apps/web/lib/surface-status.ts:29-36; packages/contracts/types/src/suite-contracts.ts:79; apps/mobile/app.config.js:81; apps/extension-vscode/package.json:3; apps/extension/manifest.json:3; found by REF-glossary)

## `ollama-manifest.json`

- **Outdated:** It launches `agiworkforce ollama-setup` for configuration, sets OLLAMA_HOST from {{host}}, and states minContextLength 65536 and '24 providers, 150+ skills'. **The code says:** No `ollama-setup` subcommand, no OLLAMA_HOST read and no 65536 context check were found in the CLI. Local base URLs come from CLI config and default to loopback ports. The `--provider`, `--model` and `--yes` flags do exist. (grep over apps/cli/src and crates found no match for ollama-setup, OLLAMA_HOST or a 65536 context check; apps/cli/src/local_models.rs:54-67; apps/cli/src/lib.rs:195-196; found by SYS-local-inference)

## `packages/ai/model-registry/catalog/harnesses.json (vscode/local-chat and vscode/byok-chat, lines 703-725)`

- **Outdated:** Both profiles have status 'unwired'. **The code says:** The VS Code extension supports Local through the CLI app-server (Ollama, LM Studio) and own key through the CLI login, with no AGI subscription needed. The catalog flag lags the implementation. (apps/extension-vscode/src/integrations/localRuntimeClient.ts:~720-745; apps/extension-vscode/src/providers/terminalProvider.ts:~383-404; apps/extension-vscode/README.md:~35-38; found by SYS-execution-boundaries)

## `packages/ai/model-registry/catalog/harnesses.json, harness 'mistral/chat-completions'`

- **Outdated:** Adapter field names @agiworkforce/providers-mistral. **The code says:** No such package exists in packages/ai/providers, and the web dispatch table has no mistral entry. (packages/ai/providers directory listing; adapter-providers.ts:126-258; found by SYS-inference-providers)

## `packages/ai/provider-runtime/src/index.ts (header comment)`

- **Outdated:** Lists apps/mobile and apps/extension as consumers of the error taxonomy. **The code says:** Both apps list @agiworkforce/provider-runtime in package.json, but no source file in either imports it. The Chrome extension imports only provider-protocol (ThinkingTagSplitter, three files). (apps/mobile/package.json:67; apps/extension/package.json:49-50; grep of apps/mobile/src and apps/extension/src; provider-runtime/src/index.ts:12-16; found by SYS-inference-providers)

## `packages/ai/routing/src/index.ts (header comment)`

- **Outdated:** Describes the package as 'pure-TypeScript, zero side effects, zero shared module state'. **The code says:** The package also holds stateful stores (route-health-store.ts, capability-health.ts store factory) and env-var readers for stage switches. (packages/ai/routing/src/route-health-store.ts; packages/ai/routing/src/capability-health.ts:249; packages/ai/routing/src/auto.ts:766-780; found by SYS-model-catalog-and-routing)

## `packages/contracts/cloud-contracts/src/index.ts header comment`

- **Outdated:** Says the typed clients are shared by Web, Desktop, Mobile, and the Services compatibility facade, and omits VS Code and Chrome, which also use them. **The code says:** VS Code and Chrome extension files call createManagedCloud* factories, and no packages/services/src directory exists. (packages/contracts/cloud-contracts/src/index.ts:1-8; apps/extension-vscode/src/utils/managedCloudChat.ts; apps/extension/src/features/cloud-bridge/projectsClient.ts; ls packages/services/src failed; found by SYS-api-and-contracts)

## `packages/contracts/licensing/src/index.ts and crates/agiworkforce-licensing/src/lib.rs (header comments)`

- **Outdated:** Not outdated as such, but they are the only statement that the verifier is unwired. No project guide says whether Team and Enterprise editions will use it. **The code says:** No app imports the package or crate; editions are only team and enterprise in the claims schema. (packages/contracts/licensing/src/claims.ts:3-4; searches found no app-level importer; found by SYS-subscriptions-entitlements-and-usage)

## `packages/contracts/types/src/billing-catalog.ts (PLAN_SURFACE_VISIBILITY, lines 235-247)`

- **Outdated:** Marks local-only and byok selectable on web, desktop and mobile, which reads as if those modes run there. **The code says:** The trust-boundary document says web and Chrome are Cloud only, public Desktop chat is Cloud only, and BYOK is not offered on mobile. This is a catalog-versus-document mismatch; the catalog is code and wins as plan visibility, but it is not mode support. (packages/contracts/types/src/billing-catalog.ts:235-247; docs/architecture/trust-boundaries.md:45-60; found by SYS-subscriptions-entitlements-and-usage)

## `packages/contracts/types/src/model-catalog.ts (header comment)`

- **Outdated:** Lists consumers apps/desktop/src/constants/llm.ts, apps/web/constants/llm.ts and apps/mobile 'via API responses' as the consumers. **The code says:** Mobile imports the shared packages directly (routing, types) and runs resolveAutoRoute on the device; the CLI and Rust crates also consume the generated registry. (apps/mobile/src/features/chat/utils/cloudDispatchRouting.ts:1-16; apps/cli/src/model_catalog.rs:16; found by SYS-model-catalog-and-routing)

## `packages/platform/local-llm/package.json (peerDependencies)`

- **Outdated:** Peer range for llama.rn is ^0.10.0. **The code says:** apps/mobile/package.json depends on llama.rn ^0.12.9. (packages/platform/local-llm/package.json peerDependencies; apps/mobile/package.json:132; found by SYS-local-inference)

## `packages/platform/local-llm/src/selector.ts error text ('join AGI Cloud when it is available')`

- **Outdated:** The no-model error tells the user to join AGI Cloud when it is available, which depends on waitlist state. **The code says:** Cloud chat on Mobile is gated by a waitlist flag (cloudUnlocked), so the advice is only correct for some users. (packages/platform/local-llm/src/selector.ts:59, :145; apps/mobile/stores/chat/chatExecutionStore.ts:2236-2237; found by SYS-local-inference)

## `packages/ui/ui/src/index.ts header comment`

- **Outdated:** Says the package is shared by web and desktop only. **The code says:** Still true for package.json dependencies (web and desktop, plus unified-chat), but the ui package also exports auth-scene, sidebar and directory areas that are not 'plain config'. The header understates the scope. (packages/ui/ui/package.json exports; directory listing of packages/ui/ui/src; found by SYS-shared-ui-and-design)

## `scripts/neon-migrate.mjs (help and error text)`

- **Outdated:** Messages list targets local|ci|branch|production. **The code says:** Allowed targets also include staging, and the staging workflow uses it. (scripts/lib/neon-migrations.mjs:16; scripts/neon-migrate.mjs:111,126; .github/workflows/deploy-staging.yml:145; found by ENG-deployment)

## `scripts/neon-migrate.mjs --help text`

- **Outdated:** Lists targets local, ci, branch and production only. **The code says:** MIGRATION_TARGETS also includes staging, and the staging deploy workflow uses it. (scripts/lib/neon-migrations.mjs:16; .github/workflows/deploy-staging.yml:145; found by SYS-data-model-and-migrations)

## `scripts/neon-migrate.mjs help text (printHelp)`

- **Outdated:** Lists targets local|ci|branch|production. **The code says:** MIGRATION_TARGETS also includes staging, used by the staging workflow. (scripts/lib/neon-migrations.mjs:16; .github/workflows/deploy-staging.yml:145; found by ENG-migrations)

## `services/signaling-server/README.md`

- **Outdated:** Says the initiator defaults to desktop. **The code says:** The web pairing route defaults initiator to mobile when the request names none; the relay's own default was not re-read. (apps/web/app/api/pair/initiate/route.ts:62-65; found by SYS-sync-and-continuity)
