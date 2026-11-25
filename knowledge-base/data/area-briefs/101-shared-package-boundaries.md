# Area 101. Shared package boundaries

38 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S101.01 Shared request/response contracts.
- Should: Client-called API routes and every client parse request/response bodies with one shared schema package.
- Status: platform partial
- Code: packages/contracts/cloud-contracts/src/web-search-allowance.ts:1; packages/contracts/cloud-contracts/src/service-notices.ts:1; packages/contracts/cloud-contracts/src/managed-media.ts:220
- Unfinished: platform: partials/platform-final 49567fe099, 5b37bb05e9, d2e43f39d6: device authorization (code, token, refresh, approve; client-runtime and the approval page parse with it), notification feed (web and mobile), routing preferences (web and mobile) and waitlist/public (stale) leave the baseline: 171 to 164. The ownership guard's module list now covers the five modules it was failing on. Left: 164 baselined routes (settings 50, admin 30 and smaller families); check-route-shared-contracts still fails on connectors/bank-accounts/exchange and /link (m-features Plaid files).

## S101.02 Shared event schemas.
- Should: Streamed and domain events are declared once and parsed through the same schema on every surface.
- Status: platform done
- Code: apps/web/lib/audit-domain-events.ts:17; apps/web/lib/audit-domain-events.ts:48; apps/web/lib/security-audit.ts:643; apps/web/lib/security-audit.ts:721; scripts/check-domain-event-emitters.mjs:28; scripts/check-domain-event-emitters.mjs:98; package.json:131

## S101.03 Shared content-block schemas.
- Should: Message content blocks come from one vocabulary that every client renders or degrades explicitly.
- Status: platform done
- Code: apps/mobile/src/features/tasks/runPresentation.ts:1; apps/mobile/services/streaming.ts:620; scripts/check-content-blocks.mjs:63

## S101.04 Shared error definitions.
- Should: Error codes, classes and retryability are defined once and every client maps them rather than inferring its own.
- Status: platform done
- Code: apps/web/shared/lib/error-utils.ts:56; apps/web/shared/lib/error-utils.ts:74; apps/web/shared/lib/error-utils.ts:142; packages/contracts/types/src/index.ts:19; scripts/check-error-model.baseline.json:2

## S101.05 Shared resource identifiers.
- Should: Resource identifiers follow one contract applied to every primary key, and ids are server-minted values clients carry unchanged.
- Status: platform done
- Code: packages/contracts/types/src/identifier-contract.ts:53; scripts/check-identifier-discipline.mjs:3; packages/contracts/types/src/conversation.ts:6

## S101.06 Shared model metadata.
- Should: Model metadata comes from one compiled registry shared by TypeScript and Rust, with no private copies in clients.
- Status: platform partial
- Code: apps/web/features/marketing/components/RouteFlow.tsx:6; apps/web/features/marketing/components/LandingSections.tsx:3; apps/web/features/admin/components/RouteEconomicsPanel.tsx:85
- Unfinished: platform: partials/platform-final 7eba315679: the web marketing marquee, route diagram and admin route economics panel read the catalogue (PROVIDERS_IN_ORDER, COMPAT_CAPABILITY_SOURCES); three web entries left the check-client-inference baseline. Left: the Tauri renderer's types/provider.ts (its union carries mistral, together, fireworks, cerebras, deepinfra, cohere, ai21, sambanova, azure, llamacpp, vllm, which the shared Provider lacks), types/media.ts and OnboardingWizard key-prefix detection, and mobile providerStreamClient.ts.

## S101.07 Shared capability resolution.
- Should: Capabilities are resolved once on the server and every client reads that decision instead of deciding locally.
- Status: platform done
- Code: scripts/check-capability-consumption.mjs:1

## S101.08 Shared entitlement resolution.
- Should: Plan entitlements are resolved through one server entry point from one shared plan vocabulary.
- Status: platform done
- Code: scripts/check-entitlement-entry-point.mjs:40; scripts/check-entitlement-entry-point.mjs:61; scripts/check-entitlement-entry-point.mjs:97; apps/web/lib/services/org-entitlements.ts:72; package.json:132

