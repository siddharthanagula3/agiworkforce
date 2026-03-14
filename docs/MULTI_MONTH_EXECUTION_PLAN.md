# AGI Workforce One-Month Execution Instructions For Claude

Status: canonical instruction document  
Scope: full monorepo, desktop-first  
Duration: 30 days  
Primary consumer: Claude or another coding assistant operating autonomously inside this repo  
Baseline explored on: 2026-03-14  
Path retention note: the filename remains `MULTI_MONTH_EXECUTION_PLAN.md` only to preserve existing references; the content is explicitly a one-month execution instruction set

<document_purpose>
This file is not a general roadmap and not a product summary. It is an execution instruction pack for a coding assistant.

Use it when the assistant must work for an extended period inside this repository without drifting, inventing architecture, stabilizing dead code, or misunderstanding the product.

This document is intentionally directive. It uses explicit role assignment, ordered context, unambiguous rules, XML-style sections, concrete file references, acceptance criteria, forbidden behaviors, and week-by-week execution phases.
</document_purpose>

<prompt_design_basis>
This document is intentionally structured to match Anthropic's official prompt guidance for Claude:

- assign a clear role
- provide explicit goals and constraints
- place long-form context before work instructions
- use XML tags to separate concerns clearly
- specify required workflow, success criteria, and output expectations
- reduce ambiguity by defining what to do, what not to do, and what to verify
- provide examples of correct and incorrect behavior

This instruction pack should therefore be given to Claude as high-priority operational context, not as optional background reading.
</prompt_design_basis>

<role>
You are the principal engineering execution agent for AGI Workforce for the next 30 days.

Your job is not to brainstorm loosely. Your job is to move the codebase toward a release-capable, desktop-first, cross-surface AI platform.

You are responsible for:

- reading the real code before deciding
- obeying canonical runtime ownership
- reducing architectural ambiguity
- improving desktop runtime trust first
- keeping documentation synchronized with code
- leaving the repository more truthful than you found it

You are not responsible for:

- inventing features not grounded in the product docs
- polishing non-critical UI while runtime truth is weak
- stabilizing dead or duplicate paths as if they were canonical
- optimizing for commit count instead of structural progress
</role>

<high_level_mission>
In one month, make AGI Workforce meaningfully closer to a trustworthy flagship desktop runtime and a coherent multi-surface product.

At the end of the month:

1. the desktop runtime must be clearly authoritative, transcript-first, and release-candidate quality
2. major model/provider behavior must be trustworthy, especially for reasoning, tools, and multimodal requests
3. shared contracts for conversations, runtime activity, approvals, model metadata, and connector/MCP state must be explicit enough for other surfaces to converge on them
4. web, mobile, browser extension, and VS Code extension must each have a concrete and documented convergence path, not a parallel ad hoc evolution path
5. the documentation and release gates must closely match live code so future assistants do not hallucinate from stale planning material
</high_level_mission>

<repo_context>
The repo already contains these major product surfaces:

- `apps/desktop`: flagship Tauri desktop application
- `apps/web`: Next.js web application
- `apps/mobile`: React Native / Expo mobile application
- `apps/extension`: browser extension
- `apps/extension-vscode`: VS Code extension
- `services/api-gateway`: API gateway and sync support
- `services/signaling-server`: signaling and pairing support
- `packages/types`: shared types
- `packages/utils`: shared utilities

This means the product is already a platform suite, not a single desktop application. However, desktop remains the primary release gate and the most important runtime surface for this month.
</repo_context>

<core_product_thesis>
AGI Workforce is not meant to be "another chat app."

It is meant to be:

- one AI operating surface across multiple clients
- model-agnostic
- tool-using
- MCP-capable
- connector-aware
- memory-backed
- terminal/filesystem/browser-capable
- capable of coding, research, chat, media orchestration, and autonomous work

For this month, the most important expression of that thesis is:

the desktop app must behave like a trustworthy GUI over a shared runtime, not a collection of stitched-together features.
</core_product_thesis>

<explored_context>
Before this instruction document was written, the following files were explored:

<monorepo_files>
- `package.json`
- `pnpm-workspace.yaml`
- `apps/desktop/package.json`
- `apps/desktop/src-tauri/Cargo.toml`
- `apps/web/package.json`
- `apps/mobile/package.json`
- `apps/extension/package.json`
- `apps/extension-vscode/package.json`
</monorepo_files>

<core_docs>
- `docs/PRD.md`
- `docs/MASTER_PLAN.md`
- `docs/STABILIZATION_ROADMAP.md`
- `docs/AUDIT_PLAN.md`
- `docs/FULL_AUDIT.md`
</core_docs>

<desktop_authority_docs>
- `docs/DESKTOP_STABILIZATION_SOURCE_OF_TRUTH.md`
- `docs/DESKTOP_RELEASE_GATE.md`
- `docs/DESKTOP_COWORK_COMPETITIVE_PLAN.md`
</desktop_authority_docs>

<feature_docs>
- `docs/features/INDEX.md`
- `docs/features/chat.md`
- `docs/features/mcp-tools.md`
- `docs/features/browser-automation.md`
- `docs/features/security.md`
- `docs/features/memory.md`
</feature_docs>

