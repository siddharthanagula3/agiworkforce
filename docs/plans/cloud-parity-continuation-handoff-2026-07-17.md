# AGI Workforce Cloud parity — Codex continuation handoff (2026-07-17)

Status: implementation in progress; persistent goal paused for chat transfer

Branch: `chore/repo-restructure-2026-07`

Pushed implementation head before this handoff: `aa71627c0`

Original mission handoff: `docs/plans/cloud-parity-handoff-2026-07-17.md`

This document is the continuation state for a new Codex chat. It does not replace the product
mission, the Claude evidence bundle, or Parts G/J of the dossier. It replaces the original
handoff's stale statements about the starting HEAD and the old free-tier WIP.

Founder priority update (2026-07-18): implementation and release work is serial in this order:
**Website → Mobile → Desktop → Chrome Extension → VS Code Extension → CLI**. This newer explicit
order supersedes the engine-first ordering later in this handoff. Shared code may support later
surfaces, but do not start their product slices before the active surface advances.

## Start the next chat with this instruction

> Continue the active AGI Workforce Cloud-parity implementation from
> `docs/plans/cloud-parity-continuation-handoff-2026-07-17.md`. Read it completely, then load the
> repository context in its mandated order. Resume the persistent goal if it is available; do not
> create a duplicate. Check `git status` before editing. The first implementation slice is the
> Managed Cloud model-invocable Skill tool described under “Exact active slice.” Work test-first,
> commit and push each verified slice, never deploy or mutate production, preserve Local/BYOK trust
> boundaries, and do not treat this handoff or any audit markdown as remediation.

## Required context order

1. `AGENTS.md`, then the nearest path-scoped `AGENTS.md` for every edit area.
2. `docs/current/source-of-truth.md`.
3. `docs/agent-context/repo-map.json`, `commands.json`, and `known-flaws.md`.
4. This continuation handoff.
5. The original `docs/plans/cloud-parity-handoff-2026-07-17.md` for the complete mission and
   remaining Phase 0→5 register.
6. `~/.claude/plans/dreamy-hopping-moonbeam.md`, especially Parts G and J, plus the referenced
   agent files.
7. `~/Downloads/claude_six_surfaces_inventory_bundle_2026-07-17/` and newer screenshots under
   `/Users/siddhartha/Desktop/reference`; prefer the newest evidence and verify fast-moving facts
   against current official sources.

Do not read or print `.env.local`. Secrets may only be read in-process for an authorized check and
must never appear in output.

## Current repository state

- Branch and remote are aligned at `aa71627c0` before this documentation-only handoff.
- The persistent goal exists but is **paused**, not complete. Its objective remains: Cloud parity
  across the six surfaces while Local/BYOK remains the privacy and storage-choice differentiator.
- There are no uncommitted production-code edits from the active Skill-tool investigation.
- The original handoff file is user-authored and untracked. Preserve it. Do not stage it merely
  because it appears in `git status`.
- This continuation document is intentionally separate so the original evidence handoff remains
  unchanged.
- Never use a broad reset, checkout, clean, or destructive command to make the tree look clean.

The next chat must begin with `git status --short`, `git branch --show-current`, and a short recent
log. If files beyond these two handoff documents are modified, treat them as user work until proven
otherwise.

## What has shipped in this implementation run

Forty-nine implementation commits were pushed after the original handoff base `08f96db95`. The
major outcomes are below. “Shipped” here means committed and pushed to the working branch; it does
**not** mean production-deployed. Production activation is blocked by the migrations listed later.

### Phase 0 honesty and demo blockers

- Free Cloud now follows the corrected Claude-like contract in code: private server-side
  actual-token accounting, no published prompt/token countdown, five Projects, one custom remote
  MCP, free chat tools allowed, and Cowork/developer surfaces still paid. Migration 0060 remains a
  founder gate.
- Desktop fake task IDs and fake completed transitions were replaced with engine-owned lifecycle
  state.
- The stale Web sync copy and orphaned settings surface were removed.
- Web artifacts now participate in real Cloud sync instead of remaining localStorage-only beside a
  dead server delta path.

Key commits: `86c626d8b`, `456dd6771`, `a6866db11`, `f0eba4781`.

### Shared engine, memory, context, task state, and WebSocket depth

- The CLI app-server WebSocket surface now drives the full developer engine instead of a seven-tool
  read-only subset and carries approval decisions over the same session contract.
