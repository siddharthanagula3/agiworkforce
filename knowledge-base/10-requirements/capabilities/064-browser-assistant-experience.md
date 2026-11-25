---
id: "REQ-AREA-064"
type: "requirements"
title: "Requirement items: Browser-assistant experience"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 64. Browser-assistant experience

32 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S64.01

**Current-page context.** The assistant reads the page open in the user's browser and answers with it as context.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F064-01 Ask about the page you are on](../../20-features/064-browser-assistant-experience/F064-01-ask-about-the-page-you-are-on.md)

## S64.02

**Selected-text context.** Text the user highlights on a web page reaches the assistant as context for a question.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F064-02 Use selected text](../../20-features/064-browser-assistant-experience/F064-02-use-selected-text.md)

## S64.03

**Open-tab picker.** The user picks one or more open tabs to give the assistant as context.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop missing, Chrome missing
- Feature: [F064-03 Pick and compare open tabs](../../20-features/064-browser-assistant-experience/F064-03-pick-and-compare-open-tabs.md)

## S64.04

**Multi-tab comparison.** The assistant compares content from two or more open tabs in one answer.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop missing, CLI missing, Chrome missing
- Feature: [F064-03 Pick and compare open tabs](../../20-features/064-browser-assistant-experience/F064-03-pick-and-compare-open-tabs.md)

## S64.05

**Page summary.** One action summarizes the page the user is viewing.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done, Mobile done, Chrome done
- Feature: [F064-01 Ask about the page you are on](../../20-features/064-browser-assistant-experience/F064-01-ask-about-the-page-you-are-on.md)

## S64.06

**Question about page.** The user asks a free-form question and the answer uses the current page's content.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F064-01 Ask about the page you are on](../../20-features/064-browser-assistant-experience/F064-01-ask-about-the-page-you-are-on.md)

## S64.07

**Question about video/transcript.** The assistant answers questions about a video on the page using its transcript.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop missing, Mobile missing, CLI missing, Chrome done
- Feature: [F064-04 Ask about a video transcript](../../20-features/064-browser-assistant-experience/F064-04-ask-about-a-video-transcript.md)

## S64.08

**Browser side conversation.** A chat sits beside the page in the browser and keeps its own conversation while the user browses.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Chrome done
- Feature: [F064-05 Side chat beside the page](../../20-features/064-browser-assistant-experience/F064-05-side-chat-beside-the-page.md)

## S64.09

**Browser history context where explicitly enabled.** When the user turns it on, the assistant can use their browsing history as context.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop missing, CLI missing, Chrome missing
- Feature: [F064-06 Search browsing history (opt-in)](../../20-features/064-browser-assistant-experience/F064-06-search-browsing-history-opt-in.md)

## S64.10

**Open URL.** The assistant opens a web address in the browser for the user.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop done, Mobile missing, CLI done, VS Code done, Chrome done
- Feature: [F064-07 Open pages and manage tabs](../../20-features/064-browser-assistant-experience/F064-07-open-pages-and-manage-tabs.md)
- Competitor trace: CAP-agent-actions-19

## S64.11

**Back/forward/reload.** The assistant can go back, go forward or reload the page it is working on.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop partial, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F064-07 Open pages and manage tabs](../../20-features/064-browser-assistant-experience/F064-07-open-pages-and-manage-tabs.md)

## S64.12

**Create or close tab.** The assistant can open a new tab or close one as part of a task.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F064-07 Open pages and manage tabs](../../20-features/064-browser-assistant-experience/F064-07-open-pages-and-manage-tabs.md)

## S64.13

**Organize tabs.** The assistant groups, sorts or tidies the user's open tabs.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop missing, CLI missing, VS Code missing
- Feature: [F064-07 Open pages and manage tabs](../../20-features/064-browser-assistant-experience/F064-07-open-pages-and-manage-tabs.md)

## S64.14

**Website search.** The assistant runs a search on a website and reads the results back.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code done, Chrome done
- Feature: [F064-08 Act on a website](../../20-features/064-browser-assistant-experience/F064-08-act-on-a-website.md)

## S64.15

**Form filling.** The assistant fills in a web form on the user's behalf.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop done, Mobile missing, CLI done, VS Code done, Chrome done
- Feature: [F064-08 Act on a website](../../20-features/064-browser-assistant-experience/F064-08-act-on-a-website.md)
- Competitor trace: CAP-agent-actions-19

## S64.16

**Multi-step website task.** The user gives a goal and the assistant carries it out over several steps on websites.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI done, VS Code done, Chrome done
- Feature: [F064-08 Act on a website](../../20-features/064-browser-assistant-experience/F064-08-act-on-a-website.md)
- Competitor trace: CAP-agent-actions-19

## S64.17