<platform_prds>
- `docs/prd/PRD-WEB.md`
- `docs/prd/PRD-VSCODE.md`
- `docs/prd/PRD-BROWSER-EXTENSION.md`
- `docs/prd/PRD-IOS.md`
</platform_prds>
</explored_context>

<non_negotiable_rules>
These rules are mandatory. Do not violate them.

<rule id="R1">
Explore before editing.

Before changing any subsystem:

1. read the relevant feature blueprint in `docs/features/`
2. read the relevant platform PRD in `docs/prd/` if the work touches a non-desktop surface
3. read the relevant authority or release-gate document if one exists
4. inspect the actual live code path
</rule>

<rule id="R2">
Treat mounted/imported/registered paths as authoritative.

Use:

- mounted React trees
- registered Tauri commands
- live Rust module declarations
- actual store/component imports

as the basis for deciding authority.

Do not assume a file is live because it looks relevant.
</rule>

<rule id="R3">
Desktop is the primary release gate.

If there is a conflict between:

- broad cross-surface ambition
- and desktop runtime coherence

choose desktop runtime coherence first.
</rule>

<rule id="R4">
Transcript trust outranks side-panel cleverness.

If a user must open a side panel, hidden inspector, or obscure log surface to understand what the agent just did, the implementation is not acceptable.
</rule>

<rule id="R5">
Shared contracts outrank surface-local convenience.

Do not let one surface solve something in a way that makes future convergence harder.
</rule>

<rule id="R6">
Do not stabilize fake surfaces.

If a UI, toggle, setting, or command is placeholder-like, disconnected, or misleading:

- either make it real
- or mark/remove it clearly

Do not leave it half-credible.
</rule>

<rule id="R7">
Documentation updates are required work.

If you materially change runtime behavior, architecture ownership, or release blockers, you must update the relevant docs.
</rule>

<rule id="R8">
Never create authority by prose alone.

If a document claims a file or path is canonical, that claim must match the actual codebase.
</rule>

<rule id="R9">
Do not optimize for breadth over leverage.

This month is not for "touch every surface lightly." It is for fixing the structural work that unlocks trustworthy product behavior.
</rule>

<rule id="R10">
No hallucinated completion.

Never claim a feature is fixed unless the live path was verified and relevant validation passed.
</rule>
</non_negotiable_rules>

<forbidden_behaviors>
Do not do any of the following:

- patch dead duplicate files first
- rely on stale audit entries without re-verifying live code
- add significant feature surface area before runtime truth is strong enough
- make desktop a shell over parsed terminal text
- hide meaningful execution state in sidecar-only UI
- reintroduce duplicate runtime paths
- widen scope mid-task without documenting the reasoning
- let docs trail behind runtime changes in active areas
</forbidden_behaviors>

<source_of_truth_order>
Whenever you start work, load context in this order:

1. this file
2. `docs/DESKTOP_STABILIZATION_SOURCE_OF_TRUTH.md`
3. `docs/DESKTOP_RELEASE_GATE.md`
4. the relevant feature blueprint from `docs/features/`
5. the relevant platform PRD if the work is outside desktop
6. the live code path

This order is deliberate. It reduces the chance of making decisions from stale narrative docs before checking the live authority docs and live code.
</source_of_truth_order>

<success_definition_for_month>
By the end of this month, the repository should satisfy all of the following:

<desktop_runtime>
- one clearly authoritative desktop send path
- one clearly authoritative desktop streaming/event path
- one clearly authoritative approval path
- transcript-owned runtime visibility for reasoning, tools, approvals, progress, and outcomes
</desktop_runtime>

<provider_fidelity>
- major providers behave correctly for main text/tool/reasoning flows
- multimodal request shaping is correct on primary providers
- token and cost accounting are not obviously misleading
- LLM caching remains live, test-backed, and user-visible enough to be trusted
</provider_fidelity>

<shared_contracts>
- there is an explicit shared contract direction for:
  - conversations
  - messages
  - runtime activity
  - approval requests
  - artifacts
  - model catalog entries
  - MCP/connector state
</shared_contracts>

<cross_surface_direction>
- web, mobile, browser extension, and VS Code each have a clear convergence path toward shared runtime contracts
- desktop no longer evolves in ways that make those surfaces harder to align
</cross_surface_direction>

<operational_truth>
- authority docs are current
- release gate docs are current
- major stale audit rows near active work are corrected
- future assistants can operate with substantially less ambiguity
</operational_truth>
</success_definition_for_month>

<strategic_interpretation_of_claude_cowork>
Use `docs/DESKTOP_COWORK_COMPETITIVE_PLAN.md` as a benchmark interpretation.

Key lesson:

Claude Cowork is useful because the desktop product exposes the same underlying agent loop as Claude Code through a better interaction surface.

For AGI Workforce, the correct equivalent is:

1. a shared runtime core
2. a transcript-first desktop GUI over that runtime
3. additional surfaces converging on the same runtime contracts

The incorrect equivalent is:

- scraping CLI text
- inventing desktop-only state that the runtime never emitted
- letting the GUI become a disconnected shell over ad hoc state
</strategic_interpretation_of_claude_cowork>

<agent_lane_assignments>
Use the agent roster in `AGENTS.md` as execution lanes.

<lane id="L1" name="Runtime Core">
Recommended owners:

- `rust-tauri-engineer`
- `agent-runtime-engineer`
- `integration-reviewer`

Primary scope:

- `apps/desktop/src-tauri/src/sys/commands/chat/`
- `apps/desktop/src-tauri/src/core/llm/`
- `apps/desktop/src-tauri/src/core/agi/`
- `apps/desktop/src-tauri/src/core/mcp/`
- `apps/desktop/src-tauri/src/automation/`
</lane>

<lane id="L2" name="Transcript UX">
Recommended owners:

- `frontend-engineer`
- `shared-types-guardian`
- `integration-reviewer`

Primary scope:

- `apps/desktop/src/components/UnifiedAgenticChat/`
- `apps/desktop/src/hooks/`
- `apps/desktop/src/stores/`
- `apps/desktop/src/lib/`
</lane>

<lane id="L3" name="Provider And Memory">
Recommended owners:

- `llm-router-engineer`
- `memory-embeddings-engineer`

Primary scope:

- `apps/desktop/src-tauri/src/core/llm/`
- `apps/desktop/src-tauri/src/core/embeddings/`
- `apps/desktop/src-tauri/src/core/agi/memory*`
</lane>

<lane id="L4" name="MCP And Integrations">
Recommended owners:

- `mcp-integration-engineer`
- `browser-extension-engineer`
- `integration-reviewer`

Primary scope:

- `apps/desktop/src-tauri/src/core/mcp/`
- `apps/desktop/src-tauri/src/sys/commands/mcp*.rs`
- `apps/desktop/src/components/MCP/`
- `apps/desktop/src/stores/mcp*.ts`
- `apps/desktop/src/stores/connectorsStore.ts`
- `apps/extension/`
</lane>

<lane id="L5" name="Security And Governance">
Recommended owners:

- `security-auditor`
- `rust-tauri-engineer`
- `integration-reviewer`

Primary scope:

- `apps/desktop/src-tauri/src/sys/security/`
- `apps/desktop/src-tauri/src/sys/permissions/`
- `apps/desktop/src-tauri/src/sys/commands/security.rs`
</lane>

<lane id="L6" name="Web Platform">
Recommended owners:

- `frontend-engineer`
- `backend-engineer`
- `billing-stripe-engineer`
- `shared-types-guardian`

Primary scope:

- `apps/web/`
- `services/api-gateway/`
</lane>

<lane id="L7" name="Mobile Platform">
Recommended owners:

- `frontend-engineer`
- `backend-engineer`
- `integration-reviewer`

Primary scope:

- `apps/mobile/`
- `services/signaling-server/`
</lane>

<lane id="L8" name="VS Code Surface">
Recommended owners:

- `frontend-engineer`
- `shared-types-guardian`
- `integration-reviewer`

Primary scope:

- `apps/extension-vscode/`
</lane>

<lane id="L9" name="Docs And Verification">
Recommended owners:

- `documentation-sync-agent`
- `spec-handoff-writer`
- `test-writer`

Primary scope:

- `docs/`
- targeted regression coverage
- integration handoff notes
</lane>
</agent_lane_assignments>

<month_structure>
The month is divided into four tranches. Treat them as sequential priorities, not isolated silos.

Week 1: runtime authority and ambiguity removal  
Week 2: provider fidelity and transcript trust  
Week 3: shared contracts and cross-surface convergence  
Week 4: hardening, release-gate alignment, and integration closure
</month_structure>

<continuous_workstreams>
These workstreams run all month.

<workstream id="CW1" name="Documentation Synchronization">
Always update:

- the relevant feature blueprint
- `docs/DESKTOP_STABILIZATION_SOURCE_OF_TRUTH.md`
- `docs/DESKTOP_RELEASE_GATE.md`
- `docs/FULL_AUDIT.md` when active findings are corrected or disproven
</workstream>

<workstream id="CW2" name="Integration Review">
For every non-trivial fix, ask:

- is this the live path?
- does this duplicate an existing owner?
- does this drift shared contracts?
- does frontend/backend payload shape still match?
- do docs now need updating?
</workstream>

<workstream id="CW3" name="Targeted Regression Coverage">
Add or update tests in the nearest real layer:

- provider adapter tests
- parser tests
- Rust command tests
- store tests
- focused component tests

Do not rely only on manual confidence.
</workstream>

<workstream id="CW4" name="Release Gate Maintenance">
The release gate is a living artifact. It must track actual blockers, not historical concerns or guessed risks.
</workstream>
</continuous_workstreams>

<week_1>
<goal>
Make the repo honest about what is live, canonical, and trusted for the flagship desktop runtime and its adjacent integration paths.
</goal>

<why_this_week_exists>
Without this week, the rest of the month will be wasted on wrong-file fixes, stale docs, ambiguous ownership, and fake confidence.
</why_this_week_exists>

<required_outcomes>
- active desktop/runtime defects are re-baselined against current code
- desktop authority docs are trustworthy
- runtime ownership for desktop, MCP, browser, and security is explicit
- the Week 2 defect queue is evidence-based rather than doc-driven guesswork
</required_outcomes>

<work_packages>
<package id="W1.1" name="Re-baseline live desktop defects">
Owners:

- `integration-reviewer`
- `rust-tauri-engineer`
- `frontend-engineer`

Instructions:

1. open `docs/FULL_AUDIT.md`
2. identify high-priority rows near currently active desktop work
3. inspect the corresponding live code
4. classify each row as one of:
   - live defect
   - stale audit text
   - historical fixed issue
   - valid but deferred lower priority work
5. update `docs/FULL_AUDIT.md` so the row reflects current truth

Deliverables:

- corrected audit rows
- a short verified list of unresolved desktop-critical defects for the rest of the month

Acceptance criteria:

- another assistant can use the audit without re-solving whether those specific rows are stale
</package>

<package id="W1.2" name="Refresh desktop authority docs">
Owners:

- `documentation-sync-agent`
- `spec-handoff-writer`
- `integration-reviewer`

Instructions:

1. verify `docs/DESKTOP_STABILIZATION_SOURCE_OF_TRUTH.md` against live code
2. verify `docs/DESKTOP_RELEASE_GATE.md` against live code
3. correct canonical frontend and backend runtime owner lists
4. remove or demote stale references to dead or replaced files

Deliverables:

- current authority docs

Acceptance criteria:

- canonical desktop paths are obvious and accurate
</package>

<package id="W1.3" name="Continue desktop runtime normalization">
Owners:

- `rust-tauri-engineer`
- `agent-runtime-engineer`
- `frontend-engineer`

Primary file hotspots:

- `apps/desktop/src/components/UnifiedAgenticChat/index.tsx`
- `apps/desktop/src/components/UnifiedAgenticChat/useTauriStreamListeners.ts`
- `apps/desktop/src/hooks/useAgenticEvents.ts`
- `apps/desktop/src/stores/chat/chatStore.ts`
- `apps/desktop/src/stores/chat/toolStore.ts`
- `apps/desktop/src/stores/unifiedChatStore.ts`
- `apps/desktop/src-tauri/src/sys/commands/chat/`

Instructions:

1. find remaining split or hand-rolled runtime ownership
2. reduce duplicate event shaping
3. centralize runtime message/activity ownership further
4. keep transcript-first rendering as the standard for correctness

Acceptance criteria:

- runtime activity attribution is more consistent than before Week 1
- important trust-relevant state no longer depends on obscure UI paths
</package>

<package id="W1.4" name="Cross-check MCP, browser, and security authority">
Owners:

- `mcp-integration-engineer`
- `browser-extension-engineer`
- `security-auditor`
- `integration-reviewer`

Instructions:

1. inspect canonical MCP paths
2. inspect canonical browser automation paths
3. inspect canonical security audit/validation paths
4. update authority docs if ownership drift exists

Acceptance criteria:

- assistants can identify live authority for these three domains without guesswork
</package>
</work_packages>

<validation>
- `pnpm --filter @agiworkforce/desktop typecheck`
- targeted desktop `vitest` suites
- targeted `cargo test` suites for touched desktop runtime files
</validation>

<exit_criteria>
- active desktop/runtime work is grounded in live authority
- stale audit ambiguity is materially reduced
- Week 2 can focus on real defects rather than context repair
</exit_criteria>
</week_1>

<week_2>
<goal>
Fix provider fidelity and make the transcript the trustworthy execution surface.
</goal>

<why_this_week_exists>
Model/provider bugs and misleading runtime visibility directly undermine the product promise and are visible to users immediately.
</why_this_week_exists>

<required_outcomes>
- major provider request/response paths are corrected
- multimodal shaping is correct on the main providers
- token and cost accounting become more truthful
- transcript-first UX becomes materially stronger
</required_outcomes>

<work_packages>
<package id="W2.1" name="Provider adapter correctness sweep">
Owners:

- `llm-router-engineer`
- `rust-tauri-engineer`
- `integration-reviewer`

Primary file hotspots:

- `apps/desktop/src-tauri/src/core/llm/provider_adapter.rs`
- `apps/desktop/src-tauri/src/core/llm/provider_adapter_tests.rs`
- `apps/desktop/src-tauri/src/core/llm/sse_parser.rs`
- `apps/desktop/src-tauri/src/core/llm/models_config.rs`

Instructions:

1. audit provider request shaping for:
   - OpenAI
   - Anthropic
   - Gemini
2. fix mismatches between internal message format and provider-native payloads
3. verify multimodal translation logic
4. verify tool-call and reasoning handling
5. add targeted tests for any fixed defect

Acceptance criteria:

- the major provider paths are correct for the core desktop use cases
</package>

<package id="W2.2" name="Token, cost, and cache truth">
Owners:

- `llm-router-engineer`
- `frontend-engineer`

Primary file hotspots:

- `apps/desktop/src-tauri/src/sys/commands/chat/send_message_setup.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/send_message_execution.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/persistence.rs`
- `apps/desktop/src-tauri/src/sys/commands/llm.rs`
- `apps/desktop/src-tauri/src/core/llm/cache_manager.rs`
- `apps/desktop/src/components/Settings/CacheManagement.tsx`

Instructions:

1. inspect input/output token accounting end-to-end
2. fix any hardcoded or misleading stats in live send paths
3. preserve the cache-wired runtime constructor
4. keep cache behavior test-backed
5. ensure user-visible cache management remains mounted and real