- Shared Rust and TypeScript context/memory engines were introduced and the main CLI/Desktop/Mobile
  consumers were migrated toward them.
- Context compaction, summary extraction, and usage-aware accounting were wired into live engine
  paths.
- A canonical task-state contract now includes the states needed by the GUI, replacing divergent
  surface enums and fake state progression.
- A canonical agent activity event protocol is generated into Rust and TypeScript consumers.

Key commits: `41231fb4e`, `b20b3ff38`, `a7140881f`, `53d596b22`, `e9c67e5ca`, `f34676d63`.

### Inline agent activity across Web, Desktop, and Mobile

- The Cloud loop emits canonical, display-safe progress, tool, approval, source, artifact,
  compaction, lifecycle, and task-state events.
- Web, Desktop Cloud, and Mobile Cloud render the activity **inline, collapsed by default**, with
  progressive disclosure. Private provider scratchpads and chain-of-thought are not persisted or
  displayed.
- This matches the founder's requested Claude-style interaction model: no required side reasoning
  panel; users expand the inline work only when they want detail.

Key commits: `d96583bf5`, `5a4b1a956`, `4d48941e3`, `c9cb94fc3`, `11923e7df`.

### Real AGI Work loop and durable Cloud execution

- Web `agiwork` is no longer a decorative composer field. It routes to the managed multi-step tool
  loop and is shared by Web, Desktop Cloud, and Mobile Cloud.
- The loop has bounded iteration/time policy, generic Web search, code execution routing, approvals,
  cancellation, and actual multi-step usage settlement.
- Tenant-owned run and event journals provide stable run IDs, ordered cursor replay, stop intent,
  and reconnect behavior.
- Approval checkpoints are server-owned and restart-safe rather than held in a client memory map.
- Durable workflows use operation receipts and idempotency keys so retries do not repeat completed
  provider/tool work; unsafe expired operations fail closed as `outcome_unknown`.
- Web, Desktop, Mobile, and the Chrome side panel can follow the same run after an interrupted
  stream instead of restarting the work.

Key commits: `443089b97`, `00b0d8e2d`, `96f59f0e4`, `8d4328cae`, `80cf26c3d`, `1bac46610`,
`5c4b9dc10`, `47be05399`, `fe0b8d5ca`, `5363cfbc9`, `680f1fdce`, `beb810930`, `ba835388b`.

The detailed, source-backed durability status is in `docs/agent-context/known-flaws.md` under
`CLOUD-AGENT-DURABILITY-01`. Do not infer production activation from the code state.

### Models and Web search

- Model availability is generated from the shared registry and filtered by the intersection of the
  subscription tier and implemented runtime surface via
  `getModelsForTierAndSurface(tier, runtimeProfileId)`.
- Duplicate Web/Desktop picker rosters were removed or redirected to the canonical generated
  catalog. Mobile remains a consumer, not a second source of truth.
- A weekly model release normally requires changing **one authored file**:
  `packages/ai/model-registry/catalog/models.curation.json`, then running the registry generator and
  checks. Generated Rust/TypeScript/JSON outputs change automatically and must not be edited by hand.
- The current Basic/economy authored list includes `gpt-5.4-nano` and excludes both
  `gpt-5.4-mini` and `claude-haiku-4.5`, matching the founder's latest instruction. Haiku remains a
  Pro addition.
- Native OpenAI Responses Web search and generic server Web search were wired, and Web/Desktop/
  Mobile now expose Cloud search from the same real route rather than surface-specific cosmetic
  gates.

Key commits: `8346d66ea`, `f2f88fc35`, `551e4ab22`, `2ab245ea8`, `23c545c81`, `6752a32a0`.

Before adding or replacing a model, verify the exact ID, endpoint, availability, modalities,
context, and current price with official provider documentation or a sanctioned live probe. Never
copy speculative names from the research attachments into the catalog.

### Mobile and extension progress

- Mobile Cloud schedules use the shared schedule contract and the real service; the feature flag is
  enabled in code.
- Mobile has a durable Cloud task list built from the canonical run collection.
- iOS simulator startup and the Expo dependency baseline were repaired. Physical-device and signed
  release gates remain manual.
- VS Code renders canonical tool/engine progress inline and consumes the less-crippled app-server.
- Chrome can persist, replay, stop, and resume Cloud activity in the side panel. A complete latest
  ChatGPT/Claude-quality Chrome UX and the remaining extension production audit are still pending.

