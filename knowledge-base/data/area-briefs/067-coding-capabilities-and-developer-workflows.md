# Area 67. Coding capabilities and developer workflows

39 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S67.01 Explain repository structure.
- Should: The agent reads the repository and explains its structure: main parts, entry points, how they fit.
- Status: web partial, desktop done, mobile done, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/LocalSessionPanel.tsx:160; apps/desktop/electron/runtime/dispatcher.ts:892; apps/cli/src/features/exec/tools/mod.rs:320; apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57; packages/platform/utils/src/remoteControl/codeRemoteController.ts:319; packages/platform/utils/src/remoteControl/codeRemoteController.ts:366; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S67.02 Find implementations.
- Should: Asked where something is implemented, the agent finds the defining code and cites file and line.
- Status: web partial, desktop done, mobile done, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/LocalSessionPanel.tsx:160; apps/desktop/electron/runtime/dispatcher.ts:892; apps/cli/src/features/exec/tools/mod.rs:320; apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57; packages/platform/utils/src/remoteControl/codeRemoteController.ts:319; packages/platform/utils/src/remoteControl/codeRemoteController.ts:366; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S67.03 Find references.
- Should: Asked where a symbol is used, the agent finds its references across the repository.
- Status: web partial, desktop done, mobile done, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/LocalSessionPanel.tsx:160; apps/desktop/electron/runtime/dispatcher.ts:892; apps/cli/src/features/exec/tools/mod.rs:320; apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57; packages/platform/utils/src/remoteControl/codeRemoteController.ts:319; packages/platform/utils/src/remoteControl/codeRemoteController.ts:366; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S67.04 Trace call paths.
- Should: The agent traces how a call flows through the code from entry point to effect.
- Status: web partial, desktop done, mobile done, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/LocalSessionPanel.tsx:160; apps/desktop/electron/runtime/dispatcher.ts:892; apps/cli/src/features/exec/tools/mod.rs:320; apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57; packages/platform/utils/src/remoteControl/codeRemoteController.ts:319; packages/platform/utils/src/remoteControl/codeRemoteController.ts:366; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S67.05 Answer repository questions.
- Should: The agent answers free-form questions about the repository by reading its files.
- Status: web partial, desktop done, mobile done, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/LocalSessionPanel.tsx:160; apps/desktop/electron/runtime/dispatcher.ts:892; apps/cli/src/features/exec/tools/mod.rs:320; apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57; packages/platform/utils/src/remoteControl/codeRemoteController.ts:319; packages/platform/utils/src/remoteControl/codeRemoteController.ts:366; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S67.06 Implement a feature.
- Should: Given a feature request, the agent edits and creates files in the repository to implement it.
- Status: web partial, desktop done, mobile done, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/LocalSessionPanel.tsx:160; apps/desktop/electron/runtime/dispatcher.ts:892; apps/cli/src/features/exec/tools/mod.rs:557; apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57; packages/platform/utils/src/remoteControl/codeRemoteController.ts:319; packages/platform/utils/src/remoteControl/codeRemoteController.ts:366; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S67.07 Fix a defect.
- Should: Given a defect, the agent finds the cause and edits the code to fix it.
- Status: web partial, desktop done, mobile done, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/LocalSessionPanel.tsx:160; apps/desktop/electron/runtime/dispatcher.ts:892; apps/cli/src/features/exec/tools/mod.rs:557; apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57; packages/platform/utils/src/remoteControl/codeRemoteController.ts:319; packages/platform/utils/src/remoteControl/codeRemoteController.ts:366; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S67.08 Refactor code.
- Should: The agent restructures existing code across files without changing behaviour.
- Status: web partial, desktop done, mobile done, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/LocalSessionPanel.tsx:160; apps/desktop/electron/runtime/dispatcher.ts:892; apps/cli/src/features/exec/tools/mod.rs:557; apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57; packages/platform/utils/src/remoteControl/codeRemoteController.ts:319; packages/platform/utils/src/remoteControl/codeRemoteController.ts:366; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S67.09 Generate tests.
- Should: The agent writes new test files or cases for existing code.
- Status: web partial, desktop done, mobile done, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/LocalSessionPanel.tsx:160; apps/desktop/electron/runtime/dispatcher.ts:892; apps/cli/src/features/exec/tools/mod.rs:557; apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57; packages/platform/utils/src/remoteControl/codeRemoteController.ts:319; packages/platform/utils/src/remoteControl/codeRemoteController.ts:366; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S67.10 Run tests.
- Should: The agent runs the project's test suite and reports the result.
- Status: web partial, desktop done, mobile done, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/LocalSessionPanel.tsx:160; apps/desktop/electron/runtime/dispatcher.ts:892; apps/cli/src/features/exec/tools/mod.rs:552; apps/web/features/code/components/LocalSessionPanel.tsx:187; apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57; packages/platform/utils/src/remoteControl/codeRemoteController.ts:319; packages/platform/utils/src/remoteControl/codeRemoteController.ts:366
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S67.11 Interpret test failures.
- Should: After a test run fails, the agent reads the failure output and explains or fixes the cause.
- Status: web partial, desktop done, mobile done, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/LocalSessionPanel.tsx:160; apps/desktop/electron/runtime/dispatcher.ts:892; apps/cli/src/features/exec/tools/mod.rs:552; apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57; packages/platform/utils/src/remoteControl/codeRemoteController.ts:319; packages/platform/utils/src/remoteControl/codeRemoteController.ts:366; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S67.12 Run type checking.
- Should: The agent runs the project's type checker and reports errors.
- Status: web partial, desktop done, mobile done, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/LocalSessionPanel.tsx:160; apps/desktop/electron/runtime/dispatcher.ts:892; apps/cli/src/features/exec/tools/mod.rs:552; apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57; packages/platform/utils/src/remoteControl/codeRemoteController.ts:319; packages/platform/utils/src/remoteControl/codeRemoteController.ts:366; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S67.13 Run linting.
- Should: The agent runs the project's linter and reports findings.
- Status: web partial, desktop done, mobile done, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/LocalSessionPanel.tsx:160; apps/desktop/electron/runtime/dispatcher.ts:892; apps/cli/src/features/exec/tools/mod.rs:552; apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57; packages/platform/utils/src/remoteControl/codeRemoteController.ts:319; packages/platform/utils/src/remoteControl/codeRemoteController.ts:366; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S67.14 Build applications.
- Should: The agent builds the application with the project's build command.
- Status: web partial, desktop done, mobile done, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/LocalSessionPanel.tsx:160; apps/desktop/electron/runtime/dispatcher.ts:892; apps/cli/src/features/exec/tools/mod.rs:552; apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57; packages/platform/utils/src/remoteControl/codeRemoteController.ts:319; packages/platform/utils/src/remoteControl/codeRemoteController.ts:366; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S67.15 Start development servers.
- Should: The agent starts a development server and keeps it running while it continues working.
- Status: web missing, desktop done, mobile missing, cli done, vscode done
- Code: packages/contracts/local-runtime/src/device-steps.ts:152; apps/desktop/electron/runtime/dispatcher.ts:992; apps/cli/src/features/exec/tools/bash/mod.rs:76; apps/cli/src/platform/runtime/tool_catalog.rs:511