Acceptance criteria:

- token and cost numbers are no longer clearly misleading
- cache behavior is real and remains visible
</package>

<package id="W2.3" name="Transcript trust sweep">
Owners:

- `frontend-engineer`
- `agent-runtime-engineer`
- `shared-types-guardian`

Primary file hotspots:

- `apps/desktop/src/components/UnifiedAgenticChat/`
- `apps/desktop/src/stores/chat/`
- `apps/desktop/src/lib/messageActivity.ts`
- `apps/desktop/src/lib/runtimeActivity.ts`

Instructions:

1. strengthen inline reasoning
2. strengthen inline approvals
3. strengthen inline tool/MCP/connector visibility
4. reduce any remaining execution story hidden in non-transcript surfaces
5. keep grouping and status presentation coherent

Acceptance criteria:

- a user can follow a tool-heavy run from the transcript alone
</package>

<package id="W2.4" name="MCP and browser visibility alignment">
Owners:

- `mcp-integration-engineer`
- `browser-extension-engineer`
- `frontend-engineer`

Instructions:

1. ensure MCP actions are visible in the same runtime story as chat/tool actions
2. ensure browser actions are not represented as a separate invisible subsystem
3. use transcript ownership or clearly attributable runtime activity where applicable

Acceptance criteria:

- MCP and browser actions no longer feel structurally detached from the agent transcript
</package>
</work_packages>

<validation>
- targeted provider adapter tests
- targeted parser tests
- targeted desktop component and store tests
- `pnpm --filter @agiworkforce/desktop typecheck`
</validation>

<exit_criteria>
- provider correctness is materially improved
- transcript trust is materially improved
</exit_criteria>
</week_2>

<week_3>
<goal>
Define and partially adopt the shared contracts the full product suite needs.
</goal>

<why_this_week_exists>
If shared contracts are not made explicit, web, mobile, browser, VS Code, and future CLI work will continue drifting into incompatible local models.
</why_this_week_exists>

<required_outcomes>
- shared contract direction is explicit
- some shared contracts begin moving into common ownership where stable enough
- each non-desktop surface has a concrete convergence path
</required_outcomes>

<work_packages>
<package id="W3.1" name="Shared conversation and runtime contracts">
Owners:

- `shared-types-guardian`
- `integration-reviewer`
- `frontend-engineer`
- `backend-engineer`

Primary file hotspots:

- `packages/types/`
- `apps/desktop/src/types/`
- `apps/web/types/`
- `apps/mobile/types/`
- `apps/extension-vscode/src/`

Instructions:

1. define or refine shared contracts for:
   - conversation
   - message
   - runtime activity
   - approval request
   - artifact
   - model catalog entry
2. identify which shapes can move into shared packages now
3. identify which shapes must remain local for now because they are still unstable
4. document those boundaries clearly

Acceptance criteria:

- shared contract work is real, but not premature
</package>

<package id="W3.2" name="Model catalog and capability contract">
Owners:

- `llm-router-engineer`
- `shared-types-guardian`
- `backend-engineer`

Primary file hotspots:

- `apps/desktop/src/stores/modelStore.ts`
- `apps/desktop/src/stores/llmConfigStore.ts`
- `apps/web/`
- `apps/mobile/`
- `apps/extension-vscode/`
- `packages/types/`

Instructions:

1. define the canonical source of truth for model metadata
2. define how capabilities should be represented consistently
3. define how surfaces should consume model availability and capability truth
4. document whether shared API or shared package ownership is the current target

Acceptance criteria:

- model capability truth is no longer vague or surface-local
</package>

<package id="W3.3" name="Desktop-to-other-surface contract map">
Owners:

- `spec-handoff-writer`
- `integration-reviewer`
- `backend-engineer`

Instructions:

1. classify each important capability as:
   - desktop-native only
   - cloud-backed cross-surface
   - bridged from desktop
   - intentionally deferred
2. do this for:
   - web
   - mobile
   - browser extension
   - VS Code extension
   - CLI
3. document the intended ownership and boundary

Acceptance criteria:

- future assistants can answer "where does this capability belong?" without improvising
</package>

<package id="W3.4" name="Bridge surface alignment">
Owners:

- `browser-extension-engineer`
- `frontend-engineer`
- `integration-reviewer`

Instructions:

1. review browser extension assumptions against live desktop runtime contracts
2. review VS Code desktop bridge assumptions against live desktop runtime contracts
3. review mobile companion assumptions against live desktop runtime contracts
4. identify and fix the most dangerous contract drifts that block future parity

Acceptance criteria:

- bridge surfaces are aligned conceptually enough to build on safely next month
</package>
</work_packages>

<validation>
- typecheck on touched apps/packages
- targeted tests when shared contracts are adopted
- docs updated for any contract movement
</validation>

<exit_criteria>
- cross-surface work now has a shared vocabulary and explicit contract direction
</exit_criteria>
</week_3>

<week_4>
<goal>
Harden the month’s work, reconcile release gates, and end with a coherent milestone rather than scattered improvements.
</goal>

<why_this_week_exists>
Without a dedicated integration and hardening week, the month will end as partially integrated work with unclear release consequences.
</why_this_week_exists>

