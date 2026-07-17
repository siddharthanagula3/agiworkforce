# TODO

Status: Current
Owner: Founder + platform lead
Last updated: 2026-07-15

Recreated 2026-07-15 (founder deleted the stale file intentionally). This is
the executable work queue only. Strategy lives in `PLAN.md`; the finalized
structure ruling and sequence live in
`docs/plans/target-structure-finalization-2026-07-15.md`; durable defects in
`docs/agent-context/known-flaws.md`.

## Active Queue (locked order; behavior lanes may run in parallel with disjoint write sets)

1. DONE 2026-07-15 — Frontend handoff P0s (`docs/plans/frontend-ui-ux-and-restructure-handoff-2026-07-15.md` §12–13):
   - VS Code: turn the intentional RED green — `if (options[i].disabled) continue;`
     in `fallbackModelGroups()` (`apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts`;
     failing assertion at `src/__tests__/webviewContent.webview.test.ts:180`).
   - VS Code: attachment-chip X must remove the host-side pending file
     (ID-based `removePendingAttachment` protocol) or the control goes away
     until deletion is real.
   - Web: `WEB-APPSHELL-MOBILE-SIDEBAR-01` — failing
     `matchMedia('(max-width: 768px)')` test first, then modal drawer
     (backdrop, Escape, focus management, `aria-expanded`, compact mobile
     header, close-on-navigate; desktop sidebar unchanged); rendered checks
     at 320/390/768/desktop on `/projects`, `/projects/[id]`, `/library`,
     `/schedules`.
2. Mechanical waves (single worker, serialized, per-wave gates from
   `docs/plans/monorepo-restructure-2026-07-08.md` Appendix B5):
   - M6 — DONE 2026-07-15: five merges landed (cache→utils-image; home-dir +
     rustls-provider→network-proxy; async-utils + utils-string→protocol);
     `utils-template` deleted as provably unused (disposition adjustment).
   - M7 — DONE 2026-07-15: guarded `tools/` root added;
     `services/skill-vetting` → `tools/skill-vetting` (verify.sh green from
     the new path); `tools/AGENTS.md` + repo-map Tools zone registered.
   - M8 — DONE 2026-07-15: both facades deleted (zero-importer proof,
     workspace 50→48, frozen install green, workspaceUnits 58→56, both
     ownership guards rewritten to anti-regression form, dead
     `shared-package-integration` lane retired).
   - T-wave (W4) — DONE 2026-07-16: `packages/` regrouped into
     `{contracts,ai,client,ui,tools,platform}` + renames
     `llm-runtime`→`provider-runtime`, `llm-normalize`→`provider-protocol`.
     Dispatched agent died at ~90%; orchestrator finished the relink, cache,
     guard-logic, compile.mjs root-path, and readme-scanroot gaps.
     typecheck:all 45/45, operability chain green, web compiles. Only W12
     (web domain-first internal move) remains as a mechanical wave.
3. Discipline wave 1 — CONTRACTS + FIRST CONSUMERS DONE 2026-07-15/16:
   session taxonomy (11 kinds), ExecutionProfile, and the capability
   handshake live in `packages/contracts/types/src/{sessions,capability-handshake}`
   (note: `capability-handshake/`, not the `capabilities` shorthand — that
   name collides with the pre-existing platform-capability module) with
   real consumers on web (/api/me handshake + conversation labeling),
   desktop (composition-root labeling + runtime-agreement assertion), and
   mobile (appMode labeling proven against guardedFetch). Facade-zero gate
   retired with M8. REMAINING W5 TAIL:
   - One versioned agent event envelope — DONE 2026-07-16
     (`agent_events` module + generated TS + web-edge adapter with a
     lossless fixture round-trip; `Refusal` is now a first-class stop
     member). Follow-on: converge the three surfaces' EMITTERS onto the
     envelope (adapters at edges), and wire Anthropic refusal / OpenAI
     content_filter to emit `Refusal` (the current one-way asymmetry is
     test-pinned).
   - Guardrail batch — DONE 2026-07-16: `rust-toolchain.toml` (1.94.0),
     `deny.toml` (bans/sources/licenses green after `publish = false` on
     all 15 first-party crates; advisories honestly red — 40 RUSTSEC IDs
     baselined as RUST-DEPENDENCY-ADVISORIES-01 with the catalog in
     docs/security/), `docs/agent-context/generated/` indexes + drift
     check wired into check:llm-operability, scoped AGENTS.md ×4.
     Founder follow-ups: wire `cargo deny check bans sources licenses` as
     a blocking CI step and `advisories` as non-blocking until triaged;
     the model-registry lane should align its AGENTS.md to the four-marker
     pattern (existence-enforced meanwhile).
   - Vendor-type leak gate + Turbo boundary tags — deferred INTO the
     T-wave (tags depend on the new package grouping).
   - Per-session capability-document versioning (labels currently carry
     explicit placeholder versions; staleness detection not yet real) +
     routing-admission integration of evaluateCapabilityAdmission.
