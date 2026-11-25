---
id: "DOC-70-qa-results-basics-scripts-vscode"
type: "results"
title: "Vscode baseline"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Vscode baseline

Follow the shared capture and scoring rules in [Run protocol](../README.md). Use the scorecard to see which tasks apply to each platform and mode. Each row below is a separate recorded run.

| Task | User action | Expected and recovery checks |
|---|---|---|
| **V-1** Install the extension; it finds or installs the CLI by itself | Use the genuine VS Code install flow for the owner-provided release in a clean profile. Open AGI’s panel, with the CLI initially unavailable in the clean environment. | Follow the offered CLI setup; panel becomes usable without guessing a path. Record the installed extension and CLI versions. |
| **V-2** Chat in the panel with a streamed answer | Open the side panel and ask for 17 × 19 with an explanation; stop a second, longer answer. | Correct streamed answer, visible stop, selectable text and useful failure/entitlement state; record first and last paint. |
| **V-3** It knows the open file and the selection without being told | Open sum.py and select the subtracting expression; ask what is wrong without mentioning the filename or copying the selection. | The reply references this specific file and selection, not neighboring folders or unrelated files. |
| **V-4** Ask for a change: review the diff in the editor, accept or reject | Ask to fix the subtraction. Review the editor diff, reject once, check the file, then repeat and accept. | Exactly the expected diff is applied only on acceptance, with accessible before/after rendering. |
| **V-5** Run a command with approval and see the output | Ask to run the documented tests. Decline first, then allow the test command after reviewing it. | No command runs on denial; accepted command shows terminal output and exit result. |
| **V-6** Fix a failing test from the panel | In a fresh fixture ask in one panel message to fix the failing test by repairing production code and rerunning tests. | Inspect red output, minimal implementation edit, green rerun, original tests still present, no extra prompt specifying the goal. |
| **V-7** Past sessions are listed and can be reopened after a reload | Start a marked chat, use Developer: Reload Window, then reopen the saved session in the panel and ask for its marker. | The original session and correct context reappear; no duplicate or empty transcript. |
| **V-8** Change the model; sign in or add a key from inside the editor | Use the panel’s settings/sign-in/key/model controls. Start with credentials absent, then complete the active route’s setup and change model. | Credentials are masked; selected route is visible in panel and in the resulting turn, and correct settings survive window reload. |