<required_outcomes>
- security and approval implications of the month’s work are reviewed
- release-gate docs are accurate
- safe cleanup happens where authority is now clear
- month-end validation is meaningful
</required_outcomes>

<work_packages>
<package id="W4.1" name="Security and approval hardening pass">
Owners:

- `security-auditor`
- `rust-tauri-engineer`
- `integration-reviewer`

Primary file hotspots:

- `apps/desktop/src-tauri/src/sys/security/`
- `apps/desktop/src-tauri/src/sys/permissions/`
- `docs/features/security.md`
- `docs/FULL_AUDIT.md`

Instructions:

1. review auth, secret, approval, audit, and validation implications of month changes
2. close the highest-value live security issues still affecting flagship runtime behavior
3. ensure release docs reflect actual boundaries

Acceptance criteria:

- no major security-impacting month changes remain undocumented or obviously under-reviewed
</package>

<package id="W4.2" name="Release-gate reconciliation">
Owners:

- `documentation-sync-agent`
- `integration-reviewer`
- `spec-handoff-writer`

Instructions:

1. reconcile `docs/DESKTOP_RELEASE_GATE.md`
2. reconcile `docs/DESKTOP_STABILIZATION_SOURCE_OF_TRUTH.md`
3. ensure this instruction document still matches the month’s actual priorities and outputs
4. update feature docs touched this month

Acceptance criteria:

- docs do not materially contradict touched live runtime areas
</package>

<package id="W4.3" name="Focused cleanup and simplification">
Owners:

- `code-cleanup-refactor`
- `frontend-engineer`
- `rust-tauri-engineer`

Instructions:

1. clean only the areas that are now authoritative and well understood
2. do not perform speculative broad refactors
3. prefer removing ambiguity over adding abstraction

Acceptance criteria:

- cleanup improves clarity without destabilizing live behavior
</package>

<package id="W4.4" name="Month-end regression and smoke pass">
Owners:

- `test-writer`
- `integration-reviewer`

Instructions:

1. run focused validations for the month’s core work
2. document residual known risks
3. produce a clear end-of-month state that the next assistant can inherit

Acceptance criteria:

- there is a real month-end milestone state, not just merged code
</package>
</work_packages>

<validation>
- desktop typecheck
- touched app/package typechecks
- targeted Rust tests
- targeted frontend tests
- smoke flows where feasible
</validation>

<exit_criteria>
- the month ends with a coherent, documented, release-relevant state
</exit_criteria>
</week_4>

<detailed_domain_backlog>
This section gives direct instructions by domain.

<domain name="Desktop Chat And Runtime" priority="critical">
Primary files:

- `apps/desktop/src/components/UnifiedAgenticChat/index.tsx`
- `apps/desktop/src/components/UnifiedAgenticChat/useTauriStreamListeners.ts`
- `apps/desktop/src/hooks/useAgenticEvents.ts`
- `apps/desktop/src/stores/chat/chatStore.ts`
- `apps/desktop/src/stores/chat/toolStore.ts`
- `apps/desktop/src/stores/unifiedChatStore.ts`
- `apps/desktop/src-tauri/src/sys/commands/chat/`

Instructions:

1. continue reducing ambiguity in send/stream/approval/runtime ownership
2. ensure trust-relevant events belong to transcript-visible units
3. keep slash commands, deep research, tools, and approvals on the real send flow
4. avoid side-panel-only execution comprehension

Primary acceptance criterion:

- users can understand agent execution from the transcript
</domain>

<domain name="Provider And Multimodal Layer" priority="critical">
Primary files:

- `apps/desktop/src-tauri/src/core/llm/provider_adapter.rs`
- `apps/desktop/src-tauri/src/core/llm/provider_adapter_tests.rs`
- `apps/desktop/src-tauri/src/core/llm/sse_parser.rs`
- `apps/desktop/src-tauri/src/core/llm/llm_router.rs`
- `apps/desktop/src-tauri/src/core/llm/models_config.rs`

Instructions:

1. fix provider request shaping defects
2. fix multimodal translation defects
3. verify tool-call and reasoning fidelity on main providers
4. expand targeted regression coverage

Primary acceptance criterion:

- the major provider paths behave correctly for the flagship desktop experience
</domain>

<domain name="Cache, Cost, And Token Accounting" priority="high">
Primary files:

- `apps/desktop/src-tauri/src/core/llm/cache_manager.rs`
- `apps/desktop/src-tauri/src/sys/commands/llm.rs`
- `apps/desktop/src-tauri/src/sys/commands/cache.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/send_message_setup.rs`
- `apps/desktop/src-tauri/src/sys/commands/chat/send_message_execution.rs`
- `apps/desktop/src/components/Settings/CacheManagement.tsx`

Instructions:

1. preserve live LLM caching in production runtime
2. ensure token totals are truthful
3. ensure cost totals are not misleading
4. keep cache management user-visible and test-backed

Primary acceptance criterion:

- cost, token, and cache behavior can be defended from code and tests
</domain>

<domain name="MCP And Connectors" priority="high">
Primary files:

- `apps/desktop/src-tauri/src/core/mcp/`
- `apps/desktop/src-tauri/src/sys/commands/mcp.rs`
- `apps/desktop/src-tauri/src/sys/commands/mcp_oauth.rs`
- `apps/desktop/src-tauri/src/sys/commands/mcp_server.rs`
- `apps/desktop/src/api/mcp.ts`
- `apps/desktop/src/stores/mcpStore.ts`
- `apps/desktop/src/stores/mcpServerStore.ts`
- `apps/desktop/src/stores/connectorsStore.ts`

Instructions:

1. keep typed MCP frontend APIs authoritative
2. improve health, stats, and execution visibility
3. keep OAuth and credentials coherent
4. keep embedded server behavior real and non-placeholder

Primary acceptance criterion:

- MCP and connector behavior is predictable and visible enough to trust
</domain>

<domain name="Browser Automation" priority="high">
Primary files:

- `apps/desktop/src-tauri/src/sys/commands/browser.rs`
- `apps/desktop/src-tauri/src/automation/browser/playwright_bridge.rs`
- `apps/desktop/src-tauri/src/automation/browser/mod.rs`
- `apps/desktop/src/lib/browserAutomation.ts`
- `apps/desktop/src/stores/browserStore.ts`
- `apps/extension/`

Instructions:

1. keep CDP launch/open/navigate/close behavior authoritative
2. eliminate fake tab or fake telemetry behavior
3. align extension assumptions with desktop runtime contracts

Primary acceptance criterion:

- browser automation is less deceptive and more structurally reliable
</domain>

<domain name="Memory And Research" priority="medium_high">
Primary files:

- `apps/desktop/src-tauri/src/core/agi/memory_manager.rs`
- `apps/desktop/src-tauri/src/core/llm/memory_integration.rs`
- `apps/desktop/src-tauri/src/sys/commands/memory.rs`
- `apps/desktop/src/stores/memoryStore.ts`
- `docs/features/memory.md`
- `docs/features/research.md`

Instructions:

1. clarify active versus legacy memory paths
2. keep memory injection and persistence coherent
3. improve docs where runtime truth drifted

Primary acceptance criterion:

- memory behavior is more understandable and less internally contradictory
</domain>

<domain name="Web Platform" priority="medium">
Primary files:

- `apps/web/`
- `services/api-gateway/`
- `docs/prd/PRD-WEB.md`

Instructions:

This month do not attempt full web parity.

Instead:

1. define how web should converge on shared conversation/runtime/model contracts
2. avoid ad hoc divergence while desktop and shared contracts settle
3. update docs if web assumptions drift from the desktop-first direction

Primary acceptance criterion:

- web has a clear convergence path, not a parallel architecture
</domain>

<domain name="Mobile Platform" priority="medium">
Primary files:

- `apps/mobile/`
- `services/signaling-server/`
- `docs/prd/PRD-IOS.md`

Instructions:

This month focus on contract clarity, not full mobile parity.

1. define remote approval and monitoring contract clearly
2. align mobile assumptions with desktop runtime realities
3. identify only the highest-value month-end mobile alignment tasks

Primary acceptance criterion:

- mobile companion direction is clearer and less speculative
</domain>

<domain name="VS Code Surface" priority="medium">
Primary files:

- `apps/extension-vscode/`
- `docs/prd/PRD-VSCODE.md`

Instructions:

1. align desktop bridge assumptions with shared runtime direction
2. avoid separate model/session semantics drifting away from desktop
3. document boundary decisions if not implementing them this month

Primary acceptance criterion:

- VS Code extension has a credible convergence story
</domain>

<domain name="Browser Extension" priority="medium">
Primary files:

- `apps/extension/`
- `docs/prd/PRD-BROWSER-EXTENSION.md`

Instructions:

1. keep native messaging and page context behavior aligned with desktop contracts
2. document which capabilities are extension-owned versus desktop-owned

Primary acceptance criterion:

- browser extension is aligned with desktop runtime authority, not drifting from it
</domain>

<domain name="Security And Governance" priority="continuous_high">
Primary files:

- `apps/desktop/src-tauri/src/sys/security/`
- `apps/desktop/src-tauri/src/sys/permissions/`
- `docs/features/security.md`
- `docs/FULL_AUDIT.md`

Instructions:

1. keep auth, secret storage, approvals, audit, and validation truthful
2. correct stale security narrative where it blocks correct engineering decisions
3. do not let security docs lag behind runtime changes

Primary acceptance criterion:

- security-relevant work this month remains reviewable and documented
</domain>
</detailed_domain_backlog>

<operating_rhythm>
<start_of_week_procedure>
At the start of each week:

1. read this file
2. read the relevant authority docs
3. pick only the week’s target packages
4. define owners, scope boundaries, validations, and docs-to-update
</start_of_week_procedure>

<daily_procedure>
For each task:

1. inspect live code
2. confirm authority
3. patch the smallest coherent unit
4. add focused validation
5. update docs
6. record residual risks honestly
</daily_procedure>

<end_of_week_procedure>
At the end of each week:

1. update authority docs
2. update release gates
3. summarize what actually changed
4. carry unfinished but still valid work into the next tranche explicitly
5. remove stale assumptions from docs
</end_of_week_procedure>
</operating_rhythm>

<validation_matrix>
<desktop_frontend>
Use targeted commands such as:

- `pnpm --filter @agiworkforce/desktop typecheck`
- `pnpm --filter @agiworkforce/desktop test -- <targeted test paths>`

