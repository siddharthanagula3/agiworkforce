---
id: "PLAN-vscode-088"
type: "test-plan"
title: "VS Code · 88. Support, trust, and policy product"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "88"
---
# VS Code · 88. Support, trust, and policy product

6 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S88.01 Contextual help links.

- **Expected:** Screens that need explaining link straight to the matching help or docs article for that feature.
- **Code:** done. Evidence present: apps/web/content/support/configuration.md:2; apps/web/content/support/custom-instructions.md:2; apps/web/lib/support/doc-metadata.ts:199
- **Where to find it:** Sidebar > onboarding screen > Permission docs (labels found in the code)
- **Needs:** none (an internet connection to open the docs page)
- **Steps:**
  1. Open the AGI Code sidebar and go to the onboarding screen that has the Permission docs link.
  2. Click Permission docs.
  3. Look at the browser that opens: it should be the docs page for permissions (URL contains topic=permissions), and the article should explain the permission settings shown on that screen.

## S88.04 Report-a-bug flow.

- **Expected:** A user can report a bug from the product, with enough context (build, platform) for support to act.
- **Code:** done. Evidence moved: apps/extension-vscode/src/core/commandSetup.ts:1545; apps/extension-vscode/src/features/feedback/submitFeedback.ts:27 (quoted code not found in the file now); apps/extension-vscode/src/features/feedback/submitFeedback.ts:50; apps/extension-vscode/src/features/feedback/submitFeedback.ts:51
- **Where to find it:** Command palette > Code: Send Feedback > Report a Bug (also Sidebar > More actions > Help > Send feedback) (labels found in the code)
- **Needs:** a signed-in AGI Cloud account (signed-out users get a Sign in prompt)
- **Steps:**
  1. Open the Command Palette and type Code: Send Feedback, or open the sidebar's More actions menu and choose Help > Send feedback.
  2. Pick Report a Bug from the list.
  3. Type a description in the box that reads Report a Bug: Describe your feedback, then press Enter.
  4. Look for the notification that says your feedback reached the team. Compare with Expected: the form asks only for text, and the build and platform are sent with the report without being shown to you.

## S88.05 Product feedback.

- **Expected:** Users can send general product feedback from inside the product and it is stored for the team.
- **Code:** done. Evidence moved: apps/extension-vscode/src/core/commandSetup.ts:1552; apps/extension-vscode/src/features/feedback/submitFeedback.ts:49; apps/web/app/api/feedback/route.ts:49 (quoted code not found in the file now); apps/web/app/api/feedback/route.ts:37
- **Where to find it:** Command palette > Code: Send Feedback > General Feedback (labels found in the code)
- **Needs:** a signed-in AGI Cloud account
- **Steps:**
  1. Open the Command Palette and type Code: Send Feedback.
  2. Pick General Feedback (description: Share thoughts about the extension).
  3. Type a message in the box and press Enter.
  4. Look for the notification that says your feedback reached the team. Compare with Expected.

## S88.06 Feature request.

- **Expected:** Users can submit a feature request from inside the product and it is stored for the team.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:1549; apps/extension-vscode/src/features/feedback/submitFeedback.ts:83; apps/web/app/api/feedback/route.ts:37
- **Where to find it:** Command palette > Code: Send Feedback > Feature Request (labels found in the code)
- **Needs:** a signed-in AGI Cloud account
- **Steps:**
  1. Open the Command Palette and type Code: Send Feedback.
  2. Pick Feature Request (description: Suggest a new feature or improvement).
  3. Type the request in the box and press Enter.
  4. Look for the notification that says your feedback reached the team. Compare with Expected.

## S88.07 User-reviewable diagnostic bundle.

- **Expected:** A user can produce a diagnostic bundle, see what it contains, and choose to share it with support.
- **Code:** done. Evidence present: apps/extension-vscode/src/core/commandSetup.ts:1504; apps/extension-vscode/src/core/commandSetup.ts:1525
- **Where to find it:** Command palette > Code: Export Diagnostics (also Sidebar > More actions > Help > Export diagnostics) (labels found in the code)
- **Needs:** a signed-in AGI Cloud account
- **Steps:**
  1. Sign in to AGI Cloud (signed-out, the command shows a message and exports nothing).
  2. Open the Command Palette and type Code: Export Diagnostics, or use Help > Export diagnostics from the sidebar's More actions menu.
  3. Wait for the save dialog to open, then save the JSON file somewhere you choose.
  4. Open the saved file and check its fields (for example collectedAt, surface, appVersion, platform, locale, recentEvents), then compare with Expected. Note the save dialog is the only point of choice: there is no preview in the app and no share-with-support button, so the tester attaches the file to support by hand. Cancelling the dialog writes nothing.

## S88.08 Request/error identifier.

- **Expected:** When a request fails, the user sees a reference id they can quote to support.
- **Code:** done. Evidence moved: apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts:287 (quoted code not found in the file now); apps/web/lib/error-handler.ts:346
- **Where to find it:** Sidebar chat > a message that fails > error message (the Reference: line) (labels found in the code)
- **Needs:** a request that fails with a server failure (not controllable from the app)
- **Steps:**
  1. Send a chat message in the AGI Code sidebar.
  2. Make the request fail (this cannot be set up on demand; it needs a failing request that the server answers with a typed failure).
  3. Read the error message in the chat. It should end with Reference: followed by an id.
  4. Copy the id and compare with Expected: the id must be one the user can quote to support.
