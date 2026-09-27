# Cross-product flows

From the code audit of `21d4395`. Each flow takes the status of its weakest link. Remove a flow when every link works end to end; delete this file when none are left.

These are the 30 end-to-end journeys from the inventory's cross-product section, traced link by link. This section is single-pass.

**Working end to end:**

- **Web conversation → mobile continuation.** Works in Cloud mode: the phone gets the full history, and replies sync back. Archive state doesn't reach the phone.
- **CLI session → desktop continuation** and **desktop session → VS Code continuation.** Both work through the shared local session store, but both ends need the unpublished CLI (§2.8).
- **Notebook (project) → main chat.** Works on web and desktop. On mobile, VS Code and Chrome the project's sources don't reach the answer: they get the instructions only, or they miss the first turn.

**Partially working, and where each breaks:**

| flow                                  | where it breaks                                                                                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat → editable document              | No document editor: Edit is a raw source textarea on web and desktop. Mobile only previews.                                                          |
| Document → presentation               | The office tool makes a new, fixed-layout, download-only .pptx. There's no deck view or editing.                                                     |
| Spreadsheet → chart → report          | The DOCX/PDF report tool takes text and tables only, so the chart never reaches the report (`managed-office-file-service.ts:156`).                   |
| Research → interactive page           | The report hands off only as a static Markdown artifact.                                                                                             |
| Voice → durable task                  | Live voice can't reach AGI Work. The user must leave voice and retype.                                                                               |
| Voice → generated document            | Voice can reach only search and code, not file writing.                                                                                              |
| Email thread → agent task             | Gmail exists only with operator config. There's no email-to-task address, and Gmail triggers never fire.                                             |
| Team mention → coding session         | A GitHub PR mention only queues a review. A Slack mention starts a routine that fails (0284). Web cloud Code is off.                                 |
| Design → implementation               | No spec handoff. Web Code is off; local sessions need the CLI.                                                                                       |
| Completed task → Skill                | Only the CLI auto-learner, which writes skills without asking.                                                                                       |
| Completed task → routine              | No "turn into routine" action anywhere. The CLI's route creates a schedule whose runs fail (0284).                                                   |
| Mobile request → local-host execution | The phone steers existing sessions, but "Start on Desktop" is acknowledged then dropped (§2.11).                                                     |
| Local → cloud handoff                 | CLI `/continue-with-cloud` swaps the model only. There's no cloud importer.                                                                          |
| Cloud result → local repo             | Cloud sessions can push a branch or PR. VS Code's pull command is hidden and uncalled.                                                               |
| Chat → persistent notebook source     | Only artifacts and reports can be saved to a project, and they hit the storage cap and scanner gate.                                                 |
| Usage exhaustion → alternative        | Shows the reset time and upgrade, but never names an eligible model, and checkout is waitlist-gated.                                                 |
| Disconnected integration → resume     | Reconnect exists, but nothing resumes the interrupted turn.                                                                                          |
| Published output → versioned update   | Republish to the same link works, but there's no publish-history screen.                                                                             |
| Public creation → private fork        | Shared conversations can be forked (text only). Artifacts and apps can't.                                                                            |
| Personal → shared workspace resource  | Projects can be shared with the right role, but recipients find them only under Workspace > Sharing. Skills, assistants and plugins can't be shared. |

**Not working on any surface:** research → audio overview (no audio-overview generator exists), image → edited image → video (the video contract takes no image), browser page → project source (no "add website" source, and the desktop drops Chrome's page capture), repository → review deck, custom assistant → plugin, and shared artifact → viewer-authorized connected app (published apps are static, with no network access).