## S101.09 Shared policy contracts.
- Should: Workspace policy keys are declared once and every declared key is enforced by the server.
- Status: platform done
- Code: apps/cli/src/cloud/workspace_policy.rs:77; apps/cli/src/cloud/workspace_policy.rs:183; scripts/config/workspace-policy-enforcement-baseline.json:1

## S101.10 Shared authentication client.
- Should: One authentication client (sign-in, device flow, token refresh) is shared by every client surface.
- Status: platform done
- Code: packages/contracts/cloud-contracts/src/device-authorization.ts:3

## S101.11 Shared API client.
- Should: Every client calls the server through the same API client modules.
- Status: platform partial
- Code: apps/extension-vscode/src/features/cloud-tasks/continueInCloud.ts:144; apps/extension/src/features/computer-use/cloudAgentClient.ts:373
- Unfinished: platform: Idempotency keys are no longer a gap on VS Code or Chrome (check-idempotency passes; both send keys on chat, schedules, cloud runs). Left: the Electron main process uses no shared managed-cloud client and the CLI is Rust.

## S101.12 Shared streaming client.
- Should: One streaming client (SSE reading, reconnect, event parsing) is shared by every client.
- Status: platform done
- Code: apps/mobile/services/streaming.ts:445; scripts/check-sse-readers.mjs:56

## S101.13 Shared conversation-state logic.
- Should: Conversation state transitions (activity, queue, message status) use one shared reducer on every client.
- Status: platform partial
- Code: packages/client/client-runtime/src/index.ts:29; apps/extension/src/features/side-panel/chat-state.ts:1
- Unfinished: platform: partials/platform-final 7075a2d2d3: VS Code follow-ups now wait in the shared client-runtime message queue (volatile, cap 20, payloads beside it by id); FIFO, cap, cancel and epoch tests pass unchanged. The lifecycle-names baseline holds no VS Code files (53 lifecycle entries in check-client-inference.baseline.json, not 66). Left: VS Code local-runtime tool progress is posted straight to the webview rather than through applyAgentActivityEvent (needs a runtime-event to envelope adapter and a new webview message); the CLI keeps its own state logic (c-cli).

## S101.14 Shared synchronization logic.
- Should: Sync (cursors, push/pull, tombstones, conflicts) runs through one shared implementation on every synced surface.
- Status: platform partial
- Code: packages/contracts/cloud-contracts/src/sync.ts:110; apps/web/app/api/chat/sync/route.ts:89; apps/web/app/api/chat/sync/route.ts:597; packages/client/sync/src/conversations.ts:66
- Unfinished: platform: partials/platform-final 833c5fc654: mobile's conversation store now receives starred (shown as a star on the chat row, as on web) and drops archived chats, with a sync test. Left: Chrome, VS Code and the CLI keep their own sync code.

## S101.15 Shared Project models.
- Should: Project records have one shared model used by the server and every client.
- Status: platform done
- Code: scripts/check-cli-wire-parity.mjs:108; scripts/check-cli-wire-parity.mjs:21; package.json:350

## S101.16 Shared file/Library models.
- Should: Files and Library items share one file model across server and clients.
- Status: platform done
- Code: apps/web/lib/server/pdf-attachment-content.ts:139; apps/web/lib/server/project-knowledge-extraction.ts:95; scripts/check-file-reference-canonical.mjs:46

## S101.17 Shared artifact models.
- Should: Artifacts share one model across server and clients.
- Status: platform done
- Code: scripts/check-cli-wire-parity.mjs:152

## S101.18 Shared source/citation models.
- Should: Sources and citations use one shared model on every surface that shows them.
- Status: platform partial
- Code: apps/web/shared/types/common.ts:203; apps/web/features/chat/utils/research-plan.ts:116
- Unfinished: platform: partials/platform df36f1085b: the last web source-record copies extend AgentEventSource; web and mobile are done. Left: Chrome and VS Code adoption patches (surface phases).