## S67.16 Inspect browser behavior.
- Should: The agent opens the app in a browser and inspects how it behaves (navigate, click, read, screenshot).
- Status: web missing, desktop done, mobile done, cli done, vscode partial, chrome done
- Code: apps/web/features/code/components/LocalSessionPanel.tsx:160; apps/desktop/electron/runtime/dispatcher.ts:892; apps/cli/src/features/exec/tools/mod.rs:686; apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57; packages/platform/utils/src/remoteControl/codeRemoteController.ts:319; packages/platform/utils/src/remoteControl/codeRemoteController.ts:366; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493; apps/mobile/src/features/companion/components/CodeSessionView.tsx:377
- Unfinished: vscode: Needs a CLI-side browser pairing without AGI Desktop (c-cli lane); VS Code has nothing of its own to add.

## S67.17 Inspect console errors.
- Should: The agent reads the browser console errors of the app under test.
- Status: web missing, desktop done, mobile missing, cli missing, vscode missing, chrome done
- Code: packages/contracts/local-runtime/src/device-steps.ts:255; packages/contracts/local-runtime/src/device-steps.ts:260; apps/web/features/desktop-host/lib/device-steps.ts:252; apps/desktop/electron/browser/browserSteps.ts:51; apps/extension/src/features/side-panel/computerUsePanel.ts:567; apps/extension/src/features/computer-use/agentLoop.ts:382; apps/extension/src/features/browser-tools/consoleCapture.ts:5