Key commits: `e7666d82b`, `133c35b53`, `ee4a16866`, `32f2077a7`, `e4aaa327a`, `ccd6cc545`,
`3b3fa62e9`, `0807ea803`, `b0e139b04`, `90bfad07e`, `7847f7f5e`.

### CLI model-invocable skills

- The CLI no longer injects every discovered skill body into the base prompt.
- A read-only `Skill` tool lists metadata and lazy-loads one exact skill name.
- Model input cannot supply a filesystem path; flat and canonical `<name>/SKILL.md` layouts work.
- Tool/env dependencies fail closed without secret disclosure, and skill text is fenced as
  untrusted reference material.
- The same tool catalog reaches stdio and authenticated WebSocket app-server clients.

Commit: `aa71627c0`.

Fresh verification for that commit:

- CLI test suite: 1,650 passed, 1 ignored, 0 failed.
- `cargo check -p agiworkforce-cli`: passed.
- `cargo clippy -p agiworkforce-cli --lib -- -D warnings`: passed.
- `pnpm check:llm-failures`: passed.
- `pnpm check:agent-context`: passed.
- Full pre-push `pnpm check:llm-operability`: passed.

The immediately preceding search slice is commit `6752a32a0`; it was committed and pushed with its
focused contract and surface checks green.

## Exact active slice: real Managed Cloud Skill tool

This is the first task for the next chat. The audit is complete; implementation has not begun.

### Confirmed dishonest behavior to remove

The Web composer currently downloads a selected skill body into the browser, prepends that body as
a hidden system message, and fabricates an already-completed “Read skill: …” timeline entry. No
server Skill tool ran. The weak test reimplements the fake label instead of testing production
behavior.

Confirmed owners:

- `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
  - Holds `skillBody` state.
  - Fetches `/api/skills/:name` when a skill is selected.
  - Sends both body and name in composer metadata.
- `apps/web/lib/hooks/useChatStream.ts`
  - Prepends `options.skillBody` as a system message.
  - Seeds a fake completed Skill tool entry.
- `apps/web/lib/hooks/useChatStream.skill.test.ts`
  - Tests copied label logic, not the production request/tool loop. Replace it with a real
    regression test or delete it after coverage moves to the owner.
- `apps/web/features/chat/pages/WebChatPage.tsx`
  - Forwards body/name and currently discards `skillId` because the body is carried separately.
- `apps/web/app/api/skills/route.ts` and `[name]/route.ts`
  - Own catalog loading and body lookup inside route code; reusable mechanics should move to a
    server service.
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts`
  - Canonical request schema and server-owned tool-definition injection point.
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts`
  - Real tool execution, read-only classification, status phrases, canonical events, and results.
- `packages/tools/skills`
  - Existing shared loader/merge/types owner. Reuse it. Do not add a fourth catalog.

### Required final behavior

1. Selecting a skill sends only a validated skill name/ID, never the body or a host path.
2. The server resolves the selected skill from the tenant/deployment catalog.
3. The model receives path-free metadata and a real `skill` function tool with `list` and exact
   `load` operations.
4. A selected skill is described as selected and the model is instructed to call `skill.load`
   before using it; do not fake success if it does not call.
5. The Cloud tool loop executes the call, returns the fenced untrusted body, and emits genuine
   running/completed/error canonical activity.
6. The timeline shows “Reading skill” only because a real tool call occurred.
7. Missing names and unmet dependencies fail closed with a structured, user-safe error. Never
   reveal env values, secret names beyond declared public metadata, or server paths.
8. Free chat may use Skills; Cowork/developer-level access remains governed by its separate tier
   policy.
9. Web, Desktop Cloud, and Mobile Cloud must ultimately consume the same server behavior. Do not
   reimplement the catalog per client.
10. Directory/customization views may keep a body-preview endpoint for an authenticated user, but
    composer activation must not use it.

### Test-first implementation order

1. Add failing pure tests in `packages/tools/skills` for a path-free tool definition, list, exact
   load, missing skill, bounded output, and untrusted-body fencing.
2. Add the shared Skill tool helper in that package and update the stale comment that says Skills
   are not tools.
3. Extract Web catalog/cache mechanics from API route code into a server-only service. Keep route
   policy/auth in the route.
4. Add a validated `skill_name` field to the managed completion request. A selected missing skill
   is a 4xx, not silent fallback.
5. Inject path-free catalog metadata and the server-owned `skill` definition before request cost/
   quota estimation so usage accounting includes server-added prompt material.
6. Intercept `skill` in `runMcpTool` before generic MCP name parsing, classify it as read-only, and
   add real status phrasing.
7. Remove browser body fetching, hidden system injection, and the fabricated seed event. Send only
   the selected name.
8. Add a real end-to-end loop test: first provider turn requests `skill.load`, the executor returns
   the real body, the second provider turn receives the tool result, and SSE contains genuine
   running/completed status. Prove the body was absent from the first provider request.
9. Run package tests/typecheck/lint, focused Web suites, Web typecheck, Web build, guard checks,
   staged diff inspection, commit, and push.
10. Then wire/verify selection in Mobile and the Desktop Cloud wrapper without copying loader
    mechanics into either client.

Relevant existing test templates:

- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.web-search.test.ts`
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.url-fetch.test.ts`
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.e2e.test.ts`
- `apps/web/__tests__/api/skills.security.test.ts`

