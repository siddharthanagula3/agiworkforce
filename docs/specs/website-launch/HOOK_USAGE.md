# Project-scoped launch continuation

Status: Configuration and19 fixture tests verified; owner trust and runtime activation pending
Owner: Explicitly authorized website launch coordinator
Last updated: 2026-09-19

The desktop app (26.908.70816, build9275) runs bundled Codex0.154.0-alpha.6.2.
The terminal command resolves to a separate Codex0.147.0. Both report hooks stable/enabled.
Reviewed the [official hook contract](https://learn.chatgpt.com/docs/hooks) on2026-09-19.
The project is already trusted, but project trust does not trust a new hook definition.
No global config, model, permission, sandbox or compaction setting was changed.

## Files and binding

[AGENT_GOAL.md](AGENT_GOAL.md) preserves the master launch objective.
[CONTINUE_GOAL.md](CONTINUE_GOAL.md) is the compact continuation context.
[PROGRESS.md](PROGRESS.md) remains the checkpoint. The existing coverage, issue and plan files
remain authoritative; the run state is only control metadata and evidence references.

[hooks.json](../../../.codex/hooks.json) registers one synchronous command handler each for
Stop, Interrupt and UserPromptSubmit. Only Stop requests continuation, using the documented
`decision: block` and `reason` response. No SubagentStop hook is installed.
The command binds the exact coordinator session01a0b8ba-e573-7a53-af23-6671ff7670f0.
The handler also requires the exact resolved worktree and ignores worker identifiers.
Stop matchers are unsupported, so binding occurs inside the handler, not in a fake matcher.

No user/project inline hooks or standalone hook files existed before installation; no overlapping
continuation hooks were found in cached plugin hook JSON files. Inline plugin manifests
register existing Browser/Chrome and computer-use Stop cleanup calls to turn_ended; these are
preserved. They do not configure a continuation prompt. Managed sources at /etc/codex were absent.
The runtime hook review remains authoritative for enabled plugin/managed sources. If it shows
another continuation handler, disable this new handler until the overlap is resolved; do not
independently activate both. The existing host goal is not a second installed Stop hook; this
script creates no task, goal, process, timer, daemon or scheduler.

## Review and activation: owner action required

Use the installed bundled CLI from the repository:

```sh
cd /Users/siddhartha/Desktop/agiworkforce
/Applications/ChatGPT.app/Contents/Resources/codex
```

Without submitting another work prompt, enter `/hooks`. Inspect the project source
`.codex/hooks.json` and review the three definitions invoking `.codex/hooks/launch.py`.
Trust those exact definitions only if their commands and scopes match the reviewed files.
Do not use the trust-bypass flag. Exit that inspection session; it is not bound to launch work.
This is the verified documented CLI review flow; no equivalent desktop button label is assumed.
Do not launch a second worker on this coordinator's session.

After trust, return to this task and confirm review is complete. The next normal Stop should
issue one harmless, bounded continuation. The corresponding UserPromptSubmit event must match
its exact issued message hash. `status` must show both runtimeStopObservedAt and
runtimeContinuationObservedAt; only then can `observed` record activation verified.
A fixture invocation is not a real runtime activation test. If this existing desktop task does
not reload the new hook, report that limitation and preserve the checkpoint; do not restart the
application or spawn a replacement run to bypass it.

## Controls

Run from the repository. All commands below target only the bound coordinator. Use this prefix:

```sh
python3 .codex/hooks/launch.py status --session 01a0b8ba-e573-7a53-af23-6671ff7670f0
```

Replace `status` with:

- `enable --next PROJECT-PERSISTENCE`: first activation only, refuses to overwrite an existing run.
- `pause --reason 'Owner requested pause'`: PAUSED_BY_USER; no automatic restart.
- `resume --reason 'Owner explicitly resumed the launch task'`: preserves counters and deadline.
- `wait --reason 'Login handoff to owner'`: WAITING_FOR_USER for up to60 seconds at Stop boundaries.
- `checkpoint --reason 'Exact unresolved prerequisite or context boundary'`: allows a checkpoint.
- `disable --reason 'Owner disabled launch continuation'`: disables this run, preserving its history.
- `observed`: records activation only after a matching runtime continuation has been observed.
- `verify-scope`: accepts LOCAL_SCOPE_VERIFIED only with complete current scope/evidence accounting.

Example pause:

```sh
python3 .codex/hooks/launch.py pause --session 01a0b8ba-e573-7a53-af23-6671ff7670f0 --reason 'Owner requested pause'
```

To disable the hook definitions themselves, use `/hooks` and disable only these three project
handlers. Do not switch off all Codex hooks. Explicit interruption automatically pauses the run.
Any new user message suspends automatic continuation until the coordinator honors the message
and explicitly resumes within its authorization. A generated continuation is recognized only
by the exact hash issued by this handler. Neither reference text nor a demo chat activates it.

## Limits, evidence and failure behavior

State lives in the ignored `.codex/launch-runs/<session>.json`, protected by an advisory file
lock and atomic replace. Stop requests are deduplicated by documented turn identity, repeated
Stop indicator and latest message hash. Counters do not reset when a new turn begins.
Default ceilings:20 automatic continuations and four hours. Lower limits can be set on initial
enable using `--max-continuations` and `--hours`. Raising them, replacing a run or extending its
deadline requires a new explicit owner authorization and reviewed policy change.
These limits apply only at Stop boundaries; the hook cannot interrupt an active turn or enforce
provider spend. Existing task/provider limits remain authoritative. No dollar budget is invented.

After two continuations with no changed relevant implementation/evidence, the message requires
replanning. If the next boundary still has no substantive change, it checkpoints. Plan prose,
timestamps and Stop message changes are not progress. The hook does not test or repair anything.
New useful verification must be recorded in QA_COVERAGE with artifact hashes and assertions;
implementation dependencies are fingerprinted separately. Repeated screenshots alone do not
establish new behavior. The script checks small explicitly referenced files, never the repo tree.

The pinned `localScope` IDs must remain accounted for. Completed cases need a `verification`
object with assertions, artifact-path/hash pairs and dependency-path/hash pairs, plus a final
`completionAudit` covering all pinned IDs with its own evidence references. A changed dependency
invalidates only cases naming it; valid passes are not requeued. Legacy valid passes may be
referenced when the coordinator establishes their provenance without replaying them.
A structural check cannot prove functional correctness; the coordinator must inspect the actual
functional evidence before asking to verify scope. A done flag or completion phrase is ignored.

Mark case actionability only after checking authorization/prerequisites. Production tasks are
excluded. One blocked task does not prevent another local task. Missing or malformed state,
ledger or evidence produces a diagnostic, never a launch-completion claim. Hook errors stop
automatic continuation rather than creating a fail-closed infinite loop. Waiting for login never
retries it; after the handoff window the coordinator waits for owner confirmation.

## Validation

```sh
/usr/bin/python3 -m unittest discover -s .codex/hooks -p 'test_*.py' -v
```

Fixtures cover scope binding, activation, interruption, user redirection, login wait/expiry,
independent work despite blockers, completion evidence, missing/malformed state/ledger,
no-progress replanning, finite limits, selective invalidation, and concurrent duplicate delivery.
See PROGRESS.md for actual results and the separate trust/runtime verification status.
