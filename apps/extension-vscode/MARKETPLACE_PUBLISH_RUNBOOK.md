# VS Code Marketplace Publish Runbook

Canonical release procedure for `agiworkforce.agi-workforce`.

## Release boundary

- Tags for this product use `v-vscode-<semver>`.
- Build the exact tagged source and publish the resulting `.vsix`; never rebuild from `main` after approval.
- The repository-pinned `@vscode/vsce` is authoritative. Do not depend on a globally installed `vsce`.
- Global Azure DevOps Personal Access Tokens are retired on **December 1, 2026**. Production automation must use Microsoft Entra ID workload identity and `vsce publish --azure-credential`; do not add a long-lived Marketplace token to GitHub secrets.

Reference: <https://code.visualstudio.com/api/working-with-extensions/publishing-extension>

## One-time secure publisher setup

The automated path is `.github/workflows/release-vscode-extension.yml` and uses GitHub OIDC. It never stores a Marketplace PAT or Azure client secret.

1. Create an Entra application or user-assigned managed identity for Marketplace publication.
2. Add a federated credential for the GitHub environment subject `repo:siddharthanagula3/agiworkforce:environment:vscode-marketplace`.
3. Add that identity to the `agiworkforce` Visual Studio Marketplace publisher with the **Contributor** role.
4. Create the protected GitHub environment `vscode-marketplace`, require an approving reviewer, restrict it to `v-vscode-*` tags, and add these environment variables:
   - `VSCODE_MARKETPLACE_AZURE_CLIENT_ID`
   - `VSCODE_MARKETPLACE_AZURE_TENANT_ID`
5. Keep `id-token: write` scoped to the publish job. Do not add `VSCE_PAT`, a client secret, or subscription-wide Azure permissions.

If the workload identity is not configured, run the workflow with `publish=false` to produce the verified artifact and upload that `.vsix` manually through the Marketplace publisher management page. Manual upload is safer than introducing a temporary CI secret that will be obsolete in 2026.

## 1. Prepare the source version

1. Update `apps/extension-vscode/package.json` `version` using SemVer.
2. Update the Marketplace-facing README and listing assets when shipped claims or UI changed, and record the release notes in the tagged release commit.
3. Commit the version and release notes together.
4. Create and push the matching `v-vscode-<version>` tag. The tag-triggered workflow packages that exact commit and pauses at the protected Marketplace environment before publication.

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

The protected GitHub publish job runs the equivalent command after OIDC authentication:

```bash
cd apps/extension-vscode
pnpm exec vsce publish --azure-credential \
  --packagePath agi-workforce-<version>.vsix \
  --no-dependencies
```

The GitHub workflow authenticates with OIDC and consumes the previously validated `.vsix`; it does not let `vsce publish` mutate the package version or create a separate release commit. A manual dry run can package an existing tag without publishing:

```bash
gh workflow run release-vscode-extension.yml \
  -f tag=v-vscode-<version> \
  -f publish=false
```

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
