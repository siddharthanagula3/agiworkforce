# Jev and TypeSafe AI: public evidence and AGI Workforce fit

Status: Current research snapshot
Owner: Provider/platform and product architecture
Reviewed: 2026-09-22

## Decision summary

Jev is a credible candidate for frequent, bounded semantic decisions with a
closed answer space. It is not a general reasoning or generation model and must
not become an authority for permissions, billing, trust-boundary changes or
consequential actions. AGI Workforce should retain the existing off-by-default
website response-assessment slice, evaluate additional candidates in shadow mode,
and use independently labeled task outcomes before activating any result.

The strongest public implementation pattern is consistent: code constructs a
small admitted action or category set, Jev selects or scores within that set, and
code validates, authorizes, executes and verifies. Public demonstrations support
testing this architecture. They do not establish production accuracy, capacity,
privacy eligibility or a universal confidence threshold for AGI Workforce.

## Verified official behavior

The current stable model is `jev-1.13.0`; `jev-latest` and `jev-preview` both
resolve to it. TypeSafe documents text-only input, a 64k total request budget, a
32k state-plus-longest-question budget, 250,000 input tokens per second and 1,200
requests per minute. Those limits are explicitly dynamic. Published direct price
is $0.042 per million input tokens and output tokens are free. Pin a version when
thresholds were calibrated against that version instead of relying on a moving
alias. Source: [TypeSafe model reference](https://docs.typesafe.ai/models).

`POST https://api.typesafe.ai/v1/systemone` accepts shared `state` and named
typed questions. Noul returns a probability of true, Choice returns one option
plus its full option distribution, and Score returns a distribution over ordered
levels. Choice supports at most 255 options; Score supports at most 10 levels.
Choice and Score carry distribution-derived confidence; Noul does not. Source:
[TypeSafe API reference](https://docs.typesafe.ai/api).

TypeSafe advises task-specific risk thresholds and explicitly treats confidence
as distribution concentration, not correctness. Its own jaggedness document says
Jev 1.13 is weak at exact arithmetic, date comparison, counting, indirection,
large irrelevant state, adversarial content and generation. It recommends
keeping arithmetic and invariants in code, minimizing state and testing precise
criteria. Sources: [confidence](https://docs.typesafe.ai/confidence) and
[Jev 1.13 jaggedness](https://docs.typesafe.ai/model-jaggedness/jev-1.13).

TypeSafe says customer requests are not used for model training, but ordinary
use is not the same as zero retention. Its legal page says enterprise ZDR is
available by arrangement. The September 19 customer agreement permits service
telemetry processing and requires customers to independently evaluate possibly
inaccurate output. Private conversations and workspace data therefore remain
ineligible until the actual AGI Workforce account, route, subprocessors and
retention terms are verified. Sources: [legal index](https://docs.typesafe.ai/legal),
[DPA](https://typesafe.ai/legal/data-processing) and
[customer agreement](https://typesafe.ai/legal/mca).

Vercel AI Gateway exposes Jev through AI SDK 7's experimental evaluation API and
documents a per-request ZDR option, logging, budgets and provider metadata. This
is a separate transport and policy boundary from TypeSafe direct access; AGI
Workforce must verify the effective route and installed SDK behavior. Source:
[Vercel announcement](https://vercel.com/changelog/typesafe-ai-jev-now-available-on-ai-gateway).

## Public builds and reports

These sources are useful for hypotheses, not launch claims:

- Browser Use's `jev-ultrafast` gives Jev indexed operations and compatible DOM
  targets while a small generative model supplies text only when needed. The
  project reports a Google Flights demonstration in 7.1 seconds, but it has only
  three commits and the demonstration is not an independent benchmark. Source:
  [browser-use/jev-ultrafast](https://github.com/browser-use/jev-ultrafast).
- `jev-browser` uses the same separation at broader scope: Jev chooses an action,
  code owns budgets/recovery/stopping, passwords never reach the model and
  consequential submission remains constrained. Its README explicitly calls the
  software early and says thresholds are starting points. Source:
  [jkudish/jev-browser](https://github.com/jkudish/jev-browser).
- The voice-browser prototype streams partial speech, asks one Jev batch for
  intent, target, completion, command relevance and destructive risk, then lets
  code wait, disambiguate, confirm or execute through Playwright. It reports 34
  fixture cases and roughly 300 ms median Jev latency on its machine. It controls
  a browser, not the full desktop; it uses Chrome/Edge Web Speech, which sends
  audio to Google, and warns that spoken confirmation is only a convenience.
  Source: [jev-voice-browser](https://github.com/moritzkremb/jev-voice-browser).
- TypeSafe's community playground includes routing, RAG reranking, extraction,
  PR review, browser actions, source filtering and workflow decisions. It also
  documents that the prototypes are not automatically a supported suite. Source:
  [TypeSafe playground](https://github.com/TypeSafeAI/typesafe-playground).
- An analysis of 12,759 relevant X posts found lower reported median speed and
  cost improvements than vendor headline maxima and explicitly states that it
  did not reproduce the experiments. It identified browser/computer control,
  PR review, safety/security classification and paper classification among the
  reported builds. Source:
  [OpenChamber launch-window analysis](https://openchamber.dev/blog/jev-typesafe-ai/).
- Reddit reports show agent routing, parallel project scoring and context
  compaction, but the threads also question missing benchmarks, context loss,
  privacy and whether confidence corresponds to correctness. Individual posts
  are small, self-reported samples and several are promotional. Examples:
  [agent routing](https://www.reddit.com/r/LLMDevs/comments/1wihigc/tried_typesafes_new_decisiononly_model_jev_as_an/),
  [project scoring discussion](https://www.reddit.com/r/SideProject/comments/1wiw6tk/i_built_a_side_project_to_test_typesafes_jev/),
  and [context-compaction discussion](https://www.reddit.com/r/ClaudeCode/comments/1wkjnrz/instant_claude_code_compaction_is_my_favorite_use/).
- The available Hacker News discussion is only four comments and includes a
  TypeSafe employee, so it is evidence of early interest rather than independent
  validation. Source:
  [Hacker News thread](https://news.ycombinator.com/item?id=49716682).

## Repository-specific adoption sequence

### Website phase

1. Keep the existing response-budget assessment flags off by default until the
   authenticated smoke test and held-out evaluation are complete.
2. Inventory repeated semantic decisions already owned by website code. Evaluate
   only cases with an explicit candidate set and measurable downstream outcome:
   intent and ambiguity, response-depth assessment, authorized skill/tool/
   connector shortlisting, retrieval relevance, clarification recommendation and
   advisory output-completeness checks.
3. Compare current behavior, a deterministic improvement and a Jev-assisted
   version on the same labeled snapshots. Record end-to-end task success, false
   actions, abstention, latency, total cost, state size and fallback frequency.
4. Begin with shadow-only results. An unavailable, invalid, low-confidence or
   policy-ineligible evaluation preserves the existing authorized path.
5. Do not send raw private history, files, credentials, tool results or tenant
   identifiers. Admit only minimized data after the actual route and retention
   policy permit it.

### Later Desktop voice phase

Use a host-owned pipeline:

`local speech recognition -> bounded candidates -> optional Jev batch -> deterministic policy and permissions -> explicit confirmation -> native executor -> outcome verification -> undo/recovery`

Candidate Jev heads are command relevance, intent, target, phrase completion,
ambiguity, correction, risk classification and next-step recommendation. Native
accessibility APIs and application adapters remain the source of available
targets and actions. Exact shortcuts, app identities, permissions, file paths,
amounts, dates and state transitions stay in code. High-risk actions require the
canonical confirmation surface regardless of model confidence.

Before any desktop pilot, build an offline corpus of partial speech, corrections,
background conversation, multilingual commands, ambiguous targets, stale UI,
prompt-injected page content, destructive requests and interrupted execution.
Measure false-action rate separately from intent accuracy. A voice system that
chooses the right intent but acts on the wrong window is not successful.

### 2026-09-22 addendum: owner-nominated Laya alternative for retained Tauri

The [Convai Innovations model card](https://huggingface.co/convaiinnovations/laya)
publishes Laya as an Apache-2.0, locally runnable typed-decision model with
choice, score and yes/no-style outputs. The
[@receptron/laya runtime](https://github.com/receptron/laya) is a community
TypeScript/ONNX implementation, not a verified integration with our Tauri host;
its documented English bundle is about 1.7 GB on disk and needs roughly 2 GB of
loaded memory. The upstream model card itself reports that its base checkpoints
perform poorly on its typed-decisions benchmark without task-specific tuning.
These are documented vendor/community claims, not AGI Workforce measurements.

For the later retained-Tauri phase, Laya is an evaluation candidate if hosted
Jev is unsuitable. Compare it with the existing classifier and Jev on the same
labeled, privacy-safe desktop intent/target/ambiguity cases. Measure cold and
warm latency, false actions, calibration, memory, download/installer size,
platform packaging and offline behavior. A model decision remains advisory;
speech recognition, permissions, execution and outcome verification stay in
their separate host-owned stages. No runtime change, dependency or rollout is
approved by this research note. The public Desktop product remains Electron.

## Rejected blanket use

Do not add Jev to deterministic navigation, feature flags, entitlement checks,
Free-plan limits, waitlist/access-code admission, pricing, billing arithmetic,
authentication, authorization, tenant isolation, route capability admission,
exact dates/counts or irreversible execution. Do not treat typed output as proof
of a correct decision or vendor/community latency as AGI Workforce performance.