## S67.18 Inspect network failures.
- Should: The agent inspects failed network requests of the app under test.
- Status: web missing, desktop done, mobile missing, cli missing, vscode missing, chrome done
- Code: packages/contracts/local-runtime/src/device-steps.ts:255; packages/contracts/local-runtime/src/device-steps.ts:260; apps/web/features/desktop-host/lib/device-steps.ts:252; apps/desktop/electron/browser/browserSteps.ts:51; apps/extension/src/features/side-panel/computerUsePanel.ts:567; apps/extension/src/features/computer-use/agentLoop.ts:403

## S67.19 Interact with a simulator.
- Should: The agent drives an iOS/Android simulator to exercise a mobile app.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing

## S67.20 Review code changes.
- Should: The agent reviews the current code changes and reports issues with file/line references.
- Status: web partial, desktop done, mobile done, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/LocalSessionPanel.tsx:160; apps/desktop/electron/runtime/dispatcher.ts:892; apps/cli/src/platform/runtime/git_tools.rs:100; apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57; packages/platform/utils/src/remoteControl/codeRemoteController.ts:319; packages/platform/utils/src/remoteControl/codeRemoteController.ts:366; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S67.21 Review pull requests.
- Should: The agent reviews a pull request (fetches its diff) and posts or shows review findings.
- Status: web done, desktop done, mobile missing, cli done, vscode done
- Code: apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:626; apps/web/app/api/github/webhook/route.ts:236; apps/web/app/api/github/webhook/route.ts:263; apps/cli/src/lib.rs:752; apps/cli/src/review.rs:184; apps/cli/src/review.rs:137; apps/extension-vscode/src/extension.ts:262; apps/extension-vscode/src/features/editor-utilities/editorUtilities.ts:170

## S67.22 Scan for security problems.
- Should: The agent scans the code for security problems and reports them.
- Status: web partial, desktop done, mobile done, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/cli/src/app_server/surfaces.rs:1116; apps/cli/src/app_server/developer_host.rs:890; apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57; packages/platform/utils/src/remoteControl/codeRemoteController.ts:319; packages/platform/utils/src/remoteControl/codeRemoteController.ts:366; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493; apps/mobile/src/features/companion/components/CodeSessionView.tsx:377
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S67.23 Explain findings.
- Should: After a review or scan, the agent explains each finding in plain language with its location.
- Status: web done, desktop done, mobile done, cli done, vscode done
- Code: apps/web/features/connectors/hooks/useConnectorsSettingsAdapter.tsx:626; apps/web/app/api/github/webhook/route.ts:411; apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57; packages/platform/utils/src/remoteControl/codeRemoteController.ts:319; packages/platform/utils/src/remoteControl/codeRemoteController.ts:366; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493; apps/mobile/src/features/companion/components/CodeSessionView.tsx:377; apps/cli/src/lib.rs:743

