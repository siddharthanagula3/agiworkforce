# VS Code Marketplace Publish Runbook

Canonical release procedure for `agiworkforce.agi-workforce`.

## Release boundary

- Tags for this product must use `v-vscode-<semver>` when automation is added.
- Build the exact tagged source and publish the resulting `.vsix`; never rebuild from `main` after approval.
- The repository-pinned `@vscode/vsce` is authoritative. Do not depend on a globally installed `vsce`.
- Global Azure DevOps Personal Access Tokens are retired on **December 1, 2026**. Production automation must use Microsoft Entra ID workload identity and `vsce publish --azure-credential`; do not add a long-lived Marketplace token to GitHub secrets.

Reference: <https://code.visualstudio.com/api/working-with-extensions/publishing-extension>

## One-time secure publisher setup

The official secure path currently runs in Azure Pipelines:

1. Create an Azure Resource Manager service connection using workload identity federation.
2. Create a user-assigned managed identity and complete the federated credential exchange between Azure DevOps and Azure.
3. Retrieve the managed identity resource ID with the Azure DevOps profile API.
4. Add that identity to the `agiworkforce` Visual Studio Marketplace publisher with the **Contributor** role.
5. Restrict the service connection to the extension publishing pipeline.

Until that account-bound setup exists, package the extension here and upload the `.vsix` manually through the Marketplace publisher management page. Manual upload is safer than introducing a temporary CI secret that will be obsolete in 2026.

## 1. Prepare the source version

1. Update `apps/extension-vscode/package.json` `version` using SemVer.
2. Add the corresponding entry to `apps/extension-vscode/CHANGELOG.md`.
3. Commit the version and changelog together.
4. Run the extension tests and package from a clean tree.

## 2. Build and inspect the VSIX

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm --filter agi-workforce test
pnpm --filter agi-workforce package
```

The package command performs the production esbuild and invokes the pinned `@vscode/vsce` wrapper with `--no-dependencies`.

Inspect the exact archive before publication:

```bash
unzip -l apps/extension-vscode/agi-workforce-<version>.vsix
```

Reject the package if it contains source maps, local credentials, fixture secrets, development-only files, or a version that does not match `package.json`.

## 3. Verify listing assets

Listing screenshots live in `apps/extension-vscode/media/` and are referenced from the Marketplace README. Refresh any screenshot that no longer matches the shipped UI.

| Asset                      | Expected evidence                                |
| -------------------------- | ------------------------------------------------ |
| `sidebar-chat.png`         | Working multi-turn local developer session       |
| `at-mention-quickpick.png` | File-context selection                           |
| `chat-in-editor.png`       | Editor chat panel                                |
| `model-picker.png`         | Current registry-backed model picker             |
| `sessions-history.png`     | Local workspace session history                  |
| `inline-completion.png`    | Inline completion in a non-sensitive source file |

Do not claim a cloud, BYOK, tool, or session capability in listing copy unless the tagged implementation and release checks prove it.

## 4. Publish

### Secure automated path

Run from the Azure Pipeline job authenticated through the managed-identity service connection:

```bash
cd apps/extension-vscode
pnpm exec vsce publish --azure-credential \
  --packagePath agi-workforce-<version>.vsix \
  --no-dependencies
```

The pipeline must consume the previously validated `.vsix`; it must not let `vsce publish` mutate the package version or create a separate release commit.

### Manual account-bound fallback

Upload the validated `.vsix` at <https://marketplace.visualstudio.com/manage/publishers/>. Record the source commit, package SHA-256, operator, and Marketplace result in the release handoff.

## 5. Verify after publication

1. Open <https://marketplace.visualstudio.com/items?itemName=agiworkforce.agi-workforce> and confirm the version, changelog, permissions, screenshots, and pricing label.
2. Install into a clean VS Code profile:

   ```bash
   code --profile agi-release-smoke --install-extension agiworkforce.agi-workforce
   ```

3. Verify activation, local runtime connection, a new developer session, resume, approval, diff, terminal, and update discovery.
4. Verify signed-out and unavailable-runtime error states; do not stop at successful installation.

## Rollback

Marketplace version deletion is not a reusable rollback mechanism: the latest version cannot be deleted, and deleted version numbers cannot be republished. Prefer a tested forward patch with a new SemVer. For a critical security incident, unpublish the extension from the publisher management page, preserve the publisher and extension identifiers, remediate, and publish a newer version.

| Field           | Value                                                                            |
| --------------- | -------------------------------------------------------------------------------- |
| Publisher ID    | `agiworkforce`                                                                   |
| Extension ID    | `agi-workforce`                                                                  |
| Marketplace URL | <https://marketplace.visualstudio.com/items?itemName=agiworkforce.agi-workforce> |
