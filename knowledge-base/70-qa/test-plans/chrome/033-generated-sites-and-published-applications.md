---
id: "PLAN-chrome-033"
type: "test-plan"
title: "Chrome · 33. Generated Sites and published applications"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "33"
---
# Chrome · 33. Generated Sites and published applications

12 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S33.02 Application name and description.

- **Expected:** The user can set a name and description for a published app.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No app name or description setting found in apps/extension (searched publish, deploy, published app, site, hosted, visibility, app name).
- **Needs:** live-web, as the plan file says

## S33.04 Prompt-based creation.

- **Expected:** The user creates a site by prompting the assistant, then hosts the result.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. The side panel creates artifacts in chat (for example the locale text "Creating $TITLE$"), but no hosting step was found in apps/extension.
- **Needs:** live-web, as the plan file says

## S33.05 Source-code workspace.

- **Expected:** The site's source code can be browsed and edited in a workspace.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. The side panel shows an artifact's source under the "Code" view in apps/extension/src/features/side-panel/artifactPanel.ts, but no workspace or edit control for a site was found.
- **Needs:** live-web, as the plan file says

## S33.07 Preview deployment.

- **Expected:** The site can be deployed to a shareable preview URL.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No preview deployment or shareable preview URL found in apps/extension (searched deploy, preview URL, deployment).
- **Needs:** live-web, as the plan file says

## S33.08 Production deployment.

- **Expected:** The site can be deployed to a separate production URL/stage.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No production deployment or separate production URL found in apps/extension.
- **Needs:** live-web, as the plan file says

## S33.10 Public URL.

- **Expected:** The published site is reachable at a public URL.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No public URL for a published site found in apps/extension; the locale text "once this app is published" is about artifact runtime, not a URL control.
- **Needs:** live-web, as the plan file says

## S33.12 Workspace-only access.

- **Expected:** The owner can restrict a site to members of their workspace.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No workspace-only access setting for a site found in apps/extension.
- **Needs:** live-web, as the plan file says

## S33.13 Password or authentication options where offered.

- **Expected:** The owner can require a password or sign-in to view the site.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. The only password hits in apps/extension are for sign-in fields, not a site password option.
- **Needs:** live-web, as the plan file says

## S33.19 Usage and hosting limits.

- **Expected:** Usage and hosting limits are enforced and shown to the owner.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No hosting usage or limit display for published apps found in apps/extension.
- **Needs:** live-web, as the plan file says

## S33.23 Rollback.

- **Expected:** The owner can roll the live site back to an earlier version.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. No rollback control found in apps/extension (searched rollback, roll back, restore version).
- **Needs:** live-web, as the plan file says

## S33.25 Duplicate/fork.

- **Expected:** The owner can duplicate/fork an app to keep working on a copy.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. apps/extension/src/side_panel.ts has forkConversationForHistory for chats, not apps; no app duplicate or fork control found.
- **Needs:** live-web, as the plan file says

## S33.26 Download source.

- **Expected:** The owner can download the app's source.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** live-web
- **Where to find it:** not found in the code. The nearest control is the artifact "Download" button (spAnswerFileDownload, _locales/en/messages.json), which saves one artifact file, not an app's source; no app source download found.
- **Needs:** live-web, as the plan file says
