# VS Code Marketplace Publish Runbook

One-shot reference for publishing `agi-workforce` to the VS Code Marketplace.

## Prerequisites

- `vsce` installed globally: `npm install -g @vscode/vsce`
- Personal Access Token (PAT) scoped to **Marketplace → Manage** for publisher `agiworkforce`
- Node 22 + pnpm 9.15.3

## Step 1 — Bump version

Edit `apps/extension-vscode/package.json` `"version"` field. Follow semver.
Add a `CHANGELOG.md` entry under `## [x.y.z] - YYYY-MM-DD`.

## Step 2 — Package

```bash
cd apps/extension-vscode
pnpm build           # compiles src/ → out/
vsce package         # emits agi-workforce-x.y.z.vsix
```

Verify the `.vsix` size is reasonable (current baseline: ~116 KB for v0.3.0).
Inspect contents: `unzip -l agi-workforce-x.y.z.vsix | less`

## Step 3 — Capture screenshots (6 required)

Screenshots must be placed in `apps/extension-vscode/media/` and referenced in `README.md`.
Capture with the extension loaded via `code --extensionDevelopmentPath=.` from the repo root.

| #   | Shot                       | What to capture                                                           |
| --- | -------------------------- | ------------------------------------------------------------------------- |
| 1   | `sidebar-chat.png`         | Sidebar panel open with a multi-turn conversation, provider badge visible |
| 2   | `at-mention-quickpick.png` | `@` typed in chat input, file quickpick dropdown open                     |
| 3   | `chat-in-editor.png`       | Editor tab showing chat panel (`agi-workforce.openChatInEditor`)          |
| 4   | `model-picker.png`         | `agi-workforce.selectModel` QuickPick with provider list visible          |
| 5   | `sessions-history.png`     | History tree view in sidebar showing multiple past conversations          |
| 6   | `inline-completion.png`    | Ghost-text inline completion suggestion accepted in a code file           |

Recommended size: **1280 × 800 px**, PNG, ≤ 200 KB each.

## Step 4 — Publish

```bash
vsce publish --pat <YOUR_PAT>
```

Or to publish a pre-built `.vsix`:

```bash
vsce publish --packagePath agi-workforce-x.y.z.vsix --pat <YOUR_PAT>
```

## Step 5 — Verify marketplace listing

1. Open <https://marketplace.visualstudio.com/items?itemName=agiworkforce.agi-workforce> in a browser.
2. Confirm version number, description, and screenshots are correct.
3. Install from marketplace in a clean VS Code profile: `code --profile fresh-test --install-extension agiworkforce.agi-workforce`.
4. Run `AGI Workforce: Set API Key` and confirm the sidebar opens.

## Publisher details

| Field           | Value                                                                            |
| --------------- | -------------------------------------------------------------------------------- |
| Publisher ID    | `agiworkforce`                                                                   |
| Extension ID    | `agi-workforce`                                                                  |
| Marketplace URL | `https://marketplace.visualstudio.com/items?itemName=agiworkforce.agi-workforce` |
| PAT management  | <https://dev.azure.com/agiworkforce/_usersSettings/tokens>                       |

## Rollback

To unpublish a bad version (within 24 h of publish):

```bash
vsce unpublish agiworkforce.agi-workforce@x.y.z --pat <YOUR_PAT>
```

After 24 h, contact VS Code Marketplace support — versions cannot be deleted by publishers.