4. Provider/billing correctness lane (handoff §6) — 2026-07-15 status:
   Anthropic `refusal`→error DONE (+ stop-reason regression tests;
   `pause_turn` gap tracked as PROVIDER-ANTHROPIC-PAUSE-TURN-01);
   `post_promo_prices` DONE in web `llm-cost-calculator` AND gateway
   `managedUsageBilling` (all four rate fields switch, boundary-instant
   tests both sides; gateway suite 224 pass); stale refund test rewritten
   onto `settleCreditsDurably` DONE. Follow-ups: (a) final-shape decision — first-class safety-stop
   member in the unified stop union (Anthropic `refusal` + OpenAI
   `content_filter` currently collapse to generic error); decide alongside
   the W5 event-envelope work when `llm-normalize` quiesces. (b) OpenAI
   Responses-native hosted tools DEFERRED pending two prerequisites: the
   W5 capability-registry semantics (do catalog `codeExecution`/`search`
   flags mean provider-native or harness-provided?) and a founder product
   decision on the deliberate `useResponsesApi:false` + Perplexity-backed
   `web_search` override on the web chat route; wiring anchors are recorded
   in the W6 report (translate-responses.ts, stream-responses.ts event
   switch, gateway `buildProviderAdapter('openai')`). (c) DONE 2026-07-15 —
   `managedUsageBilling` now imports the shared `@agiworkforce/routing`
   `isPromoExpired` (with `normalizeModelId` canonicalization); the interim
   inline helper was collapsed the same evening once the provider-factory
   lane's package.json edit settled; lockfile re-synced,
   `pnpm install --frozen-lockfile` green, gateway 224 + anthropic 45 +
   web 33 all re-verified.