Important nuance: keep the completion request fingerprint based on the logical client request, as
current project/research server enrichment does. Account for server-added skill metadata in quota
and cost estimation, but do not let host paths or bodies enter the browser contract.

## Work immediately after the Skill slice

Continue one production slice at a time; do not begin all of these in parallel.

1. Verify the Managed Cloud Skill tool across Web, Desktop Cloud, and Mobile Cloud with inline
   collapsed activity.
2. Complete the remaining Phase 3 engine depth: typed agent definitions/coordinator, MCP transport
   breadth, per-call hook permission pipeline, code-mode orchestration, streaming executor, missing
   tools, git/PR tooling, LSP breadth, and content-addressed checkpoint/rewind.
3. Complete Cloud product gaps in Phase 5: server-side document extraction and real Office/PPTX
   creation, Web auto-memory, unified installable Skills/Connectors/Plugins directory, two-way voice,
   Reflect/recap/focus reminders, and Desktop thinking/effort control.
4. Complete enterprise/reliability: managed settings/MDM hierarchy, settings migrations, SSO/SCIM/
   RBAC depth, wired retry generator, proxy/mTLS/custom CA, first-party observability/kill switches,
   durable cost persistence, and prompt-cache regression sentinels.
5. Finish latest-quality Chrome and VS Code frontend UX only after their real engine contracts are
   complete. Use the founder's newest ChatGPT Desktop/Chrome screenshots and Claude references;
   verify current UI facts before copying a layout.
6. Build the Local/BYOK storage-choice primitive: File, Keyring, Auto, and Ephemeral/in-memory.
   Never weaken on-device inference or silently cross trust boundaries.
7. Address the dedup/dead-code backlog and dictation stages 4–7 after the higher-risk engine paths.
8. Run the final requirement-by-requirement audit from implementation evidence, not the research
   checklist alone.

The complete unordered details remain in the original handoff. If this concise ordering conflicts
with a founder instruction, the newest explicit founder instruction wins.

## Production and founder gates — leave until last

Do not deploy dependent code or run production-mutating QA until the founder completes the required
actions.

1. Apply `apps/web/db/neon/0060_free_tier_token_budget.sql` to production Neon.
2. Apply `0061_cloud_agent_runs.sql`, then `0062_cloud_agent_approval_checkpoints.sql`, then
   `0063_cloud_agent_execution_operations.sql` in that exact order.
3. Provide/verify production Stripe keys and webhook configuration.
4. Decide whether to move Vercel Hobby to Pro for non-daily schedules and production operational
   needs.
5. Provide signing certificates and live Clerk production configuration for DCL-4.
6. Perform physical-device Mobile QA and any production-data-mutating QA.
7. Authorize sanctioned max-tier star/archive PATCH-then-revert QA only after the relevant migration
   and deploy.

No agent should print a secret, apply these migrations, deploy production, or mutate production data
without explicit authority in the active chat.

## Known open technical risks

- Managed Cloud Skill activation is still hidden body injection plus a fake timeline event until the
  active slice lands.
- Desktop all-features strict lint is blocked by the documented optional remote-database dependency
  incompatibilities and an async test holding a standard mutex across awaits. Default supported
  builds remain separately green; do not call all-features support green.
- Mobile uses `react-native-executorch` 0.8.4 and emits an iOS deployment-target packaging warning.
  Upgrade only as a dedicated local-model migration; physical-device evidence is still missing.
- Production Cloud durability and free-tier behavior are inactive until migrations 0060–0063 are
  applied in order.