## S67.24 Propose patches.
- Should: The agent proposes a change as a reviewable patch before or as it applies it.
- Status: web partial, desktop done, mobile done, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/LocalSessionPanel.tsx:230; apps/desktop/electron/runtime/dispatcher.ts:907; apps/web/features/code/local-code.ts:447; apps/mobile/src/features/companion/components/CodeSessionView.tsx:446; apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57; apps/mobile/src/features/cloud-code/components/CloudCodeChangesSheet.tsx:127; apps/cli/src/tui/tui_app.rs:3974
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S67.25 Apply selected patches.
- Should: The user picks which of the agent's proposed patches to apply, and only those are applied.
- Status: web partial, desktop done, mobile done, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/LocalChangesPanel.tsx:79; apps/web/features/code/components/LocalChangesPanel.tsx:132; apps/desktop/electron/runtime/dispatcher.ts:1107; apps/desktop/electron/runtime/gitService.ts:157; apps/mobile/src/features/companion/components/CodeSessionView.tsx:269; apps/mobile/src/features/cloud-code/components/CloudCodeChangesSheet.tsx:127; apps/mobile/src/features/cloud-code/components/CloudCodeChangesSheet.tsx:347
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S67.26 Generate documentation.
- Should: The agent writes or updates documentation (README, doc comments) from the code.
- Status: web partial, desktop done, mobile done, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/LocalSessionPanel.tsx:160; apps/desktop/electron/runtime/dispatcher.ts:892; apps/cli/src/features/exec/tools/mod.rs:557; apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57; packages/platform/utils/src/remoteControl/codeRemoteController.ts:319; packages/platform/utils/src/remoteControl/codeRemoteController.ts:366; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S67.27 Perform migrations.
- Should: The agent performs a code or schema migration across the repository.
- Status: web partial, desktop done, mobile done, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/LocalSessionPanel.tsx:160; apps/desktop/electron/runtime/dispatcher.ts:892; apps/cli/src/features/exec/tools/mod.rs:557; apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57; packages/platform/utils/src/remoteControl/codeRemoteController.ts:319; packages/platform/utils/src/remoteControl/codeRemoteController.ts:366; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S67.28 Upgrade dependencies.
- Should: The agent upgrades dependencies and adjusts code to the new versions.
- Status: web partial, desktop done, mobile done, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/LocalSessionPanel.tsx:160; apps/desktop/electron/runtime/dispatcher.ts:892; apps/cli/src/features/exec/tools/mod.rs:557; apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57; packages/platform/utils/src/remoteControl/codeRemoteController.ts:319; packages/platform/utils/src/remoteControl/codeRemoteController.ts:366; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S67.29 Create commits.
- Should: The agent (or user from the coding surface) commits the session's changes with a message.
- Status: web partial, desktop done, mobile done, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/LocalSessionPanel.tsx:160; apps/desktop/electron/runtime/dispatcher.ts:892; apps/cli/src/platform/runtime/git_tools.rs:135; apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57; packages/platform/utils/src/remoteControl/codeRemoteController.ts:319; packages/platform/utils/src/remoteControl/codeRemoteController.ts:366; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S67.30 Create branches.
- Should: The agent creates a git branch for its work.
- Status: web partial, desktop done, mobile done, cli done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/LocalSessionPanel.tsx:160; apps/desktop/electron/runtime/dispatcher.ts:892; apps/cli/src/platform/runtime/git_tools.rs:157; apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57; packages/platform/utils/src/remoteControl/codeRemoteController.ts:319; packages/platform/utils/src/remoteControl/codeRemoteController.ts:366; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S67.31 Create pull requests.
- Should: The agent opens a pull request for its branch on the code host.
- Status: web partial, desktop done, mobile done, vscode done
- Code: apps/web/lib/e2b/gate.ts:16; apps/web/features/code/components/LocalPullRequest.tsx:120; apps/web/features/code/components/LocalPullRequest.tsx:63; apps/desktop/electron/runtime/gitService.ts:241; apps/web/app/api/code/local-pull-requests/route.ts:71; apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57; packages/platform/utils/src/remoteControl/codeRemoteController.ts:319; packages/platform/utils/src/remoteControl/codeRemoteController.ts:366
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S67.32 Respond to review feedback.
- Should: The agent reads review comments on a pull request and changes the code to address them.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing
- Code: apps/cli/src/pr_feedback.rs:90; apps/cli/src/pr_feedback.rs:217; apps/cli/src/claude_parity.rs:312