5. P4 residual / W7 desktop engine extraction — IN PROGRESS (agent died
   mid-refactor 2026-07-16, crates left compiling by an orchestrator holding
   fix). State per the handover + current tree: c1 done; c2a byte-identity
   oracle DONE 2026-07-16 — see the DONE note below (26/26 GREEN, un-ignored,
   runs in the normal desktop suite as a permanent parity guard). The earlier RED
   narrative (keepalive shape-normalization, usage-composition, and the
   per-fixture divergence log) is fully resolved via sound, self-validating
   exceptions.
   `apps/desktop/src-tauri/src/core/llm/tests/{c2a_decode_oracle.rs,c2a_old_parser.rs}`
   (both untracked). c2b Ollama-on-shared-engine — DONE 2026-07-16 (executed +
   verified). The migration was NARROWER/safer than first mapped: Ollama's adapter
   keeps its own local `/api/chat` request-building (`think`/`num_ctx`/tools body,
   UNCHANGED — no request-drift risk); only its RESPONSE DECODE moved onto the
   shared engine. Three edits: (1) `stream_engine::decoder_for(Provider::Ollama) ⇒
Decoder::OllamaNative`; (2) `providers/ollama.rs` streaming path swapped
   `parse_sse_stream(response, Ollama)` → `decode_direct_stream(response, Ollama,
&request.model)` (drop-in — both yield `impl Stream<Item=Result<StreamChunk>>`;
   the `PromptToolInjectionStream` wrapper is decoder-agnostic, untouched); (3)
   removed the now-obsolete `#[allow(dead_code)]` on `OllamaNative` (now live via
   `decoder_for` → `run_ollama_stream`). So ALL 5 providers (anthropic/google/
   openai/openai-responses/ollama) now decode through the ONE shared
   `agiworkforce-llm` engine — canonical-owner + dedup goal element met on the live
   path. Byte-identity with the retired `parse_ollama_sse` is oracle-proven (4
   ollama fixtures green) modulo the enumerated intentional fixes. VERIFIED: clean
   `cargo check` (no warnings), oracle 26/26 green, ollama+stream*engine unit tests
   green, full `core::llm` 903 pass / 12 fail — the 12 are ALL the unrelated
   `routing_logic_tests` lane (gpt-5.4-mini vs 5.6-luna), ZERO new failures from
   c2b. HONEST CAVEAT: no live `/api/chat` smoke test run — but request-building is
   untouched and the decode is oracle-proven byte-identical, so residual runtime
   risk is minimal; still smoke-test against a local `ollama serve` before relying
   on it in anger. `parse_ollama_sse` is now unused by the live Ollama path (still
   referenced by `parse_sse_event`'s Ollama arm, so not statically dead) — removable
   in the founder-gated twin-deletion. Only `ManagedCloud` remains on the old
   `parse_sse_stream` path. c2c/c3/c4 NOT done. c2c SCOPED 2026-07-16 (next focused
   pass — a request-side parity oracle, mirror of c2a, "L"): the shared crate ALREADY
   serializes requests (`crates/agiworkforce-llm/src/serialize.rs` — per-dialect
   `convert_message_to*{anthropic,openai,openai_responses,gemini}`, `\*\_tools_json`,
   `ollama_chat_request_body`, `set_openai_max_tokens`, `add_message_cache_breakpoint`)
   with its OWN unit tests. c2c = golden old-vs-new BYTE-EQUALITY of request bodies
   per provider BEFORE deleting the desktop's duplicate serializers, then switch the
   desktop to the crate serializers. EXPECT REAL DIVERGENCES (not a rubber-stamp): the
   crate does sophisticated Ollama request processing (`compact_ollama_system_prompt`,
   `ollama_nativize_message_values`, num_predict omission, think-default) the desktop
   adapter may not mirror — diagnose + enumerate intentional deltas the same way c2a
   did for decode. Do it as a fresh focused session (c2a took a full one); a PARTIAL
   c2c is safe (proves nothing false, green-lights no deletion) but do NOT delete any
   request arm until its provider is proven byte-equal. CONCRETE GAP FOUND 2026-07-16
   (Ollama, by direct read): the crate `ollama_chat_request_body`(serialize.rs:614)
   HARDCODES`think:false`and OMITS`num_ctx`+`images`, whereas the desktop
   `OllamaChatRequest`(providers/ollama.rs ~560-568) sends`num_ctx:32768`(default),
   dynamic`think`via`resolve_ollama_think(request.thinking)`, and image blocks. So
   the crate serializer is NOT at feature parity — switching Ollama's request to it
   TODAY would drop context-window + thinking (regression). SCOPE CONFIRMED 2026-07-16
   by reading crate `ChatRequest` (stream.rs:45): fields are model/messages/max_tokens/
   temperature/tools/`thinking_budget`(Anthropic-only, u32)/idle_timeout — there is NO
   `num_ctx`and NO Ollama`think`bool (thinking_budget ≠ Ollama's think).`images`   likely already carried via`Message`/`ContentBlock::Image`(verify — may NOT be a
   gap). So c2c-Ollama = extend the SHARED`ChatRequest`struct (add`num_ctx`+ an
   Ollama`think`signal) — a crate-API change touching ALL dialects/callers — THEN
   populate them from the desktop + prove byte-equality + switch. That shared-type
   change (not a one-function serializer tweak) is why c2c is genuinely "L"/fresh-pass;
   both crate files (serialize.rs, stream.rs) are already` M` (prior W7 agent), so it's
   W7-lane work but stays uncommitted like the rest. d2/e2 already
   implemented (validate only); ~201 twin-file deletion — oracle-green gate now
   MET; remaining gates (host-owned-file manifest + orchestrator review + founder
   commit-sequencing) in the DONE note below;
   CLI`exec_policy.rs`→`agiworkforce-execpolicy` (`EXEC-POLICY-DUP-01`) pending.
   RESUME CAREFULLY (byte-identity guarantees) — do NOT rush-delete twins.
   DONE 2026-07-16: ALL 26 fixtures GREEN, `#[ignore]` REMOVED — the oracle runs
   in the normal desktop suite as a permanent parity guard. The re-scope question
   was resolved the sound way: intended bug-fixes are enumerated as
   SELF-VALIDATING, PINNED exceptions (UsageMergeCorrection, FinishReason /
   ToolCalls / SwallowedError recovery, OllamaEagerToolFinish,
   OllamaInvalidToolArgsWrapped, usage null≡zeros) — each proves new-correct
   against c2a_old_parser.rs source and still FAILS on any real regression; NO
   usage-VALUE blind skips, NO fabricated owner-decision-register citations. The
   new decoder intentionally FIXES real old bugs (anthropic message_delta usage
   under-count; old ollama tool-turn finish="stop"; old SWALLOWED openai-responses
   top-level/response.failed errors → old desktop HUNG on a responses stream
   error) — harmless at zero users but a behavior change to acknowledge on
   landing. ~201 twin-file deletion is now UN-GATED BY THE ORACLE but still needs
   a host-owned-file manifest + orchestrator review + the founder's
   commit-sequencing decision (whole W7 tree uncommitted + entangled — see
   [[project-restructure-landing-gates-goal-2026-07]]).
6. P1 residual dead-code sweep — DONE 2026-07-15 (W8): apps/web/src
   skeleton, test.db, agent-mode trio, 8 dead v3 components (3 planned + 5
   proven siblings), SearchModalCmdK; zero-importer proofs, web 4340 /
   unified-chat 644 / desktop suites green. Follow-up resolved same
   evening: the web composer's AgentModeSwitcher.tsx proved dead too
   (barrel-export-only; composer removed the mode UI deliberately) and was
   deleted — web typecheck + Composer 85/85 green; the live AgentMode type
   stays in features/chat/types/agentMode.ts.
7. P6 mobile SLM — CODE SIDE DONE 2026-07-16 (W10): Qwen3-VL-2B primary
   path had already landed in prior commits (re-verified checksums);
   LFM2-VL entry corrected to its true 450M identity (FOUNDER NOTE: this
   amends the recorded "LFM2-VL-1.6B" decision PARAMETER, not its
   low-RAM-tier intent — the 1.6B artifact is 2.4GB); RAM gate built with
   wiring handoff to the model-picker rewrite lane; root ios/ deleted
   (config-plugin-first canonical). REMAINING: on-device QA matrix
   (external), tier-2 vision plumbing (documented follow-up), health-
   context client decision (founder), privacy-manifest locked-copy
   reconcile before submission. P7 design doc
   DONE 2026-07-15 (`docs/plans/enterprise-local-design-2026-07-15.md`,
   supersedes the 2026-07-09 draft) — implementation stays gated on founder
   decisions FD-1–FD-4 (pricing/edition, seat true-up, identity tier,
   activation ping) plus its §8 open questions (VS Code Local chokepoint,
   Neon-driver→vanilla-Postgres portability, gateway Docker build proof).
8. RESOLVED 2026-07-15 — `THIRD_PARTY_LICENSES.md` restored (it had been
   deleted in the worktree as collateral of the entitlements-licensing lane;
   same accident happened during P0 on 2026-07-08). Restored at HEAD content
   with the SkillSpector paths corrected to `tools/skill-vetting/`;
   `pnpm check:licenses` green; `check-licenses.mjs` itself was never
   touched by that lane. Founder: re-delete only if the removal really was
   intentional.

9. Desktop system dictation — PLANNED 2026-07-16:
   implement `docs/plans/desktop-system-dictation.md` end to end. The current
   global PTT control is not a working capability and must not be advertised as
   available until its OS-specific release gates pass. Sequence after the
   active restructure write lanes: contract/truth cleanup; one coordinator;
   stoppable global hooks; device-safe capture; explicit Local/BYOK/Managed
   transcription; target-pinned secure injection; dictionary/snippets/app
   profiles; complete settings/overlay; signed macOS/Windows/Linux verification.
   The confirmed implementation defects are tracked as
   `DESKTOP-SYSTEM-DICTATION-UNWIRED-01`.

## PRE-MERGE MIGRATION PASS (the one runbook; run before merging chore/repo-restructure-2026-07 to main)

Landed branch code selects/writes schema that prod Neon does not have yet.
Vercel deploys from `main`, so the branch is inert in prod until merge — but
the merge MUST NOT happen before this pass. Order:

1. Verify applied-state read-only first: `select column_name from
information_schema.columns where table_name='web_conversations'` (and the
   0052-0055 objects) against prod Neon — 0044 is confirmed applied; 0052-0055
   status is unverified, do not assume.
2. Probe each unapplied migration on a disposable Neon branch (W9 gate).
3. Apply in sequence: 0043 (audit immutability, AUDIT-IMMUT-01), any
   unapplied of 0052-0055, 0056 (managed-usage lifecycle —
   SVC-MANAGED-USAGE-0056-DEPLOY-SEQ-01), 0057 (durable scheduling),
   0058 (drop legacy teams — DESTRUCTIVE, founder eyes required),
   0059 (conversation star/archive).
4. Then merge to main and redeploy; then run the post-deploy verification
   list (star/archive persistence, managed send on local :3100 no longer
   503s, schedules CRUD).

## W9 Wave Status (2026-07-15 — CODE-COMPLETE) + Pending External Gates

All four confirmed-broken W9 items are fixed and verified (worker-control
plane deleted; API keys unified onto ApiKeyService incl. the CSRF
exemption; legacy Teams system deleted; desktop schedules durable), and
the three already-fixed audit items (E2B tenant binding, custom-MCP handle
identity, schedules vocabulary) are verified in-tree. FOUNDER-GATED
externals before full wave closure:

- Apply + probe migration `0057_durable_scheduling.sql` on a disposable
  Neon branch (it exists only in the working tree; the schedules-vocab
  verification cites it).
- Apply migration `0058_drop_legacy_teams.sql` (created, deliberately not
  applied to any database).
- Desktop restart-persistence smoke: create schedule → quit → relaunch →
  still present (device-level; Rust restart-simulation tests are green
  but are not the real smoke).
- W7 live-provider + desktop-device smoke and W10 on-device mobile QA
  remain the other program-level external gates.

## Minor Final-Shape Cleanups (queue behind active waves)

- `packages/contracts/types/src/user.ts` `SubscriptionTier` still lists `'hobby'`
  although the 2026-06-30 pricing decision removed Plus+Hobby and
  `TIER_POLICIES_DEFINITION`/`getTierPolicy` normalize unknown values to
  free (verified by test during W5 stage-2). SCOPE CORRECTION 2026-07-16:
  this is NOT a one-line member removal — live consumers branch on the
  literal: `apps/web/app/api/llm/v1/models/route.ts` uses `'hobby'` as its
  internal economy-tier key (`getAllowedModelsForTier('hobby')`), the
  extension paywall stack (`managedModelPicker`, `freeTrialClient`,
  `providerStreamClient` incl. a stale `'pro_plus'`), web `constants/llm.ts`,
  and `InlinePaywallCard` tier unions. Removing the member requires a
  deliberate tier-vocabulary sweep (rename the internal economy alias,
  purge `hobby`/`pro_plus` unions, align the gallery SQL check constraint)
  with paywall tests — schedule as its own slice, do not drive-by it.

## Wiring-Gap Audit (2026-07-16, web) — founder freeze directive

Investigation of the founder's named flows (AGI Work toggle, project
folders, chats) + a general self-documented-gap sweep. Finding: the web
app's capability honesty is ALREADY GOOD — dead affordances are unmounted
(e.g. connectors/ToolPermissionsPanel.tsx: `⚠️ UNMOUNTED`, broken key
contract), guarded (MessageBubble/ToolTimeline approval affordances hide
when no resolver), or honestly labeled. There is no large pile of missed
wiring. The genuine items:

1. AGI Work toggle — INTENTIONALLY HIDDEN, test-enforced
   (ChatComposerNew.test.tsx:374 "does not expose a disconnected AGI Work
   mode before a durable work-run backend exists"). BLOCKED on founder
   product decision: does "AGI Work" mean (a) select a Project as chat
   context [wire to existing, freeze-compliant] or (b) durable background
   work-runs [needs a NEW backend = frozen]? No fix until decided.
2. Composer cowork-folder (`useCoworkFolderStore`, ChatComposerNew.tsx:280)
   — the one genuinely COSMETIC control: picks + displays a working folder
   but "handle is never forwarded to any API route" (does nothing), AND
   duplicates the real `/api/chat/folders` system (one-canonical-owner
   violation). Fix depends on decision #1: wire to project/folder context
   (a) or hide as desktop-only concept (b). Do NOT modify unilaterally
   while the founder is deciding the AGI Work shape.
3. Chats + sidebar folders — WIRED + REAL: folder-management-service →
   `/api/chat/folders` (0022_chat_features migration, persisted);
   move-to-project via ConversationListItem. OPEN: signed-in runtime
   click-through to confirm they WORK end-to-end (wiring exists, behavior
   unverified).
4. Honestly-labeled incomplete (likely frozen — need new endpoints):
   settings provider-import placeholder (CapabilitiesSection.tsx:146),
   2FA-enable stub (use-settings-queries.ts:458).

### Full web wiring-gap audit (wiring-gap-investigator, 2026-07-16 — read-only, prod-Neon-verified)

AGI WORK (Flow 1) — toggle EXISTS at HEAD (workMode:'chat'|'agiwork' +
selectedProjectId + segmented pill + real-project selector, from the
claude.ai-parity composer commit); it is VISUAL-ONLY. Being wired now by
agi-work-wiring teammate: submit payload must carry workMode+projectId
(currently sends dead agentMode:'solo'+folderId:null); WebChatPage sendContent
must forward it; createConversation(title,model,projectId); unify ?project=/
?projectId= entry param; and — the ONLY new code — request-processor.ts loads
project instructions + knowledge_files into system context when project_id set.
NOTE: an uncommitted apps/web lane STRIPS the toggle UI (−232 lines) — verify
the toggle survives before/after.

DEAD FEATURE STACKS (fully built, zero callers — per ponytail reuse-ladder:
remove unused; per founder freeze: do NOT mount as new features → ARCHIVE to
recycle bin, recoverable). Verify zero-importers + typecheck AFTER the
agi-work-wiring teammate frees apps/web:

- chat_folders stack (duplicates Projects; contract = projects on web):
  /api/chat/folders route + folder-management-service.ts +
  Sidebar/FolderManagement.tsx + Composer/FolderContextSelector.tsx (+ its
  POST/PUT hits nonexistent prod columns, WEB-ROUTE-PROD-SCHEMA-MISMATCH-01).
- bookmarks: /api/chat/bookmarks + message_bookmarks + service + BookmarksDialog.
- emoji-reactions (dead parallel to the WORKING thumbs metadata path):
  /api/chat/reactions + message_reactions + service + use-message-reactions.
- prompt shortcuts: /api/chat/shortcuts + user_shortcuts + service +
  PromptShortcuts.tsx/CustomShortcutDialog.tsx.
- sessions alias API: /api/chat/sessions + [id]/messages (self-described
  "UI alias", zero callers).
- branch stack: BranchNavigator/CreateBranchDialog/use-conversation-branches/
  conversation-branching.ts + /api/chat/branch (schema-broken vs prod). Has a
  cloud contract → founder call: fix+mount later vs archive. Default archive.
- ProjectSidebar.tsx (zero-importer dead dup of the shared-Sidebar section).
- Large zero-importer component/hook inventory (ModeSelector, AgentStatusBar,
  MediaDisplay, MessageSearch, EditableMessage, CodeExecutionBlock, etc. +
  use-voice-recording/use-unified-adapter/… — full list in investigator msg;
  many are chains feeding the dead features above; archive per-flow not blind).
- v3 web shell (UnifiedChatPage/WebShellV3/WebSidebar/WebEmptyChat/
  WebSearchModalCmdK) — deliberate ("kept while web chat converges"); FLAG,
  do NOT delete (desktop shares unified-chat).
  STAR/ARCHIVE + BRANCH DB schema fixes are lane-independent
  (WEB-STAR-ARCHIVE-NONPERSIST-01, WEB-ROUTE-PROD-SCHEMA-MISMATCH-01).

## Standing Directives (founder, 2026-07-15)

- Breaking-change window OPEN until first external user: internal contracts,
  schemas, and identifiers are fixed to final shape without compatibility
  shims (external provider/App Store/Stripe contracts excluded).
- Contracts before parity breadth; new parity surface area paused until
  discipline wave 1 lands.
- Optimize for the 10–20 year horizon; no quick wins.

## Ponytail dedup queue (one-canonical-owner, non-urgent)

- retry-after: ALREADY DEDUPED (verified 2026-07-16). anthropic/openai index import parseRetryAfterFromError directly from @agiworkforce/provider-runtime; the ./retry-after.ts files are intentional 2-line public-API shims, not copies. Canonical owner = provider-runtime/retry-after-internal.ts. NO ACTION.
- hash.ts (apps/web/lib + apps/desktop/src/lib, byte-identical md5 6e162cbd), useReducedMotion.ts (apps/web/hooks + apps/desktop/src/hooks identical 87158f62; unified-chat has a divergent third c78e1c0d) — real cross-surface dups → hoist to a shared package (packages/platform/utils or packages/client/\*), update both imports. BLOCKED: requires apps/web edits (held until web AGI Work lane fully lands).
- ROOT CAUSE (2026-07-16 content-hash scan): the one-canonical-owner dedups are systematically gated on the RESTRUCTURE landing, not merely scattered co-dirty consumers — the canonical OWNERS are themselves untracked W4 artifacts. Proof: customModel.ts is byte-identical in apps/desktop/src/types/ (clean/committed) and packages/contracts/types/src/ (UNTRACKED, already `export * from './customModel'` in the contracts index), with only 2 clean desktop importers (features/settings/CustomModelsSettings.tsx, stores/settingsStore.ts) and desktop already imports @agiworkforce/types elsewhere — so the dedup is trivially feasible IN the working tree, but cannot be COMMITTED coherently because the canonical contracts copy is uncommitted W4 work; committing the dedup means committing a W4 chunk. Corollary: "eliminate duplicate code / one canonical owner" is a POST-restructure workstream — it unblocks wholesale once W4 (types→contracts) and the app-layer moves commit, and should be run then as a single tooled pass (knip for dead exports + a content-hash dedup sweep), not piecemeal.

## Desktop AGI Work wiring (desktop-wiring-investigator 2026-07-16; sequence AFTER/with W7 — src-tauri churn). Tracked: DESKTOP-PROJECT-SCOPING-UNWIRED-01.

- 1c PROJECT SCOPING (highest value; the founder's "project folders, chats … did not wire it properly"). Three seams, fix in order:
  (A) add project_id to CreateConversationRequest (src-tauri/.../chat/types.rs) + a conversations column migration (data/db/migrations.rs) + persist (chat/conversation.rs). TauriRuntime.ts already sends projectId (serde drops it today).
  (B) send_message_setup.rs: resolve conversation.project_id → inject project custom_instructions + knowledge_base_files (projects table, v65) into the system prompt next to build_project_context_message (mirror web task #7).
  (C) replace projectStore.conversationIds counting with a real link call (DesktopShellV3.handleNewChat → linkConversation). Local folder→context already wired.
  Write sets are OUTSIDE core/\*\* (W7-safe) but sequence src-tauri commits behind W7.
- 1b COMPOSER TOGGLE+PICKER (web parity; mirror the just-landed web ChatComposerNew toggle): add Chat|AGI-Work toggle + "Project or folder" picker to shared unified-chat ChatInput as host-fed props (extend the existing onSelectFolder seam with onSelectProject/projects); DesktopShellV3 feeds the folder picker + projectStore list; folder row desktop-only + privacy-mode-gated; project OR folder mutually exclusive. Touches packages/ui/unified-chat (shared with mobile — blast radius).
- Cloud: CloudRuntime.createConversation should ride the web API project param once web ?projectId= unification is stable; do NOT build a parallel path.

## Desktop live defect (investigator sweep 2026-07-16)

- DESKTOP-PLANSMODAL-WAITLIST-STALE-CTA-01 (known-flaws, LIVE): paid CTAs route to an invite/waitlist modal, contradicting public-alpha cloud. Fix needs a billing-routing decision (web checkout vs honest interim copy) — founder call. Also delete the dead App.tsx 'open-cloud-waitlist' listener.

## Web dead-code elimination (goal: one canonical owner / eliminate duplicate + stale)

- DONE 2026-07-16 (commit 6f56f1f90): archived apps/web/core/ai/tools/ — orphaned all-stub parallel tool registry (0 external importers; every execute() a stub). Canonical tool owner = app/api/llm/v1/chat/completions/lib/tool-loop.ts.
- BLOCKED on web-AGI-Work integration: chat_folders stack (app/api/chat/folders/route.ts + features/chat/{components/Sidebar/FolderManagement, components/Composer/FolderContextSelector, services/folder-management-service} + 3 barrels). Verified UNMOUNTED (neither component rendered) and folders duplicate Projects (canonical) → archive to resolve WEB-ROUTE-PROD-SCHEMA-MISMATCH-01. BUT Composer/index.ts barrel is co-dirty with the unintegrated web AGI Work slice → can't edit cleanly until that slice lands. (branch stack is ambiguous — has a cloud contract — decide fix-vs-archive separately.)
- AUDIT TARGET: apps/web/core/ (48 files: ai/llm, ai/orchestration [agent-collaboration/communication protocols, intelligent-agent-router, workflow-orchestration, NLP, task-breakdown], auth, integrations [imagen/veo/openai-image/social-media-analyzer/web-search-handler/websocket-manager], monitoring, security [api-abuse, employee-input-sanitizer, gradual-rollout], storage) — a large parallel/legacy business-logic layer with only 1–6 external importers per module (core/storage/chat = 0). Likely significant dead/duplicate code but NOT safe to blind-archive; needs a dedicated read-only wired/partial/dead audit before archiving.

## INTEGRATION KNOT — RESOLVED 2026-07-16 (tree landed)

- The founder authorized commit-sequencing via the session goal; the whole
  working tree landed in six reviewed slices (`5b14585dd..c39eba06c`) with
  every gate green and a clean post-commit secret audit (details in
  CHANGELOG 2026-07-16). The combined request-processor changes (AGI-Work
  project context + W5 reservation) are committed together as recorded.
  STILL OPEN from this knot: migration 0056 MUST be applied to prod Neon
  BEFORE this branch merges to `main`/deploys
  (SVC-MANAGED-USAGE-0056-DEPLOY-SEQ-01), then 0057/0058 per W9. Branch
  commits do not deploy; Vercel deploys from `main`.
