---
id: "REQ-AREA-012"
type: "requirements"
title: "Requirement items: New-chat experience"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 12. New-chat experience

24 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S12.01

**Empty conversation canvas.** Opening a new chat shows an empty conversation area (no prior messages) with a ready composer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F012-01 New chat screen and greeting](../../20-features/012-new-chat-experience/F012-01-new-chat-screen-and-greeting.md)
- Competitor trace: CAP-conversations-and-history-01

## S12.02

**Personalized greeting where appropriate.** The new-chat screen greets the signed-in user by their (preferred) name when one is known.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Seen in a real run: Web PASS
- Feature: [F012-01 New chat screen and greeting](../../20-features/012-new-chat-experience/F012-01-new-chat-screen-and-greeting.md)

## S12.03

**Neutral greeting when personalization is disabled.** When personalization is off (or no name is known), the new-chat greeting is neutral and shows no personal details.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F012-01 New chat screen and greeting](../../20-features/012-new-chat-experience/F012-01-new-chat-screen-and-greeting.md)

## S12.04

**Suggested prompts.** The new-chat screen offers clickable suggested prompts that fill or send a message.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web unverified, Desktop unverified, Mobile missing, CLI missing, VS Code missing, Chrome done
- Feature: [F012-02 Suggested prompts and recommendations](../../20-features/012-new-chat-experience/F012-02-suggested-prompts-and-recommendations.md)

## S12.05

**Task-category shortcuts.** The new-chat screen offers one-tap task-category shortcuts (e.g. write, research, image) that set up the next message.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, Chrome done
- Feature: [F012-04 Task shortcuts and mode explanation](../../20-features/012-new-chat-experience/F012-04-task-shortcuts-and-mode-explanation.md)

## S12.06

**Recent Project shortcuts.** The new-chat screen offers shortcuts to the user's recent projects that open the project or start a chat in it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, CLI done, VS Code done, Chrome done
- Feature: [F012-03 Recent projects and files](../../20-features/012-new-chat-experience/F012-03-recent-projects-and-files.md)

## S12.07

**Recent-file suggestions.** When starting a chat the user is offered their recently used files to attach in one step.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F012-03 Recent projects and files](../../20-features/012-new-chat-experience/F012-03-recent-projects-and-files.md)

## S12.08

**Recommended Skills.** The new-chat screen recommends Skills relevant to the user, which can be applied to the next message.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): VS Code done, Chrome missing
- Feature: [F012-02 Suggested prompts and recommendations](../../20-features/012-new-chat-experience/F012-02-suggested-prompts-and-recommendations.md)

## S12.09

**Recommended connected apps.** The new-chat screen recommends apps/connectors worth connecting or using for the next message.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web unverified, Desktop unverified, Mobile done, VS Code done
- Feature: [F012-02 Suggested prompts and recommendations](../../20-features/012-new-chat-experience/F012-02-suggested-prompts-and-recommendations.md)

## S12.10

**Search entry.** From the new-chat screen the user can explicitly start a web search for the next message.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome missing
- Feature: [F012-05 Search, research, agentic and coding entries](../../20-features/012-new-chat-experience/F012-05-search-research-agentic-and-coding-entries.md)

## S12.11

**Research entry.** From the new-chat screen the user can switch on a deep-research mode for the next message.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F012-05 Search, research, agentic and coding entries](../../20-features/012-new-chat-experience/F012-05-search-research-agentic-and-coding-entries.md)
- Competitor trace: CAP-research-01

## S12.12

**Image-creation entry.** From the new-chat screen the user can enter an image-creation mode whose send generates an image.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Feature: [F012-06 Image and video entries](../../20-features/012-new-chat-experience/F012-06-image-and-video-entries.md)

## S12.13

**Video-creation entry.** From the new-chat screen the user can enter a video-creation mode whose send starts a video generation.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F012-06 Image and video entries](../../20-features/012-new-chat-experience/F012-06-image-and-video-entries.md)

## S12.14

**Voice entry.** From the new-chat screen the user can start a spoken (voice-mode) conversation.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing
- Feature: [F012-07 Voice entry](../../20-features/012-new-chat-experience/F012-07-voice-entry.md)

## S12.15

**Agentic-work entry.** From the new-chat screen the user can start agentic (multi-step, tool-using) work rather than a plain chat.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F012-05 Search, research, agentic and coding entries](../../20-features/012-new-chat-experience/F012-05-search-research-agentic-and-coding-entries.md)

## S12.16

**Coding entry.** From the new-chat surface the user can start a coding session (a repository/workspace-aware coding agent).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F012-05 Search, research, agentic and coding entries](../../20-features/012-new-chat-experience/F012-05-search-research-agentic-and-coding-entries.md)

## S12.17

**Temporary-chat control.** Before or during a new chat the user can switch it to a temporary chat that is not kept in history.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code missing, Chrome missing
- Feature: [F012-08 Temporary chat](../../20-features/012-new-chat-experience/F012-08-temporary-chat.md)
- Competitor trace: CAP-conversations-and-history-13

## S12.18

**Default-model display.** The new-chat screen shows which model the next message will use before the user sends.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F012-09 Model, workspace and project for the next message](../../20-features/012-new-chat-experience/F012-09-model-workspace-and-project-for-the-next-message.md)

## S12.19

**Default-workspace display.** The new-chat screen shows which workspace (personal or organization) the new chat will belong to.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, Chrome missing
- Feature: [F012-09 Model, workspace and project for the next message](../../20-features/012-new-chat-experience/F012-09-model-workspace-and-project-for-the-next-message.md)

## S12.20

**Default-Project selection.** Before sending, the user can pick the project a new chat will be created in.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F012-09 Model, workspace and project for the next message](../../20-features/012-new-chat-experience/F012-09-model-workspace-and-project-for-the-next-message.md)
- Competitor trace: CAP-conversations-and-history-01, CAP-conversations-and-history-24

## S12.21

**Mode explanation and examples.** The new-chat screen explains the available modes and gives examples of what each is for.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web unverified, Desktop unverified, CLI done, VS Code done, Chrome done
- Feature: [F012-04 Task shortcuts and mode explanation](../../20-features/012-new-chat-experience/F012-04-task-shortcuts-and-mode-explanation.md)

## S12.22

**First-use feature education.** First-time users are shown a short introduction to the product's key features before or at their first chat.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F012-10 First-use introduction](../../20-features/012-new-chat-experience/F012-10-first-use-introduction.md)

## S12.23

**Resumption of an unsent draft.** An unsent draft typed in a new chat is restored when the user returns (after navigation or reload).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code done, Chrome missing
- Feature: [F012-11 Unsent draft restore](../../20-features/012-new-chat-experience/F012-11-unsent-draft-restore.md)
- Competitor trace: CAP-conversations-and-history-01

## S12.24

**Guest limitations and sign-in conversion.** A signed-out visitor can use the product within stated guest limits and is prompted to sign in to lift them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web partial, Desktop partial, Mobile done, CLI done
- Feature: [F012-12 Guest use and sign-in prompt](../../20-features/012-new-chat-experience/F012-12-guest-use-and-sign-in-prompt.md)
- Competitor trace: CAP-conversations-and-history-22