**Structured site-tool invocation.** The assistant calls tools a website declares (e.g. WebMCP) instead of clicking through the page.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Desktop missing, CLI missing, VS Code missing, Chrome done
- Feature: [F064-08 Act on a website](../../20-features/064-browser-assistant-experience/F064-08-act-on-a-website.md)
- Competitor trace: CAP-agent-actions-21

## S64.18

**Visible action timeline.** Each browser action the assistant takes is listed for the user as it happens.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop done, Mobile missing, CLI done, VS Code done, Chrome done
- Feature: [F064-09 See and control a run](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md)
- Competitor trace: CAP-agent-actions-19, CAP-agent-actions-26

## S64.19

**Live browser preview.** The user can watch the browser the assistant is driving while it works.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Mobile missing, Chrome done
- Feature: [F064-09 See and control a run](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md)
- Competitor trace: CAP-agent-actions-15, CAP-agent-actions-26

## S64.20

**Active-tab indicator.** A visible marker shows which tab the assistant is working in.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, Chrome done
- Feature: [F064-09 See and control a run](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md)
- Competitor trace: CAP-agent-actions-26

## S64.21

**Login handoff.** When a site needs the user to sign in, the assistant pauses, lets them sign in, then continues.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome done
- Feature: [F064-10 Hand off sign-in, human checks and takeover](../../20-features/064-browser-assistant-experience/F064-10-hand-off-sign-in-human-checks-and-takeover.md)
- Competitor trace: CAP-agent-actions-17

## S64.22

**Human verification handoff.** When a site shows a CAPTCHA or human check, the assistant hands it to the user and resumes after.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome done
- Feature: [F064-10 Hand off sign-in, human checks and takeover](../../20-features/064-browser-assistant-experience/F064-10-hand-off-sign-in-human-checks-and-takeover.md)
- Competitor trace: CAP-agent-actions-17

## S64.23

**Take over.** The user takes over the browser mid-task without ending the assistant's run.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F064-10 Hand off sign-in, human checks and takeover](../../20-features/064-browser-assistant-experience/F064-10-hand-off-sign-in-human-checks-and-takeover.md)
- Competitor trace: CAP-agent-actions-16

## S64.24

**Return control to agent.** After taking over, the user hands control back and the assistant continues the same task.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F064-10 Hand off sign-in, human checks and takeover](../../20-features/064-browser-assistant-experience/F064-10-hand-off-sign-in-human-checks-and-takeover.md)
- Competitor trace: CAP-agent-actions-16

## S64.25

**Pause/stop.** The user can pause or stop the assistant's browser task at any moment.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, VS Code done, Chrome done
- Feature: [F064-09 See and control a run](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md)

## S64.26

**Download review.** Files the assistant downloads are approved and listed so the user can review them.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop done, Mobile missing, CLI missing, Chrome done
- Feature: [F064-11 Approve downloads and uploads](../../20-features/064-browser-assistant-experience/F064-11-approve-downloads-and-uploads.md)
- Competitor trace: CAP-agent-actions-20

## S64.27

**Upload review.** Before the assistant uploads a file to a website the user reviews and approves it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, Chrome done
- Feature: [F064-11 Approve downloads and uploads](../../20-features/064-browser-assistant-experience/F064-11-approve-downloads-and-uploads.md)
- Competitor trace: CAP-agent-actions-20

## S64.28

**Website permission controls.** The user decides which websites the assistant may read or act on.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Chrome done
- Feature: [F064-12 Website permissions and browser data](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md)
- Competitor trace: CAP-agent-actions-20

## S64.29

**Browser-session persistence setting.** A setting decides whether the assistant's browser keeps cookies and sign-ins between tasks.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Mobile missing
- Feature: [F064-12 Website permissions and browser data](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md)
- Competitor trace: CAP-agent-actions-20
- An owner decision is open on this item.

## S64.30

**Clear website data.** The user can clear the cookies and site data the assistant's browser holds.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop done, Mobile missing, Chrome missing
- Feature: [F064-12 Website permissions and browser data](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md)
- Competitor trace: CAP-agent-actions-18

## S64.31

**Isolated agent browser versus user browser choice.** The user chooses whether the assistant works in an isolated browser or in their own signed-in browser.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F064-12 Website permissions and browser data](../../20-features/064-browser-assistant-experience/F064-12-website-permissions-and-browser-data.md)
- Competitor trace: CAP-agent-actions-18

## S64.32

**Browser-task result summary.** When a browser task ends the assistant reports what it did and what still needs the user.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop done, Mobile missing, CLI done, VS Code done, Chrome done
- Feature: [F064-09 See and control a run](../../20-features/064-browser-assistant-experience/F064-09-see-and-control-a-run.md)
- Competitor trace: CAP-agent-actions-19