## S101.19 Shared Memory contracts.
- Should: Memory records and controls share one contract across server and clients.
- Status: platform done
- Code: apps/extension-vscode/src/memory/accountMemoryClient.ts:22; apps/extension/src/features/cloud-bridge/memoryClient.ts:9

## S101.20 Shared tool definitions.
- Should: Tool definitions share one Rust-owned shape and every offerable tool is declared once.
- Status: platform partial
- Code: apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:142; apps/web/app/api/llm/v1/chat/completions/lib/tool-metadata.ts:546; scripts/check-tool-registry.mjs:44
- Unfinished: platform: partials/platform-final 25b9a0802f, 064c76deea: search_places, ask_clarifying_questions and the eight paired-Chrome commands are declared (undeclared baseline 11 to 1). Left: run_command stays with the Cloud Code agent loop's own definitions and approval store, and web tool metadata is still a TS table beside the Rust-generated ToolDefinition wire shape.

## S101.21 Shared approval contracts.
- Should: Approval requests, decisions and resume share one contract across server and clients.
- Status: platform done
- Code: apps/extension/src/features/cloud-bridge/freeTrialClient.ts:18; apps/extension-vscode/src/integrations/localRuntimeClient.ts:12; apps/extension/src/features/options/approval-history-section.ts:146

## S101.22 Shared connector interfaces.
- Should: Connectors expose one shared interface (connection, health, policy) to server and clients.
- Status: platform done
- Code: packages/contracts/cloud-contracts/src/connectors.ts:598; packages/contracts/cloud-contracts/src/connectors.ts:625; apps/web/app/api/settings/organization/connector-policy/route.ts:107; apps/web/features/workspace-console/hooks/use-connector-policy.ts:22; packages/client/client-runtime/src/connectors/parse.ts:82

## S101.23 Shared Skill/Plugin manifests.
- Should: Skill and plugin manifests are parsed by one shared implementation everywhere.
- Status: platform done
- Code: packages/tools/skills/src/__fixtures__/skill-manifests.golden.json:1; packages/tools/skills/src/__tests__/manifest-fixtures.test.ts:1; apps/cli/src/skills.rs:1231

## S101.24 Shared agent/task models.
- Should: Agent runs and tasks share one model and one lifecycle vocabulary across server and clients.
- Status: platform partial
- Code: apps/extension/src/features/background/scheduled-task-cancellation.ts:136
- Unfinished: platform: partials/platform-final 7eba315679: Chrome scheduled-run cancellation reads the shared task board stages (it also missed partial and timed_out as terminal). Left: Chrome schedulesSection.ts switches on the schedule-run status contract-typed from cloud-contracts, which the guard reads as lifecycle names; 42 Tauri renderer files under apps/desktop/src; mobile baseline files.

## S101.25 Shared coding-session protocol.
- Should: The local coding-session protocol is defined once in Rust and generated for every TypeScript consumer, with CI failing on drift.
- Status: platform done
- Code: scripts/generate-protocol-types.mjs:28; .github/workflows/ci.yml:612; apps/extension-vscode/src/integrations/localRuntimeClient.ts:4; apps/desktop/electron/runtime/developerSessionService.ts:28

## S101.26 Shared usage/billing models.
- Should: Usage and billing figures use one shared model on server and clients.
- Status: platform done
- Code: scripts/check-protocol-types.mjs:218; scripts/check-protocol-types.mjs:341

## S101.27 Shared notifications.
- Should: Notifications use one shared category and target vocabulary on server and clients.
- Status: platform done
- Code: apps/mobile/stores/notificationPrefsStore.ts:16; apps/mobile/src/features/notifications/accountFeed.ts:3

## S101.28 Shared localization.
- Should: Every UI surface draws its strings from one shared localization catalogue.
- Status: platform partial
- Code: apps/mobile/src/i18n/index.ts:8; apps/extension-vscode/src/l10n/index.ts:2
- Unfinished: platform: @agiworkforce/i18n serves web and mobile; VS Code keeps its own l10n locale files, and Chrome and CLI use neither.