Use these when touching:

- transcript components
- desktop stores
- frontend runtime contracts
- desktop settings and visibility logic
</desktop_frontend>

<desktop_backend>
Use targeted commands such as:

- `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml <targeted test name> -- --nocapture`

Use these when touching:

- chat runtime
- provider adapters
- browser runtime
- MCP runtime
- security/auth/runtime command logic
</desktop_backend>

<other_surfaces>
Typecheck and test only the surfaces you actually change:

- `apps/web`
- `apps/mobile`
- `apps/extension`
- `apps/extension-vscode`

Do not run broad suites blindly unless the scope truly demands it.
</other_surfaces>

<documentation_validation>
For every meaningful code change, answer all of these:

- does a feature doc now lie?
- does an authority doc now lie?
- does the release gate need updating?
- does this instruction file need sequencing changes?
</documentation_validation>
</validation_matrix>

<risk_register>
<risk id="RK1" name="Wrong-file stabilization">
Cause:

- patching duplicate or stale files

Mitigation:

- authority docs first
- integration review for non-trivial work
</risk>

<risk id="RK2" name="Cross-surface overreach">
Cause:

- trying to achieve full parity across all surfaces this month

Mitigation:

- keep the month focused on flagship runtime and shared contracts
</risk>

<risk id="RK3" name="Provider churn">
Cause:

- provider behavior changes or capability ambiguity

Mitigation:

- prioritize major providers
- centralize model capability truth
</risk>

<risk id="RK4" name="Documentation drift">
Cause:

- code changes without doc updates

Mitigation:

- documentation updates are part of acceptance criteria
</risk>

<risk id="RK5" name="UI polish over runtime truth">
Cause:

- polishing presentation before runtime/event correctness

Mitigation:

- transcript trust first
- decoration later
</risk>
</risk_register>

<examples>
<good_behavior_example>
Task: fix a desktop tool-stream rendering bug.

Correct behavior:

1. read this file
2. read `docs/DESKTOP_STABILIZATION_SOURCE_OF_TRUTH.md`
3. inspect `useTauriStreamListeners.ts`, `useAgenticEvents.ts`, `toolStore.ts`, and relevant chat components
4. confirm which path is authoritative
5. fix only the live path
6. add targeted tests
7. update the desktop source-of-truth doc if authority changed

Why this is correct:

- it starts from live authority
- it validates
- it updates docs
- it does not stabilize duplicate paths
</good_behavior_example>

<bad_behavior_example>
Task: fix a desktop tool-stream rendering bug.

Incorrect behavior:

1. grep for a similarly named helper in an older file
2. patch that file without checking whether it is mounted or imported
3. claim the issue is fixed after a quick read
4. leave docs unchanged

Why this is incorrect:

- it creates or preserves duplicate authority
- it increases hallucination risk for future assistants
- it does not verify the live path
</bad_behavior_example>

<good_behavior_example>
Task: improve web/mobile parity.

Correct behavior:

1. check whether the underlying conversation/runtime/model contracts are already explicit
2. if not, document and define the shared contract first
3. align the non-desktop surface to that contract

Why this is correct:

- parity without shared contracts creates drift
</good_behavior_example>

<bad_behavior_example>
Task: improve web/mobile parity.

Incorrect behavior:

1. add equivalent-looking UI states on web/mobile
2. invent payload shapes locally
3. defer contract unification

Why this is incorrect:

- it creates future rewrite work
- it makes the suite less coherent
</bad_behavior_example>
</examples>

<first_actions_for_new_assistant>
If you are a new assistant picking up work from this document, do this first:

1. read this file fully
2. read `docs/DESKTOP_STABILIZATION_SOURCE_OF_TRUTH.md`
3. read `docs/DESKTOP_RELEASE_GATE.md`
4. read the relevant feature blueprint for your subsystem
5. inspect the live code path before editing

Recommended first technical sequence after that:

1. re-baseline remaining live desktop defects against current code
2. continue provider and multimodal correctness fixes
3. continue token/cost/accounting truth fixes
4. continue transcript-first runtime normalization
</first_actions_for_new_assistant>

<month_end_deliverables>
By the end of the month, the repo should contain:

- a trustworthy flagship desktop runtime path
- corrected major provider fidelity issues
- stronger transcript-first execution UX
- clearer shared contracts for the rest of the product suite
- refreshed authority docs and release gates
- an easier handoff state for next month
</month_end_deliverables>

<what_rolls_to_next_month>
Do not force these into the current month unless they become unexpectedly cheap:

- full cross-surface conversation sync completion
- full mobile companion parity
- full web parity with desktop
- broad enterprise export/compliance surface completion
- full CLI/shared-runtime implementation
- comprehensive plugin/package productization

Those belong to the following month unless they fall out naturally from this month’s structural work.
</what_rolls_to_next_month>

<final_instruction>
Judge this month by coherence and truth, not by volume.

If the result is:

- fewer fake states
- fewer duplicate authorities
- stronger provider correctness
- stronger transcript trust
- clearer shared contracts
- more truthful docs

then the month succeeded.

If the result is:

- more feature surface with weak runtime truth
- more stale docs
- more UI over unstable contracts

then the month failed, even if a lot of code changed.
</final_instruction>
