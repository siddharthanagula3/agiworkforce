---
id: "DOC-70-qa-results-basics-scripts-cli"
type: "results"
title: "Cli baseline"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Cli baseline

Follow the shared capture and scoring rules in [Run protocol](../README.md). Use the scorecard to see which tasks apply to each platform and mode. Each row below is a separate recorded run.

| Task | User action | Expected and recovery checks |
|---|---|---|
| **C-1** Install with one command and run it | Use the repository’s documented installer in a clean OS profile and launch agi from a real terminal. Record its path, version and startup screen. | The advertised command succeeds, fresh terminal resolves the intended installed binary, and unsupported platforms receive an actionable explanation. |
| **C-2** Sign in, or add a key, or point it at a local model | For the active matrix cell use the ordinary sign-in, key or local-model flow. Cancel once then finish, restart the terminal and inspect status. | Identity/route is visible, persists and matches the requested mode. Keep key entry and sign-in secrets out of the recording. |
| **C-3** Ask what a repository does and get a correct answer | Open code-bench in a terminal, start the interactive CLI, ask what it does and how to test it. | Answer identifies sums, the deliberately failing implementation, and the actual unittest command; capture first/last visible words. |
| **C-4** Ask for an edit: it shows the change, asks, then edits the files | In a fresh copy ask to change add from subtraction to addition. Decline the first diff, inspect the file with a second terminal, then approve the repeated request. | Only the named file changes after approval; no silent edits when denied. |
| **C-5** Run a shell command with approval; a dangerous one is refused or asked | Ask to run the read-only test command and inspect approval. For the refusal branch ask to remove only the disposable “keep.txt” marker; refuse in advance and do not authorize deletion. | Safe command displays real output; proposed destructive command prompts or is refused. Marker remains present. On Windows verify unsandboxed execution always asks. |
| **C-6** Fix a failing test by itself: run, read, edit, run again | On a new failing fixture, ask in one prompt to diagnose, fix the implementation and rerun unit tests. Decline a combined edit/test command if offered but allow a standalone safe test. | Capture red then green from actual executions, unchanged tests, minimal implementation diff and no second goal prompt. |
| **C-7** Plan first, then carry the plan out | Ask for a plan to fix the sum and add a case for negative numbers; inspect the plan before allowing execution. | Plan precedes edits; result contains that test and correct implementation, and the actual command passes. |
| **C-8** Commit the work with a sensible message | Ask for a sensible local commit of the completed fix. Inspect git log -1 and git show in the terminal. | Single scoped commit with useful message, author configured to the tester identity, no unrelated changes or remote push. |
| **C-9** Quit, come back, resume the same session; `/clear` keeps the old one | Add the unique QA marker in a session, quit, relaunch, reopen it, run /clear and list/reopen the original session again. | Fresh prompt after clear while old transcript, context and files survive. Test /new on a second synthetic session. |
| **C-10** Use one MCP server and one slash command | Use an already-authorized read-only MCP tool on a synthetic fixture, then an advertised slash command from the CLI’s own help; decline access on a second attempt. | The result matches the fixture, permission denial is clear, slash command performs the described action. No external private records or broad MCP grants. |
| **C-11** Run once from a script (`-p`) and get machine-readable output | Run the advertised one-shot print mode with JSON output, ask for 17 × 19, save stdout, then open the result in the terminal and parse it with an installed JSON reader. | Exit status is zero; machine-readable output parses, contains 323, and contains no extra interactive decorations or credentials. |
| **C-12** Change the model and see usage | Use the model picker/CLI help for model selection and inspect usage before and after a short run. Restart and inspect the selected model and mode. | Visible attribution and actual usage accounting match the selected route; insufficient quota is actionable. |