## S101.29 Shared design tokens.
- Should: Every GUI surface takes colours, radii and type from one shared token package.
- Status: platform partial
- Code: apps/mobile/src/ui/theme/tokens.ts:1; apps/extension/src/tokens.ts:1; scripts/check-css-tokens.mjs:9
- Unfinished: platform: Web, Chrome and VS Code read @agiworkforce/design-tokens under a CSS-token guard; mobile keeps its own colour palette (only radii come from the package).

## S101.30 Shared web UI primitives.
- Should: Every web-rendered surface builds UI from one shared primitive library.
- Status: platform partial
- Code: packages/ui/ui/package.json:2
- Unfinished: platform: @agiworkforce/ui serves web (and desktop via hosted web); the Chrome side panel and VS Code webview are web UIs that build their own controls.

## S101.31 Platform-specific native UI primitives.
- Should: Each native surface has its own primitive layer that screens use instead of raw platform controls.
- Status: platform partial
- Code: scripts/check-mobile-primitives.mjs:20; scripts/check-mobile-primitives.mjs:84; scripts/config/mobile-primitives-baseline.json:1; package.json:134
- Unfinished: platform: partials/platform-final 77f4a0ae51: 117 modules moved from raw Pressable to PressableBox (full mobile jest 4600/4600, tsc clean); baseline 126 to 10. Left: 10 modules that also draw raw Text (the Text primitive adds NativeWind classes, so a visual check is needed), alias the import, or pass Pressable as a value (SendButton, VoiceInputButton).

## S101.32 Shared Markdown/content transformations.
- Should: Markdown and content transformations run through one shared implementation on every surface.
- Status: platform done
- Code: apps/extension-vscode/src/webview/render.ts:134; apps/extension/src/features/side-panel/markdown.ts:3; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:759

## S101.33 Platform-specific renderers.
- Should: Each surface has a renderer for the shared content model that declares which block kinds it renders and degrades the rest.
- Status: not applicable anywhere

## S101.34 Shared telemetry conventions.
- Should: Telemetry and analytics follow one shared vocabulary and redaction path on every surface.
- Status: platform partial
- Code: packages/contracts/types/src/product-analytics.ts:7
- Unfinished: platform: The analytics vocabulary is imported only by web; Chrome and VS Code share the error scrubber, while mobile telemetry and the CLI use neither.

## S101.35 Shared test data and schema conformance fixtures.
- Should: Wire contracts have shared golden fixtures that every implementation (server, TS clients, Rust) is tested against.
- Status: platform done
- Code: apps/cli/src/cloud/contract_fixtures.rs:44; apps/cli/src/cloud/contract_fixtures.rs:55

## S101.36 Shared configuration validation.
- Should: Configuration for every surface is validated through one shared registry and validator.
- Status: platform partial
- Code: scripts/check-config-keys.mjs:19; apps/web/lib/validate-env.ts:342; apps/web/lib/__tests__/validate-env.test.ts:335; apps/web/lib/__tests__/validate-env.test.ts:349
- Unfinished: platform: Validation covers only the web server (validate-env.ts plus the config-keys guard over apps/web); mobile, Chrome, VS Code, Electron and CLI validate config ad hoc.

## S101.37 Shared security-sensitive utility code.
- Should: Security-sensitive helpers (crypto, redaction, path containment) live in one shared place that every surface uses.
- Status: platform done
- Code: packages/platform/utils/src/secretRedaction.ts:1; packages/platform/utils/src/__tests__/secretRedaction.parity.test.ts:1; apps/web/lib/security/__tests__/secrets-audit.parity.test.ts:1; scripts/check-security-helpers.mjs:25

## S101.38 Explicit browser-only, server-only, and native-only exports.
- Should: Shared packages declare browser-only, server-only and native-only entry points explicitly.
- Status: platform done
- Code: scripts/config/package-runtimes.json:2; scripts/config/package-runtimes.json:163; scripts/check-package-runtimes.mjs:172; scripts/check-package-runtimes.mjs:357; package.json:136