- Chrome/VS Code UI polish and several product-parity features remain incomplete even though their
  core activity/run contracts are materially deeper.
- The repository still has a large dead-code/knip backlog; do not mix that cleanup with behavior
  changes.

Read the full current `docs/agent-context/known-flaws.md` before reporting a gap as new.

## Verification and commit protocol

For every slice:

1. Read the closest `AGENTS.md` and inspect existing patterns.
2. Start with the smallest failing regression test.
3. Implement the complete UI→API→service/engine→persistence behavior.
4. Run the smallest checks first, then the surface typecheck/tests/build and relevant Rust checks.
5. Inspect the actual rendered/manual behavior when a UI changed, including loading/error/empty/
   disabled/success states and console/network output.
6. Run `git diff --check`, inspect the diff, and inspect `git status`.
7. Run `git reset` before staging because the index is shared. Stage only the exact slice; never
   stage the original untracked handoff.
8. Use a lowercase Conventional Commit subject no longer than 100 characters, with no attribution
   footer.
9. Push only after the pre-push operability check is green. Record any intentionally skipped check;
   the default is to skip none.
10. Update `known-flaws.md` when a durable risk is found or remediated.

Build success alone is never completion. A feature is done only when the real behavior is wired,
tested, surface-verified where applicable, committed, pushed, and its deployment/manual gates are
honestly recorded.

## Commit ledger since the original handoff base

```text
86c626d8b fix: align free cloud plan with claude
456dd6771 fix: use engine task lifecycle in desktop
a6866db11 fix: remove stale web settings surfaces
f0eba4781 fix: sync cloud artifacts into web
41231fb4e chore: restore strict rust lint baseline
b20b3ff38 feat: run full agent over app-server websocket
a7140881f feat: share context compaction across agent surfaces
53d596b22 feat: share memory engine across agent surfaces
e9c67e5ca feat: wire desktop context auto-compaction
d96583bf5 feat: define canonical agent run activity events
5a4b1a956 feat: stream canonical web agent activity
4d48941e3 feat: render durable web agent activity inline
c9cb94fc3 feat: render durable desktop cloud activity inline
11923e7df feat: render durable mobile cloud activity inline
f34676d63 feat: normalize agent task state across engine surfaces
762d1a183 chore: refresh agent context indexes
8346d66ea feat(models): unify tier and surface selection
443089b97 fix(web): execute generic web search in agent loop
00b0d8e2d feat(web): route agi work through cloud agent tools
96f59f0e4 feat(chat): unify cloud work mode across app surfaces
8d4328cae feat(chat): deepen managed agi work execution
80cf26c3d feat(chat): persist managed agent runs
1bac46610 feat(cloud): add shared agent run client
5c4b9dc10 feat(cloud): resume web agent runs from durable journal
47be05399 feat(cloud): resume desktop agent runs from durable journal
fe0b8d5ca feat(cloud): resume mobile agent runs from durable journal
5363cfbc9 feat(extension): resume durable cloud agent runs
7847f7f5e chore(agent-context): refresh extension dependency graph
90bfad07e feat(vscode): stream canonical tool activity
680f1fdce feat(cloud): persist approval checkpoints across clients
beb810930 feat(cloud): make agi work execution restart-safe
e4aaa327a fix(mobile): restore ios simulator startup
f2f88fc35 refactor(models): remove duplicate picker roster
ba835388b feat(cloud): stream safe agi work progress
2ab245ea8 feat(cloud): wire native openai web search
ccd6cc545 fix(mobile): make cloud sign-in dismissible
3b3fa62e9 fix(mobile): preserve pending clerk sessions
0807ea803 fix(mobile): align expo sdk dependencies
23c545c81 test(models): cover openai search harness
b0e139b04 fix(mobile): make cloud sign-in dismissible
5d3491f9e docs(mobile): correct free usage policy
43e1126c4 docs(web): correct free model usage policy
ee4a16866 fix(schedules): unify mobile cloud contract
32f2077a7 feat(mobile): enable cloud schedules
551e4ab22 refactor(models): generate shared routing catalog
e7666d82b feat(vscode): stream engine progress inline
133c35b53 feat(mobile): add durable cloud task list
6752a32a0 feat(search): unify cloud availability across apps
aa71627c0 feat(cli): make skills model invocable
```

This ledger is an audit aid, not proof by itself. Open the implementation and tests before relying
on a claim.