## S67.33 Investigate CI failures.
- Should: The agent investigates a failed CI run (reads logs, finds the cause, proposes a fix).
- Status: web partial, desktop missing, mobile missing, cli missing, vscode missing
- Code: apps/web/lib/e2b/gate.ts:16
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S67.34 Work from issues or team mentions.
- Should: Work starts from an issue or a team mention (e.g. @agent on GitHub or Slack) and the agent does the coding task.
- Status: web partial, desktop partial, mobile missing, cli missing, vscode missing
- Code: apps/web/lib/e2b/gate.ts:16
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code | desktop: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when

## S67.35 Produce repository-grounded reports, slides, and designs.
- Should: The agent produces a report, slide deck or design grounded in the repository's contents.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing

## S67.36 Run bounded goal/completion loops.
- Should: The user sets a goal and a bound (turns/time) and the agent loops until done or the bound is hit.
- Status: web partial, mobile done, cli done
- Code: apps/web/lib/e2b/gate.ts:16; apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57; packages/platform/utils/src/remoteControl/codeRemoteController.ts:319; packages/platform/utils/src/remoteControl/codeRemoteController.ts:366; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493; apps/mobile/src/features/companion/components/CodeSessionView.tsx:377; apps/cli/src/lib.rs:313; apps/cli/src/agent/chat.rs:946
- Unfinished: web: switch-on: set AGI_E2B_EXECUTION=1 and E2B_API_KEY in Vercel Production and redeploy (read by e2bProvisioningReady, apps/web/lib/e2b/gate.ts:16-30; the sandbox rate card is already priceable, compute-metering.ts:73; AGI_MANAGED_COMPUTE_PRIVATE_BETA is on when unset, do not set it to 0); then live-check the feature in /code

## S67.37 Persist useful repository-specific Memory.
- Should: The agent saves useful repository-specific facts to memory and reuses them in later sessions on that repository.
- Status: web missing, desktop done, mobile done, cli done, vscode done
- Code: apps/web/features/code/components/LocalMemoryControl.tsx:49; apps/web/features/code/components/LocalSessionPanel.tsx:302; apps/desktop/electron/runtime/dispatcher.ts:1169; apps/desktop/electron/runtime/developerSessionService.ts:1135; apps/cli/src/app_server/surfaces.rs:974; apps/cli/src/agent/prompt.rs:401; apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57; packages/platform/utils/src/remoteControl/codeRemoteController.ts:319

## S67.38 Load repository instruction files.
- Should: The agent loads the repository's instruction files (AGENTS.md, CLAUDE.md) and follows them.
- Status: web missing, desktop done, mobile done, cli done, vscode done
- Code: apps/web/features/code/components/LocalSessionPanel.tsx:160; apps/desktop/electron/runtime/dispatcher.ts:892; apps/cli/src/agent/prompt.rs:396; apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57; packages/platform/utils/src/remoteControl/codeRemoteController.ts:319; packages/platform/utils/src/remoteControl/codeRemoteController.ts:366; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493; apps/mobile/src/features/companion/components/CodeSessionView.tsx:377

## S67.39 Use project-specific Skills and Plugins.
- Should: The agent uses skills and plugins defined in the project and the user can see or toggle them.
- Status: web missing, desktop done, mobile done, cli done, vscode done
- Code: apps/web/features/code/components/LocalExtensionsControl.tsx:127; apps/web/features/code/components/LocalExtensionsControl.tsx:107; apps/desktop/electron/runtime/dispatcher.ts:1084; crates/agiworkforce-protocol/src/developer_session.rs:83; apps/mobile/src/features/companion/components/CodeSessionsCard.tsx:57; packages/platform/utils/src/remoteControl/codeRemoteController.ts:319; packages/platform/utils/src/remoteControl/codeRemoteController.ts:366; apps/mobile/src/features/companion/components/CodeSessionView.tsx:493
